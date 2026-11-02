import crypto from 'crypto';
import { pool } from '../config/db.js';
import { getUserFromReq, logActivity } from '../config/auditLogger.js';
import { formatTitleCase } from './customerController.js';
import { can, canAny, deny } from '../middleware/auth.js';

// Tek kalemde girilebilecek en yüksek adet
const MAX_ITEM_QTY = 999;
// İkram/iade/iptal edilmiş kalemler: bu durumdan çıkarmak, o durumu verme yetkisini de ister
const LOSS_STATUSES = ['cancelled', 'returned', 'complimentary'];

/**
 * Kullanıcının Kuralı: Masada ödenmiş olan aynı ürünler tek satırda birleştirilsin!
 * (Aynı üründen daha önce ödenen ile sonra ödenen aynı siparişte tek satır haline getirilir)
 * Yalnızca durumu, birim fiyatı ve QR isteği aynı olan satırlar birleşir: ikram/iade/iptal kalemleri
 * satışa dönüşmez (raporlar bozulmaz), fiyatı değişmiş ürün yanlış birim fiyatla görünmez,
 * QR müşterisi kendi siparişinin durumunu görmeye devam eder.
 */
export const mergePaidOrderItems = async (connectionOrPool, orderId = null) => {
  const query = `
    SELECT order_id, product_id, unit_price, item_status, qr_request_id,
           COUNT(*) as cnt, MIN(id) as keep_id,
           SUM(quantity) as total_qty, SUM(total_price) as total_sum,
           GROUP_CONCAT(DISTINCT NULLIF(TRIM(note), '') SEPARATOR ', ') as combined_notes
    FROM order_items
    WHERE is_paid = 1 ${orderId ? 'AND order_id = ?' : ''}
    GROUP BY order_id, product_id, unit_price, item_status, qr_request_id
    HAVING cnt > 1
  `;
  const [duplicatePaid] = await connectionOrPool.query(query, orderId ? [orderId] : []);

  for (const dup of duplicatePaid) {
    await connectionOrPool.query(
      'UPDATE order_items SET quantity = ?, total_price = ?, note = ? WHERE id = ?',
      [dup.total_qty, dup.total_sum, dup.combined_notes || null, dup.keep_id]
    );
    await connectionOrPool.query(
      `DELETE FROM order_items
       WHERE order_id = ? AND product_id = ? AND is_paid = 1 AND unit_price = ? AND item_status = ?
         AND (qr_request_id <=> ?) AND id != ?`,
      [dup.order_id, dup.product_id, dup.unit_price, dup.item_status, dup.qr_request_id, dup.keep_id]
    );
  }
};

/**
 * Siparişin kalan (ödenmemiş) borcunu hesaplayıp orders.total_price'a yazar.
 * Kalan = Faturalanabilir tüm kalemler (ödenmiş dahil; İptal, İade, İkram hariç)
 *         - Daha önce masadan düşülen tutar (Tahsilat - Bahşiş + İndirim)
 * Böylece kalem bazlı ve tutar bazlı kısmi ödemeler aynı formülle hesaba katılır.
 */
export const recalcOrderTotal = async (connectionOrPool, orderId) => {
  const [[itemsRow]] = await connectionOrPool.query(
    `SELECT COALESCE(SUM(total_price), 0.00) as items_sum FROM order_items
     WHERE order_id = ? AND item_status NOT IN ('cancelled', 'returned', 'complimentary')`,
    [orderId]
  );
  const [[paidRow]] = await connectionOrPool.query(
    `SELECT COALESCE(SUM(total_amount - tip + discount), 0.00) as settled FROM payments WHERE order_id = ?`,
    [orderId]
  );
  const remaining = Math.max(0, parseFloat(itemsRow.items_sum) - parseFloat(paidRow.settled));
  const newTotal = Math.round(remaining * 100) / 100;

  await connectionOrPool.query('UPDATE orders SET total_price = ? WHERE id = ?', [newTotal, orderId]);
  return newTotal;
};

/**
 * Belirli bir masanın aktif sipariş ve adisyon detaylarını getir
 */
/**
 * Kalem adedi değişikliği / kalemin masadan kaldırılması için denetim izi kaydı
 * change: { action, verb, qty } — qty: değişen adet (azalışta negatif)
 */
const logItemChange = async (req, item, tableId, change) => {
  const user = getUserFromReq(req);
  const [[prod]] = await pool.query('SELECT name FROM products WHERE id = ?', [item.product_id]);
  const [[table]] = await pool.query('SELECT title FROM restaurant_tables WHERE id = ?', [tableId]);
  const productName = prod?.name || 'Ürün';
  const tableTitle = table?.title || `Masa ${tableId}`;
  const amount = Math.abs(change.qty) * parseFloat(item.unit_price);
  await logActivity({
    userId: user.id,
    userName: user.name,
    entityType: 'order_item',
    entityId: item.id,
    actionType: change.action,
    title: `${change.verb}: ${productName} (${tableTitle})`,
    details: `${user.name} tarafından mutfağa geçmeden önce değiştirildi. Tutar farkı: ${change.qty < 0 ? '−' : '+'}₺${amount.toFixed(2)}`,
    amount,
    quantity: Math.abs(change.qty),
    tableTitle
  });
};

export const getTableOrder = async (req, res) => {
  try {
    const { tableId } = req.params;

    // 1. Masa Bilgisini Getir
    const [tableRows] = await pool.query(
      'SELECT id, table_number, title, status FROM restaurant_tables WHERE id = ? AND is_active = TRUE',
      [tableId]
    );

    if (tableRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Masa bulunamadı.' });
    }

    const table = tableRows[0];

    // 2. Masanın Açık Siparişini Getir (completed veya cancelled olmayan)
    const [orderRows] = await pool.query(
      `SELECT * FROM orders 
       WHERE table_id = ? AND status NOT IN ('completed', 'cancelled') 
       ORDER BY id DESC LIMIT 1`,
      [tableId]
    );

    if (orderRows.length === 0) {
      return res.json({
        success: true,
        table,
        order: null,
        items: [],
        payments: []
      });
    }

    const order = orderRows[0];

    // Not: Ödenmiş aynı ürünlerin birleştirilmesi ödeme işleminin içinde yapılır; okuma isteği veriyi değiştirmez
    // (aynı masayı iki cihaz aynı anda açtığında çakışma olmasın).

    // 4. Siparişe Ait Kalemleri (Ürünleri) Getir (Önce ödenmemişler, sonra ödenmişler)
    const [items] = await pool.query(
      `SELECT 
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        oi.item_status,
        COALESCE(oi.is_paid, 0) AS is_paid,
        oi.note,
        oi.created_at,
        p.name AS product_name,
        p.image_url,
        c.name AS category_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE oi.order_id = ?
       ORDER BY oi.is_paid ASC, oi.id ASC`,
      [order.id]
    );

    // 5. Siparişe ait daha önce yapılmış kısmi veya tamamlanmış tahsilat kayıtlarını getir
    const [payments] = await pool.query(
      `SELECT 
        p.id,
        p.table_id,
        p.order_id,
        p.total_amount,
        p.cash_amount,
        p.card_amount,
        p.veresiye_amount,
        p.discount,
        p.tip,
        p.payment_method,
        p.customer_id,
        p.customer_name,
        p.notes,
        p.created_at,
        u.name AS closed_by_name
       FROM payments p
       LEFT JOIN users u ON p.closed_by_user_id = u.id
       WHERE p.order_id = ? OR (p.order_id IS NULL AND p.table_id = ? AND p.created_at >= ?)
       ORDER BY p.id ASC`,
      [order.id, tableId, order.created_at]
    );

    res.json({
      success: true,
      table,
      order,
      items,
      payments: payments || []
    });
  } catch (error) {
    console.error('Masa siparişi getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Sipariş detayları alınamadı: ' + error.message });
  }
};

/** İş kuralı hatası (HTTP durum kodu ile) — işlem geri alınır ve mesaj kullanıcıya gösterilir */
export class OrderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Masaya ürün ekler (açık adisyon yoksa yeni adisyon açar). Açık bir veritabanı işlemi (transaction) içinde çağrılmalıdır.
 * Garsonun POS'tan girdiği sipariş ile onaylanan QR siparişi bu ortak yolu kullanır.
 * Fiyat her zaman veritabanından alınır; adetler doğrulanmış olmalıdır.
 * @returns {{ orderId, newTotal, tableTitle, totalQty }}
 */
