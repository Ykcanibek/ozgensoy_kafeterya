import crypto from 'crypto';
import { pool } from '../config/db.js';
import { getUserFromReq, logActivity } from '../config/auditLogger.js';
import { addItemsToTable, publishOrderUpdate, OrderError } from './orderController.js';
import { isQrOrderingEnabled, setSetting } from '../config/settings.js';

const parseItems = (items) => (typeof items === 'string' ? JSON.parse(items) : items) || [];

/** Onay bekleyen (veya istenen durumdaki) QR siparişleri. Query: status (varsayılan pending), tableId */
export const getQrRequests = async (req, res) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const params = [status];
    let tableFilter = '';
    if (req.query.tableId) { tableFilter = 'AND q.table_id = ?'; params.push(Number(req.query.tableId)); }
    const [rows] = await pool.query(`
      SELECT q.id, q.table_id, t.title AS table_title, q.items, q.note, q.status, q.estimated_total,
             q.reject_reason, q.created_at, q.handled_at, u.name AS handled_by_name
      FROM qr_order_requests q
      JOIN restaurant_tables t ON t.id = q.table_id
      LEFT JOIN users u ON u.id = q.handled_by_user_id
      WHERE q.status = ? ${tableFilter}
      ORDER BY q.id ${status === 'pending' ? 'ASC' : 'DESC'}
      LIMIT 100
    `, params);
    res.json({
      success: true,
      requests: rows.map(r => ({ ...r, items: parseItems(r.items), estimated_total: Number(r.estimated_total) }))
    });
  } catch (error) {
    console.error('QR sipariş listesi hatası:', error);
    res.status(500).json({ success: false, message: 'QR siparişleri alınamadı: ' + error.message });
  }
};

/** Onay: istek masanın adisyonuna eklenir ve mutfağa düşer */
export const approveQrRequest = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM qr_order_requests WHERE id = ? FOR UPDATE', [req.params.id]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'QR siparişi bulunamadı.' });
    }
    const request = rows[0];
    if (request.status !== 'pending') {
      await connection.rollback();
      return res.status(409).json({ success: false, message: request.status === 'approved' ? 'Bu sipariş zaten onaylanmış.' : 'Bu sipariş reddedilmiş.' });
    }

    const items = parseItems(request.items).map(it => ({ product_id: it.product_id, quantity: it.quantity, note: it.note }));
    const { orderId, newTotal, tableTitle, totalQty } = await addItemsToTable(connection, {
      tableId: request.table_id,
      items,
      // Müşterinin siparişe yazdığı genel not ("Hepsi aynı anda gelsin" gibi) adisyona ve mutfağa geçer
      note: request.note ? `QR: ${request.note}`.slice(0, 500) : null,
      userId: user.id,
      source: 'qr',
      qrRequestId: request.id
    });
    await connection.query(
      "UPDATE qr_order_requests SET status = 'approved', order_id = ?, handled_by_user_id = ?, handled_at = NOW() WHERE id = ?",
      [orderId, user.id, request.id]
    );
    await connection.commit();

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'order',
      entityId: orderId,
      actionType: 'qr_order_approved',
      title: `QR Sipariş Onaylandı: ${tableTitle}`,
      details: `${user.name} tarafından onaylandı: ${items.length} çeşit (${totalQty} adet) mutfağa iletildi.`,
      tableTitle,
      quantity: totalQty
    });

    await publishOrderUpdate(req.io, request.table_id, orderId, newTotal);
    req.io?.emit('qr:request', { tableId: request.table_id, requestId: request.id, status: 'approved' });
    res.json({ success: true, message: `${tableTitle}: QR siparişi onaylandı ve mutfağa iletildi.` });
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error instanceof OrderError) {
      return res.status(error.status).json({ success: false, message: `${error.message} Siparişi reddedip müşteriye bilgi verebilirsiniz.` });
    }
    console.error('QR sipariş onay hatası:', error);
    res.status(500).json({ success: false, message: 'QR siparişi onaylanamadı: ' + error.message });
  } finally {
    connection.release();
  }
};

