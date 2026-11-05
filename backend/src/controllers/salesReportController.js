import { pool } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { WASTE_REASONS } from './wasteController.js';

/*
 * RAPOR TANIMLARI (tüm rapor ekranları bu tanımları kullanır)
 * ─ Satış: adisyonun KAPANDIĞI zamana göre (orders.closed_at, status = 'completed')
 *   Brüt Satış  = İptal hariç tüm kalemler (ikram ve iade dahil, liste fiyatıyla)
 *   Net Satış   = Brüt − İkram − İade − İndirim
 *   İptal       = Mutfak/servis öncesi iptal edilen kalemler (satışa dahil değildir, ayrıca gösterilir)
 *   Tahsil edilmeden kapatılan = Net satış − adisyona yapılan tahsilatlar (ödemesiz kapatılan masalar)
 * ─ Tahsilat: ödemenin ALINDIĞI zamana göre (payments.created_at)
 *   Kasaya giren = Nakit + Kart (bahşiş ve cari tahsilat dahil); Veresiye = açık hesaba yazılan (kasaya girmez)
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY_MS = 86400000;

/** ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD → aralık; boşsa tüm zamanlar */
const parseRange = (query) => {
  const valid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  if (!valid(query.startDate) && !valid(query.endDate)) {
    return { from: '1970-01-01 00:00:00', to: '2999-12-31 23:59:59', allTime: true, days: null };
  }
  const start = valid(query.startDate) ? query.startDate : query.endDate;
  const end = valid(query.endDate) ? query.endDate : query.startDate;
  const days = Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / DAY_MS) + 1;
  return { from: `${start} 00:00:00`, to: `${end} 23:59:59`, start, end, days, allTime: false };
};

/**
 * Karşılaştırma dönemi: istemci ?compareStart&compareEnd ile "aynı dönemin karşılığını" gönderebilir
 * (bu hafta ↔ geçen haftanın aynı günleri); gönderilmezse aynı uzunluktaki hemen önceki dönem kullanılır.
 */
const previousRange = (range, query = {}) => {
  if (range.allTime || query.compare === 'none') return null;
  const valid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  if (valid(query.compareStart) && valid(query.compareEnd) && query.compareStart <= query.compareEnd) {
    const days = Math.round((new Date(`${query.compareEnd}T00:00:00`) - new Date(`${query.compareStart}T00:00:00`)) / DAY_MS) + 1;
    return { from: `${query.compareStart} 00:00:00`, to: `${query.compareEnd} 23:59:59`, start: query.compareStart, end: query.compareEnd, days };
  }
  const startDate = new Date(`${range.start}T00:00:00`);
  const prevEnd = new Date(startDate.getTime() - DAY_MS);
  const prevStart = new Date(prevEnd.getTime() - (range.days - 1) * DAY_MS);
  return { from: `${ymd(prevStart)} 00:00:00`, to: `${ymd(prevEnd)} 23:59:59`, start: ymd(prevStart), end: ymd(prevEnd), days: range.days };
};

/** Aralıkta kapanan adisyonların satış kırılımı (adisyon başına) */
export const fetchClosedOrders = async (range) => {
  const [rows] = await pool.query(`
    SELECT
      o.id, o.order_number, o.table_id, o.created_at, o.closed_at, o.created_by_user_id, o.note,
      t.title AS table_title,
      COALESCE(it.gross, 0) AS gross, COALESCE(it.comp, 0) AS comp, COALESCE(it.ret, 0) AS ret,
      COALESCE(it.voided, 0) AS voided, COALESCE(it.item_qty, 0) AS item_qty,
      COALESCE(pay.discount, 0) AS discount, COALESCE(pay.settled, 0) AS settled, COALESCE(pay.tip, 0) AS tip,
      COALESCE(pay.cash, 0) AS cash, COALESCE(pay.card, 0) AS card, COALESCE(pay.veresiye, 0) AS veresiye,
      COALESCE(pay.payment_count, 0) AS payment_count, pay.customers, pay.last_payment_by
    FROM orders o
    LEFT JOIN restaurant_tables t ON t.id = o.table_id
    LEFT JOIN (
      SELECT order_id,
        SUM(CASE WHEN item_status <> 'cancelled' THEN total_price ELSE 0 END) AS gross,
        SUM(CASE WHEN item_status = 'complimentary' THEN total_price ELSE 0 END) AS comp,
        SUM(CASE WHEN item_status = 'returned' THEN total_price ELSE 0 END) AS ret,
        SUM(CASE WHEN item_status = 'cancelled' THEN total_price ELSE 0 END) AS voided,
        SUM(CASE WHEN item_status NOT IN ('cancelled', 'returned', 'complimentary') THEN quantity ELSE 0 END) AS item_qty
      FROM order_items GROUP BY order_id
    ) it ON it.order_id = o.id
    LEFT JOIN (
      SELECT order_id,
        SUM(discount) AS discount, SUM(total_amount - tip) AS settled, SUM(tip) AS tip,
        SUM(cash_amount) AS cash, SUM(card_amount) AS card, SUM(veresiye_amount) AS veresiye,
        COUNT(*) AS payment_count,
        GROUP_CONCAT(DISTINCT customer_name SEPARATOR ', ') AS customers,
        SUBSTRING_INDEX(GROUP_CONCAT(closed_by_user_id ORDER BY id DESC), ',', 1) AS last_payment_by
      FROM payments WHERE order_id IS NOT NULL GROUP BY order_id
    ) pay ON pay.order_id = o.id
    WHERE o.status = 'completed' AND o.closed_at BETWEEN ? AND ?
    ORDER BY o.closed_at DESC
  `, [range.from, range.to]);

  return rows.map(r => {
    const gross = round2(r.gross), comp = round2(r.comp), ret = round2(r.ret), discount = round2(r.discount);
    const net = round2(gross - comp - ret - discount);
    const tip = round2(r.tip);
    return {
      ...r,
      gross, comp, ret, discount, net,
      revenue: round2(net + tip), // Net ciro: raporların ana rakamı (bahşiş işletmeye kalır)
      voided: round2(r.voided),
      settled: round2(r.settled),
      tip,
      cash: round2(r.cash),
      card: round2(r.card),
      veresiye: round2(r.veresiye),
      item_qty: Number(r.item_qty) || 0,
      payment_count: Number(r.payment_count) || 0,
      unpaid_closed: Math.max(0, round2(net - round2(r.settled)))
    };
  });
};