export const addItemsToTable = async (connection, { tableId, items, note = null, userId = null, source = 'pos', qrRequestId = null }) => {
  // 1. Masa kontrolü
  const [tableRows] = await connection.query(
    'SELECT id, title, status FROM restaurant_tables WHERE id = ? AND is_active = TRUE FOR UPDATE',
    [tableId]
  );
  if (tableRows.length === 0) throw new OrderError(404, 'Masa bulunamadı.');

  // 2. Masada açık sipariş var mı?
  const [activeOrders] = await connection.query(
    `SELECT id, total_price FROM orders
     WHERE table_id = ? AND status NOT IN ('completed', 'cancelled')
     ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [tableId]
  );

  let orderId;
  if (activeOrders.length > 0) {
    orderId = activeOrders[0].id;
    if (note && source === 'qr') {
      // Müşterinin QR notu personelin yazdığı adisyon notunu silmez, sonuna eklenir
      await connection.query(
        "UPDATE orders SET note = IF(note IS NULL OR note = '', ?, CONCAT(note, ' | ', ?)) WHERE id = ?",
        [note, note, orderId]
      );
    } else if (note) {
      await connection.query('UPDATE orders SET note = ? WHERE id = ?', [note, orderId]);
    }
  } else {
    // Yeni sipariş oluştur
    const [orderResult] = await connection.query(
      `INSERT INTO orders (table_id, status, source, total_price, note, created_by_user_id)
       VALUES (?, 'approved', ?, 0.00, ?, ?)`,
      [tableId, source, note || null, userId]
    );
    orderId = orderResult.insertId;

    // Benzersiz Sipariş GUID (UUID v4) ata
    await connection.query('UPDATE orders SET order_number = ? WHERE id = ?', [crypto.randomUUID(), orderId]);
  }

  // 3. Kalemleri (Ürünleri) Ekle veya Miktarlarını Artır
  for (const item of items) {
    const quantity = Number(item.quantity ?? 1);
    // Fiyat her zaman veritabanından alınır; istemcinin gönderdiği fiyat dikkate alınmaz
    const [pRows] = await connection.query('SELECT name, price, status FROM products WHERE id = ?', [item.product_id]);
    if (pRows.length === 0 || Number(pRows[0].status) !== 1) {
      throw new OrderError(400, pRows.length ? `"${pRows[0].name}" şu an satışta değil.` : 'Siparişteki bir ürün bulunamadı.');
    }
    const unitPrice = parseFloat(pRows[0].price) || 0;
    const itemNote = typeof item.note === 'string' && item.note.trim() ? item.note.trim() : null;

    // Kullanıcının kuralı: SADECE durumu MUTFAKTA ('pending') olan, ÖDENMEMİŞ, aynı fiyatlı ve aynı nota sahip satırları birleştir!
    // Eğer mevcut satır 'delivered' (teslim edilmiş), hazır veya ödenmişse asla birleştirilmez; yeni satır olarak eklenir!
    // QR siparişinin kalemleri müşterinin takip edebilmesi için yalnızca aynı QR isteğinin kalemleriyle birleşir.
    const [existingItems] = await connection.query(
      `SELECT id, quantity, unit_price FROM order_items
       WHERE order_id = ? AND product_id = ? AND item_status = 'pending' AND COALESCE(is_paid, 0) = 0 AND unit_price = ?
         AND (note = ? OR (note IS NULL AND ? IS NULL)) AND (qr_request_id <=> ?)
       ORDER BY id ASC LIMIT 1`,
      [orderId, item.product_id, unitPrice, itemNote, itemNote, qrRequestId]
    );

    if (existingItems.length > 0) {
      const existingItem = existingItems[0];
      const newQty = existingItem.quantity + quantity;
      await connection.query(
        'UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?',
        [newQty, newQty * unitPrice, existingItem.id]
      );
    } else {
      await connection.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, item_status, is_paid, note, created_by_user_id, qr_request_id)
         VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
        [orderId, item.product_id, quantity, unitPrice, quantity * unitPrice, itemNote, userId, qrRequestId]
      );
    }
  }

  // 4. Siparişin kalan borcunu yeniden hesapla
  const newTotal = await recalcOrderTotal(connection, orderId);

  // 5. Masayı Dolu (Occupied) Durumuna Getir
  await connection.query("UPDATE restaurant_tables SET status = 'occupied' WHERE id = ?", [tableId]);

  const totalQty = items.reduce((s, it) => s + (parseInt(it.quantity, 10) || 1), 0);
  return { orderId, newTotal, tableTitle: tableRows[0].title, totalQty };
};

/**
 * İşlem sonrası: ödenmiş kalemleri birleştirir, güncel adisyonu getirir ve POS/mutfak ekranlarına canlı bildirim gönderir.
 */
export const publishOrderUpdate = async (io, tableId, orderId, newTotal) => {
  await mergePaidOrderItems(pool, orderId);
  const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  const [allOrderItems] = await pool.query(
    `SELECT
      oi.*,
      COALESCE(oi.is_paid, 0) AS is_paid,
      p.name AS product_name,
      p.image_url,
      c.name AS category_name
     FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE oi.order_id = ?
     ORDER BY oi.id ASC`,
    [orderId]
  );

  const tid = parseInt(tableId, 10);
  io?.emit('table:updated', { tableId: tid, status: 'occupied', active_total: newTotal });
  io?.emit('order:created', { orderId, tableId: tid, order: orderRows[0], items: allOrderItems });
  return { order: orderRows[0], items: allOrderItems };
};

/**
 * Masaya Yeni Sipariş / Ek Ürünler Ekle (Kaydet / Mutfağa Gönder)
 */
export const saveTableOrder = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { tableId } = req.params;
    const { items, note } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'En az bir ürün eklenmelidir.' });
    }

    // Adet pozitif tam sayı olmalı (negatif/ondalık adet adisyon toplamını düşürmesin)
    for (const item of items) {
      const qty = Number(item.quantity ?? 1);
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ITEM_QTY) {
        return res.status(400).json({ success: false, message: `Ürün adedi 1 ile ${MAX_ITEM_QTY} arasında bir tam sayı olmalıdır.` });
      }
    }

    await connection.beginTransaction();
    const { orderId, newTotal, tableTitle, totalQty } = await addItemsToTable(connection, {
      tableId, items, note, userId: user.id, source: 'pos'
    });
    await connection.commit();

    // Denetim İzi Kaydı
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'order',
      entityId: orderId,
      actionType: 'order_created',
      title: `Sipariş Eklendi: ${tableTitle || 'Masa'}`,
      details: `${user.name} tarafından ${items.length} çeşit (${totalQty} adet) sipariş girildi.`,
      tableTitle,
      quantity: totalQty
    });

    const { order, items: allOrderItems } = await publishOrderUpdate(req.io, tableId, orderId, newTotal);

    res.json({
      success: true,
      message: 'Siparişler başarıyla kaydedildi ve mutfağa iletildi.',
      order,
      items: allOrderItems
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error instanceof OrderError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Sipariş kaydetme hatası:', error);
    res.status(500).json({ success: false, message: 'Sipariş kaydedilemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Tek Bir Sipariş Kaleminin Adetini veya Notunu Güncelle
 */
export const updateOrderItem = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { itemId } = req.params;
    const { quantity, note } = req.body;

    await connection.beginTransaction();

    const [itemRows] = await connection.query(
      'SELECT id, order_id, product_id, quantity, unit_price, is_paid, item_status FROM order_items WHERE id = ? FOR UPDATE',
      [itemId]
    );

    if (itemRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Sipariş kalemi bulunamadı.' });
    }

    const item = itemRows[0];
    if (item.is_paid) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Ödenmiş bir ürün değiştirilemez.' });
    }

    // Adet gönderilmediyse (sadece not güncelleniyorsa) mevcut adet korunur
    const qtyGiven = quantity !== undefined && quantity !== null && quantity !== '';
    const newQty = qtyGiven ? Number(quantity) : item.quantity;
    if (!Number.isInteger(newQty) || newQty < 0 || newQty > MAX_ITEM_QTY) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `Ürün adedi 0 ile ${MAX_ITEM_QTY} arasında bir tam sayı olmalıdır.` });
    }

    // Adet yalnızca mutfakta henüz hazırlanmaya başlanmamış kalemlerde değiştirilebilir.
    // Hazırlanan/teslim edilen ürünler İptal, İade veya İkram ile düşülür (kayıp raporunda görünsün diye).
    if (newQty !== item.quantity && item.item_status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Hazırlanmaya başlanmış veya teslim edilmiş ürünün adedi değiştirilemez. İptal, İade veya İkram kullanın.' });
    }
    if (newQty === 0 && !can(req.user, 'pos.item_delete')) {
      await connection.rollback();
      return deny(res, 'pos.item_delete');
    }

    if (newQty <= 0) {
      // 0 veya daha az ise kalemi sil
      await connection.query('DELETE FROM order_items WHERE id = ?', [itemId]);
    } else {
      const newTotal = newQty * parseFloat(item.unit_price);
      await connection.query(
        'UPDATE order_items SET quantity = ?, total_price = ?, note = COALESCE(?, note) WHERE id = ?',
        [newQty, newTotal, note !== undefined ? note : null, itemId]
      );
    }

    // Siparişin kalan borcunu yeniden hesapla
    const newOrderTotal = await recalcOrderTotal(connection, item.order_id);

    // Masa yalnızca siparişte hiç kalem (ödenmiş dahil) kalmadıysa boşaltılır
    const [countResult] = await connection.query(
      'SELECT COUNT(id) as count FROM order_items WHERE order_id = ?',
      [item.order_id]
    );
    const itemsCount = countResult[0].count;

    // Eğer hiç kalem kalmadıysa masayı boş yapabiliriz
    const [orderInfo] = await connection.query('SELECT table_id FROM orders WHERE id = ?', [item.order_id]);
    const tableId = orderInfo[0]?.table_id;

    if (itemsCount === 0 && tableId) {
      await connection.query("UPDATE restaurant_tables SET status = 'empty', qr_reset_at = NOW() WHERE id = ?", [tableId]);
      await connection.query("UPDATE orders SET status = 'cancelled', closed_at = NOW() WHERE id = ?", [item.order_id]);
    }

    await connection.commit();

    if (newQty !== item.quantity) {
      await logItemChange(req, item, tableId, newQty === 0
        ? { action: 'item_removed', verb: 'Masadan Kaldırıldı', qty: -item.quantity }
        : { action: 'item_quantity_changed', verb: `Adet Değişti (${item.quantity} → ${newQty})`, qty: newQty - item.quantity });
    }

    req.io?.emit('table:updated', {
      tableId,
      status: itemsCount === 0 ? 'empty' : 'occupied',
      active_total: newOrderTotal
    });
    req.io?.emit('order:updated', { tableId });

    res.json({
      success: true,
      message: 'Sipariş kalemi güncellendi.',
      newTotal: newOrderTotal
    });
  } catch (error) {
    await connection.rollback();
    console.error('Sipariş kalemi güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Güncellenemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Sipariş Kalemini Sil
 */
export const deleteOrderItem = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { itemId } = req.params;

    await connection.beginTransaction();

    const [itemRows] = await connection.query(
      'SELECT id, order_id, product_id, quantity, unit_price, is_paid, item_status FROM order_items WHERE id = ? FOR UPDATE',
      [itemId]
    );

    if (itemRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Sipariş kalemi bulunamadı.' });
    }

    const item = itemRows[0];
    if (item.is_paid) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Ödenmiş bir ürün masadan silinemez.' });
    }
    // Yalnızca mutfakta henüz hazırlanmaya başlanmamış kalem silinebilir; diğerleri İptal/İade/İkram ile düşülür
    if (item.item_status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Hazırlanmaya başlanmış veya teslim edilmiş ürün silinemez. İptal, İade veya İkram kullanın.' });
    }

    await connection.query('DELETE FROM order_items WHERE id = ?', [itemId]);

    // Siparişin kalan borcunu yeniden hesapla
    const newOrderTotal = await recalcOrderTotal(connection, item.order_id);

    const [orderInfo] = await connection.query('SELECT table_id FROM orders WHERE id = ?', [item.order_id]);
    const tableId = orderInfo[0]?.table_id;

    // Masadaki tüm kalemler (ödenmiş ve ödenmemiş toplam)
    const [allCountResult] = await connection.query(
      'SELECT COUNT(id) as total_count FROM order_items WHERE order_id = ?',
      [item.order_id]
    );
    const totalCount = allCountResult[0]?.total_count || 0;

    if (totalCount === 0 && tableId) {
      await connection.query("UPDATE restaurant_tables SET status = 'empty', qr_reset_at = NOW() WHERE id = ?", [tableId]);
      await connection.query("UPDATE orders SET status = 'cancelled', closed_at = NOW() WHERE id = ?", [item.order_id]);
    }

    await connection.commit();

    await logItemChange(req, item, tableId, { action: 'item_removed', verb: 'Masadan Kaldırıldı', qty: -item.quantity });

    req.io?.emit('table:updated', {
      tableId,
      status: totalCount === 0 ? 'empty' : 'occupied',
      active_total: newOrderTotal
    });
    req.io?.emit('order:updated', { tableId });

    res.json({
      success: true,
      message: 'Sipariş kalemi silindi.',
      newTotal: newOrderTotal
    });
  } catch (error) {
    await connection.rollback();
    console.error('Kalem silme hatası:', error);
    res.status(500).json({ success: false, message: 'Kalem silinemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Ödeme Alma & Masayı Kapatma (Nakit / Kredi Kartı / Parçalı / Veresiye / Tutar Bazlı)
 */
export const closeTablePayment = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { tableId } = req.params;
    const { 
      payment_method = 'cash', 
      amount_paid, 
      discount = 0, 
      tip = 0, 
      cash_amount = 0,
      card_amount = 0,
      veresiye_amount = 0,
      customer_id,
      customer_name,
      notes,
      paid_items 
    } = req.body;

    await connection.beginTransaction();

    // Masanın adını/başlığını al
    const [tableRow] = await connection.query('SELECT title FROM restaurant_tables WHERE id = ?', [tableId]);
    const tableTitle = tableRow[0]?.title || `Masa ${tableId}`;

    // 1. Masanın açık siparişlerini bul
    const [activeOrders] = await connection.query(
      `SELECT id, total_price, created_at FROM orders 
       WHERE table_id = ? AND status NOT IN ('completed', 'cancelled') 
       ORDER BY id DESC FOR UPDATE`,
      [tableId]
    );

    if (activeOrders.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Bu masada ödenecek açık bir sipariş bulunmuyor.' });
    }

    const primaryOrder = activeOrders[0];
    const discountVal = Math.max(0, parseFloat(discount || 0));
    const tipVal = Math.max(0, parseFloat(tip || 0));

    // Ödeme yöntemi doğrulama
    const allowedMethods = ['cash', 'credit_card', 'mixed', 'veresiye'];
    const validMethod = allowedMethods.includes(payment_method) ? payment_method : 'cash';

    let customerName = customer_name ? String(customer_name).trim() : null;
    const notesVal = notes ? String(notes).trim() : null;
    const veresiyeInputVal = parseFloat(veresiye_amount || 0);

    if ((validMethod === 'veresiye' || (validMethod === 'mixed' && veresiyeInputVal > 0)) && !customerName && !customer_id) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Veresiye tutarı için lütfen müşteri seçiniz veya müşteri adı giriniz.' });
    }

    // 2. Masadaki tüm sipariş kalemlerinin toplam tutarını ve daha önce ödenenleri hesapla
    const orderIds = activeOrders.map(o => o.id);
    const [itemSumRows] = await connection.query(
      `SELECT COALESCE(SUM(total_price), 0.00) as items_sum FROM order_items 
       WHERE order_id IN (${orderIds.map(() => '?').join(',')}) 
         AND item_status NOT IN ('cancelled', 'returned', 'complimentary')`,
      orderIds
    );
    const orderItemsTotal = parseFloat(itemSumRows[0].items_sum || 0);

    const [prevPaidRows] = await connection.query(
      `SELECT COALESCE(SUM(total_amount), 0.00) as paid_sum,
              COALESCE(SUM(discount), 0.00) as discount_sum,
              COALESCE(SUM(tip), 0.00) as tip_sum
       FROM payments 
       WHERE order_id IN (${orderIds.map(() => '?').join(',')})`,
      orderIds
    );
    const previousPaidTotal = parseFloat(prevPaidRows[0].paid_sum || 0);
    const previousDiscountTotal = parseFloat(prevPaidRows[0].discount_sum || 0);
    const previousTipTotal = parseFloat(prevPaidRows[0].tip_sum || 0);
    // Masadan düşen ürün borcu = Ödenen tutar - Bahşiş + İndirim
    const previousSettled = Math.max(0, previousPaidTotal - previousTipTotal + previousDiscountTotal);
    const remainingBefore = Math.max(0, orderItemsTotal - previousSettled);

    // 3. Kalem Bazlı veya Tutar Bazlı Tahsilat Belirleme
    const hasItemSelection = Array.isArray(paid_items) && paid_items.length > 0;
    let computedPaidAmount = 0;

    if (hasItemSelection) {
      // Kalem bazlı ödeme: Seçilen ürünleri ve adetlerini işle
      for (const pItem of paid_items) {
        const reqQty = Number(pItem?.quantity ?? 1);
        if (!Number.isInteger(reqQty) || reqQty < 1) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Ödenecek ürün adedi 1 veya daha büyük bir tam sayı olmalıdır.' });
        }
        const [itemRows] = await connection.query(
          'SELECT id, order_id, product_id, quantity, unit_price, item_status, note, created_by_user_id, qr_request_id FROM order_items WHERE id = ? AND COALESCE(is_paid, 0) = 0 FOR UPDATE',
          [pItem.id]
        );
        if (itemRows.length > 0) {
          const item = itemRows[0];
          // Kalem bu masanın açık adisyonuna ait olmalı (başka masanın ürünü ödendi işaretlenemez)
          if (!orderIds.includes(item.order_id)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Seçilen ürünlerden biri bu masaya ait değil. Lütfen adisyonu yenileyin.' });
          }
          // İptal/İade/İkram kalemleri ücretlendirilmez; hesap kapanırken zaten kapatılır
          if (LOSS_STATUSES.includes(item.item_status)) continue;
          const payQty = Math.min(item.quantity, reqQty);
          const lineTotal = payQty * parseFloat(item.unit_price);
          computedPaidAmount += lineTotal;

          if (payQty >= item.quantity) {
            // Kalemin tamamı ödendi
            await connection.query('UPDATE order_items SET is_paid = 1 WHERE id = ?', [item.id]);
          } else {
            // Kısmi adet ödendi
            const remQty = item.quantity - payQty;
            const remTotal = remQty * parseFloat(item.unit_price);
            await connection.query(
              'UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?',
              [remQty, remTotal, item.id]
            );

            // Ödenen kısım için is_paid = 1 olan yeni satır aç
            await connection.query(
              `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, item_status, is_paid, note, created_by_user_id, qr_request_id)
               VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
              [item.order_id, item.product_id, payQty, item.unit_price, lineTotal, item.item_status, item.note, item.created_by_user_id, item.qr_request_id]
            );
          }
        }
      }
    }

    // Eğer amount_paid açıkça verildiyse onu kullan, yoksa kalem toplamını veya kalan bakiyeyi al
    let paidAmount = 0;
    if (amount_paid !== undefined && amount_paid !== null && parseFloat(amount_paid) > 0) {
      paidAmount = parseFloat(amount_paid);
    } else if (hasItemSelection && computedPaidAmount > 0) {
      paidAmount = computedPaidAmount;
    } else {
      paidAmount = remainingBefore;
    }

    // Yetki kontrolleri: ödeme türü, kısmi ödeme, veresiye, bahşiş ve indirim (rolün indirim üst sınırı dahil)
    const denyInTx = async (keys) => {
      await connection.rollback();
      return deny(res, keys);
    };
    if (paidAmount <= 0) {
      if (!canAny(req.user, ['pos.close_empty', 'payment.cash_card'])) {
        return denyInTx(['pos.close_empty', 'payment.cash_card']);
      }
    } else {
      const mixedCashCard = (parseFloat(cash_amount) || 0) + (parseFloat(card_amount) || 0);
      const usesCashCard = validMethod === 'cash' || validMethod === 'credit_card' || (validMethod === 'mixed' && mixedCashCard > 0);
      const usesVeresiye = validMethod === 'veresiye' || (validMethod === 'mixed' && veresiyeInputVal > 0);
      const settledNow = Math.max(0, paidAmount - tipVal + discountVal); // Bu tahsilatla masadan düşen ürün tutarı
      // Kısmi ödeme: bu tahsilattan sonra masada ödenmemiş tutar kalıyorsa. Tüm ürünler seçilip ödeniyorsa kısmi sayılmaz
      // (bölerek ödeme yetkisi olmayan kasiyer de "Tümünü Seç" ile hesabı kapatabilsin).
      const isPartial = settledNow < remainingBefore - 0.05;

      // Fazla tahsilat: masadan düşen tutar kalan borcu aşamaz (kasa raporu şişmesin; bahşiş ayrıca girilir)
      if (settledNow > remainingBefore + 0.05) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          code: 'OVERPAYMENT',
          message: `Tahsil edilen tutar masanın kalan borcunu aşıyor. Kalan borç: ₺${remainingBefore.toFixed(2)}. Fazlası bahşişse bahşiş alanına girin.`
        });
      }

      if (usesCashCard && !can(req.user, 'payment.cash_card')) return denyInTx('payment.cash_card');
      if ((validMethod === 'mixed' || isPartial) && !can(req.user, 'payment.split')) return denyInTx('payment.split');
      if (usesVeresiye && !can(req.user, 'payment.veresiye')) return denyInTx('payment.veresiye');
      if (tipVal > 0 && !can(req.user, 'payment.tip')) return denyInTx('payment.tip');
      if (discountVal > 0) {
        if (!can(req.user, 'payment.discount')) return denyInTx('payment.discount');
        const limit = req.user.role === 'admin' ? null : req.user.max_discount_percent;
        const maxDiscount = limit === null ? Infinity : Math.round(settledNow * limit) / 100;
        if (discountVal > maxDiscount + 0.01) {
          await connection.rollback();
          return res.status(403).json({
            success: false,
            code: 'DISCOUNT_LIMIT',
            message: `İndirim sınırınızı aşıyor: rolünüz en fazla %${limit} (₺${maxDiscount.toFixed(2)}) indirim yapabilir.`
          });
        }
      }
    }

    if (paidAmount <= 0) {
      // Masada gerçekten ödenecek bakiye kalmamışsa (örneğin tüm ürünler ikram/iade ise), masayı doğrudan kapatmaya izin ver!
      if (remainingBefore <= 0.05) {
        for (const ordId of orderIds) {
          await connection.query(
            'UPDATE order_items SET is_paid = 1 WHERE order_id = ? AND COALESCE(is_paid, 0) = 0',
            [ordId]
          );
          await mergePaidOrderItems(connection, ordId);
        }

        await connection.query(
          `UPDATE orders SET total_price = 0.00, status = 'completed', closed_at = NOW() WHERE id IN (${orderIds.map(() => '?').join(',')})`,
          orderIds
        );

        await connection.query(
          "UPDATE restaurant_tables SET status = 'empty', qr_reset_at = NOW() WHERE id = ?",
          [tableId]
        );

        await connection.commit();

        if (req.io) {
          req.io.emit('table:updated', { tableId: parseInt(tableId), active_total: 0.00, status: 'empty' });
          req.io.emit('order:completed', { tableId: parseInt(tableId), orderIds });
        }

        return res.json({
          success: true,
          message: 'Masada ödenecek bakiye kalmadığı için masa 0.00 ₺ ile başarıyla kapatıldı.',
          is_closed: true
        });
      }

      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Tahsil edilecek tutar 0₺ den büyük olmalıdır.' });
    }

    // Nakit, Kart ve Veresiye Dağılımını Hesapla
    let cashPortion = 0;
    let cardPortion = 0;
    let veresiyePortion = 0;
    if (validMethod === 'cash') {
      cashPortion = paidAmount;
      cardPortion = 0;
      veresiyePortion = 0;
    } else if (validMethod === 'credit_card') {
      cardPortion = paidAmount;
      cashPortion = 0;
      veresiyePortion = 0;
    } else if (validMethod === 'veresiye') {
      veresiyePortion = paidAmount;
      cashPortion = 0;
      cardPortion = 0;
    } else if (validMethod === 'mixed') {
      cashPortion = parseFloat(cash_amount || 0);
      cardPortion = parseFloat(card_amount || 0);
      veresiyePortion = parseFloat(veresiye_amount || 0);
      if (cashPortion === 0 && cardPortion === 0 && veresiyePortion === 0) {
        cashPortion = paidAmount;
      }
      // Parçalar negatif olamaz ve toplamı tahsil edilen tutara eşit olmalı (kasa raporu bozulmasın)
      if (cashPortion < 0 || cardPortion < 0 || veresiyePortion < 0 ||
          Math.abs(cashPortion + cardPortion + veresiyePortion - paidAmount) > 0.01) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Parçalı ödemede nakit, kart ve veresiye toplamı tahsil edilen tutara (₺${paidAmount.toFixed(2)}) eşit olmalıdır.`
        });
      }
    }

    const closedUserId = user.id;

    // 4. Müşteri (Cari) Bilgisini Çözümle
    let resolvedCustomerId = customer_id ? parseInt(customer_id, 10) : null;
    if (!resolvedCustomerId && customerName) {
      const [existingCust] = await connection.query('SELECT id, name FROM customers WHERE name = ? LIMIT 1', [customerName]);
      if (existingCust.length > 0) {
        resolvedCustomerId = existingCust[0].id;
        customerName = existingCust[0].name;
      } else {
        const formattedCustName = formatTitleCase(customerName);
        const [newCustRes] = await connection.query(
          `INSERT INTO customers (name, phone, notes, created_by_user_id) VALUES (?, '0', 'Masadan veresiye açıldı', ?)`,
          [formattedCustName, user.id]
        );
        resolvedCustomerId = newCustRes.insertId;
        customerName = formattedCustName;
      }
    } else if (resolvedCustomerId && !customerName) {
      const [existingCust] = await connection.query('SELECT name FROM customers WHERE id = ?', [resolvedCustomerId]);
      if (existingCust.length > 0) {
        customerName = existingCust[0].name;
      }
    }

    // Veresiye tutarı varsa müşteriye borç kaydet
    if (veresiyePortion > 0 && resolvedCustomerId) {
      await connection.query(
        'UPDATE customers SET total_debt = total_debt + ?, current_balance = current_balance + ? WHERE id = ?',
        [veresiyePortion, veresiyePortion, resolvedCustomerId]
      );

      await connection.query(
        `INSERT INTO customer_transactions (
          customer_id, transaction_type, amount, order_id, table_id, table_title,
          payment_method, cash_amount, card_amount, veresiye_amount, discount, tip, notes,
          created_by_user_id, created_by_user_name
        ) VALUES (?, 'debt', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resolvedCustomerId,
          veresiyePortion,
          primaryOrder.id,
          tableId,
          tableTitle,
          validMethod,
          cashPortion,
          cardPortion,
          veresiyePortion,
          discountVal,
          tipVal,
          notesVal || (validMethod === 'mixed' ? `${tableTitle} masasından parçalı veresiye hesaba yazıldı.` : `${tableTitle} masasından veresiye hesaba yazıldı.`),
          user.id,
          user.name
        ]
      );
    }

    // 5. Ödeme Fişi / Tahsilat Kaydını Oluştur (order_id, cash_amount, card_amount, veresiye_amount ve müşteri adı/id ile)
    const [payResult] = await connection.query(
      `INSERT INTO payments (table_id, order_id, total_amount, cash_amount, card_amount, veresiye_amount, discount, tip, payment_method, customer_id, customer_name, notes, closed_by_user_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tableId, primaryOrder.id, paidAmount, cashPortion, cardPortion, veresiyePortion, discountVal, tipVal, validMethod, resolvedCustomerId, customerName, notesVal, closedUserId]
    );

    // 5. Masada Kalan Toplam Borcu ve Kapanış Durumunu Kontrol Et
    // Masadan düşen ürün tutarı = (Tahsil Edilen Tutar - Bahşiş + İndirim)
    const currentSettled = Math.max(0, paidAmount - tipVal + discountVal);
    const newTotalSettled = previousSettled + currentSettled;
    const newRemainingBalance = Math.max(0, orderItemsTotal - newTotalSettled);

    // Bakiye 0.05 TL ve altı kaldıysa masa tamamen ödenmiş kabul edilir
    const isFullSettlement = newRemainingBalance <= 0.05;

    if (isFullSettlement) {
      // Masadaki tüm kalemleri is_paid = 1 yap ve birleştir
      for (const ordId of orderIds) {
        await connection.query(
          'UPDATE order_items SET is_paid = 1 WHERE order_id = ? AND COALESCE(is_paid, 0) = 0',
          [ordId]
        );
        await mergePaidOrderItems(connection, ordId);
      }

      // Siparişi completed yap ve masayı boşalt
      await connection.query(
        `UPDATE orders SET total_price = ?, status = 'completed', closed_at = NOW() WHERE id IN (${orderIds.map(() => '?').join(',')})`,
        [orderItemsTotal, ...orderIds]
      );

      await connection.query(
        "UPDATE restaurant_tables SET status = 'empty', qr_reset_at = NOW() WHERE id = ?",
        [tableId]
      );
    } else {
      // Kısmi ödeme yapıldı: Kalan borç tutarını sipariş üzerinde güncelle
      await connection.query('UPDATE orders SET total_price = ? WHERE id = ?', [newRemainingBalance, primaryOrder.id]);
      if (hasItemSelection) {
        for (const ordId of orderIds) {
          await mergePaidOrderItems(connection, ordId);
        }
      }
    }

    await connection.commit();

    // 6. Denetim İzi Kaydı (Audit Log)
    let methodDesc = 'Nakit';
    if (validMethod === 'credit_card') {
      methodDesc = 'Kredi Kartı';
    } else if (validMethod === 'mixed') {
      methodDesc = `Parçalı / Karma (₺${cashPortion.toFixed(2)} Nakit + ₺${cardPortion.toFixed(2)} Kart)`;
    } else if (validMethod === 'veresiye') {
      methodDesc = `Veresiye / Açık Hesap (Cari: ${customerName || 'Belirtilmedi'})`;
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'payment',
      entityId: payResult.insertId,
      actionType: 'payment_received',
      title: `Tahsilat Alındı: ${tableTitle} (₺${paidAmount.toFixed(2)})`,
      details: `${user.name} tarafından ${methodDesc} tahsilat yapıldı. ${isFullSettlement ? 'Hesap tamamen kapatıldı ve masa boşaltıldı.' : `Kalan Masa Borcu: ₺${newRemainingBalance.toFixed(2)}`}${discountVal > 0 ? `, İndirim: ₺${discountVal.toFixed(2)}` : ''}${tipVal > 0 ? `, Bahşiş: ₺${tipVal.toFixed(2)}` : ''}`,
      amount: paidAmount,
      discount: discountVal,
      tip: tipVal,
      tableTitle
    });

    // 7. Socket.io Bildirimleri
    if (isFullSettlement) {
      req.io?.emit('table:updated', {
        tableId: parseInt(tableId, 10),
        status: 'empty',
        active_total: 0.00
      });
      req.io?.emit('order:updated', { tableId: parseInt(tableId, 10) });
    } else {
      req.io?.emit('table:updated', { 
        tableId: parseInt(tableId, 10), 
        status: 'occupied',
        active_total: newRemainingBalance 
      });
      req.io?.emit('order:updated', { tableId: parseInt(tableId, 10) });
    }

    req.io?.emit('payment:completed', {
      tableId: parseInt(tableId, 10),
      totalAmount: paidAmount,
      discount: discountVal,
      tip: tipVal,
      isPartial: !isFullSettlement,
      method: validMethod,
      customerName: customerName || null,
      customerId: resolvedCustomerId || null
    });

    if (resolvedCustomerId) {
      req.io?.emit('customer:updated', { customerId: resolvedCustomerId });
    }

    res.json({
      success: true,
      isPartial: !isFullSettlement,
      message: isFullSettlement 
        ? 'Hesap başarıyla kapatıldı ve masa boşaltıldı!' 
        : `₺${paidAmount.toFixed(2)} tutarında kısmi ödeme alındı. Kalan masa borcu: ₺${newRemainingBalance.toFixed(2)}`,
      totalAmount: paidAmount,
      remainingBalance: newRemainingBalance,
      paymentMethod: validMethod
    });
  } catch (error) {
    await connection.rollback();
    console.error('Ödeme alma hatası:', error);
    res.status(500).json({ success: false, message: 'Ödeme tamamlanamadı: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Sipariş Kaleminin Durumunu Güncelle (Mutfakta, Hazır, Teslim Edildi)
 * Kullanıcının Kuralı: Durumu aynı olan ürünler birleştirilir!
 * Bir ürün 'delivered' (teslim edildi) yapıldığında, masada aynı ürün ve aynı durumdaki kalemle birleştirilir.
 */
export const updateOrderItemStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { itemId } = req.params;
    const { status, quantity } = req.body; 
    // 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'returned' | 'complimentary'

    const validStatuses = ['pending', 'preparing', 'ready', 'delivered', 'cancelled', 'returned', 'complimentary'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Geçersiz ürün durumu.' });
    }

    // Hedef duruma göre gereken yetki: servis/mutfak durumları, iptal, iade ve ikram ayrı yetkilerdir
    const STATUS_PERMISSIONS = {
      pending: ['kitchen.update', 'pos.deliver'],
      preparing: ['kitchen.update', 'pos.deliver'],
      ready: ['kitchen.update', 'pos.deliver'],
      delivered: ['kitchen.update', 'pos.deliver'],
      cancelled: ['pos.cancel'],
      returned: ['pos.return'],
      complimentary: ['pos.treat']
    };
    if (!canAny(req.user, STATUS_PERMISSIONS[status])) {
      return deny(res, STATUS_PERMISSIONS[status]);
    }

    await connection.beginTransaction();

    // 1. Güncellenecek kalemi al
    const [targetRows] = await connection.query(
      'SELECT id, order_id, product_id, quantity, unit_price, item_status, is_paid, note, created_by_user_id, qr_request_id FROM order_items WHERE id = ? FOR UPDATE',
      [itemId]
    );

    if (targetRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Sipariş kalemi bulunamadı.' });
    }

    const currentItem = targetRows[0];
    if (currentItem.is_paid) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Ödenmiş bir ürünün durumu değiştirilemez.' });
    }
    // İptal/iade/ikram edilmiş bir ürünü geri almak, o durumu verme yetkisini de ister
    // (ör. mutfak personeli yöneticinin ikramını tekrar "teslim edildi" yapıp hesaba ekleyemez)
    if (LOSS_STATUSES.includes(currentItem.item_status) && !canAny(req.user, STATUS_PERMISSIONS[currentItem.item_status])) {
      await connection.rollback();
      return deny(res, STATUS_PERMISSIONS[currentItem.item_status]);
    }

    const currentQty = parseInt(currentItem.quantity, 10);
    const qtyGiven = quantity !== undefined && quantity !== null && quantity !== '';
    if (qtyGiven && (!Number.isInteger(Number(quantity)) || Number(quantity) < 1)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Adet 1 veya daha büyük bir tam sayı olmalıdır.' });
    }
    const splitQty = qtyGiven ? Math.min(Number(quantity), currentQty) : currentQty;

    let targetItemId = itemId;

    if (splitQty < currentQty && splitQty > 0) {
      // Kısmi adet değişimi: Mevcut satırın adedini düşür
      const remainingQty = currentQty - splitQty;
      const remTotal = remainingQty * parseFloat(currentItem.unit_price);
      await connection.query(
        'UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?',
        [remainingQty, remTotal, itemId]
      );

      // Yeni durum için yeni satır ekle
      const newTotal = splitQty * parseFloat(currentItem.unit_price);
      const [insertRes] = await connection.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, item_status, is_paid, note, created_by_user_id, status_updated_by_user_id, qr_request_id, status_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NOW())`,
        [currentItem.order_id, currentItem.product_id, splitQty, currentItem.unit_price, newTotal, status, currentItem.note, currentItem.created_by_user_id, user.id, currentItem.qr_request_id]
      );
      targetItemId = insertRes.insertId;
    } else {
      // Tüm adedin durumu güncelleniyor
      await connection.query('UPDATE order_items SET item_status = ?, status_updated_by_user_id = ?, status_updated_at = NOW() WHERE id = ?', [status, user.id, itemId]);
    }

    // 3. Durumu aynı olan, aynı ürün, aynı is_paid (ödenmemiş) ve aynı nota sahip başka bir satır var mı kontrol et (birleştir)
    const [matchingRows] = await connection.query(
      `SELECT id, quantity, total_price FROM order_items 
       WHERE order_id = ? 
         AND product_id = ? 
         AND item_status = ? 
         AND COALESCE(is_paid, 0) = 0 
         AND (note <=> ?)
         AND (qr_request_id <=> ?)
         AND id != ?
       ORDER BY id ASC LIMIT 1 FOR UPDATE`,
      [
        currentItem.order_id,
        currentItem.product_id,
        status,
        currentItem.note,
        currentItem.qr_request_id,
        targetItemId
      ]
    );

    let merged = false;
    let targetKeepId = targetItemId;

    if (matchingRows.length > 0) {
      const existingMatch = matchingRows[0];
      const mergedQty = existingMatch.quantity + splitQty;
      const mergedTotal = mergedQty * parseFloat(currentItem.unit_price);

      await connection.query(
        'UPDATE order_items SET quantity = ?, total_price = ?, status_updated_by_user_id = ?, status_updated_at = NOW() WHERE id = ?',
        [mergedQty, mergedTotal, user.id, existingMatch.id]
      );

      await connection.query('DELETE FROM order_items WHERE id = ?', [targetItemId]);

      merged = true;
      targetKeepId = existingMatch.id;
    }

    // 4. Siparişin kalan borcunu yeniden hesapla (İptal, İade, İkram hariç)
    const newOrderTotal = await recalcOrderTotal(connection, currentItem.order_id);

    // 5. Siparişin bağlı olduğu masayı bul
    const [orderInfo] = await connection.query('SELECT table_id FROM orders WHERE id = ?', [currentItem.order_id]);
    const tableId = orderInfo[0]?.table_id;

    let tableEmptied = false;

    if (tableId) {
      // Masadaki tüm açık siparişlerin kalemlerini kontrol et
      const [tableItems] = await connection.query(
        `SELECT oi.id, oi.item_status, oi.is_paid 
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE o.table_id = ? AND o.status NOT IN ('completed', 'cancelled')`,
        [tableId]
      );

      // Masada henüz ödenmemiş ve faturalandırılabilir aktif borçlu kalem var mı?
      const hasUnpaidBillable = tableItems.some(
        i => !i.is_paid && !['cancelled', 'returned', 'complimentary'].includes(i.item_status)
      );

      // Eğer ödenecek hiçbir ürün kalmadıysa ve masadaki TÜM ürünler iade/iptal edildiyse:
      if (!hasUnpaidBillable && tableItems.length > 0) {
        const allCancelledOrReturned = tableItems.every(
          i => !i.is_paid && ['cancelled', 'returned'].includes(i.item_status)
        );

        if (allCancelledOrReturned) {
          await connection.query(
            "UPDATE orders SET status = 'cancelled', total_price = 0.00, closed_at = NOW() WHERE table_id = ? AND status NOT IN ('completed', 'cancelled')",
            [tableId]
          );
          await connection.query(
            "UPDATE restaurant_tables SET status = 'empty', qr_reset_at = NOW() WHERE id = ?",
            [tableId]
          );
          tableEmptied = true;
        }
      }
    }

    await connection.commit();

    // Ürün adı ve masa adını alıp Denetim İzi Kaydı ekle
    const [prodInfo] = await pool.query('SELECT name FROM products WHERE id = ?', [currentItem.product_id]);
    const [tableInfo] = await pool.query('SELECT title FROM restaurant_tables WHERE id = ?', [tableId]);
    const productName = prodInfo[0]?.name || 'Ürün';
    const tableTitle = tableInfo[0]?.title || `Masa ${tableId}`;
    const splitAmount = splitQty * parseFloat(currentItem.unit_price);

    const statusActionMap = {
      delivered: { action: 'item_delivered', title: `Ürün Teslim Edildi: ${productName} (${splitQty} Adet)` },
      complimentary: { action: 'item_complimentary', title: `İkram Yapıldı: ${productName} (${splitQty} Adet)` },
      returned: { action: 'item_returned', title: `İade Alındı: ${productName} (${splitQty} Adet)` },
      cancelled: { action: 'item_cancelled', title: `Sipariş İptal Edildi: ${productName} (${splitQty} Adet)` },
      pending: { action: 'item_pending', title: `Mutfağa Geri Alındı: ${productName} (${splitQty} Adet)` },
      preparing: { action: 'item_preparing', title: `Hazırlanıyor: ${productName} (${splitQty} Adet)` },
      ready: { action: 'item_ready', title: `Hazır: ${productName} (${splitQty} Adet)` }
    };

    const statusLabels = {
      pending: 'Mutfakta',
      preparing: 'Hazırlanıyor',
      ready: 'Hazır',
      delivered: 'Teslim Edildi',
      cancelled: 'İptal',
      returned: 'İade',
      complimentary: 'İkram'
    };

    const actInfo = statusActionMap[status] || { action: 'item_status_changed', title: `Durum Değiştirildi: ${productName}` };

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'order_item',
      entityId: targetItemId,
      actionType: actInfo.action,
      title: `${actInfo.title} (${tableTitle})`,
      details: `${user.name} tarafından durumu "${statusLabels[status] || status}" yapıldı. Tutar: ₺${splitAmount.toFixed(2)}`,
      amount: splitAmount,
      quantity: splitQty,
      tableTitle
    });

    // 6. Socket.io Bildirimleri
    req.io?.emit('order:item_status_updated', {
      itemId: parseInt(itemId, 10),
      status,
      merged,
      targetKeepId
    });

    if (tableId) {
      if (tableEmptied) {
        req.io?.emit('table:updated', { tableId: parseInt(tableId, 10), active_total: 0.00, status: 'empty' });
      } else {
        req.io?.emit('table:updated', {
          tableId: parseInt(tableId, 10),
          active_total: newOrderTotal
        });
      }
      req.io?.emit('order:updated', { tableId });
    }

    res.json({
      success: true,
      message: tableEmptied
        ? `Ürün "${statusLabels[status] || status}" yapıldı. Masada başka ürün kalmadığı için masa otomatik kapatıldı ve boşaltıldı.`
        : `Ürün durumu "${statusLabels[status] || status}" olarak güncellendi.`,
      status,
      merged,
      targetKeepId,
      newOrderTotal,
      tableEmptied
    });
  } catch (error) {
    await connection.rollback();
    console.error('Ürün durumu güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Durum güncellenemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Masa Taşıma / Birleştirme
 * - Hedef masa boşsa: açık adisyon (kalemler, kısmi tahsilatlar, not) olduğu gibi hedef masaya taşınır.
 * - Hedef masa doluysa: kaynak masanın kalemleri ve tahsilatları hedef masanın açık adisyonuna birleştirilir.
 * Body: { target_table_id }
 */
export const transferTable = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const sourceId = parseInt(req.params.tableId, 10);
    const targetId = parseInt(req.body.target_table_id, 10);

    if (!targetId || targetId === sourceId) {
      return res.status(400).json({ success: false, message: 'Lütfen farklı bir hedef masa seçin.' });
    }

    await connection.beginTransaction();

    // İki masayı da kilitle (aynı anda yapılan sipariş/ödeme ile çakışmasın)
    const [tables] = await connection.query(
      'SELECT id, title FROM restaurant_tables WHERE id IN (?, ?) AND is_active = TRUE FOR UPDATE',
      [sourceId, targetId]
    );
    const source = tables.find(t => t.id === sourceId);
    const target = tables.find(t => t.id === targetId);
    if (!source || !target) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Kaynak veya hedef masa bulunamadı.' });
    }

    const openOrdersOf = async (tableId) => {
      const [rows] = await connection.query(
        `SELECT id, note FROM orders WHERE table_id = ? AND status NOT IN ('completed', 'cancelled') ORDER BY id DESC FOR UPDATE`,
        [tableId]
      );
      return rows;
    };
    const sourceOrders = await openOrdersOf(sourceId);
    if (sourceOrders.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `${source.title}: taşınacak açık adisyon yok.` });
    }
    const sourceOrderIds = sourceOrders.map(o => o.id);
    const targetOrders = await openOrdersOf(targetId);
    const isMerge = targetOrders.length > 0;
    let targetOrderId;

    if (!isMerge) {
      // Boş masaya taşıma: adisyonu ve tahsilatlarını hedef masaya bağla
      await connection.query('UPDATE orders SET table_id = ? WHERE id IN (?)', [targetId, sourceOrderIds]);
      await connection.query('UPDATE payments SET table_id = ? WHERE order_id IN (?)', [targetId, sourceOrderIds]);
      targetOrderId = sourceOrderIds[0];
    } else {
      // Dolu masaya birleştirme: kalemleri ve tahsilatları hedefin ana adisyonuna aktar
      targetOrderId = targetOrders[0].id;
      await connection.query('UPDATE order_items SET order_id = ? WHERE order_id IN (?)', [targetOrderId, sourceOrderIds]);
      await connection.query('UPDATE payments SET order_id = ?, table_id = ? WHERE order_id IN (?)', [targetOrderId, targetId, sourceOrderIds]);

      // Sipariş notlarını birleştir
      const notes = [targetOrders[0].note, ...sourceOrders.map(o => o.note)].filter(n => n && n.trim());
      if (notes.length > 0) {
        await connection.query('UPDATE orders SET note = ? WHERE id = ?', [[...new Set(notes)].join(' | '), targetOrderId]);
      }

      // Boşalan kaynak adisyonlar kapatılır (kalemleri ve tahsilatları artık hedef adisyonda)
      await connection.query(
        `UPDATE orders SET status = 'cancelled', total_price = 0.00, closed_at = NOW(), note = ? WHERE id IN (?)`,
        [`Birleştirildi → ${target.title}`, sourceOrderIds]
      );
      await mergePaidOrderItems(connection, targetOrderId);
    }

    // Bu grubun QR siparişleri de masayla birlikte taşınır: bekleyenler onaylanınca yeni masaya düşer,
    // müşteriler yeni masanın QR'ında siparişlerini görmeye devam eder
    await connection.query(
      `UPDATE qr_order_requests SET table_id = ?
       WHERE table_id = ?
         AND (status = 'pending' OR order_id IN (?)
              OR created_at > COALESCE((SELECT qr_reset_at FROM restaurant_tables WHERE id = ?), '1970-01-02'))`,
      [targetId, sourceId, sourceOrderIds, sourceId]
    );

    const newTotal = await recalcOrderTotal(connection, targetOrderId);
    await connection.query("UPDATE restaurant_tables SET status = 'empty', qr_reset_at = NOW() WHERE id = ?", [sourceId]);
    await connection.query("UPDATE restaurant_tables SET status = 'occupied' WHERE id = ?", [targetId]);

    await connection.commit();

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'order',
      entityId: targetOrderId,
      actionType: isMerge ? 'table_merged' : 'table_transferred',
      title: isMerge
        ? `Masalar Birleştirildi: ${source.title} → ${target.title}`
        : `Masa Taşındı: ${source.title} → ${target.title}`,
      details: `${user.name} tarafından adisyon ${isMerge ? 'birleştirildi' : 'taşındı'}: ${source.title} → ${target.title}. Güncel kalan tutar: ₺${newTotal.toFixed(2)}`,
      amount: newTotal,
      tableTitle: target.title
    });

    // Her iki masayı ve mutfak ekranını anında güncelle
    req.io?.emit('table:updated', { tableId: sourceId, status: 'empty', active_total: 0.00 });
    req.io?.emit('table:updated', { tableId: targetId, status: 'occupied', active_total: newTotal });
    req.io?.emit('order:updated', { tableId: sourceId });
    req.io?.emit('order:updated', { tableId: targetId });

    res.json({
      success: true,
      merged: isMerge,
      message: isMerge
        ? `Adisyonlar birleştirildi: ${source.title} → ${target.title}`
        : `Adisyon taşındı: ${source.title} → ${target.title}`,
      target_table: { id: target.id, title: target.title },
      remaining_total: newTotal
    });
  } catch (error) {
    await connection.rollback();
    console.error('Masa taşıma hatası:', error);
    res.status(500).json({ success: false, message: 'Masa taşınamadı: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Mutfak Ekranı (KDS): Aktif Mutfak Siparişlerini ve Kalemlerini Getir
 */
export const getKitchenOrders = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        o.id AS order_id,
        o.order_number,
        o.table_id,
        o.note AS order_note,
        o.created_at AS order_created_at,
        t.title AS table_title,
        t.table_number,
        t.status AS table_status,
        oi.id AS item_id,
        oi.product_id,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        oi.item_status,
        COALESCE(oi.is_paid, 0) AS is_paid,
        oi.note AS item_note,
        oi.created_at AS item_created_at,
        p.name AS product_name,
        p.image_url,
        c.name AS category_name,
        u.name AS created_by_name
      FROM orders o
      JOIN restaurant_tables t ON o.table_id = t.id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON oi.created_by_user_id = u.id
      WHERE o.status NOT IN ('completed', 'cancelled')
        AND (
          oi.item_status IN ('pending', 'preparing', 'ready')
          OR (oi.item_status = 'delivered' AND COALESCE(oi.status_updated_at, oi.created_at) >= NOW() - INTERVAL 1 HOUR)
        )
      ORDER BY oi.created_at ASC
    `);

    // Masalara göre grupla
    const ordersMap = {};
    const productSummaryMap = {};

    for (const row of rows) {
      if (!ordersMap[row.table_id]) {
        ordersMap[row.table_id] = {
          table_id: row.table_id,
          table_title: row.table_title,
          table_number: row.table_number,
          order_id: row.order_id,
          order_number: row.order_number,
          order_note: row.order_note,
          order_created_at: row.order_created_at,
          created_by_name: row.created_by_name,
          items: [],
          pending_count: 0,
          preparing_count: 0,
          ready_count: 0,
          delivered_count: 0,
          total_active: 0
        };
      }

      const itemObj = {
        id: row.item_id,
        order_id: row.order_id,
        table_id: row.table_id,
        product_id: row.product_id,
        product_name: row.product_name,
        category_name: row.category_name,
        image_url: row.image_url,
        quantity: row.quantity,
        item_status: row.item_status,
        is_paid: row.is_paid,
        note: row.item_note,
        created_at: row.item_created_at,
        created_by_name: row.created_by_name
      };

      ordersMap[row.table_id].items.push(itemObj);

      if (row.item_status === 'pending') {
        ordersMap[row.table_id].pending_count += row.quantity;
        ordersMap[row.table_id].total_active += row.quantity;
      } else if (row.item_status === 'preparing') {
        ordersMap[row.table_id].preparing_count += row.quantity;
        ordersMap[row.table_id].total_active += row.quantity;
      } else if (row.item_status === 'ready') {
        ordersMap[row.table_id].ready_count += row.quantity;
        ordersMap[row.table_id].total_active += row.quantity;
      } else if (row.item_status === 'delivered') {
        ordersMap[row.table_id].delivered_count += row.quantity;
      }

      // Mutfak toplu özet için aktif (teslim edilmemiş) kalemleri topla
      if (['pending', 'preparing', 'ready'].includes(row.item_status)) {
        if (!productSummaryMap[row.product_id]) {
          productSummaryMap[row.product_id] = {
            product_id: row.product_id,
            product_name: row.product_name,
            category_name: row.category_name,
            image_url: row.image_url,
            total_quantity: 0,
            pending_quantity: 0,
            preparing_quantity: 0,
            ready_quantity: 0,
            tables: []
          };
        }
        productSummaryMap[row.product_id].total_quantity += row.quantity;
        if (row.item_status === 'pending') productSummaryMap[row.product_id].pending_quantity += row.quantity;
        if (row.item_status === 'preparing') productSummaryMap[row.product_id].preparing_quantity += row.quantity;
        if (row.item_status === 'ready') productSummaryMap[row.product_id].ready_quantity += row.quantity;

        productSummaryMap[row.product_id].tables.push({
          table_title: row.table_title,
          quantity: row.quantity,
          note: row.item_note,
          status: row.item_status
        });
      }
    }

    const orders = Object.values(ordersMap);
    const summary = Object.values(productSummaryMap).sort((a, b) => b.total_quantity - a.total_quantity);

    res.json({
      success: true,
      orders,
      summary,
      total_tables: orders.length,
      total_pending: orders.reduce((acc, o) => acc + o.pending_count, 0),
      total_preparing: orders.reduce((acc, o) => acc + o.preparing_count, 0),
      total_ready: orders.reduce((acc, o) => acc + o.ready_count, 0)
    });
  } catch (error) {
    console.error('Mutfak siparişleri getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Mutfak siparişleri alınamadı: ' + error.message });
  }
};

/**
 * Masadaki Tüm Hazırlanan / Bekleyen Sipariş Kalemlerini Tek Tıkla Teslim Et
 */
export const deliverAllTableItems = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { tableId } = req.params;

    await connection.beginTransaction();

    const [unfulfilledItems] = await connection.query(`
      SELECT oi.id, oi.product_id, oi.quantity, p.name AS product_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.table_id = ? 
        AND o.status NOT IN ('completed', 'cancelled')
        AND oi.item_status IN ('pending', 'preparing', 'ready')
    `, [tableId]);

    if (unfulfilledItems.length > 0) {
      await connection.query(`
        UPDATE order_items oi
        JOIN orders o ON oi.order_id = o.id
        SET oi.item_status = 'delivered', oi.status_updated_by_user_id = ?, oi.status_updated_at = NOW()
        WHERE o.table_id = ? 
          AND o.status NOT IN ('completed', 'cancelled')
          AND oi.item_status IN ('pending', 'preparing', 'ready')
      `, [user.id, tableId]);

      // Tek tek teslimde olduğu gibi: aynı ürün, fiyat, not ve QR isteğine sahip ödenmemiş teslim edilmiş satırlar birleşir
      const [dupGroups] = await connection.query(`
        SELECT oi.order_id, oi.product_id, oi.unit_price, oi.note, oi.qr_request_id,
               MIN(oi.id) AS keep_id, SUM(oi.quantity) AS total_qty, SUM(oi.total_price) AS total_sum
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.table_id = ? AND o.status NOT IN ('completed', 'cancelled')
          AND oi.item_status = 'delivered' AND COALESCE(oi.is_paid, 0) = 0
        GROUP BY oi.order_id, oi.product_id, oi.unit_price, oi.note, oi.qr_request_id
        HAVING COUNT(*) > 1
      `, [tableId]);
      for (const g of dupGroups) {
        await connection.query(
          'UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?',
          [g.total_qty, g.total_sum, g.keep_id]
        );
        await connection.query(
          `DELETE FROM order_items
           WHERE order_id = ? AND product_id = ? AND unit_price = ? AND (note <=> ?) AND (qr_request_id <=> ?)
             AND item_status = 'delivered' AND COALESCE(is_paid, 0) = 0 AND id != ?`,
          [g.order_id, g.product_id, g.unit_price, g.note, g.qr_request_id, g.keep_id]
        );
      }

      // Denetim İzi Kaydı
      const [tableRows] = await connection.query('SELECT title FROM restaurant_tables WHERE id = ?', [tableId]);
      const tableTitle = tableRows[0]?.title || `Masa ${tableId}`;
      await logActivity({
        userId: user.id,
        userName: user.name,
        entityType: 'order',
        entityId: tableId,
        actionType: 'item_delivered',
        title: `Tüm Siparişler Teslim Edildi (${tableTitle})`,
        details: `${user.name} tarafından masanın tüm bekleyen ürünleri (${unfulfilledItems.length} çeşit) teslim edildi olarak işaretlendi.`,
        tableTitle
      });
    }

    await connection.commit();

    // Socket.io bildirimleri: POS ve Mutfak anında güncellenir
    req.io?.emit('order:item_status_updated', {
      tableId: parseInt(tableId, 10),
      status: 'delivered',
      bulk: true
    });
    req.io?.emit('order:updated', { tableId: parseInt(tableId, 10) });

    res.json({
      success: true,
      message: 'Masanın tüm siparişleri başarıyla teslim edildi.',
      count: unfulfilledItems.length
    });
  } catch (error) {
    await connection.rollback();
    console.error('Tümünü teslim etme hatası:', error);
    res.status(500).json({ success: false, message: 'İşlem gerçekleştirilemedi: ' + error.message });
  } finally {
    connection.release();
  }
};


