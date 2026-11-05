import { pool } from '../config/db.js';
import { logActivity } from '../config/auditLogger.js';
import { isQrOrderingEnabled } from '../config/settings.js';

/*
 * QR MENÜ (müşteri tarafı, oturum gerektirmez)
 * Her masanın QR kodunda tahmin edilemez bir anahtar vardır: /m/<anahtar>.
 * Müşteri masa seçmez; anahtar masayı belirler. Sipariş önce "onay bekliyor" olarak düşer,
 * personel onaylayınca masanın adisyonuna eklenip mutfağa gider.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SESSION_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_LINES = 30;
const MAX_QTY_PER_LINE = 20;
const MAX_PENDING_PER_TABLE = 5;
const MAX_PENDING_PER_SESSION = 3;
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX_ORDERS = 60; // Kafe Wi-Fi'ındaki tüm müşteriler aynı adresten görünür; asıl sınır telefon ve masa başınadır
const ORDER_HISTORY_HOURS = 12;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const recentByIp = new Map(); // ip -> sipariş zamanları (bellekte; kötüye kullanım sınırı)

const notFound = (res) => res.status(404).json({
  success: false,
  code: 'INVALID_QR',
  message: 'Bu QR kod geçersiz veya artık kullanılmıyor. Lütfen garsonunuza danışın.'
});

export const findTable = async (token) => {
  if (!TOKEN_RE.test(token || '')) return null;
  const [rows] = await pool.query(
    'SELECT id, title, table_number FROM restaurant_tables WHERE qr_code_token = ? AND is_active = TRUE',
    [token]
  );
  return rows[0] || null;
};

// QR menüde görünen ürünler: satışta, QR'da gösterilen ve kategorisi de görünür olanlar
const VISIBLE_PRODUCTS_SQL = `
  SELECT p.id, p.category_id, p.name, p.description, p.ingredients, p.price, p.image_url
  FROM products p
  JOIN categories c ON c.id = p.category_id
  WHERE p.status = 1 AND p.show_in_qr = 1 AND c.status = 1 AND c.show_in_qr = 1
`;

const fetchVisibleMenu = async () => {
  const [categories] = await pool.query(`
    SELECT id, name, icon, image_url FROM categories
    WHERE status = 1 AND show_in_qr = 1
    ORDER BY order_num ASC, id ASC
  `);
  const [products] = await pool.query(`${VISIBLE_PRODUCTS_SQL} ORDER BY p.order_num ASC, p.id ASC`);
  const usedCategoryIds = new Set(products.map(p => p.category_id));
  return {
    categories: categories.filter(c => usedCategoryIds.has(c.id)),
    products: products.map(p => ({ ...p, price: Number(p.price) }))
  };
};

/** Masasız menü (alan adına doğrudan girenler): yalnızca incelenir, sipariş her zaman kapalıdır */
export const getBrowseMenu = async (req, res) => {
  try {
    res.json({ success: true, table: null, ordering_enabled: false, ...(await fetchVisibleMenu()) });
  } catch (error) {
    console.error('QR menü hatası:', error);
    res.status(500).json({ success: false, message: 'Menü yüklenemedi' });
  }
};

/** Masanın menüsü */
export const getPublicMenu = async (req, res) => {
  try {
    const table = await findTable(req.params.token);
    if (!table) return notFound(res);

    res.json({
      success: true,
      table: { title: table.title },
      ordering_enabled: await isQrOrderingEnabled(),
      ...(await fetchVisibleMenu())
    });
  } catch (error) {
    console.error('QR menü hatası:', error);
    res.status(500).json({ success: false, message: 'Menü yüklenemedi' });
  }
};