const sumBy = (rows, key) => round2(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));

export const salesTotals = (orders) => {
  const net = sumBy(orders, 'net');
  const gross = sumBy(orders, 'gross');
  const comp = sumBy(orders, 'comp'), ret = sumBy(orders, 'ret'), voided = sumBy(orders, 'voided');
  const discount = sumBy(orders, 'discount');
  // net: ürün satışı (fiyatlardan gelen tutar) · revenue: net ciro = net + bahşiş; raporlarda gösterilen rakam budur
  const tip = sumBy(orders, 'tip');
  const itemQty = orders.reduce((s, o) => s + o.item_qty, 0);
  const durations = orders.map(o => (new Date(o.closed_at) - new Date(o.created_at)) / 60000).filter(m => m >= 0);
  // Kayıp = ikram + iade + iptal; oran, iptal dahil sipariş edilen toplam tutara göre
  const loss = round2(comp + ret + voided);
  return {
    order_count: orders.length,
    gross,
    complimentary: comp,
    returned: ret,
    discount,
    net,
    tip,
    revenue: round2(net + tip),
    voided,
    unpaid_closed: sumBy(orders, 'unpaid_closed'),
    item_qty: itemQty,
    average_ticket: orders.length ? round2((net + tip) / orders.length) : 0,
    items_per_ticket: orders.length ? round2(itemQty / orders.length) : 0,
    avg_duration_min: durations.length ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length) : 0,
    loss_amount: loss,
    loss_rate: gross + voided ? round2((loss / (gross + voided)) * 100) : 0,
    discount_rate: gross ? round2((discount / gross) * 100) : 0
  };
};

/** Haftanın günü × saat dağılımı (Pazartesi = 0) ve tekil gün/saat toplamları; "net" alanı net cirodur */
const buildDistribution = (orders) => {
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ net: 0, orders: 0 })));
  for (const o of orders) {
    const d = new Date(o.closed_at);
    const cell = heat[(d.getDay() + 6) % 7][d.getHours()];
    cell.net = round2(cell.net + o.revenue);
    cell.orders += 1;
  }
  const weekdays = heat.map((row, i) => ({ day: i, net: round2(row.reduce((s, c) => s + c.net, 0)), orders: row.reduce((s, c) => s + c.orders, 0) }));
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    net: round2(heat.reduce((s, row) => s + row[h].net, 0)),
    orders: heat.reduce((s, row) => s + row[h].orders, 0)
  }));
  return { heatmap: heat, weekdays, hours };
};