/** Ret: müşteri menüde ret nedenini görür */
export const rejectQrRequest = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim().slice(0, 255) : null;
    const [rows] = await pool.query(
      `SELECT q.*, t.title AS table_title FROM qr_order_requests q JOIN restaurant_tables t ON t.id = q.table_id WHERE q.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'QR siparişi bulunamadı.' });
    const request = rows[0];
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'Bu sipariş zaten işlenmiş.' });
    }
    // Aynı anda başka biri onayladıysa (onay işlemi kaydı kilitler) ret uygulanmaz
    const [result] = await pool.query(
      "UPDATE qr_order_requests SET status = 'rejected', reject_reason = ?, handled_by_user_id = ?, handled_at = NOW() WHERE id = ? AND status = 'pending'",
      [reason, user.id, request.id]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ success: false, message: 'Bu sipariş bu sırada başka biri tarafından işlendi.' });
    }
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'qr_order',
      entityId: request.id,
      actionType: 'qr_order_rejected',
      title: `QR Sipariş Reddedildi: ${request.table_title}`,
      details: `${user.name} tarafından reddedildi.${reason ? ` Neden: ${reason}` : ''}`,
      amount: Number(request.estimated_total) || 0,
      tableTitle: request.table_title
    });
    req.io?.emit('qr:request', { tableId: request.table_id, requestId: request.id, status: 'rejected' });
    res.json({ success: true, message: `${request.table_title}: QR siparişi reddedildi.` });
  } catch (error) {
    console.error('QR sipariş ret hatası:', error);
    res.status(500).json({ success: false, message: 'QR siparişi reddedilemedi: ' + error.message });
  }
};

/** QR menü ayarları (şimdilik: QR'dan sipariş alma açık/kapalı) */
export const getQrSettings = async (req, res) => {
  try {
    res.json({ success: true, ordering_enabled: await isQrOrderingEnabled() });
  } catch (error) {
    console.error('QR ayarları hatası:', error);
    res.status(500).json({ success: false, message: 'QR ayarları alınamadı' });
  }
};

/** QR'dan sipariş almayı açar/kapatır (kapalıyken müşteriler menüyü görür ama sipariş veremez) */
export const updateQrSettings = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    if (typeof req.body?.ordering_enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Geçersiz ayar.' });
    }
    const enabled = req.body.ordering_enabled;
    await setSetting('qr_ordering_enabled', enabled ? '1' : '0', user.id);
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'settings',
      entityId: null,
      actionType: enabled ? 'qr_ordering_enabled' : 'qr_ordering_disabled',
      title: enabled ? 'QR Sipariş Açıldı' : 'QR Sipariş Kapatıldı',
      details: `${user.name} tarafından QR menüden sipariş alma ${enabled ? 'açıldı' : 'kapatıldı'}.`
    });
    req.io?.emit('qr:settings', { ordering_enabled: enabled });
    res.json({
      success: true,
      ordering_enabled: enabled,
      message: enabled ? 'QR menüden sipariş alma açıldı.' : 'QR menüden sipariş alma kapatıldı. Müşteriler menüyü görebilir ama sipariş veremez.'
    });
  } catch (error) {
    console.error('QR ayarı güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'QR ayarı kaydedilemedi' });
  }
};

/** Masanın QR anahtarını yeniler (eski basılı QR artık çalışmaz) */
export const regenerateTableQr = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const [rows] = await pool.query('SELECT id, title FROM restaurant_tables WHERE id = ? AND is_active = TRUE', [req.params.tableId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Masa bulunamadı.' });
    const token = crypto.randomBytes(16).toString('base64url');
    await pool.query('UPDATE restaurant_tables SET qr_code_token = ? WHERE id = ?', [token, rows[0].id]);
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'table',
      entityId: rows[0].id,
      actionType: 'table_qr_regenerated',
      title: `QR Kod Yenilendi: ${rows[0].title}`,
      details: `${user.name} tarafından masanın QR kodu yenilendi; eski QR kod artık çalışmaz.`,
      tableTitle: rows[0].title
    });
    res.json({ success: true, message: `${rows[0].title} için yeni QR kod oluşturuldu. Eski kodu masadan kaldırın.`, qr_code_token: token });
  } catch (error) {
    console.error('QR yenileme hatası:', error);
    res.status(500).json({ success: false, message: 'QR kod yenilenemedi: ' + error.message });
  }
};
