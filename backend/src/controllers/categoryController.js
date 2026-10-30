import { pool } from '../config/db.js';
import { optimizeAndSaveImage } from '../config/upload.js';
import { getUserFromReq, logActivity } from '../config/auditLogger.js';

/**
 * Kategorileri listele
 * Query parametresi ?active_only=true ise sadece aktif (status = 1) olanları getirir (POS ve QR için)
 * Aksi halde silinmemiş olan tümünü (status != -1) getirir
 */
export const getCategories = async (req, res) => {
  try {
    const activeOnly = req.query.active_only === 'true' || req.query.active_only === '1';
    
    let whereClause = 'WHERE c.status != -1';
    if (activeOnly) {
      whereClause = 'WHERE c.status = 1';
    }

    const query = `
      SELECT 
        c.id,
        c.name,
        c.icon,
        c.image_url,
        c.order_num,
        c.status,
        c.show_in_qr,
        c.created_at,
        c.created_by_user_id,
        u1.name AS created_by_name,
        c.updated_by_user_id,
        u2.name AS updated_by_name,
        COUNT(p.id) AS total_products,
        COUNT(CASE WHEN p.is_available = 1 THEN 1 END) AS active_products
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      LEFT JOIN users u1 ON c.created_by_user_id = u1.id
      LEFT JOIN users u2 ON c.updated_by_user_id = u2.id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.order_num ASC, c.id ASC
    `;

    const [categories] = await pool.query(query);
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Kategorileri getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Kategoriler alınamadı: ' + error.message });
  }
};

/**
 * Yeni Kategori Ekle
 * Form-data veya JSON kabul eder.
 */