/** Aralıkta alınan tahsilatlar (ödeme zamanına göre) */
export const fetchCollections = async (range) => {
  const [[row]] = await pool.query(`
    SELECT
      COALESCE(SUM(cash_amount), 0) AS cash,
      COALESCE(SUM(card_amount), 0) AS card,
      COALESCE(SUM(veresiye_amount), 0) AS veresiye,
      COALESCE(SUM(tip), 0) AS tip,
      COALESCE(SUM(CASE WHEN order_id IS NULL AND customer_id IS NOT NULL THEN cash_amount + card_amount ELSE 0 END), 0) AS account_collections,
      COUNT(*) AS payment_count,
      SUM(CASE WHEN payment_method = 'cash' THEN 1 ELSE 0 END) AS cash_count,
      SUM(CASE WHEN payment_method = 'credit_card' THEN 1 ELSE 0 END) AS card_count,
      SUM(CASE WHEN payment_method = 'mixed' THEN 1 ELSE 0 END) AS mixed_count,
      SUM(CASE WHEN payment_method = 'veresiye' THEN 1 ELSE 0 END) AS veresiye_count
    FROM payments WHERE created_at BETWEEN ? AND ?
  `, [range.from, range.to]);
  const cash = round2(row.cash), card = round2(row.card);
  return {
    cash, card,
    veresiye: round2(row.veresiye),
    tip: round2(row.tip),
    account_collections: round2(row.account_collections),
    drawer_total: round2(cash + card),
    payment_count: Number(row.payment_count) || 0,
    counts: {
      cash: Number(row.cash_count) || 0,
      credit_card: Number(row.card_count) || 0,
      mixed: Number(row.mixed_count) || 0,
      veresiye: Number(row.veresiye_count) || 0
    }
  };
};

/** Trend: tek gün → saatlik, ≤ 62 gün → günlük, daha uzun → aylık (boş dilimler 0 ile doldurulur); "net" alanı net cirodur */
export const buildTrend = (orders, range) => {
  const add = (map, key, o) => {
    const b = map.get(key) || { net: 0, orders: 0 };
    b.net = round2(b.net + o.revenue);
    b.orders += 1;
    map.set(key, b);
  };
  const map = new Map();
  if (!range.allTime && range.days === 1) {
    orders.forEach(o => add(map, new Date(o.closed_at).getHours(), o));
    return { granularity: 'hour', points: Array.from({ length: 24 }, (_, h) => ({ key: h, label: `${pad(h)}:00`, ...(map.get(h) || { net: 0, orders: 0 }) })) };
  }
  const useDaily = !range.allTime && range.days <= 62;
  orders.forEach(o => {
    const d = new Date(o.closed_at);
    add(map, useDaily ? ymd(d) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, o);
  });
  if (useDaily) {
    const points = [];
    for (let i = 0; i < range.days; i++) {
      const d = new Date(new Date(`${range.start}T00:00:00`).getTime() + i * DAY_MS);
      const key = ymd(d);
      points.push({ key, label: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), ...(map.get(key) || { net: 0, orders: 0 }) });
    }
    return { granularity: 'day', points };
  }
  const keys = [...map.keys()].sort();
  return {
    granularity: 'month',
    points: keys.map(key => {
      const [y, m] = key.split('-');
      return { key, label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' }), ...map.get(key) };
    })
  };
};

/** Ürün bazlı satış kırılımı (aralıkta kapanan adisyonlardaki kalemler) */
export const fetchProductSales = async (range) => {
  const [rows] = await pool.query(`
    SELECT
      p.id AS product_id, p.name AS product_name, p.cost_price,
      c.id AS category_id, COALESCE(c.name, 'Kategorisiz') AS category_name,
      SUM(CASE WHEN oi.item_status NOT IN ('cancelled', 'returned', 'complimentary') THEN oi.quantity ELSE 0 END) AS qty,
      SUM(CASE WHEN oi.item_status NOT IN ('cancelled', 'returned', 'complimentary') THEN oi.total_price ELSE 0 END) AS revenue,
      SUM(CASE WHEN oi.item_status = 'complimentary' THEN oi.quantity ELSE 0 END) AS comp_qty,
      SUM(CASE WHEN oi.item_status = 'complimentary' THEN oi.total_price ELSE 0 END) AS comp_amount,
      SUM(CASE WHEN oi.item_status = 'returned' THEN oi.quantity ELSE 0 END) AS returned_qty,
      SUM(CASE WHEN oi.item_status = 'cancelled' THEN oi.quantity ELSE 0 END) AS voided_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE o.status = 'completed' AND o.closed_at BETWEEN ? AND ?
    GROUP BY p.id, p.name, p.cost_price, c.id, c.name
  `, [range.from, range.to]);

  return rows.map(r => {
    const qty = Number(r.qty) || 0;
    const revenue = round2(r.revenue);
    const costPrice = r.cost_price === null ? null : Number(r.cost_price);
    const cost = costPrice === null ? null : round2(qty * costPrice);
    return {
      product_id: r.product_id,
      product_name: r.product_name,
      category_id: r.category_id,
      category_name: r.category_name,
      qty,
      revenue,
      average_price: qty ? round2(revenue / qty) : 0,
      comp_qty: Number(r.comp_qty) || 0,
      comp_amount: round2(r.comp_amount),
      returned_qty: Number(r.returned_qty) || 0,
      voided_qty: Number(r.voided_qty) || 0,
      cost_price: costPrice,
      cost,
      profit: cost === null ? null : round2(revenue - cost),
      margin: cost === null || revenue === 0 ? null : round2(((revenue - cost) / revenue) * 100)
    };
  }).filter(p => p.qty || p.comp_qty || p.returned_qty || p.voided_qty);
};

