import { pool } from '../config/db.js';
import { optimizeAndSaveImage } from '../config/upload.js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserFromReq, logActivity } from '../config/auditLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ürünleri listele
 * Query parametreleri:
 * - ?category_id=X (Belirli bir kategoriye ait ürünler)
 * - ?active_only=true (Sadece aktif ürünler, POS/QR menü için)
 */
export const getProducts = async (req, res) => {
  try {
    const { category_id, active_only } = req.query;

    const conditions = ['p.status != -1'];
    const params = [];

    if (active_only === 'true' || active_only === '1') {
      conditions.push('p.status = 1');
      conditions.push('(c.status = 1 OR c.id IS NULL)');
    }

    if (category_id && category_id !== 'all') {
      conditions.push('p.category_id = ?');
      params.push(category_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        p.id,
        p.category_id,
        c.name AS category_name,
        p.name,
        p.description,
        p.ingredients,
        p.price,
        p.cost_price,
        p.image_url,
        p.order_num,
        p.status,
        p.show_in_qr,
        p.is_available,
        p.created_at,
        p.created_by_user_id,
        u1.name AS created_by_name,
        p.updated_by_user_id,
        u2.name AS updated_by_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u1 ON p.created_by_user_id = u1.id
      LEFT JOIN users u2 ON p.updated_by_user_id = u2.id
      ${whereClause}
      ORDER BY p.order_num ASC, p.id DESC
    `;

    const [products] = await pool.query(query, params);

    // İstatistik özeti
    const [stats] = await pool.query(`
      SELECT 
        COUNT(CASE WHEN status != -1 THEN 1 END) AS total_count,
        COUNT(CASE WHEN status = 1 THEN 1 END) AS active_count,
        COUNT(CASE WHEN status = 0 THEN 1 END) AS passive_count
      FROM products
    `);

    res.json({ 
      success: true, 
      products,
      stats: stats[0] || { total_count: 0, active_count: 0, passive_count: 0 }
    });
  } catch (error) {
    console.error('Ürünleri getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Ürünler alınamadı: ' + error.message });
  }
};

/**
 * Yeni Ürün Ekle
 * Zorunlu: name, category_id, price
 * Opsiyonel: cost_price, description, ingredients, image
 */
export const createProduct = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { 
      name, 
      category_id, 
      price, 
      cost_price, 
      description, 
      ingredients, 
      status 
    } = req.body;

    // Zorunlu alan kontrolü
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Ürün adı zorunludur.' });
    }
    if (!category_id) {
      return res.status(400).json({ success: false, message: 'Kategori seçimi zorunludur.' });
    }
    if (price === undefined || price === null || price === '' || isNaN(Number(price))) {
      return res.status(400).json({ success: false, message: 'Geçerli bir satış fiyatı giriniz.' });
    }

    // Kategori var mı kontrol et
    const [catRows] = await pool.query(
      'SELECT id, name FROM categories WHERE id = ? AND status != -1', 
      [category_id]
    );
    if (catRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Seçilen kategori bulunamadı veya silinmiş.' });
    }

    // Fiyat ve maliyet parse
    const parsedPrice = parseFloat(price);
    const parsedCostPrice = (cost_price !== undefined && cost_price !== null && cost_price !== '' && !isNaN(Number(cost_price))) 
      ? parseFloat(cost_price) 
      : null;

    const parsedStatus = status !== undefined ? parseInt(status, 10) : 1;
    const isAvailable = parsedStatus === 1 ? 1 : 0;

    // Görsel işleme (Opsiyonel)
    let finalImageUrl = null;
    if (req.file) {
      try {
        finalImageUrl = await optimizeAndSaveImage(req.file.buffer, 'products', 500, 500);
      } catch (imgErr) {
        console.error('Ürün görsel optimizasyon hatası:', imgErr);
        return res.status(400).json({ success: false, message: 'Görsel işlenemedi: ' + imgErr.message });
      }
    }

    // Sıradaki order_num değerini bul
    const [maxOrder] = await pool.query(
      'SELECT COALESCE(MAX(order_num), 0) + 1 AS next_order FROM products WHERE status != -1'
    );
    const nextOrder = maxOrder[0].next_order;

    // Ürünü veritabanına ekle
    const [result] = await pool.query(
      `INSERT INTO products (
        category_id, 
        name, 
        description, 
        ingredients, 
        price, 
        cost_price, 
        image_url, 
        order_num, 
        status, 
        is_available,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id,
        name.trim(),
        description ? description.trim() : null,
        ingredients ? ingredients.trim() : null,
        parsedPrice,
        parsedCostPrice,
        finalImageUrl,
        nextOrder,
        parsedStatus,
        isAvailable,
        user.id,
        user.id
      ]
    );

    // Eklenen ürünü getir
    const [createdRows] = await pool.query(`
      SELECT 
        p.*, 
        c.name AS category_name,
        ? AS created_by_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `, [user.name, result.insertId]);

    const newProduct = createdRows[0];

    // Denetim İzi Kaydı
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'product',
      entityId: result.insertId,
      actionType: 'product_created',
      title: `Yeni Ürün Eklendi: "${name.trim()}"`,
      details: `${user.name} tarafından oluşturuldu. Satış Fiyatı: ₺${parsedPrice.toFixed(2)}, Kategori: ${catRows[0].name}`,
      newValue: { name: name.trim(), price: parsedPrice, cost_price: parsedCostPrice, category: catRows[0].name }
    });

    // Socket.io ile diğer ekranlara bildir
    req.io?.emit('product:created', newProduct);

    res.status(201).json({
      success: true,
      message: 'Ürün başarıyla oluşturuldu.',
      product: newProduct
    });
  } catch (error) {
    console.error('Ürün ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Ürün eklenemedi: ' + error.message });
  }
};