export const createCategory = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { name, image_url, icon } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Kategori adı zorunludur.' });
    }

    let finalImageUrl = image_url ? image_url.trim() : null;

    // Eğer görsel dosyası yüklendiyse WebP olarak optimize et
    if (req.file) {
      try {
        finalImageUrl = await optimizeAndSaveImage(req.file.buffer, 'categories', 500, 500);
      } catch (imgErr) {
        console.error('Görsel optimizasyon hatası:', imgErr);
        return res.status(400).json({ success: false, message: 'Görsel işlenemedi: ' + imgErr.message });
      }
    }

    // Sıradaki order_num değerini bul
    const [maxOrder] = await pool.query(
      'SELECT COALESCE(MAX(order_num), 0) + 1 AS next_order FROM categories WHERE status != -1'
    );
    const nextOrder = maxOrder[0].next_order;

    // Yeni kategoriyi ekle (Varsayılan status = 1: Aktif, created_by_user_id kaydedilir)
    const [result] = await pool.query(
      `INSERT INTO categories (name, icon, image_url, order_num, status, created_by_user_id, updated_by_user_id) 
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [name.trim(), icon || 'Coffee', finalImageUrl, nextOrder, user.id, user.id]
    );

    const [createdRows] = await pool.query(
      `SELECT c.*, 0 AS total_products, 0 AS active_products, ? AS created_by_name 
       FROM categories c WHERE c.id = ?`,
      [user.name, result.insertId]
    );

    const newCategory = createdRows[0];

    // Denetim Günlüğü Kaydı
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'category',
      entityId: result.insertId,
      actionType: 'category_created',
      title: `Yeni Kategori Eklendi: "${name.trim()}"`,
      details: `${user.name} tarafından oluşturuldu. İkon: ${icon || 'Coffee'}`,
      newValue: { name: name.trim(), icon: icon || 'Coffee' }
    });

    // Socket.io ile tüm bağlı ekranlara bildir
    req.io?.emit('category:created', newCategory);

    res.status(201).json({
      success: true,
      message: 'Kategori başarıyla oluşturuldu.',
      category: newCategory
    });
  } catch (error) {
    console.error('Kategori ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Kategori eklenemedi: ' + error.message });
  }
};

/**
 * Kategori Güncelle (Ad, Görsel, İkon, Durum vb.)
 */
export const updateCategory = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;
    const { name, image_url, icon, status } = req.body;

    // Kategorinin var olduğunu kontrol et
    const [existing] = await pool.query(
      'SELECT * FROM categories WHERE id = ? AND status != -1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı veya silinmiş.' });
    }

    const prev = existing[0];
    let finalImageUrl = prev.image_url;

    // Yeni görsel yüklendiyse WebP olarak optimize et
    if (req.file) {
      try {
        finalImageUrl = await optimizeAndSaveImage(req.file.buffer, 'categories', 500, 500);
      } catch (imgErr) {
        console.error('Görsel optimizasyon hatası:', imgErr);
        return res.status(400).json({ success: false, message: 'Görsel işlenemedi: ' + imgErr.message });
      }
    } else if (image_url !== undefined) {
      finalImageUrl = image_url ? image_url.trim() : null;
    }

    const updatedName = name ? name.trim() : prev.name;
    const updatedIcon = icon !== undefined ? icon : prev.icon;
    const updatedStatus = status !== undefined ? parseInt(status, 10) : prev.status;

    // Değişiklikleri tespit et
    const changes = [];
    if (prev.name !== updatedName) {
      changes.push(`İsim: "${prev.name}" ➔ "${updatedName}"`);
    }
    if (prev.icon !== updatedIcon) {
      changes.push(`İkon: "${prev.icon}" ➔ "${updatedIcon}"`);
    }
    if (prev.status !== updatedStatus) {
      changes.push(`Durum: ${prev.status === 1 ? 'Aktif' : 'Pasif'} ➔ ${updatedStatus === 1 ? 'Aktif' : 'Pasif'}`);
    }
    if (req.file) {
      changes.push('Görsel güncellendi');
    }

    await pool.query(
      `UPDATE categories 
       SET name = ?, icon = ?, image_url = ?, status = ?, updated_by_user_id = ? 
       WHERE id = ?`,
      [updatedName, updatedIcon, finalImageUrl, updatedStatus, user.id, id]
    );

    const [updatedRows] = await pool.query(
      `SELECT 
        c.*,
        u2.name AS updated_by_name,
        COUNT(p.id) AS total_products,
        COUNT(CASE WHEN p.is_available = 1 THEN 1 END) AS active_products
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id
       LEFT JOIN users u2 ON c.updated_by_user_id = u2.id
       WHERE c.id = ?
       GROUP BY c.id`,
      [id]
    );

    const updatedCategory = updatedRows[0];

    // Denetim Günlüğü Kaydı
    if (changes.length > 0) {
      await logActivity({
        userId: user.id,
        userName: user.name,
        entityType: 'category',
        entityId: id,
        actionType: 'category_updated',
        title: `Kategori Güncellendi: "${updatedName}"`,
        details: `${user.name} tarafından düzenlendi: ${changes.join(' | ')}`,
        oldValue: { name: prev.name, icon: prev.icon, status: prev.status },
        newValue: { name: updatedName, icon: updatedIcon, status: updatedStatus }
      });
    }

    // Socket.io ile güncelle
    req.io?.emit('category:updated', updatedCategory);

    res.json({
      success: true,
      message: 'Kategori başarıyla güncellendi.',
      category: updatedCategory
    });
  } catch (error) {
    console.error('Kategori güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Kategori güncellenemedi: ' + error.message });
  }
};

/**
 * Kategori Durum Değiştir (Aktif / Pasif Toggle)
 */
export const toggleCategoryStatus = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;
    let targetStatus = req.body.status;

    const [existing] = await pool.query(
      'SELECT id, name, status FROM categories WHERE id = ? AND status != -1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı.' });
    }

    if (targetStatus === undefined) {
      targetStatus = existing[0].status === 1 ? 0 : 1;
    } else {
      targetStatus = parseInt(targetStatus, 10);
    }

    await pool.query('UPDATE categories SET status = ?, updated_by_user_id = ? WHERE id = ?', [targetStatus, user.id, id]);

    // Denetim Günlüğü
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'category',
      entityId: id,
      actionType: 'category_status_changed',
      title: `Kategori Durumu Değiştirildi: "${existing[0].name}"`,
      details: `${user.name} tarafından ${targetStatus === 1 ? 'Aktif' : 'Pasif'} yapıldı.`
    });

    const [updatedRows] = await pool.query(
      `SELECT 
        c.*,
        u2.name AS updated_by_name,
        COUNT(p.id) AS total_products,
        COUNT(CASE WHEN p.is_available = 1 THEN 1 END) AS active_products
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id
       LEFT JOIN users u2 ON c.updated_by_user_id = u2.id
       WHERE c.id = ?
       GROUP BY c.id`,
      [id]
    );

    const updatedCategory = updatedRows[0];
    req.io?.emit('category:updated', updatedCategory);

    res.json({
      success: true,
      message: `Kategori ${targetStatus === 1 ? 'aktif' : 'pasif'} duruma getirildi.`,
      category: updatedCategory
    });
  } catch (error) {
    console.error('Kategori durum değiştirme hatası:', error);
    res.status(500).json({ success: false, message: 'Durum değiştirilemedi: ' + error.message });
  }
};

/**
 * Kategori QR Menü Gösterim Durumunu Değiştir
 */
export const toggleCategoryQrStatus = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;
    let targetQr = req.body.show_in_qr;

    const [existing] = await pool.query(
      'SELECT id, name, status, show_in_qr FROM categories WHERE id = ? AND status != -1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı.' });
    }

    if (targetQr === undefined) {
      targetQr = existing[0].show_in_qr === 1 ? 0 : 1;
    } else {
      targetQr = parseInt(targetQr, 10);
    }

    await pool.query('UPDATE categories SET show_in_qr = ?, updated_by_user_id = ? WHERE id = ?', [targetQr, user.id, id]);

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'category',
      entityId: id,
      actionType: 'category_qr_changed',
      title: `Kategori QR Görünürlüğü Değiştirildi: "${existing[0].name}"`,
      details: `${user.name} tarafından QR Menüde ${targetQr === 1 ? 'Gösterildi' : 'Gizlendi'}.`
    });

    const [updatedRows] = await pool.query(
      `SELECT c.*, COUNT(p.id) AS total_products, COUNT(CASE WHEN p.is_available = 1 THEN 1 END) AS active_products
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id
       WHERE c.id = ?
       GROUP BY c.id`,
      [id]
    );

    const updatedCategory = updatedRows[0];
    req.io?.emit('category:updated', updatedCategory);

    res.json({
      success: true,
      message: `"${existing[0].name}" QR menüde ${targetQr === 1 ? 'gösterilecek' : 'gizlendi'}.`,
      category: updatedCategory
    });
  } catch (error) {
    console.error('QR menü durum değiştirme hatası:', error);
    res.status(500).json({ success: false, message: 'QR durum değiştirilemedi: ' + error.message });
  }
};

/**
 * Kategori Sil (Soft Delete -> status = -1)
 */
export const deleteCategory = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;

    const [existing] = await pool.query(
      'SELECT id, name FROM categories WHERE id = ? AND status != -1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı veya zaten silinmiş.' });
    }

    // Kategoriye bağlı ürün kontrolü
    const [prodCount] = await pool.query(
      'SELECT COUNT(id) AS count FROM products WHERE category_id = ? AND status != -1',
      [id]
    );

    if (prodCount[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Bu kategoriye bağlı ${prodCount[0].count} adet ürün bulunmaktadır. Kategori silinemez! Lütfen önce ürünleri silin veya başka bir kategoriye taşıyın.`
      });
    }

    // Soft delete: status = -1
    await pool.query('UPDATE categories SET status = -1, updated_by_user_id = ? WHERE id = ?', [user.id, id]);

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'category',
      entityId: id,
      actionType: 'category_deleted',
      title: `Kategori Silindi: "${existing[0].name}"`,
      details: `${user.name} tarafından silindi.`
    });

    req.io?.emit('category:deleted', { id: Number(id) });

    res.json({
      success: true,
      message: `"${existing[0].name}" kategorisi silindi.`
    });
  } catch (error) {
    console.error('Kategori silme hatası:', error);
    res.status(500).json({ success: false, message: 'Kategori silinemedi: ' + error.message });
  }
};