const stripCost = (products) => products.map(({ cost_price, cost, profit, margin, ...rest }) => rest);

const percentChange = (current, previous) =>
  previous ? round2(((current - previous) / previous) * 100) : (current ? null : 0);

// ───────────────────────────────────────────────────────────────
// 1. Özet: satış, tahsilat, karşılaştırma, trend, kategori, en çok satanlar
// ───────────────────────────────────────────────────────────────
export const getSalesSummary = async (req, res) => {
  try {
    const range = parseRange(req.query);
    // Geçmiş rapor yetkisi olmayan kullanıcıya önceki dönemin rakamları karşılaştırma yoluyla da gösterilmez
    const prev = can(req.user, 'reports.history') ? previousRange(range, req.query) : null;

    const [orders, collections, products, prevOrders, prevCollections] = await Promise.all([
      fetchClosedOrders(range),
      fetchCollections(range),
      fetchProductSales(range),
      prev ? fetchClosedOrders(prev) : Promise.resolve(null),
      prev ? fetchCollections(prev) : Promise.resolve(null)
    ]);

    const sales = salesTotals(orders);
    const prevSales = prevOrders ? salesTotals(prevOrders) : null;

    // Kategori kırılımı ürünlerden türetilir (net tutar = indirim öncesi satış)
    const catMap = new Map();
    for (const p of products) {
      const c = catMap.get(p.category_name) || { category_id: p.category_id, category_name: p.category_name, qty: 0, revenue: 0 };
      c.qty += p.qty;
      c.revenue = round2(c.revenue + p.revenue);
      catMap.set(p.category_name, c);
    }
    const productRevenueTotal = sumBy(products, 'revenue');
    const categories = [...catMap.values()]
      .map(c => ({ ...c, share: productRevenueTotal ? round2((c.revenue / productRevenueTotal) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    const showCost = can(req.user, 'products.view_cost');
    const topProducts = [...products].sort((a, b) => b.revenue - a.revenue || b.qty - a.qty).slice(0, 10);

    res.json({
      success: true,
      period: { start: range.start || null, end: range.end || null, days: range.days, all_time: range.allTime },
      previous_period: prev ? { start: prev.start, end: prev.end } : null,
      sales,
      collections,
      comparison: prevSales ? Object.fromEntries([
        ['revenue', sales.revenue, prevSales.revenue],
        ['gross', sales.gross, prevSales.gross],
        ['order_count', sales.order_count, prevSales.order_count],
        ['average_ticket', sales.average_ticket, prevSales.average_ticket],
        ['items_per_ticket', sales.items_per_ticket, prevSales.items_per_ticket],
        ['avg_duration_min', sales.avg_duration_min, prevSales.avg_duration_min],
        ['loss_amount', sales.loss_amount, prevSales.loss_amount],
        ['discount', sales.discount, prevSales.discount],
        ['tip', sales.tip, prevSales.tip],
        ['drawer_total', collections.drawer_total, prevCollections.drawer_total],
        ['veresiye', collections.veresiye, prevCollections.veresiye]
      ].map(([key, cur, prv]) => [key, { previous: prv, change: percentChange(cur, prv) }])) : null,
      trend: buildTrend(orders, range),
      // Önceki dönem trendi, şimdiki trendle aynı dilimlere hizalanır (grafikte üst üste çizilir)
      trend_previous: prevOrders && !range.allTime ? buildTrend(prevOrders, prev).points.slice(0, buildTrend(orders, range).points.length) : null,
      distribution: buildDistribution(orders),
      categories,
      top_products: showCost ? topProducts : stripCost(topProducts)
    });
  } catch (error) {
    console.error('Satış özeti hatası:', error);
    res.status(500).json({ success: false, message: 'Satış özeti alınamadı: ' + error.message });
  }
};

// ───────────────────────────────────────────────────────────────
// 2. Ürün satışları (maliyet/kâr yalnızca products.view_cost ile)
// ───────────────────────────────────────────────────────────────
export const getProductSales = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const prev = can(req.user, 'reports.history') ? previousRange(range, req.query) : null;
    const [current, previous] = await Promise.all([
      fetchProductSales(range),
      prev ? fetchProductSales(prev) : Promise.resolve(null)
    ]);
    // Önceki dönem adet/tutarı (yükselen-düşen ürünler için)
    const prevMap = new Map((previous || []).map(p => [p.product_id, p]));
    const products = current
      .map(p => ({
        ...p,
        prev_qty: previous ? (prevMap.get(p.product_id)?.qty || 0) : null,
        prev_revenue: previous ? (prevMap.get(p.product_id)?.revenue || 0) : null
      }))
      .sort((a, b) => b.revenue - a.revenue);
    // Önceki dönemde satılıp bu dönemde hiç satılmayan ürünler
    const dropped = previous
      ? previous.filter(p => p.qty > 0 && !current.some(c => c.product_id === p.product_id))
          .map(p => ({ product_id: p.product_id, product_name: p.product_name, category_name: p.category_name, prev_qty: p.qty, prev_revenue: p.revenue }))
      : [];
    const showCost = can(req.user, 'products.view_cost');
    const withCost = products.filter(p => p.cost !== null);
    res.json({
      success: true,
      has_comparison: Boolean(previous),
      dropped_products: dropped,
      show_cost: showCost,
      products: showCost ? products : stripCost(products),
      totals: {
        qty: products.reduce((s, p) => s + p.qty, 0),
        revenue: sumBy(products, 'revenue'),
        comp_qty: products.reduce((s, p) => s + p.comp_qty, 0),
        comp_amount: sumBy(products, 'comp_amount'),
        ...(showCost ? {
          cost: sumBy(withCost, 'cost'),
          profit: sumBy(withCost, 'profit'),
          products_without_cost: products.length - withCost.length
        } : {})
      }
    });
  } catch (error) {
    console.error('Ürün satış raporu hatası:', error);
    res.status(500).json({ success: false, message: 'Ürün satışları alınamadı: ' + error.message });
  }
};

// ───────────────────────────────────────────────────────────────
// 3. Adisyonlar (kapanan adisyon listesi) ve adisyon detayı
// ───────────────────────────────────────────────────────────────
export const getClosedOrders = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const orders = await fetchClosedOrders(range);
    const [users] = await pool.query('SELECT id, name FROM users');
    const nameOf = new Map(users.map(u => [u.id, u.name]));
    res.json({
      success: true,
      orders: orders.map(o => ({
        id: o.id,
        order_number: o.order_number,
        table_title: o.table_title,
        opened_at: o.created_at,
        closed_at: o.closed_at,
        duration_minutes: Math.max(0, Math.round((new Date(o.closed_at) - new Date(o.created_at)) / 60000)),
        item_qty: o.item_qty,
        gross: o.gross, complimentary: o.comp, returned: o.ret, discount: o.discount, net: o.revenue,
        cash: o.cash, card: o.card, veresiye: o.veresiye, tip: o.tip,
        payment_count: o.payment_count,
        unpaid_closed: o.unpaid_closed,
        customers: o.customers || null,
        opened_by: nameOf.get(o.created_by_user_id) || null,
        closed_by: nameOf.get(Number(o.last_payment_by)) || null,
        payment_types: [o.cash > 0 && 'cash', o.card > 0 && 'credit_card', o.veresiye > 0 && 'veresiye'].filter(Boolean)
      })),
      totals: salesTotals(orders)
    });
  } catch (error) {
    console.error('Adisyon listesi hatası:', error);
    res.status(500).json({ success: false, message: 'Adisyonlar alınamadı: ' + error.message });
  }
};