/**
 * Ürün Güncelle
 */
export const updateProduct = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;
    const { 
      name, 
      category_id, 
      price, 
      cost_price, 
      description, 
      ingredients, 
      status,
      remove_image
    } = req.body;

    const [existingRows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı.' });
    }
    const currentProduct = existingRows[0];

    // Zorunlu alan kontrolü
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Ürün adı zorunludur.' });
    }
    if (!category_id) {
      return res.status(400).json({ success: false, message: 'Kategori seçimi zorunludur.' });
    }
    if (price === undefined || price === null || price === '' || isNaN(Number(price))) {
      return res.status(400).json({ success: false, message: 'Geçerli bir satış fiyatı giriniz.' });
    }

    const parsedPrice = parseFloat(price);
    const parsedCostPrice = (cost_price !== undefined && cost_price !== null && cost_price !== '' && !isNaN(Number(cost_price))) 
      ? parseFloat(cost_price) 
      : null;

    let parsedStatus = currentProduct.status;
    if (status !== undefined) {
      parsedStatus = parseInt(status, 10);
    }
    const isAvailable = parsedStatus === 1 ? 1 : 0;

    let finalImageUrl = currentProduct.image_url;

    // Görsel silme talebi
    if (remove_image === 'true' || remove_image === true) {
      if (currentProduct.image_url && currentProduct.image_url.startsWith('/uploads/')) {
        try {
          const oldPath = path.resolve(__dirname, '../../', currentProduct.image_url.replace(/^\//, ''));
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch (e) {
          console.warn('Eski görsel silinemedi:', e.message);
        }
      }
      finalImageUrl = null;
    }

    // Yeni görsel yüklendiyse optimize et
    if (req.file) {
      try {
        finalImageUrl = await optimizeAndSaveImage(req.file.buffer, 'products', 500, 500);

        // Eski dosyayı temizle
        if (currentProduct.image_url && currentProduct.image_url.startsWith('/uploads/')) {
          try {
            const oldPath = path.resolve(__dirname, '../../', currentProduct.image_url.replace(/^\//, ''));
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          } catch (e) {
            console.warn('Eski görsel silinemedi:', e.message);
          }
        }
      } catch (imgErr) {
        console.error('Görsel optimizasyon hatası:', imgErr);
        return res.status(400).json({ success: false, message: 'Görsel işlenemedi: ' + imgErr.message });
      }
    }

    // Değişiklikleri tespit et
    const changes = [];
    if (currentProduct.name !== name.trim()) {
      changes.push(`İsim: "${currentProduct.name}" ➔ "${name.trim()}"`);
    }
    if (parseFloat(currentProduct.price) !== parsedPrice) {
      changes.push(`Fiyat: ₺${parseFloat(currentProduct.price).toFixed(2)} ➔ ₺${parsedPrice.toFixed(2)}`);
    }
    if (parseFloat(currentProduct.cost_price || 0) !== (parsedCostPrice || 0)) {
      changes.push(`Maliyet: ₺${parseFloat(currentProduct.cost_price || 0).toFixed(2)} ➔ ₺${(parsedCostPrice || 0).toFixed(2)}`);
    }
    if (currentProduct.category_id !== parseInt(category_id, 10)) {
      changes.push('Kategori değiştirildi');
    }
    if (currentProduct.status !== parsedStatus) {
      changes.push(`Durum: ${currentProduct.status === 1 ? 'Aktif' : 'Pasif'} ➔ ${parsedStatus === 1 ? 'Aktif' : 'Pasif'}`);
    }
    if (req.file) {
      changes.push('Görsel güncellendi');
    }

    await pool.query(
      `UPDATE products 
       SET category_id = ?, 
           name = ?, 
           description = ?, 
           ingredients = ?, 
           price = ?, 
           cost_price = ?, 
           image_url = ?, 
           status = ?, 
           is_available = ?,
           updated_by_user_id = ?
       WHERE id = ?`,
      [
        category_id,
        name.trim(),
        description ? description.trim() : null,
        ingredients ? ingredients.trim() : null,
        parsedPrice,
        parsedCostPrice,
        finalImageUrl,
        parsedStatus,
        isAvailable,
        user.id,
        id
      ]
    );

    // Denetim İzi Kaydı
    if (changes.length > 0) {
      await logActivity({
        userId: user.id,
        userName: user.name,
        entityType: 'product',
        entityId: id,
        actionType: 'product_updated',
        title: `Ürün Güncellendi: "${name.trim()}"`,
        details: `${user.name} tarafından düzenlendi: ${changes.join(' | ')}`,
        oldValue: { name: currentProduct.name, price: currentProduct.price, cost_price: currentProduct.cost_price, status: currentProduct.status },
        newValue: { name: name.trim(), price: parsedPrice, cost_price: parsedCostPrice, status: parsedStatus }
      });
    }

    const [updatedRows] = await pool.query(`
      SELECT 
        p.*, 
        c.name AS category_name,
        u2.name AS updated_by_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u2 ON p.updated_by_user_id = u2.id
      WHERE p.id = ?
    `, [id]);

    const updatedProduct = updatedRows[0];

    req.io?.emit('product:updated', updatedProduct);

    res.json({
      success: true,
      message: 'Ürün başarıyla güncellendi.',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Ürün güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Ürün güncellenemedi: ' + error.message });
  }
};

/**
 * Ürün Durumu (Aktif/Pasif) Toggle
 */
export const toggleProductStatus = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;

    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı.' });
    }

    const current = rows[0];
    const newStatus = current.status === 1 ? 0 : 1;
    const isAvailable = newStatus === 1 ? 1 : 0;

    await pool.query(
      'UPDATE products SET status = ?, is_available = ?, updated_by_user_id = ? WHERE id = ?',
      [newStatus, isAvailable, user.id, id]
    );

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'product',
      entityId: id,
      actionType: 'product_status_changed',
      title: `Ürün Durumu Değiştirildi: "${current.name}"`,
      details: `${user.name} tarafından ${newStatus === 1 ? 'Aktif' : 'Pasif'} yapıldı.`
    });

    const [updatedRows] = await pool.query(`
      SELECT 
        p.*, 
        c.name AS category_name,
        u2.name AS updated_by_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u2 ON p.updated_by_user_id = u2.id
      WHERE p.id = ?
    `, [id]);

    const updatedProduct = updatedRows[0];

    req.io?.emit('product:updated', updatedProduct);

    res.json({
      success: true,
      message: newStatus === 1 ? 'Ürün aktifleştirildi.' : 'Ürün pasife alındı.',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Ürün durumu değiştirme hatası:', error);
    res.status(500).json({ success: false, message: 'Durum değiştirilemedi: ' + error.message });
  }
};

/**
 * Ürün QR Menü Görünürlük Durumu Toggle
 */
export const toggleProductQrStatus = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;
    let { show_in_qr: targetQr } = req.body || {};

    const [existing] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı.' });
    }

    if (existing[0].status === 0) {
      return res.status(400).json({
        success: false,
        message: 'Ürün pasif olduğu için QR menüde açılamaz. Önce ürünü aktif duruma getirmelisiniz.'
      });
    }

    if (targetQr === undefined) {
      targetQr = existing[0].show_in_qr === 1 ? 0 : 1;
    } else {
      targetQr = parseInt(targetQr, 10);
    }

    await pool.query('UPDATE products SET show_in_qr = ?, updated_by_user_id = ? WHERE id = ?', [targetQr, user.id, id]);

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'product',
      entityId: id,
      actionType: 'product_qr_changed',
      title: `Ürün QR Görünürlüğü Değiştirildi: "${existing[0].name}"`,
      details: `${user.name} tarafından QR Menüde ${targetQr === 1 ? 'Gösterildi' : 'Gizlendi'}.`
    });

    const [updatedRows] = await pool.query(`
      SELECT 
        p.*, 
        c.name AS category_name,
        u2.name AS updated_by_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u2 ON p.updated_by_user_id = u2.id
      WHERE p.id = ?
    `, [id]);

    const updatedProduct = updatedRows[0];
    req.io?.emit('product:updated', updatedProduct);

    res.json({
      success: true,
      message: `"${existing[0].name}" QR menüde ${targetQr === 1 ? 'gösterilecek' : 'gizlendi'}.`,
      product: updatedProduct
    });
  } catch (error) {
    console.error('QR menü durum değiştirme hatası:', error);
    res.status(500).json({ success: false, message: 'QR durum değiştirilemedi: ' + error.message });
  }
};

