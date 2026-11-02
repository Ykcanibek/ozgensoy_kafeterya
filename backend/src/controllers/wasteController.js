import { pool } from '../config/db.js';
import { getUserFromReq, logActivity } from '../config/auditLogger.js';
import { can } from '../middleware/auth.js';

// Fire & Zayi nedenleri ve birimleri (arayüz aynı listeleri kullanır)
export const WASTE_REASONS = {
  expired: 'Son kullanma tarihi geçti',
  spoiled: 'Bozuldu / Hasarlı',
  dropped: 'Döküldü / Kırıldı',
  staff_use: 'Personel tüketimi',
  business_use: 'İşletme içi kullanım',
  other: 'Diğer'
};
export const WASTE_UNITS = ['adet', 'porsiyon', 'kg', 'gr', 'lt', 'ml', 'paket'];

const MAX_QTY = 100000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const toSqlDateTime = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// Maliyet bilgisi yalnızca maliyet görme yetkisiyle gönderilir
const withCost = (req, row) => (can(req.user, 'products.view_cost') ? row : { ...row, unit_cost: null, total_cost: null });

const mapRow = (r) => ({
  id: r.id,
  product_id: r.product_id,
  item_name: r.item_name,
  category_name: r.category_name || null,
  quantity: Number(r.quantity),
  unit: r.unit,
  reason: r.reason,
  reason_label: WASTE_REASONS[r.reason] || r.reason,
  unit_cost: r.unit_cost === null ? null : Number(r.unit_cost),
  total_cost: r.total_cost === null ? null : Number(r.total_cost),
  note: r.note,
  occurred_at: r.occurred_at,
  created_at: r.created_at,
  created_by_name: r.created_by_name || null
});

/**
 * Kayıt listesi + özet. Query: startDate, endDate (YYYY-MM-DD), reason, search
 */
export const getWasteRecords = async (req, res) => {
  try {
    const { startDate, endDate, reason, search } = req.query;
    const where = ['w.deleted_at IS NULL'];
    const params = [];
    if (validDate(startDate)) { where.push('w.occurred_at >= ?'); params.push(`${startDate} 00:00:00`); }
    if (validDate(endDate)) { where.push('w.occurred_at <= ?'); params.push(`${endDate} 23:59:59`); }
    if (reason && WASTE_REASONS[reason]) { where.push('w.reason = ?'); params.push(reason); }
    if (search && String(search).trim()) {
      where.push('(w.item_name LIKE ? OR w.note LIKE ? OR u.name LIKE ?)');
      const q = `%${String(search).trim()}%`;
      params.push(q, q, q);
    }

    const [rows] = await pool.query(`
      SELECT w.*, u.name AS created_by_name, c.name AS category_name
      FROM waste_records w
      LEFT JOIN users u ON u.id = w.created_by_user_id
      LEFT JOIN products p ON p.id = w.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY w.occurred_at DESC, w.id DESC
      LIMIT 1000
    `, params);

    const records = rows.map(mapRow);
    const showCost = can(req.user, 'products.view_cost');
    const byReason = Object.keys(WASTE_REASONS).map(key => {
      const list = records.filter(r => r.reason === key);
      return {
        reason: key,
        label: WASTE_REASONS[key],
        count: list.length,
        total_cost: showCost ? round2(list.reduce((s, r) => s + (r.total_cost || 0), 0)) : null
      };
    });

    res.json({
      success: true,
      show_cost: showCost,
      records: records.map(r => withCost(req, r)),
      summary: {
        count: records.length,
        total_cost: showCost ? round2(records.reduce((s, r) => s + (r.total_cost || 0), 0)) : null,
        without_cost: records.filter(r => r.total_cost === null).length,
        by_reason: byReason
      }
    });
  } catch (error) {
    console.error('Fire/zayi listeleme hatası:', error);
    res.status(500).json({ success: false, message: 'Fire & zayi kayıtları alınamadı: ' + error.message });
  }
};

/**
 * Kayıt formu için seçenekler: menü ürünleri (mutfak gibi ürün sayfası yetkisi olmayan roller de seçebilsin), nedenler ve birimler
 */
export const getWasteOptions = async (req, res) => {
  try {
    const [products] = await pool.query(`
      SELECT p.id, p.name, p.cost_price, c.name AS category_name
      FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status != -1
      ORDER BY c.order_num ASC, p.order_num ASC, p.name ASC
    `);
    const showCost = can(req.user, 'products.view_cost');
    res.json({
      success: true,
      reasons: Object.entries(WASTE_REASONS).map(([key, label]) => ({ key, label })),
      units: WASTE_UNITS,
      products: products.map(p => ({
        id: p.id,
        name: p.name,
        category_name: p.category_name,
        has_cost: p.cost_price !== null,
        ...(showCost ? { cost_price: p.cost_price === null ? null : Number(p.cost_price) } : {})
      }))
    });
  } catch (error) {
    console.error('Fire/zayi seçenekleri hatası:', error);
    res.status(500).json({ success: false, message: 'Seçenekler alınamadı: ' + error.message });
  }
};

/**
 * Yeni kayıt. Body: { product_id? | item_name?, quantity, unit, reason, note?, occurred_at?, unit_cost? }
 * Menü ürününde maliyet ürünün maliyet fiyatından alınır; serbest malzemede birim maliyeti yalnızca maliyet yetkisi olan girebilir.
 */