export const getOrderDetail = async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    const [[order]] = await pool.query(`
      SELECT o.id, o.order_number, o.note, o.created_at, o.closed_at, o.status, t.title AS table_title, u.name AS opened_by
      FROM orders o
      LEFT JOIN restaurant_tables t ON t.id = o.table_id
      LEFT JOIN users u ON u.id = o.created_by_user_id
      WHERE o.id = ?
    `, [orderId]);
    if (!order) return res.status(404).json({ success: false, message: 'Adisyon bulunamadı.' });

    const [items] = await pool.query(`
      SELECT oi.id, pr.name AS product_name, COALESCE(c.name, 'Genel') AS category_name,
             oi.quantity, oi.unit_price, oi.total_price, oi.item_status, oi.note, oi.created_at, u.name AS added_by
      FROM order_items oi
      JOIN products pr ON pr.id = oi.product_id
      LEFT JOIN categories c ON c.id = pr.category_id
      LEFT JOIN users u ON u.id = oi.created_by_user_id
      WHERE oi.order_id = ?
      ORDER BY oi.id ASC
    `, [orderId]);

    const [payments] = await pool.query(`
      SELECT p.id, p.created_at, p.payment_method, p.total_amount, p.cash_amount, p.card_amount, p.veresiye_amount,
             p.discount, p.tip, p.customer_name, p.notes, u.name AS closed_by
      FROM payments p
      LEFT JOIN users u ON u.id = p.closed_by_user_id
      WHERE p.order_id = ?
      ORDER BY p.id ASC
    `, [orderId]);

    const sum = (rows, cond) => round2(rows.filter(cond).reduce((s, i) => s + Number(i.total_price), 0));
    const gross = sum(items, i => i.item_status !== 'cancelled');
    const comp = sum(items, i => i.item_status === 'complimentary');
    const ret = sum(items, i => i.item_status === 'returned');
    const discount = round2(payments.reduce((s, p) => s + Number(p.discount), 0));
    const net = round2(gross - comp - ret - discount);
    const settled = round2(payments.reduce((s, p) => s + Number(p.total_amount) - Number(p.tip), 0));

    res.json({
      success: true,
      order,
      items,
      payments,
      totals: {
        gross, complimentary: comp, returned: ret, discount, net,
        revenue: round2(net + payments.reduce((s, p) => s + Number(p.tip), 0)),
        voided: sum(items, i => i.item_status === 'cancelled'),
        tip: round2(payments.reduce((s, p) => s + Number(p.tip), 0)),
        collected: settled,
        unpaid_closed: Math.max(0, round2(net - settled))
      }
    });
  } catch (error) {
    console.error('Adisyon detayı hatası:', error);
    res.status(500).json({ success: false, message: 'Adisyon detayı alınamadı: ' + error.message });
  }
};

