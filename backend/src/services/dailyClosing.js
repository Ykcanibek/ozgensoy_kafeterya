import crypto from 'crypto';
import { pool } from '../config/db.js';
import { logActivity } from '../config/auditLogger.js';
import {
  fetchClosedOrders, salesTotals, fetchCollections, fetchProductSales, buildTrend
} from '../controllers/salesReportController.js';

/*
 * GÜN SONU CİRO KAYDI
 * Her gece 00:00'dan sonra bir önceki günün POS tahsilatları (nakit + kart; masa ödemeleri ve cari tahsilatlar)
 * kasa defterine kalıcı gelir kaydı olarak işlenir ve o günün ayrıntılı ciro raporu saklanır.
 * Sunucu gece kapalıysa açıldığında kapanmamış geçmiş günler sırayla kapatılır (hiçbir gün atlanmaz).
 * Kapanmış gün "Yeniden hesapla" ile güncellenebilir; kayıtlar çoğalmaz, yerine yazılır.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const trDate = (s) => s.split('-').reverse().join('.');
const money = (n) => `₺${Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/*
 * Bahşiş personele aittir: kasaya girer ama işletme cirosu (geliri) değildir. Bu yüzden gün sonu cirosu ve
 * kasa defterine işlenen tutar bahşiş hariçtir; bahşiş raporda ayrıca gösterilir.
 * Ödeme başına bahşişin hangi hesaba girdiği: nakit ödemede nakit, kartlı ödemede kart; parçalı ödemede
 * önce nakit kısmından, kalan varsa kart kısmından düşülür. (Veresiyeye yazılan bahşiş kasaya girmediğinden dikkate alınmaz.)
 */
export const CASH_TIP_SQL = `CASE WHEN p.payment_method = 'cash' THEN p.tip
  WHEN p.payment_method = 'mixed' THEN LEAST(p.tip, p.cash_amount) ELSE 0 END`;
export const CARD_TIP_SQL = `CASE WHEN p.payment_method = 'credit_card' THEN p.tip
  WHEN p.payment_method = 'mixed' THEN LEAST(GREATEST(p.tip - p.cash_amount, 0), p.card_amount) ELSE 0 END`;

const fetchTipSplit = async (range) => {
  const [[row]] = await pool.query(
    `SELECT COALESCE(SUM(${CASH_TIP_SQL}), 0) AS cash, COALESCE(SUM(${CARD_TIP_SQL}), 0) AS card
     FROM payments p WHERE p.created_at BETWEEN ? AND ?`,
    [range.from, range.to]
  );
  const cash = round2(row.cash), card = round2(row.card);
  return { cash, card, total: round2(cash + card) };
};

/** Bir günün ayrıntılı ciro raporu (Gün Sonu & Raporlar ekranıyla aynı tanımlar) */
export const buildDaySnapshot = async (date) => {
  const range = { from: `${date} 00:00:00`, to: `${date} 23:59:59`, start: date, end: date, days: 1, allTime: false };
  const [orders, collections, products, tips] = await Promise.all([
    fetchClosedOrders(range),
    fetchCollections(range),
    fetchProductSales(range),
    fetchTipSplit(range)
  ]);
  const catMap = new Map();
  for (const p of products) {
    const c = catMap.get(p.category_name) || { category_name: p.category_name, qty: 0, revenue: 0 };
    c.qty += p.qty;
    c.revenue = round2(c.revenue + p.revenue);
    catMap.set(p.category_name, c);
  }
  return {
    date,
    sales: salesTotals(orders),
    collections,
    // Kasa defterine işlenen ciro = kasaya giren − bahşiş (hesap bazında)
    tips,
    ledger: {
      cash: round2(collections.cash - tips.cash),
      card: round2(collections.card - tips.card),
      total: round2(collections.drawer_total - tips.total)
    },
    categories: [...catMap.values()].sort((a, b) => b.revenue - a.revenue),
    // Maliyet bilgisi saklanmaz (kasa defterini görenler maliyet yetkisine sahip olmayabilir)
    products: products
      .map(p => ({ product_name: p.product_name, category_name: p.category_name, qty: p.qty, revenue: p.revenue, comp_qty: p.comp_qty, returned_qty: p.returned_qty, voided_qty: p.voided_qty }))
      .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty),
    hourly: buildTrend(orders, range).points.map(p => ({ hour: p.key, net: p.net, orders: p.orders })),
    generated_at: new Date().toISOString()
  };
};

