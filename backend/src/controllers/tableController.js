import { pool } from '../config/db.js';

// Tüm aktif masaları ve açık sipariş tutarlarını getir
export const getTables = async (req, res) => {
  try {
    const query = `
      SELECT 
        t.id,
        t.table_number,
        t.title,
        t.status,
        t.qr_code_token,
        t.order_num,
        COALESCE(
          (
            SELECT SUM(o.total_price) 
            FROM orders o 
            WHERE o.table_id = t.id AND o.status NOT IN ('completed', 'cancelled')
          ), 0.00
        ) as active_total,
        (
          SELECT COUNT(o.id)
          FROM orders o
          WHERE o.table_id = t.id AND o.status NOT IN ('completed', 'cancelled')
        ) as active_orders_count,
        (
          SELECT MIN(o.created_at)
          FROM orders o
          WHERE o.table_id = t.id AND o.status NOT IN ('completed', 'cancelled')
        ) as opened_at
      FROM restaurant_tables t
      WHERE t.is_active = TRUE
      ORDER BY t.order_num ASC, t.id ASC
    `;

    const [tables] = await pool.query(query);
    res.json({ success: true, tables });
  } catch (error) {
    console.error('Masaları getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Masalar yüklenemedi: ' + error.message });
  }
};

// Yeni masa oluştur
export const createTable = async (req, res) => {
  try {
    const { title, table_number } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Masa adı zorunludur.' });
    }

    // Mevcut en yüksek order_num'ı bul
    const [maxOrder] = await pool.query('SELECT COALESCE(MAX(order_num), 0) + 1 as next_order FROM restaurant_tables WHERE is_active = TRUE');
    const nextOrder = maxOrder[0].next_order;

    const generatedTableNumber = table_number?.trim() || `M-${Date.now().toString().slice(-4)}`;
    const qrToken = `qr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const [result] = await pool.query(
      'INSERT INTO restaurant_tables (table_number, title, status, qr_code_token, order_num, is_active) VALUES (?, ?, "empty", ?, ?, TRUE)',
      [generatedTableNumber, title.trim(), qrToken, nextOrder]
    );

    const newTable = {
      id: result.insertId,
      table_number: generatedTableNumber,
      title: title.trim(),
      status: 'empty',
      qr_code_token: qrToken,
      order_num: nextOrder,
      active_total: 0.00,
      active_orders_count: 0
    };

    if (req.io) {
      req.io.emit('table_created', newTable);
    }

    res.status(201).json({ success: true, message: 'Masa başarıyla eklendi.', table: newTable });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Bu masa numarası zaten mevcut.' });
    }
    console.error('Masa ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Masa eklenemedi: ' + error.message });
  }
};

// Masa güncelle (başlık veya durum)
export const updateTable = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status } = req.body;

    const [existing] = await pool.query('SELECT * FROM restaurant_tables WHERE id = ? AND is_active = TRUE', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Masa bulunamadı.' });
    }

    const updatedTitle = title !== undefined ? title.trim() : existing[0].title;
    const updatedStatus = status !== undefined ? status : existing[0].status;

    await pool.query(
      'UPDATE restaurant_tables SET title = ?, status = ? WHERE id = ?',
      [updatedTitle, updatedStatus, id]
    );

    if (updatedStatus === 'empty') {
      const [activeOrders] = await pool.query(
        "SELECT id FROM orders WHERE table_id = ? AND status NOT IN ('completed', 'cancelled')",
        [id]
      );
      for (const ord of activeOrders) {
        const [items] = await pool.query(
          "SELECT id, is_paid, item_status FROM order_items WHERE order_id = ?",
          [ord.id]
        );
        const hasValidConsumption = items.some(i => i.is_paid || i.item_status === 'complimentary' || i.item_status === 'delivered');
        const finalStatus = hasValidConsumption ? 'completed' : 'cancelled';
        await pool.query("UPDATE orders SET status = ?, total_price = 0.00 WHERE id = ?", [finalStatus, ord.id]);
      }
    }

    if (req.io) {
      req.io.emit('table_updated', { id: parseInt(id), title: updatedTitle, status: updatedStatus });
      req.io.emit('table:updated', { tableId: parseInt(id), status: updatedStatus, active_total: 0.00 });
      req.io.emit('order:updated', { tableId: parseInt(id) });
    }

    res.json({ success: true, message: 'Masa güncellendi.' });
  } catch (error) {
    console.error('Masa güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Masa güncellenemedi: ' + error.message });
  }
};

// Masayı sil (Kalıcı silmek yerine is_active = FALSE yaparak geçmiş siparişleri korur)
export const deleteTable = async (req, res) => {
  try {
    const { id } = req.params;

    // Masada açık sipariş var mı kontrol et
    const [openOrders] = await pool.query(
      "SELECT id FROM orders WHERE table_id = ? AND status NOT IN ('completed', 'cancelled')",
      [id]
    );

    if (openOrders.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu masada şu an açık sipariş bulunduğu için silinemez. Önce hesabı kapatmalısınız.'
      });
    }

    // Soft delete: Geçmiş siparişler ve ciro raporları boşa düşmesin diye sadece pasife çekiyoruz!
    await pool.query('UPDATE restaurant_tables SET is_active = FALSE WHERE id = ?', [id]);

    if (req.io) {
      req.io.emit('table_deleted', { id: parseInt(id) });
    }

    res.json({ success: true, message: 'Masa başarıyla kaldırıldı (geçmiş siparişleri korundu).' });
  } catch (error) {
    console.error('Masa silme hatası:', error);
    res.status(500).json({ success: false, message: 'Masa silinemedi: ' + error.message });
  }
};

// Masaların sıralamasını kaydet (Reorder)
export const reorderTables = async (req, res) => {
  try {
    const { tableIds } = req.body; // Örn: [5, 2, 8, 1, 3]

    if (!Array.isArray(tableIds) || tableIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Geçersiz masa sıralama verisi.' });
    }

    // Her masa için order_num değerini güncelle
    const updatePromises = tableIds.map((id, index) => {
      return pool.query('UPDATE restaurant_tables SET order_num = ? WHERE id = ?', [index + 1, id]);
    });

    await Promise.all(updatePromises);

    if (req.io) {
      req.io.emit('tables_reordered', tableIds);
    }

    res.json({ success: true, message: 'Masa sıralaması başarıyla kaydedildi.' });
  } catch (error) {
    console.error('Masa sıralama hatası:', error);
    res.status(500).json({ success: false, message: 'Sıralama güncellenemedi: ' + error.message });
  }
};