// ───────────────────────────────────────────────────────────────
// 4. Personel karnesi (silinmiş/gizli hesapların işlemleri "Diğer" satırında toplanır)
// ───────────────────────────────────────────────────────────────
export const getStaffReport = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const [users] = await pool.query(`
      SELECT u.id, u.name, u.username, u.is_active, r.name AS role_name, r.color AS role_color
      FROM users u LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.is_hidden = 0
    `);
    const visibleIds = new Set(users.map(u => u.id));

    const [payments] = await pool.query(`
      SELECT closed_by_user_id AS user_id,
        COUNT(*) AS payment_count,
        SUM(cash_amount) AS cash, SUM(card_amount) AS card, SUM(veresiye_amount) AS veresiye,
        SUM(discount) AS discount, SUM(tip) AS tip,
        SUM(CASE WHEN order_id IS NULL AND customer_id IS NOT NULL THEN cash_amount + card_amount ELSE 0 END) AS account_collections
      FROM payments WHERE created_at BETWEEN ? AND ?
      GROUP BY closed_by_user_id
    `, [range.from, range.to]);

    const [actions] = await pool.query(`
      SELECT user_id,
        SUM(action_type = 'order_created') AS orders_entered,
        SUM(CASE WHEN action_type = 'order_created' THEN quantity ELSE 0 END) AS items_entered,
        SUM(CASE WHEN action_type = 'item_delivered' THEN quantity ELSE 0 END) AS delivered_qty,
        SUM(CASE WHEN action_type = 'item_complimentary' THEN quantity ELSE 0 END) AS comp_qty,
        SUM(CASE WHEN action_type = 'item_complimentary' THEN amount ELSE 0 END) AS comp_amount,
        SUM(CASE WHEN action_type = 'item_returned' THEN quantity ELSE 0 END) AS returned_qty,
        SUM(CASE WHEN action_type = 'item_returned' THEN amount ELSE 0 END) AS returned_amount,
        SUM(CASE WHEN action_type = 'item_cancelled' THEN quantity ELSE 0 END) AS voided_qty,
        SUM(CASE WHEN action_type = 'item_cancelled' THEN amount ELSE 0 END) AS voided_amount
      FROM audit_logs WHERE created_at BETWEEN ? AND ?
      GROUP BY user_id
    `, [range.from, range.to]);

    const empty = () => ({
      payment_count: 0, cash: 0, card: 0, veresiye: 0, discount: 0, tip: 0, account_collections: 0,
      orders_entered: 0, items_entered: 0, delivered_qty: 0, comp_qty: 0, comp_amount: 0,
      returned_qty: 0, returned_amount: 0, voided_qty: 0, voided_amount: 0
    });
    const rows = new Map(users.map(u => [u.id, { user_id: u.id, name: u.name, username: u.username, role_name: u.role_name, role_color: u.role_color, is_active: Boolean(u.is_active), ...empty() }]));
    const other = { user_id: null, name: 'Diğer (silinmiş / sistem hesapları)', username: null, role_name: null, is_other: true, ...empty() };

    const merge = (target, src) => {
      for (const k of Object.keys(empty())) target[k] = round2(target[k] + (Number(src[k]) || 0));
    };
    for (const p of payments) merge(visibleIds.has(p.user_id) ? rows.get(p.user_id) : other, p);
    for (const a of actions) merge(visibleIds.has(a.user_id) ? rows.get(a.user_id) : other, a);

    const finalize = (r) => ({ ...r, drawer_total: round2(r.cash + r.card) });
    const list = [...rows.values()].map(finalize)
      .filter(r => r.is_active || r.payment_count || r.orders_entered)
      .sort((a, b) => b.drawer_total - a.drawer_total || b.orders_entered - a.orders_entered);
    const hasOther = Object.keys(empty()).some(k => other[k]);

    res.json({ success: true, staff: hasOther ? [...list, finalize(other)] : list });
  } catch (error) {
    console.error('Personel raporu hatası:', error);
    res.status(500).json({ success: false, message: 'Personel raporu alınamadı: ' + error.message });
  }
};