/**
 * Ürün Sil (Soft delete: status = -1, is_available = 0)
 */
export const deleteProduct = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;

    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı.' });
    }

    // Soft delete
    await pool.query(
      'UPDATE products SET status = -1, is_available = 0, updated_by_user_id = ? WHERE id = ?',
      [user.id, id]
    );

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'product',
      entityId: id,
      actionType: 'product_deleted',
      title: `Ürün Silindi: "${rows[0].name}"`,
      details: `${user.name} tarafından silindi.`
    });

    req.io?.emit('product:deleted', { id: parseInt(id, 10) });

    res.json({
      success: true,
      message: 'Ürün başarıyla silindi.',
      id: parseInt(id, 10)
    });
  } catch (error) {
    console.error('Ürün silme hatası:', error);
    res.status(500).json({ success: false, message: 'Ürün silinemedi: ' + error.message });
  }
};

/**
 * Belirli Bir Ürünün Değişiklik Geçmişi (Timeline)
 */
export const getProductHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const [history] = await pool.query(
      `SELECT a.*, u.role AS user_role 
       FROM audit_logs a 
       LEFT JOIN users u ON a.user_id = u.id 
       WHERE a.entity_type = 'product' AND a.entity_id = ? 
       ORDER BY a.id DESC`,
      [id]
    );
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Geçmiş alınamadı: ' + err.message });
  }
};