export const createWasteRecord = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { product_id, item_name, quantity, unit = 'adet', reason, note, occurred_at, unit_cost } = req.body;

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY || Math.round(qty * 1000) !== qty * 1000) {
      return res.status(400).json({ success: false, message: 'Miktar 0’dan büyük olmalıdır (en fazla 3 ondalık basamak).' });
    }
    if (!WASTE_REASONS[reason]) {
      return res.status(400).json({ success: false, message: 'Lütfen geçerli bir neden seçin.' });
    }
    if (!WASTE_UNITS.includes(unit)) {
      return res.status(400).json({ success: false, message: 'Lütfen geçerli bir birim seçin.' });
    }
    const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;
    if (reason === 'other' && !cleanNote) {
      return res.status(400).json({ success: false, message: '"Diğer" nedeni için lütfen kısa bir açıklama yazın.' });
    }

    // Olay zamanı: verilmezse şimdi; ileri tarih olamaz
    let when = new Date();
    if (occurred_at) {
      const parsed = new Date(occurred_at);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, message: 'Geçerli bir tarih ve saat girin.' });
      }
      if (parsed.getTime() > Date.now() + 5 * 60000) {
        return res.status(400).json({ success: false, message: 'Kayıt tarihi ileri bir zaman olamaz.' });
      }
      when = parsed;
    }

    let name;
    let productId = null;
    let unitCost = null;
    if (product_id) {
      const [rows] = await pool.query('SELECT id, name, cost_price FROM products WHERE id = ? AND status != -1', [product_id]);
      if (rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Seçilen ürün bulunamadı.' });
      }
      productId = rows[0].id;
      name = rows[0].name;
      unitCost = rows[0].cost_price === null ? null : Number(rows[0].cost_price);
    } else {
      name = typeof item_name === 'string' ? item_name.trim().slice(0, 150) : '';
      if (!name) {
        return res.status(400).json({ success: false, message: 'Lütfen menüden bir ürün seçin veya malzeme adını yazın.' });
      }
      if (unit_cost !== undefined && unit_cost !== null && unit_cost !== '' && can(req.user, 'products.view_cost')) {
        const c = Number(unit_cost);
        if (!Number.isFinite(c) || c < 0) {
          return res.status(400).json({ success: false, message: 'Birim maliyet geçerli bir tutar olmalıdır.' });
        }
        unitCost = round2(c);
      }
    }
    const totalCost = unitCost === null ? null : round2(unitCost * qty);

    const [result] = await pool.query(`
      INSERT INTO waste_records (product_id, item_name, quantity, unit, reason, unit_cost, total_cost, note, occurred_at, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [productId, name, qty, unit, reason, unitCost, totalCost, cleanNote, toSqlDateTime(when), user.id]);

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'waste',
      entityId: result.insertId,
      actionType: 'waste_recorded',
      title: `Fire/Zayi: ${name} (${qty.toLocaleString('tr-TR')} ${unit})`,
      details: `${user.name} tarafından "${WASTE_REASONS[reason]}" olarak kaydedildi.${cleanNote ? ` Not: ${cleanNote}` : ''}`,
      amount: totalCost || 0,
      quantity: Math.ceil(qty)
    });

    const [rows] = await pool.query(`
      SELECT w.*, u.name AS created_by_name, c.name AS category_name
      FROM waste_records w
      LEFT JOIN users u ON u.id = w.created_by_user_id
      LEFT JOIN products p ON p.id = w.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE w.id = ?
    `, [result.insertId]);

    req.io?.emit('waste:changed', { id: result.insertId });
    res.status(201).json({ success: true, message: `"${name}" fire/zayi kaydı eklendi.`, record: withCost(req, mapRow(rows[0])) });
  } catch (error) {
    console.error('Fire/zayi kayıt hatası:', error);
    res.status(500).json({ success: false, message: 'Fire & zayi kaydı eklenemedi: ' + error.message });
  }
};

/**
 * Kaydı kaldırır (yumuşak silme: kayıt arşivlenir, işlem günlüğüne yazılır)
 */
export const deleteWasteRecord = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const [rows] = await pool.query('SELECT * FROM waste_records WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kayıt bulunamadı.' });
    }
    const rec = rows[0];
    await pool.query('UPDATE waste_records SET deleted_at = NOW(), deleted_by_user_id = ? WHERE id = ?', [user.id, rec.id]);

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'waste',
      entityId: rec.id,
      actionType: 'waste_deleted',
      title: `Fire/Zayi Kaydı Silindi: ${rec.item_name} (${Number(rec.quantity).toLocaleString('tr-TR')} ${rec.unit})`,
      details: `${user.name} tarafından "${WASTE_REASONS[rec.reason] || rec.reason}" kaydı silindi.`,
      amount: rec.total_cost || 0
    });

    req.io?.emit('waste:changed', { id: rec.id });
    res.json({ success: true, message: 'Fire/zayi kaydı silindi.' });
  } catch (error) {
    console.error('Fire/zayi silme hatası:', error);
    res.status(500).json({ success: false, message: 'Kayıt silinemedi: ' + error.message });
  }
};