// ───────────────────────────────────────────────────────────────
// 5. İkram / İade / İptal / İndirim / Borç silme kayıtları
// ───────────────────────────────────────────────────────────────
const ADJUSTMENT_TYPES = {
  item_complimentary: 'complimentary',
  item_returned: 'returned',
  item_cancelled: 'voided',
  customer_debt_reset: 'debt_reset'
};

export const getAdjustments = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const [logs] = await pool.query(`
      SELECT id, created_at, action_type, title, details, amount, quantity, table_title, user_name
      FROM audit_logs
      WHERE action_type IN (?) AND created_at BETWEEN ? AND ?
      ORDER BY id DESC
    `, [Object.keys(ADJUSTMENT_TYPES), range.from, range.to]);

    const [discounts] = await pool.query(`
      SELECT p.id, p.created_at, p.discount AS amount, p.total_amount, t.title AS table_title,
             p.customer_name, u.name AS user_name
      FROM payments p
      LEFT JOIN restaurant_tables t ON t.id = p.table_id
      LEFT JOIN users u ON u.id = p.closed_by_user_id
      WHERE p.discount > 0 AND p.created_at BETWEEN ? AND ?
      ORDER BY p.id DESC
    `, [range.from, range.to]);

    // Fire & zayi kayıtları (tutar maliyet üzerinden; maliyet yetkisi yoksa gösterilmez)
    const [wastes] = await pool.query(`
      SELECT w.id, w.occurred_at, w.item_name, w.quantity, w.unit, w.reason, w.total_cost, w.note, u.name AS user_name
      FROM waste_records w
      LEFT JOIN users u ON u.id = w.created_by_user_id
      WHERE w.deleted_at IS NULL AND w.occurred_at BETWEEN ? AND ?
      ORDER BY w.occurred_at DESC
    `, [range.from, range.to]);
    const showWasteCost = can(req.user, 'products.view_cost');

    const events = [
      ...wastes.map(w => ({
        id: `waste-${w.id}`,
        type: 'waste',
        created_at: w.occurred_at,
        title: `Fire/Zayi: ${w.item_name}`,
        details: [WASTE_REASONS[w.reason] || w.reason, `${Number(w.quantity).toLocaleString('tr-TR')} ${w.unit}`, w.note].filter(Boolean).join(' · '),
        amount: showWasteCost ? round2(w.total_cost) : 0,
        quantity: Math.ceil(Number(w.quantity)) || 0,
        table_title: null,
        user_name: w.user_name
      })),
      ...logs.map(l => ({
        id: `log-${l.id}`,
        type: ADJUSTMENT_TYPES[l.action_type],
        created_at: l.created_at,
        title: l.title,
        details: l.details,
        amount: round2(l.amount),
        quantity: Number(l.quantity) || 0,
        table_title: l.table_title,
        user_name: l.user_name
      })),
      ...discounts.map(d => ({
        id: `pay-${d.id}`,
        type: 'discount',
        created_at: d.created_at,
        title: `İndirim: ${d.table_title || d.customer_name || 'Cari tahsilat'}`,
        details: `Tahsil edilen ₺${round2(d.total_amount).toFixed(2)}`,
        amount: round2(d.amount),
        quantity: 0,
        table_title: d.table_title,
        user_name: d.user_name
      }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const summary = {};
    for (const t of ['complimentary', 'returned', 'voided', 'discount', 'debt_reset', 'waste']) {
      const list = events.filter(e => e.type === t);
      summary[t] = { count: list.length, quantity: list.reduce((s, e) => s + e.quantity, 0), amount: sumBy(list, 'amount') };
    }

    res.json({ success: true, events, summary, waste_cost_visible: showWasteCost });
  } catch (error) {
    console.error('İkram/iade/iptal raporu hatası:', error);
    res.status(500).json({ success: false, message: 'Kayıtlar alınamadı: ' + error.message });
  }
};

// ───────────────────────────────────────────────────────────────
// 6. Masa performansı (aralıkta kapanan adisyonlara göre)
// ───────────────────────────────────────────────────────────────
export const getTablePerformance = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const orders = await fetchClosedOrders(range);
    const [tables] = await pool.query('SELECT id, title, table_number, is_active FROM restaurant_tables ORDER BY order_num ASC, id ASC');

    const stats = new Map();
    for (const o of orders) {
      const s = stats.get(o.table_id) || { orders: 0, net: 0, item_qty: 0, minutes: 0, loss: 0 };
      s.orders += 1;
      s.net = round2(s.net + o.revenue);
      s.item_qty += o.item_qty;
      s.minutes += Math.max(0, (new Date(o.closed_at) - new Date(o.created_at)) / 60000);
      s.loss = round2(s.loss + o.comp + o.ret + o.voided);
      stats.set(o.table_id, s);
    }
    const totalNet = sumBy(orders, 'revenue');

    const rows = tables
      .filter(t => t.is_active || stats.has(t.id))
      .map(t => {
        const s = stats.get(t.id) || { orders: 0, net: 0, item_qty: 0, minutes: 0, loss: 0 };
        return {
          table_id: t.id,
          title: t.title,
          table_number: t.table_number,
          is_active: Boolean(t.is_active),
          orders: s.orders,
          net: s.net,
          share: totalNet ? round2((s.net / totalNet) * 100) : 0,
          average_ticket: s.orders ? round2(s.net / s.orders) : 0,
          items_per_ticket: s.orders ? round2(s.item_qty / s.orders) : 0,
          avg_duration_min: s.orders ? Math.round(s.minutes / s.orders) : 0,
          loss: s.loss
        };
      })
      .sort((a, b) => b.net - a.net || a.title.localeCompare(b.title, 'tr'));

    res.json({ success: true, tables: rows, totals: { orders: orders.length, net: totalNet, used_tables: stats.size, total_tables: tables.filter(t => t.is_active).length } });
  } catch (error) {
    console.error('Masa performansı hatası:', error);
    res.status(500).json({ success: false, message: 'Masa raporu alınamadı: ' + error.message });
  }
};