/**
 * Ürün Sıralamasını Kaydet (Sürükle & Bırak)
 */
export const reorderProducts = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Sıralama verisi geçersiz.' });
    }

    await connection.beginTransaction();

    for (let index = 0; index < orderedIds.length; index++) {
      const prodId = orderedIds[index];
      await connection.query(
        'UPDATE products SET order_num = ? WHERE id = ?',
        [index + 1, prodId]
      );
    }

    await connection.commit();

    req.io?.emit('products:reordered', { orderedIds });

    res.json({
      success: true,
      message: 'Ürün sıralaması güncellendi.',
      orderedIds
    });
  } catch (error) {
    await connection.rollback();
    console.error('Ürün sıralama hatası:', error);
    res.status(500).json({ success: false, message: 'Sıralama güncellenemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Ürünleri Şık Bir Excel (.xlsx) Dosyası Olarak Dışa Aktar (Dinamik Kategori & Kolon Filtreli)
 */
export const exportProductsToExcel = async (req, res) => {
  try {
    const { category_ids, columns } = req.method === 'POST' ? req.body : req.query;

    const conditions = ['p.status != -1'];
    const params = [];

    // Kategori Filtresi (Seçilen kategoriler)
    if (category_ids && category_ids !== 'all') {
      let catIdList = [];
      if (Array.isArray(category_ids)) {
        catIdList = category_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      } else if (typeof category_ids === 'string') {
        catIdList = category_ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      }
      if (catIdList.length > 0) {
        conditions.push(`p.category_id IN (${catIdList.map(() => '?').join(',')})`);
        params.push(...catIdList);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        p.id,
        p.category_id,
        c.name AS category_name,
        p.name,
        p.description,
        p.ingredients,
        p.price,
        p.cost_price,
        p.order_num,
        p.status,
        p.show_in_qr,
        p.created_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ORDER BY c.order_num ASC, p.order_num ASC, p.id ASC
    `;

    const [products] = await pool.query(query, params);

    // İstenen Kolonlar
    let colOptions = {};
    if (typeof columns === 'string') {
      try {
        colOptions = JSON.parse(columns);
      } catch (e) {
        colOptions = {};
      }
    } else if (columns && typeof columns === 'object') {
      colOptions = columns;
    }

    const isIncluded = (key) => {
      if (colOptions[key] === undefined) return true; // varsayılan açık
      return colOptions[key] === true || colOptions[key] === 'true' || colOptions[key] === 1;
    };

    // Dinamik Kolon Tanımları
    const allHeaders = [
      { key: 'index', header: 'Sıra', width: 8, isAlways: true },
      { key: 'category', header: 'Kategori', width: 22 },
      { key: 'name', header: 'Ürün Adı', width: 30 },
      { key: 'price', header: 'Satış Fiyatı', width: 16 },
      { key: 'cost_price', header: 'Maliyet Fiyatı', width: 16 },
      { key: 'status', header: 'Durum', width: 14 },
      { key: 'show_in_qr', header: 'QR Menü', width: 14 },
      { key: 'description', header: 'Kısa Açıklama', width: 38 },
      { key: 'ingredients', header: 'İçindekiler / Malzemeler', width: 44 }
    ];

    const activeHeaders = allHeaders.filter(h => h.isAlways || isIncluded(h.key));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Özgensoy Kafeterya';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Ürün Listesi', {
      views: [{ showGridLines: true }]
    });

    const getColLetter = (index) => {
      let temp, letter = '';
      while (index > 0) {
        temp = (index - 1) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        index = Math.floor((index - temp - 1) / 26);
      }
      return letter || 'A';
    };

    const lastColLetter = getColLetter(activeHeaders.length);

    // 1. Satır: Başlık Banner'ı
    worksheet.mergeCells(`A1:${lastColLetter}1`);
    const titleCell = worksheet.getCell('A1');
    titleCell.value = '☕ ÖZGENSOY KAFETERYA MENÜ & ÜRÜN LİSTESİ';
    titleCell.font = { name: 'Segoe UI', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF346C80' } // Özgensoy Kafeterya Mavisi
    };
    worksheet.getRow(1).height = 36;

    // 2. Satır: Alt Bilgi (Tarih ve Özet)
    worksheet.mergeCells(`A2:${lastColLetter}2`);
    const subtitleCell = worksheet.getCell('A2');
    const nowStr = new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
    subtitleCell.value = `Rapor Tarihi: ${nowStr}  |  Toplam ${products.length} Adet Ürün`;
    subtitleCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF5C3E26' } };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    subtitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF5EEE6' } // Krem Arkaplan
    };
    worksheet.getRow(2).height = 22;

    // 3. Satır: Boşluk
    worksheet.getRow(3).height = 8;

    // 4. Satır: Kolon Başlıkları
    worksheet.columns = activeHeaders.map(h => ({
      key: h.key,
      width: h.width
    }));

    const headerRow = worksheet.getRow(4);
    activeHeaders.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h.header;
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF5C3E26' } // Koyu Kahve Başlık
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD4B996' } },
        bottom: { style: 'medium', color: { argb: 'FF784E2D' } },
        left: { style: 'thin', color: { argb: 'FF8C7664' } },
        right: { style: 'thin', color: { argb: 'FF8C7664' } }
      };
    });
    headerRow.height = 28;

    // 5. Satırdan itibaren Verileri Ekle
    products.forEach((prod, index) => {
      const rowIndex = index + 5;
      const row = worksheet.getRow(rowIndex);
      const isEven = index % 2 === 0;
      const rowBgColor = isEven ? 'FFFFFFFF' : 'FFFDFBF7'; // Yumuşak latte zebra deseni

      const rowValues = [];
      activeHeaders.forEach(h => {
        if (h.key === 'index') {
          rowValues.push(index + 1);
        } else if (h.key === 'category') {
          rowValues.push(prod.category_name || '-');
        } else if (h.key === 'name') {
          rowValues.push(prod.name);
        } else if (h.key === 'price') {
          rowValues.push(parseFloat(prod.price || 0));
        } else if (h.key === 'cost_price') {
          rowValues.push(prod.cost_price ? parseFloat(prod.cost_price) : '-');
        } else if (h.key === 'status') {
          rowValues.push(prod.status === 1 ? 'Aktif' : 'Pasif');
        } else if (h.key === 'show_in_qr') {
          rowValues.push((prod.show_in_qr === 1 && prod.status === 1) ? 'Görünür' : 'Gizli');
        } else if (h.key === 'description') {
          rowValues.push(prod.description || '-');
        } else if (h.key === 'ingredients') {
          rowValues.push(prod.ingredients || '-');
        }
      });

      row.values = rowValues;
      row.height = 24;

      // Hücre stilleri
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerInfo = activeHeaders[colNumber - 1];
        if (!headerInfo) return;

        cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF2C221E' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBgColor }
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFEBDCD0' } },
          bottom: { style: 'thin', color: { argb: 'FFEBDCD0' } },
          left: { style: 'thin', color: { argb: 'FFEBDCD0' } },
          right: { style: 'thin', color: { argb: 'FFEBDCD0' } }
        };

        if (headerInfo.key === 'index') {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF784E2D' } };
        } else if (headerInfo.key === 'category') {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF5C3E26' } };
        } else if (headerInfo.key === 'name') {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF2C221E' } };
        } else if (headerInfo.key === 'price') {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00 "₺"';
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E7E34' } };
        } else if (headerInfo.key === 'cost_price') {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          if (typeof cell.value === 'number') {
            cell.numFmt = '#,##0.00 "₺"';
            cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF8C7664' } };
          } else {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        } else if (headerInfo.key === 'status') {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = {
            name: 'Segoe UI',
            size: 9.5,
            bold: true,
            color: { argb: cell.value === 'Aktif' ? 'FF1E7E34' : 'FF8C7664' }
          };
        } else if (headerInfo.key === 'show_in_qr') {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = {
            name: 'Segoe UI',
            size: 9.5,
            bold: true,
            color: { argb: cell.value === 'Görünür' ? 'FF1E7E34' : 'FFB84A39' }
          };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF5C4F45' } };
        }
      });
    });

    const filename = `Ozgensoy_Kafeterya_Urun_Listesi_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel dışa aktarma hatası:', error);
    res.status(500).json({ success: false, message: 'Excel dosyası oluşturulamadı: ' + error.message });
  }
};