/**
 * Kategorileri Sürükle-Bırak ile Yeniden Sırala
 */
export const reorderCategories = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Sıralama dizisi geçersiz.' });
    }

    const updates = orderedIds.map((id, index) => {
      return pool.query('UPDATE categories SET order_num = ?, updated_by_user_id = ? WHERE id = ?', [index + 1, user.id, id]);
    });

    await Promise.all(updates);

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'category',
      actionType: 'category_reordered',
      title: 'Kategori Gösterim Sırası Değiştirildi',
      details: `${user.name} tarafından kategorilerin sıralaması güncellendi.`
    });

    req.io?.emit('categories:reordered', { orderedIds });

    res.json({ success: true, message: 'Kategori gösterim sırası güncellendi.' });
  } catch (error) {
    console.error('Kategori sıralama hatası:', error);
    res.status(500).json({ success: false, message: 'Sıralama güncellenemedi: ' + error.message });
  }
};

/**
 * Belirli Bir Kategorinin Değişiklik Geçmişi
 */
export const getCategoryHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const [history] = await pool.query(
      `SELECT a.*, u.role AS user_role 
       FROM audit_logs a 
       LEFT JOIN users u ON a.user_id = u.id 
       WHERE a.entity_type = 'category' AND a.entity_id = ? 
       ORDER BY a.id DESC`,
      [id]
    );
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Geçmiş alınamadı: ' + err.message });
  }
};