// ───────────────────────────────────────────────────────────────
// 7. Cari hesaplar: güncel açık alacak (dönemden bağımsız) + dönem içi hareketler
// ───────────────────────────────────────────────────────────────
export const getReceivables = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const [customers] = await pool.query(`
      SELECT c.id, c.name, c.phone, c.current_balance, c.total_debt, c.total_paid,
        (SELECT MAX(created_at) FROM customer_transactions t WHERE t.customer_id = c.id AND t.transaction_type = 'debt') AS last_debt_at,
        (SELECT MAX(created_at) FROM customer_transactions t WHERE t.customer_id = c.id AND t.transaction_type = 'payment') AS last_payment_at
      FROM customers c
      WHERE c.is_active = 1 AND c.current_balance > 0.005
      ORDER BY c.current_balance DESC
    `);
    const [[period]] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'debt' THEN amount ELSE 0 END), 0) AS written,
        COALESCE(SUM(CASE WHEN transaction_type = 'payment' THEN amount ELSE 0 END), 0) AS collected,
        COALESCE(SUM(CASE WHEN transaction_type = 'debt_reset' THEN amount ELSE 0 END), 0) AS written_off,
        COUNT(DISTINCT CASE WHEN transaction_type = 'debt' THEN customer_id END) AS debtor_count
      FROM customer_transactions WHERE created_at BETWEEN ? AND ?
    `, [range.from, range.to]);

    const now = Date.now();
    const list = customers.map(c => {
      const lastActivity = [c.last_debt_at, c.last_payment_at].filter(Boolean).map(d => new Date(d).getTime());
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        balance: round2(c.current_balance),
        total_debt: round2(c.total_debt),
        total_paid: round2(c.total_paid),
        last_debt_at: c.last_debt_at,
        last_payment_at: c.last_payment_at,
        // Son ödemeden (yoksa son borçtan) bu yana geçen gün: tahsilat önceliği için
        days_since_payment: Math.floor((now - (c.last_payment_at ? new Date(c.last_payment_at).getTime() : (lastActivity.length ? Math.min(...lastActivity) : now))) / DAY_MS)
      };
    });
    const aging = { d0_7: 0, d8_30: 0, d31_plus: 0 };
    for (const c of list) {
      if (c.days_since_payment <= 7) aging.d0_7 = round2(aging.d0_7 + c.balance);
      else if (c.days_since_payment <= 30) aging.d8_30 = round2(aging.d8_30 + c.balance);
      else aging.d31_plus = round2(aging.d31_plus + c.balance);
    }

    res.json({
      success: true,
      outstanding: { total: sumBy(list, 'balance'), customer_count: list.length, aging },
      period: {
        written: round2(period.written),
        collected: round2(period.collected),
        written_off: round2(period.written_off),
        debtor_count: Number(period.debtor_count) || 0
      },
      customers: list
    });
  } catch (error) {
    console.error('Cari rapor hatası:', error);
    res.status(500).json({ success: false, message: 'Cari hesap raporu alınamadı: ' + error.message });
  }
};