/** Müşterinin sipariş isteği (personel onayına düşer) */
export const createPublicOrder = async (req, res) => {
  try {
    const table = await findTable(req.params.token);
    if (!table) return notFound(res);

    if (!(await isQrOrderingEnabled())) {
      return res.status(403).json({
        success: false,
        code: 'ORDERING_DISABLED',
        message: 'Şu an QR menüden sipariş alınmıyor. Siparişinizi garsonunuza verebilirsiniz.'
      });
    }

    const { session, items, note } = req.body || {};
    if (!SESSION_RE.test(session || '')) {
      return res.status(400).json({ success: false, message: 'Oturum bilgisi geçersiz. Lütfen sayfayı yenileyin.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Sepetiniz boş.' });
    }
    if (items.length > MAX_LINES) {
      return res.status(400).json({ success: false, message: `Tek seferde en fazla ${MAX_LINES} çeşit ürün sipariş edilebilir.` });
    }
    for (const it of items) {
      const q = Number(it?.quantity);
      if (!Number.isInteger(q) || q < 1 || q > MAX_QTY_PER_LINE) {
        return res.status(400).json({ success: false, message: `Her üründen 1 ile ${MAX_QTY_PER_LINE} arasında adet seçebilirsiniz.` });
      }
    }

    // Kötüye kullanım sınırları: aynı adresten kısa sürede çok sipariş, aynı masada/oturumda çok bekleyen istek
    const ip = req.ip || 'bilinmiyor';
    const now = Date.now();
    const ipTimes = (recentByIp.get(ip) || []).filter(t => now - t < IP_WINDOW_MS);
    if (ipTimes.length >= IP_MAX_ORDERS) {
      return res.status(429).json({ success: false, message: 'Çok kısa sürede çok fazla sipariş gönderildi. Lütfen biraz bekleyin veya garsonunuzu çağırın.' });
    }
    const [[pending]] = await pool.query(
      `SELECT COUNT(*) AS table_count, SUM(client_session = ?) AS session_count
       FROM qr_order_requests WHERE table_id = ? AND status = 'pending'`,
      [session, table.id]
    );
    if (Number(pending.session_count) >= MAX_PENDING_PER_SESSION) {
      return res.status(429).json({ success: false, message: 'Onay bekleyen siparişleriniz var. Garsonunuz onayladıktan sonra yeni sipariş verebilirsiniz.' });
    }
    if (Number(pending.table_count) >= MAX_PENDING_PER_TABLE) {
      return res.status(429).json({ success: false, message: 'Bu masada onay bekleyen çok sayıda sipariş var. Lütfen garsonunuzu bekleyin.' });
    }

    // Ürünler QR menüde görünür olmalı; fiyat her zaman veritabanından
    const ids = [...new Set(items.map(it => Number(it.product_id)).filter(Number.isInteger))];
    const [products] = ids.length
      ? await pool.query(`${VISIBLE_PRODUCTS_SQL} AND p.id IN (?)`, [ids])
      : [[]];
    const byId = new Map(products.map(p => [p.id, p]));
    const snapshot = [];
    for (const it of items) {
      const p = byId.get(Number(it.product_id));
      if (!p) {
        return res.status(400).json({ success: false, message: 'Sepetinizdeki bir ürün artık sipariş edilemiyor. Lütfen sepetinizi kontrol edin.' });
      }
      const itemNote = typeof it.note === 'string' && it.note.trim() ? it.note.trim().slice(0, 200) : null;
      snapshot.push({ product_id: p.id, name: p.name, quantity: Number(it.quantity), unit_price: Number(p.price), note: itemNote });
    }
    const estimatedTotal = round2(snapshot.reduce((s, it) => s + it.quantity * it.unit_price, 0));
    const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;

    const [result] = await pool.query(
      `INSERT INTO qr_order_requests (table_id, client_session, items, note, estimated_total, client_ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [table.id, session, JSON.stringify(snapshot), cleanNote, estimatedTotal, ip.slice(0, 64)]
    );
    ipTimes.push(now);
    recentByIp.set(ip, ipTimes);
    if (recentByIp.size > 5000) for (const [k, v] of recentByIp) if (!v.some(t => now - t < IP_WINDOW_MS)) recentByIp.delete(k);

    const qty = snapshot.reduce((s, it) => s + it.quantity, 0);
    await logActivity({
      userName: 'QR Menü (Müşteri)',
      entityType: 'qr_order',
      entityId: result.insertId,
      actionType: 'qr_order_received',
      title: `QR Sipariş Geldi: ${table.title} (${qty} ürün)`,
      details: `${snapshot.map(it => `${it.quantity}× ${it.name}`).join(', ')} — onay bekliyor.`,
      amount: estimatedTotal,
      quantity: qty,
      tableTitle: table.title
    });

    req.io?.emit('qr:request', { tableId: table.id, requestId: result.insertId, status: 'pending', tableTitle: table.title });
    res.status(201).json({ success: true, message: 'Siparişiniz alındı. Garsonunuz onayladığında hazırlanmaya başlanacak.', request_id: result.insertId });
  } catch (error) {
    console.error('QR sipariş hatası:', error);
    res.status(500).json({ success: false, message: 'Sipariş gönderilemedi' });
  }
};

/**
 * Masanın şu anki hesabına ait QR siparişleri ve hazırlık durumları.
 * Aynı masadaki herkes (QR'ı okutan tüm telefonlar) bu siparişleri görür; masanın hesabı kapanınca
 * (ödeme alınıp masa boşalınca) liste sıfırlanır, böylece sonraki müşteriler öncekilerin siparişlerini görmez.
 * Masa hiç açılmadıysa reddedilen siparişler 1 saat sonra listeden düşer.
 */
export const getPublicOrders = async (req, res) => {
  try {
    const table = await findTable(req.params.token);
    if (!table) return notFound(res);
    const session = String(req.query.session || '');

    const [requests] = await pool.query(
      `SELECT q.id, q.client_session, q.items, q.note, q.status, q.estimated_total, q.reject_reason, q.created_at, q.handled_at
       FROM qr_order_requests q
       WHERE q.table_id = ?
         AND q.created_at >= NOW() - INTERVAL ? HOUR
         AND q.created_at > GREATEST(
           COALESCE((SELECT t.qr_reset_at FROM restaurant_tables t WHERE t.id = q.table_id), '1970-01-02'),
           COALESCE((SELECT MAX(o.closed_at) FROM orders o WHERE o.table_id = q.table_id AND o.status IN ('completed', 'cancelled')), '1970-01-02')
         )
         AND NOT (
           q.status = 'rejected' AND q.handled_at < NOW() - INTERVAL 1 HOUR
           AND NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.table_id = q.table_id AND o2.status NOT IN ('completed', 'cancelled'))
         )
       ORDER BY q.id DESC LIMIT 30`,
      [table.id, ORDER_HISTORY_HOURS]
    );

    const approvedIds = requests.filter(r => r.status === 'approved').map(r => r.id);
    const [kitchenRows] = approvedIds.length
      ? await pool.query(
        `SELECT oi.qr_request_id, oi.quantity, oi.item_status, COALESCE(oi.is_paid, 0) AS is_paid, p.name
         FROM order_items oi JOIN products p ON p.id = oi.product_id
         WHERE oi.qr_request_id IN (?)
         ORDER BY oi.id ASC`,
        [approvedIds]
      )
      : [[]];

    res.json({
      success: true,
      orders: requests.map(r => ({
        id: r.id,
        // Oturum kimlikleri paylaşılmaz; yalnızca siparişin bu telefondan verilip verilmediği söylenir
        mine: SESSION_RE.test(session) && r.client_session === session,
        status: r.status,
        created_at: r.created_at,
        handled_at: r.handled_at,
        reject_reason: r.reject_reason,
        estimated_total: Number(r.estimated_total),
        note: r.note,
        items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
        // Onaylandıktan sonra mutfaktaki gerçek durumlar (Mutfakta / Hazırlanıyor / Hazır / Teslim edildi / İptal / İkram)
        progress: kitchenRows.filter(k => k.qr_request_id === r.id).map(k => ({
          name: k.name, quantity: k.quantity, status: k.item_status, is_paid: Boolean(k.is_paid)
        }))
      }))
    });
  } catch (error) {
    console.error('QR sipariş durumu hatası:', error);
    res.status(500).json({ success: false, message: 'Sipariş durumu alınamadı' });
  }
};