const systemCategoryIds = async (conn) => {
  const [rows] = await conn.query("SELECT id, system_key FROM cash_book_categories WHERE system_key IN ('pos_daily', 'pos_daily_cash', 'pos_daily_card')");
  return Object.fromEntries(rows.map(r => [r.system_key, r.id]));
};

/**
 * Günü kapatır (ya da kapanmış günü yeniden hesaplar). Hiç satış/tahsilat olmayan gün için kayıt açılmaz.
 * @returns {{ date, closing_id, cash, card, total, net_sales, order_count, recalculated } | null}
 */
export const closeDay = async (date, { userId = null, userName = 'Sistem (gün sonu)', trigger = 'auto' } = {}) => {
  const snap = await buildDaySnapshot(date);
  const cash = snap.ledger.cash;
  const card = snap.ledger.card;
  if (!snap.collections.drawer_total && !snap.sales.order_count) return null;

  const conn = await pool.getConnection();
  let closingId;
  let recalculated = false;
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query('SELECT id FROM cash_book_daily_closings WHERE business_date = ? FOR UPDATE', [date]);
    const fields = [cash, card, snap.sales.net, snap.sales.order_count, JSON.stringify(snap), trigger];
    if (existing.length) {
      closingId = existing[0].id;
      recalculated = true;
      await conn.query(
        `UPDATE cash_book_daily_closings SET cash_amount = ?, card_amount = ?, net_sales = ?, order_count = ?, details = ?,
           trigger_type = ?, updated_at = NOW(), updated_by_user_id = ? WHERE id = ?`,
        [...fields, userId, closingId]
      );
      // Otomatik satırlar yeniden üretilir (elle düzenlenemedikleri için kayıp yoktur)
      await conn.query("DELETE FROM cash_book_entries WHERE closing_id = ? AND source = 'pos_daily'", [closingId]);
    } else {
      const [res] = await conn.query(
        `INSERT INTO cash_book_daily_closings (cash_amount, card_amount, net_sales, order_count, details, trigger_type, business_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [...fields, date]
      );
      closingId = res.insertId;
    }

    const cats = await systemCategoryIds(conn);
    const lines = [['cash', cash, cats.pos_daily_cash], ['card', card, cats.pos_daily_card]].filter(([, amount]) => amount > 0);
    const batchId = lines.length > 1 ? crypto.randomUUID() : null;
    const s = snap.sales;
    const summary = `Gün sonu cirosu — ${s.order_count} adisyon, net satış ${money(s.net)}` +
      (snap.collections.account_collections ? `, cari tahsilat ${money(snap.collections.account_collections)}` : '') +
      (snap.tips.total ? ` (bahşiş ${money(snap.tips.total)} hariç)` : '');
    for (const [method, amount, subId] of lines) {
      await conn.query(
        `INSERT INTO cash_book_entries
           (entry_type, source, entry_date, category_id, subcategory_id, batch_id, closing_id, amount, vat_rate, vat_amount, net_amount,
            payment_method, document_type, description, created_by_user_id)
         VALUES ('income', 'pos_daily', ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'none', ?, ?)`,
        [date, cats.pos_daily, subId, batchId, closingId, amount, amount, method, summary, userId]
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }

  const total = round2(cash + card);
  await logActivity({
    userId,
    userName,
    entityType: 'cash_book',
    entityId: closingId,
    actionType: recalculated ? 'cashbook_closing_recalculated' : 'cashbook_closing_created',
    title: `Gün Sonu Cirosu ${recalculated ? 'Yeniden Hesaplandı' : 'Kasa Defterine İşlendi'}: ${trDate(date)} (${money(total)})`,
    details: `${userName}: ${snap.sales.order_count} adisyon, net satış ${money(snap.sales.net)}; deftere işlenen nakit ${money(cash)}, kart ${money(card)}` +
      (snap.tips.total ? `; bahşiş ${money(snap.tips.total)} (personele ait, deftere işlenmedi).` : '.'),
    amount: total
  });
  return { date, closing_id: closingId, cash, card, total, net_sales: snap.sales.net, order_count: snap.sales.order_count, recalculated };
};

/** Bugünden önceki, satış/tahsilat olan ama henüz kapatılmamış günleri sırayla kapatır */
export const closePendingDays = async (opts = {}) => {
  const todayStart = `${todayStr()} 00:00:00`;
  const [days] = await pool.query(`
    SELECT x.d FROM (
      SELECT DISTINCT DATE_FORMAT(created_at, '%Y-%m-%d') AS d FROM payments
        WHERE created_at < ? AND (cash_amount > 0 OR card_amount > 0 OR veresiye_amount > 0)
      UNION
      SELECT DISTINCT DATE_FORMAT(closed_at, '%Y-%m-%d') AS d FROM orders WHERE status = 'completed' AND closed_at < ?
    ) x
    WHERE x.d NOT IN (SELECT DATE_FORMAT(business_date, '%Y-%m-%d') FROM cash_book_daily_closings)
    ORDER BY x.d ASC
  `, [todayStart, todayStart]);
  const closed = [];
  for (const { d } of days) {
    const result = await closeDay(d, opts);
    if (result) closed.push(result);
  }
  return closed;
};

/**
 * Zamanlayıcı: açılışta ve her 5 dakikada bir kapanmamış geçmiş günleri kapatır.
 * Gece yarısını geçen ilk kontrolde (en geç ~00:05) önceki gün işlenir; sunucu kapalıysa açılınca işlenir.
 */
/**
 * Kayıt kuralı değiştiğinde (ör. bahşişin cirodan ayrılması) daha önce kaydedilmiş günler bir kez yeniden hesaplanır.
 * Her günün kaydedilme şekli (otomatik/elle) korunur.
 */
const recalculateExistingOnce = async (migrationKey) => {
  const [done] = await pool.query('SELECT name FROM schema_migrations WHERE name = ?', [migrationKey]);
  if (done.length) return 0;
  const [rows] = await pool.query("SELECT DATE_FORMAT(business_date, '%Y-%m-%d') AS d, trigger_type FROM cash_book_daily_closings ORDER BY business_date");
  for (const r of rows) await closeDay(r.d, { trigger: r.trigger_type, userName: 'Sistem (kural güncellemesi)' });
  await pool.query('INSERT INTO schema_migrations (name) VALUES (?)', [migrationKey]);
  return rows.length;
};

export const startDailyClosingScheduler = (io) => {
  let running = false;
  let migrated = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (!migrated) {
        const n = await recalculateExistingOnce('cashbook_closing_tips_v1');
        if (n) console.log(`[Gün sonu] ${n} günün cirosu bahşiş hariç olacak şekilde yeniden hesaplandı.`);
        migrated = true;
      }
      const closed = await closePendingDays();
      if (closed.length) {
        console.log(`[Gün sonu] ${closed.length} günün cirosu kasa defterine işlendi: ${closed.map(c => c.date).join(', ')}`);
        io?.emit('cashbook:changed', {});
      }
    } catch (error) {
      console.error('[Gün sonu] Ciro kaydı oluşturulamadı:', error.message);
    } finally {
      running = false;
    }
  };
  tick();
  setInterval(tick, CHECK_INTERVAL_MS).unref();
};
