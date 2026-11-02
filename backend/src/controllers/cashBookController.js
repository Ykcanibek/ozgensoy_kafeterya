import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { pool } from '../config/db.js';
import { getUserFromReq, logActivity } from '../config/auditLogger.js';
import { can, deny } from '../middleware/auth.js';
import { closeDay, closePendingDays, CASH_TIP_SQL, CARD_TIP_SQL } from '../services/dailyClosing.js';

/*
 * KASA DEFTERİ
 * İşletmenin tüm gelir ve giderleri tek defterde: elle girilen kayıtlar + POS'tan gelen günlük tahsilatlar (otomatik).
 * Kategoriler dallanmalıdır: ANA KATEGORİ (ör. Faturalar) → ALT KATEGORİ (Elektrik, Su…).
 * Kayıt ya doğrudan ana kategoriye girilir ya da ana kategorinin alt kategorilerine satır satır bölünür;
 * aynı anda girilen satırlar ortak bir batch_id taşır. Belge ve KDV bilgileri isteğe bağlıdır.
 * Liste tarih sırasıyla (eskiden yeniye) döner; dönem başı devreden bakiye ile her satırda yürüyen bakiye hesaplanır.
 */

export const ENTRY_TYPES = { income: 'Gelir', expense: 'Gider', transfer: 'Transfer' };
// Hesaplar: 'card' müşteriden POS ile alınan kart tahsilatıdır (bankaya geçecek alacak);
// 'company_card' işletmenin kendi kredi kartıdır (harcamalar borç olarak birikir, bankadan transferle ödenir)
export const PAYMENT_METHODS = {
  cash: 'Nakit Kasa',
  card: 'POS / Kart Tahsilatı',
  bank: 'Banka',
  company_card: 'Şirket Kredi Kartı',
  other: 'Diğer'
};
// Hangi kayıt türü hangi hesabı kullanabilir (POS kartıyla gider ödenmez; şirket kartına gelir girmez)
export const METHODS_BY_TYPE = {
  income: ['cash', 'card', 'bank', 'other'],
  expense: ['cash', 'company_card', 'bank', 'other'],
  transfer: Object.keys(PAYMENT_METHODS)
};
const TRANSFER_LABEL = 'Hesaplar Arası Transfer';
export const DOCUMENT_TYPES = {
  none: 'Belgesiz',
  invoice: 'Fatura',
  e_invoice: 'e-Fatura',
  e_archive: 'e-Arşiv Fatura',
  receipt: 'Perakende Satış Fişi',
  expense_slip: 'Gider Pusulası',
  self_employment: 'Serbest Meslek Makbuzu',
  z_report: 'Z Raporu',
  bank_receipt: 'Banka Dekontu',
  payroll: 'Maaş Bordrosu',
  other: 'Diğer Belge'
};
export const VAT_RATES = [0, 1, 10, 20];
const MAX_AMOUNT = 10000000;
const MAX_LINES = 30;
const MAX_ROWS = 5000;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const clean = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const emit = (req) => req.io?.emit('cashbook:changed', {});
const money = (n) => `₺${Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const validAmount = (n) => Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

const ENTRY_SELECT = `
  SELECT e.id, e.entry_type, e.source, e.closing_id, DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS entry_date,
         e.category_id, c.name AS category_name, e.subcategory_id, sc.name AS subcategory_name, e.batch_id,
         e.amount, e.vat_rate, e.vat_amount, e.net_amount, e.payment_method, e.transfer_to,
         e.document_type, e.document_no, e.counterparty, e.tax_number, e.description,
         e.created_by_user_id, cu.name AS created_by_name, e.created_at,
         uu.name AS updated_by_name, e.updated_at
  FROM cash_book_entries e
  LEFT JOIN cash_book_categories c ON c.id = e.category_id
  LEFT JOIN cash_book_categories sc ON sc.id = e.subcategory_id
  LEFT JOIN users cu ON cu.id = e.created_by_user_id
  LEFT JOIN users uu ON uu.id = e.updated_by_user_id
`;

// source: 'manual' (elle girilen) · 'pos_daily' (gece kaydedilen gün sonu cirosu) · 'pos_live' (bugünün henüz kaydedilmemiş canlı tahsilatı)
const mapEntry = (r) => ({
  id: r.id,
  source: r.source,
  closing_id: r.closing_id || null,
  entry_type: r.entry_type,
  entry_date: r.entry_date,
  category_id: r.category_id,
  category_name: r.entry_type === 'transfer' ? TRANSFER_LABEL : r.category_name,
  subcategory_id: r.subcategory_id,
  subcategory_name: r.subcategory_name || null,
  batch_id: r.batch_id || null,
  amount: Number(r.amount),
  vat_rate: Number(r.vat_rate),
  vat_amount: Number(r.vat_amount),
  net_amount: Number(r.net_amount),
  payment_method: r.payment_method,
  transfer_to: r.transfer_to || null,
  document_type: r.document_type,
  document_no: r.document_no,
  counterparty: r.counterparty,
  tax_number: r.tax_number,
  description: r.description,
  created_by_user_id: r.created_by_user_id,
  created_by_name: r.created_by_name || (r.source === 'pos_daily' ? 'Sistem (gün sonu)' : null),
  created_at: r.created_at,
  updated_by_name: r.updated_by_name || null,
  updated_at: r.updated_at
});

/** Liste filtrelerini (tarih hariç) elle girilen kayıtlar için SQL koşuluna çevirir. category_id ana ya da alt kategori olabilir. */
const manualFilters = (q) => {
  const where = ['e.deleted_at IS NULL'];
  const params = [];
  if (q.include_pos === '0') where.push("e.source = 'manual'"); // POS tahsilatları gizlenince gün sonu ciroları da gizlenir
  if (ENTRY_TYPES[q.entry_type]) { where.push('e.entry_type = ?'); params.push(q.entry_type); }
  if (PAYMENT_METHODS[q.payment_method]) { where.push('(e.payment_method = ? OR e.transfer_to = ?)'); params.push(q.payment_method, q.payment_method); }
  if (DOCUMENT_TYPES[q.document_type]) { where.push('e.document_type = ?'); params.push(q.document_type); }
  if (Number(q.category_id) > 0) { where.push('(e.category_id = ? OR e.subcategory_id = ?)'); params.push(Number(q.category_id), Number(q.category_id)); }
  const search = String(q.search || '').trim();
  if (search) {
    const s = `%${search}%`;
    where.push('(e.description LIKE ? OR e.counterparty LIKE ? OR e.document_no LIKE ? OR e.tax_number LIKE ? OR c.name LIKE ? OR sc.name LIKE ?)');
    params.push(s, s, s, s, s, s);
  }
  return { where, params };
};

/**
 * Henüz gün sonu kaydı oluşmamış günlerin (normalde yalnızca bugün) POS tahsilatları canlı olarak gösterilir
 * (masa ödemeleri + cari borç tahsilatları; veresiye kasaya para girmediği için hariç). Gece kapanan günler
 * kasa defterinde kalıcı 'pos_daily' kayıtları olarak durur; burada tekrar sayılmaz.
 * Kategori/belge filtresi seçiliyse canlı satırlar gösterilmez.
 */
const posApplies = (q) =>
  q.include_pos !== '0' && (!q.entry_type || q.entry_type === 'income') && !(Number(q.category_id) > 0) &&
  !DOCUMENT_TYPES[q.document_type] && (!q.payment_method || ['cash', 'card'].includes(q.payment_method)) &&
  (!String(q.search || '').trim() || 'pos satış tahsilat'.includes(String(q.search).trim().toLocaleLowerCase('tr-TR')));

const POS_LABEL = 'Günlük Ciro (POS)';

const loadPosDays = async (q, range) => {
  const where = [
    '(p.cash_amount > 0 OR p.card_amount > 0)',
    "DATE_FORMAT(p.created_at, '%Y-%m-%d') NOT IN (SELECT DATE_FORMAT(business_date, '%Y-%m-%d') FROM cash_book_daily_closings)"
  ];
  const params = [];
  if (range.from) { where.push('p.created_at >= ?'); params.push(`${range.from} 00:00:00`); }
  if (range.to) { where.push('p.created_at <= ?'); params.push(`${range.to} 23:59:59`); }
  if (range.before) { where.push('p.created_at < ?'); params.push(`${range.before} 00:00:00`); }
  const [rows] = await pool.query(`
    SELECT DATE_FORMAT(p.created_at, '%Y-%m-%d') AS d,
           COALESCE(SUM(p.cash_amount - (${CASH_TIP_SQL})), 0) AS cash,
           COALESCE(SUM(p.card_amount - (${CARD_TIP_SQL})), 0) AS card,
           COALESCE(SUM(p.tip), 0) AS tip,
           SUM(p.cash_amount > 0) AS cash_count, SUM(p.card_amount > 0) AS card_count,
           SUM(p.order_id IS NULL) AS collections
    FROM payments p
    WHERE ${where.join(' AND ')}
    GROUP BY d ORDER BY d ASC
  `, params);
  const out = [];
  for (const r of rows) {
    for (const method of ['cash', 'card']) {
      if (q.payment_method && q.payment_method !== method) continue;
      const amount = round2(r[method]);
      if (amount <= 0) continue;
      const isToday = r.d === todayStr();
      out.push({
        id: `pos-${r.d}-${method}`,
        source: 'pos_live',
        closing_id: null,
        entry_type: 'income',
        entry_date: r.d,
        category_id: null,
        category_name: POS_LABEL,
        subcategory_id: null,
        subcategory_name: method === 'cash' ? 'Nakit Tahsilat' : 'Kartlı Tahsilat',
        batch_id: null,
        amount,
        vat_rate: 0,
        vat_amount: 0,
        net_amount: amount,
        payment_method: method,
        document_type: null,
        document_no: null,
        counterparty: null,
        tax_number: null,
        description: `${isToday ? 'Bugün (canlı) — ' : ''}${method === 'cash' ? 'Nakit' : 'Kartlı'} tahsilat, ${Number(r[`${method}_count`])} işlem` +
          (Number(r.collections) > 0 ? ' (cari tahsilatlar dahil)' : '') +
          (Number(r.tip) > 0 ? '; bahşiş hariç' : '') +
          (isToday ? '. Gün sonu cirosu gece 00:00’dan sonra kaydedilir.' : ''),
        created_by_name: 'Otomatik (POS)'
      });
    }
  }
  return out;
};

const signed = (r) => (r.entry_type === 'income' ? r.amount : r.entry_type === 'expense' ? -r.amount : 0);

/** Ana kategori → alt kategori kırılımlı toplamlar (alt kategorisiz kayıtlar "Genel" satırında) */
const categoryTree = (list) => {
  const mains = new Map();
  list.forEach(e => {
    const key = e.category_name;
    const main = mains.get(key) || { category_id: e.category_id, name: key, total: 0, count: 0, children: new Map() };
    main.total = round2(main.total + e.amount);
    main.count += 1;
    const subKey = e.subcategory_name || 'Genel';
    const sub = main.children.get(subKey) || { category_id: e.subcategory_id || null, name: subKey, total: 0, count: 0 };
    sub.total = round2(sub.total + e.amount);
    sub.count += 1;
    main.children.set(subKey, sub);
    mains.set(key, main);
  });
  return [...mains.values()]
    .map(m => {
      const children = [...m.children.values()].sort((a, b) => b.total - a.total);
      // Yalnızca "Genel" varsa (hiç alt kategori kullanılmamış) kırılım gösterilmez
      return { ...m, children: children.length === 1 && children[0].name === 'Genel' ? [] : children };
    })
    .sort((a, b) => b.total - a.total);
};

/** Defterin tamamı: satırlar (yürüyen bakiyeli), devir ve özetler. Liste ve Excel aynı veriyi kullanır. */
const buildLedger = async (q) => {
  const from = validDate(q.startDate) ? q.startDate : null;
  const to = validDate(q.endDate) ? q.endDate : null;
  const { where, params } = manualFilters(q);

  const periodWhere = [...where];
  const periodParams = [...params];
  if (from) { periodWhere.push('e.entry_date >= ?'); periodParams.push(from); }
  if (to) { periodWhere.push('e.entry_date <= ?'); periodParams.push(to); }
  const [rows] = await pool.query(
    `${ENTRY_SELECT} WHERE ${periodWhere.join(' AND ')} ORDER BY e.entry_date ASC, e.id ASC LIMIT ${MAX_ROWS}`,
    periodParams
  );
  let entries = rows.map(mapEntry);

  const includePos = posApplies(q);
  if (includePos) entries = entries.concat(await loadPosDays(q, { from, to }));
  // Aynı gün içinde: önce günün cirosu (nakit, sonra kart), sonra elle girilen kayıtlar giriş sırasıyla
  const isAuto = (e) => e.source !== 'manual';
  entries.sort((a, b) => a.entry_date.localeCompare(b.entry_date) ||
    (isAuto(a) === isAuto(b)
      ? (isAuto(a) ? (a.payment_method === 'cash' ? -1 : 1) : a.id - b.id)
      : (isAuto(a) ? -1 : 1)));

  // Devreden: dönem başından önceki hareketler (aynı filtrelerle), ödeme yöntemi bazında
  const openingByMethod = Object.fromEntries(Object.keys(PAYMENT_METHODS).map(m => [m, 0]));
  if (from) {
    const [prev] = await pool.query(
      `SELECT e.payment_method, SUM(CASE WHEN e.entry_type = 'income' THEN e.amount ELSE -e.amount END) AS total
       FROM cash_book_entries e
       LEFT JOIN cash_book_categories c ON c.id = e.category_id
       LEFT JOIN cash_book_categories sc ON sc.id = e.subcategory_id
       WHERE ${[...where, 'e.entry_date < ?'].join(' AND ')} GROUP BY e.payment_method`,
      [...params, from]
    );
    prev.forEach(p => { openingByMethod[p.payment_method] = round2(p.total); });
    const [prevIn] = await pool.query(
      `SELECT e.transfer_to, SUM(e.amount) AS total
       FROM cash_book_entries e
       LEFT JOIN cash_book_categories c ON c.id = e.category_id
       LEFT JOIN cash_book_categories sc ON sc.id = e.subcategory_id
       WHERE ${[...where, "e.entry_type = 'transfer'", 'e.entry_date < ?'].join(' AND ')} GROUP BY e.transfer_to`,
      [...params, from]
    );
    prevIn.forEach(p => { openingByMethod[p.transfer_to] = round2(openingByMethod[p.transfer_to] + Number(p.total)); });
    if (includePos) {
      (await loadPosDays(q, { before: from })).forEach(p => { openingByMethod[p.payment_method] = round2(openingByMethod[p.payment_method] + p.amount); });
    }
  }
  const opening = round2(Object.values(openingByMethod).reduce((s, v) => s + v, 0));

  let balance = opening;
  entries.forEach(e => { balance = round2(balance + signed(e)); e.balance = balance; });

  const sum = (list) => round2(list.reduce((s, e) => s + e.amount, 0));
  const incomes = entries.filter(e => e.entry_type === 'income');
  const expenses = entries.filter(e => e.entry_type === 'expense');
  const transfers = entries.filter(e => e.entry_type === 'transfer');

  const byMethod = Object.keys(PAYMENT_METHODS).map(m => {
    const inn = sum(incomes.filter(e => e.payment_method === m));
    const out = sum(expenses.filter(e => e.payment_method === m));
    const tIn = sum(transfers.filter(e => e.transfer_to === m));
    const tOut = sum(transfers.filter(e => e.payment_method === m));
    return {
      method: m, label: PAYMENT_METHODS[m], opening: openingByMethod[m],
      income: inn, expense: out, transfer_in: tIn, transfer_out: tOut,
      closing: round2(openingByMethod[m] + inn - out + tIn - tOut)
    };
  });

  // KDV özeti: KDV oranı girilmiş (belgeli) elle kayıtlar
  const vatIn = incomes.filter(e => e.source === 'manual' && e.vat_rate > 0);
  const vatOut = expenses.filter(e => e.source === 'manual' && e.vat_rate > 0);
  const vatSum = (list) => round2(list.reduce((s, e) => s + e.vat_amount, 0));
  const netSum = (list) => round2(list.reduce((s, e) => s + e.net_amount, 0));
  const vatByRate = VAT_RATES.filter(r => r > 0).map(rate => ({
    rate,
    income_base: netSum(vatIn.filter(e => e.vat_rate === rate)),
    income_vat: vatSum(vatIn.filter(e => e.vat_rate === rate)),
    expense_base: netSum(vatOut.filter(e => e.vat_rate === rate)),
    expense_vat: vatSum(vatOut.filter(e => e.vat_rate === rate))
  })).filter(r => r.income_base || r.expense_base);

  const totalIncome = sum(incomes);
  const totalExpense = sum(expenses);
  return {
    range: { startDate: from, endDate: to },
    include_pos: includePos,
    truncated: rows.length >= MAX_ROWS,
    entries,
    summary: {
      opening,
      total_income: totalIncome,
      total_expense: totalExpense,
      net: round2(totalIncome - totalExpense),
      closing: balance,
      income_count: incomes.length,
      expense_count: expenses.length,
      transfer_count: transfers.length,
      pos_income: sum(incomes.filter(e => e.source !== 'manual')),
      by_method: byMethod,
      income_categories: categoryTree(incomes),
      expense_categories: categoryTree(expenses),
      vat: {
        output_vat: vatSum(vatIn),
        input_vat: vatSum(vatOut),
        payable: round2(vatSum(vatIn) - vatSum(vatOut)),
        by_rate: vatByRate
      }
    }
  };
};

const optionsPayload = async () => {
  const [categories] = await pool.query(`
    SELECT c.id, c.entry_type, c.parent_id, c.name, c.system_key, c.is_active, c.order_num,
           (SELECT COUNT(*) FROM cash_book_entries e
            WHERE (e.category_id = c.id OR e.subcategory_id = c.id) AND e.deleted_at IS NULL) AS usage_count
    FROM cash_book_categories c
    ORDER BY c.entry_type, c.order_num, c.name
  `);
  return {
    payment_methods: Object.entries(PAYMENT_METHODS).map(([key, label]) => ({ key, label })),
    methods_by_type: METHODS_BY_TYPE,
    document_types: Object.entries(DOCUMENT_TYPES).map(([key, label]) => ({ key, label })),
    vat_rates: VAT_RATES,
    categories: categories.map(c => ({ ...c, is_active: Boolean(c.is_active), usage_count: Number(c.usage_count) }))
  };
};

/** GET /api/cashbook — Query: startDate, endDate, entry_type, category_id (ana/alt), payment_method, document_type, search, include_pos */
export const getCashBook = async (req, res) => {
  try {
    res.json({ success: true, ...(await buildLedger(req.query)) });
  } catch (error) {
    console.error('Kasa defteri hatası:', error);
    res.status(500).json({ success: false, message: 'Kasa defteri alınamadı: ' + error.message });
  }
};

/** GET /api/cashbook/options — form ve filtre seçenekleri (kategori ağacı düz liste olarak, parent_id ile) */
export const getCashBookOptions = async (req, res) => {
  try {
    res.json({ success: true, ...(await optionsPayload()) });
  } catch (error) {
    console.error('Kasa defteri seçenekleri hatası:', error);
    res.status(500).json({ success: false, message: 'Seçenekler alınamadı: ' + error.message });
  }
};

/**
 * Kayıt gövdesini doğrular. Satırlar: body.lines = [{ subcategory_id, amount, description? }] (alt kategorilere bölme)
 * ya da tek tutar: body.amount (+ isteğe bağlı body.subcategory_id). Ortak alanlar: tarih, ana kategori, ödeme, belge, KDV, açıklama.
 * Döner: { error } ya da { common, lines: [{ subcategory_id, amount, vat_amount, net_amount, description }], names }
 */
const validateTransfer = (body) => {
  const from = body.payment_method;
  const to = body.transfer_to;
  if (!PAYMENT_METHODS[from]) return { error: 'Paranın çıktığı hesabı seçin.' };
  if (!PAYMENT_METHODS[to]) return { error: 'Paranın girdiği hesabı seçin.' };
  if (from === to) return { error: 'Çıkış ve giriş hesabı farklı olmalıdır.' };
  const amount = Number(body.amount);
  if (!validAmount(amount)) return { error: 'Tutar 0’dan büyük olmalı (en fazla 2 ondalık basamak).' };
  const label = `${PAYMENT_METHODS[from]} → ${PAYMENT_METHODS[to]}`;
  return {
    mainName: label,
    names: [label],
    common: {
      entry_type: 'transfer',
      entry_date: body.entry_date,
      category_id: null,
      vat_rate: 0,
      payment_method: from,
      transfer_to: to,
      document_type: DOCUMENT_TYPES[body.document_type] ? body.document_type : 'none',
      document_no: clean(body.document_no, 60),
      counterparty: null,
      tax_number: null,
      description: clean(body.description, 500)
    },
    lines: [{ subcategory_id: null, amount: round2(amount), vat_amount: 0, net_amount: round2(amount), description: null }]
  };
};

const validateEntry = async (body, { allowInactive = new Set(), single = false }) => {
  const entryType = body.entry_type;
  if (!ENTRY_TYPES[entryType]) return { error: 'Kayıt türü (gelir/gider/transfer) seçin.' };

  const entryDate = body.entry_date;
  if (!validDate(entryDate)) return { error: 'Geçerli bir tarih girin.' };
  if (entryDate > todayStr()) return { error: 'İleri tarihli kayıt girilemez.' };
  if (entryType === 'transfer') return validateTransfer(body);

  const [cats] = await pool.query('SELECT id, entry_type, parent_id, is_active, name, system_key FROM cash_book_categories WHERE id = ?', [Number(body.category_id) || 0]);
  const main = cats[0];
  if (!main) return { error: 'Ana kategori seçin.' };
  if (main.system_key) return { error: `"${main.name}" gün sonu cirosu için ayrılmıştır; bu kategoriye elle kayıt girilemez.` };
  if (main.parent_id) return { error: `"${main.name}" bir alt kategoridir; önce ana kategorisini seçin.` };
  if (main.entry_type !== entryType) return { error: `"${main.name}" bir ${ENTRY_TYPES[main.entry_type].toLocaleLowerCase('tr-TR')} kategorisidir.` };
  if (!main.is_active && !allowInactive.has(main.id)) return { error: `"${main.name}" kategorisi pasif; başka bir kategori seçin.` };

  const [subRows] = await pool.query('SELECT id, name, is_active FROM cash_book_categories WHERE parent_id = ?', [main.id]);
  const subs = new Map(subRows.map(s => [s.id, s]));

  const rawLines = Array.isArray(body.lines) && body.lines.length && !single
    ? body.lines
    : [{ subcategory_id: body.subcategory_id, amount: body.amount, description: null }];
  if (rawLines.length > MAX_LINES) return { error: `Tek seferde en fazla ${MAX_LINES} satır girilebilir.` };

  const vatRate = Number(body.vat_rate ?? 0);
  if (!VAT_RATES.includes(vatRate)) return { error: `KDV oranı ${VAT_RATES.map(r => `%${r}`).join(', ')} olabilir.` };

  const lines = [];
  const names = [];
  for (const [i, line] of rawLines.entries()) {
    const label = rawLines.length > 1 ? `${i + 1}. satır: ` : '';
    const amount = Number(line.amount);
    if (!validAmount(amount)) return { error: `${label}Tutar 0’dan büyük olmalı (en fazla 2 ondalık basamak).` };
    let subId = null;
    if (line.subcategory_id !== undefined && line.subcategory_id !== null && line.subcategory_id !== '') {
      const sub = subs.get(Number(line.subcategory_id));
      if (!sub) return { error: `${label}Seçilen alt kategori "${main.name}" altında değil.` };
      if (!sub.is_active && !allowInactive.has(sub.id)) return { error: `${label}"${sub.name}" alt kategorisi pasif.` };
      subId = sub.id;
      names.push(sub.name);
    } else {
      names.push(main.name);
    }
    const vatAmount = round2(amount * vatRate / (100 + vatRate));
    lines.push({
      subcategory_id: subId,
      amount: round2(amount),
      vat_amount: vatAmount,
      net_amount: round2(amount - vatAmount),
      description: clean(line.description, 500)
    });
  }

  const paymentMethod = body.payment_method;
  if (!PAYMENT_METHODS[paymentMethod]) return { error: 'Ödeme yöntemini seçin.' };
  if (!METHODS_BY_TYPE[entryType].includes(paymentMethod)) {
    return {
      error: entryType === 'expense'
        ? `"${PAYMENT_METHODS[paymentMethod]}" hesabından gider ödenemez; kartla yapılan harcamalar için "Şirket Kredi Kartı"nı seçin.`
        : `"${PAYMENT_METHODS[paymentMethod]}" hesabına gelir girilemez; müşteriden kartla alınan ödemeler "POS / Kart Tahsilatı"dır.`
    };
  }
  const documentType = DOCUMENT_TYPES[body.document_type] ? body.document_type : 'none';
  const taxNumber = clean(body.tax_number, 20);
  if (taxNumber && !/^\d{10,11}$/.test(taxNumber)) return { error: 'VKN 10, TCKN 11 haneli olmalıdır.' };

  return {
    mainName: main.name,
    names,
    common: {
      entry_type: entryType,
      entry_date: entryDate,
      category_id: main.id,
      vat_rate: vatRate,
      payment_method: paymentMethod,
      transfer_to: null,
      document_type: documentType,
      document_no: clean(body.document_no, 60),
      counterparty: clean(body.counterparty, 150),
      tax_number: taxNumber,
      description: clean(body.description, 500)
    },
    lines
  };
};

/** POST /api/cashbook — tek kayıt ya da alt kategorilere bölünmüş satırlar (aynı batch_id) */
export const createEntry = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const v = await validateEntry(req.body || {}, {});
    if (v.error) return res.status(400).json({ success: false, message: v.error });

    const batchId = v.lines.length > 1 ? crypto.randomUUID() : null;
    const ids = [];
    await connection.beginTransaction();
    for (const line of v.lines) {
      const row = {
        ...v.common,
        subcategory_id: line.subcategory_id,
        batch_id: batchId,
        amount: line.amount,
        vat_amount: line.vat_amount,
        net_amount: line.net_amount,
        // Satır açıklaması yoksa ortak açıklama kullanılır
        description: line.description || v.common.description
      };
      const cols = Object.keys(row);
      const [result] = await connection.query(
        `INSERT INTO cash_book_entries (${cols.join(', ')}, created_by_user_id) VALUES (${cols.map(() => '?').join(', ')}, ?)`,
        [...Object.values(row), user.id]
      );
      ids.push(result.insertId);
    }
    await connection.commit();

    const total = round2(v.lines.reduce((s, l) => s + l.amount, 0));
    const typeLabel = ENTRY_TYPES[v.common.entry_type];
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'cash_book',
      entityId: ids[0],
      actionType: `cashbook_${v.common.entry_type}_created`,
      title: `Kasa Defteri ${typeLabel}: ${v.mainName} (${money(total)})`,
      details: `${user.name} tarafından girildi: ${v.lines.map((l, i) => `${v.names[i]} ${money(l.amount)}`).join(', ')}` +
        (v.common.description ? ` — ${v.common.description}` : ''),
      newValue: { ...v.common, lines: v.lines },
      amount: total
    });
    emit(req);
    const [rows] = await pool.query(`${ENTRY_SELECT} WHERE e.id IN (?) ORDER BY e.id`, [ids]);
    res.status(201).json({
      success: true,
      message: v.lines.length > 1 ? `${v.mainName}: ${v.lines.length} kalem (${money(total)}) eklendi.` : `${typeLabel} kaydı eklendi.`,
      entries: rows.map(mapEntry),
      entry: mapEntry(rows[0])
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error('Kasa defteri kayıt hatası:', error);
    res.status(500).json({ success: false, message: 'Kayıt eklenemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Düzenleme/silme hakkı: ilgili yetki (cashbook.edit / cashbook.delete) ya da kaydı giren kişinin aynı gün içinde
 * kendi kaydını düzeltmesi (yanlış girilen tutarı yöneticiye gerek kalmadan düzeltebilsin).
 */
const ownSameDay = (user, row) => row.created_by_user_id === user.id &&
  new Date(row.created_at).toDateString() === new Date().toDateString();

const loadActiveEntry = async (id) => {
  const [rows] = await pool.query(`${ENTRY_SELECT} WHERE e.id = ? AND e.deleted_at IS NULL`, [Number(id) || 0]);
  return rows[0] ? mapEntry(rows[0]) : null;
};

const pathOf = (e) => (e.subcategory_name ? `${e.category_name} › ${e.subcategory_name}` : e.category_name);
const AUTO_ENTRY_MESSAGE = 'Gün sonu cirosu otomatik kayıttır; elle düzenlenemez veya silinemez. Gerekirse gün sonu raporundan "Yeniden hesapla"yı kullanın.';

/** PUT /api/cashbook/:id — tek satırı düzenler (ana/alt kategori, tutar ve ortak alanlar) */
export const updateEntry = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const existing = await loadActiveEntry(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Kayıt bulunamadı.' });
    if (existing.source !== 'manual') return res.status(400).json({ success: false, message: AUTO_ENTRY_MESSAGE });
    if (!can(req.user, 'cashbook.edit') && !ownSameDay(req.user, existing)) return deny(res, 'cashbook.edit');
    if (req.body?.entry_type !== existing.entry_type) {
      return res.status(400).json({ success: false, message: 'Kaydın türü (gelir/gider/transfer) değiştirilemez; silip yeniden girin.' });
    }

    // Mevcut (artık pasif olabilen) kategorisinde kalan kayıt düzeltilebilsin
    const v = await validateEntry(req.body || {}, {
      single: true,
      allowInactive: new Set([existing.category_id, existing.subcategory_id].filter(Boolean))
    });
    if (v.error) return res.status(400).json({ success: false, message: v.error });

    const line = v.lines[0];
    const fields = {
      ...v.common,
      subcategory_id: line.subcategory_id,
      amount: line.amount,
      vat_amount: line.vat_amount,
      net_amount: line.net_amount
    };
    const cols = Object.keys(fields);
    await pool.query(
      `UPDATE cash_book_entries SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_by_user_id = ?, updated_at = NOW() WHERE id = ?`,
      [...Object.values(fields), user.id, existing.id]
    );
    const changed = cols.filter(c => String(existing[c] ?? '') !== String(fields[c] ?? ''));
    const updated = await loadActiveEntry(existing.id);
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'cash_book',
      entityId: existing.id,
      actionType: 'cashbook_entry_updated',
      title: `Kasa Defteri Kaydı Düzenlendi: ${pathOf(updated)} (${money(fields.amount)})`,
      details: `${user.name} tarafından düzenlendi. Değişen alanlar: ${changed.join(', ') || 'yok'}. Önceki: ${pathOf(existing)} ${money(existing.amount)}`,
      oldValue: Object.fromEntries(changed.map(c => [c, existing[c]])),
      newValue: Object.fromEntries(changed.map(c => [c, fields[c]])),
      amount: fields.amount
    });
    emit(req);
    res.json({ success: true, message: 'Kayıt güncellendi.', entry: updated });
  } catch (error) {
    console.error('Kasa defteri güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Kayıt güncellenemedi: ' + error.message });
  }
};

/** DELETE /api/cashbook/:id — Body: { reason } (zorunlu). Kayıt arşivlenir, defterden düşer. */
export const deleteEntry = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const existing = await loadActiveEntry(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Kayıt bulunamadı.' });
    if (existing.source !== 'manual') return res.status(400).json({ success: false, message: AUTO_ENTRY_MESSAGE });
    if (!can(req.user, 'cashbook.delete') && !ownSameDay(req.user, existing)) return deny(res, 'cashbook.delete');
    const reason = clean(req.body?.reason, 255);
    if (!reason || reason.length < 3) return res.status(400).json({ success: false, message: 'Silme gerekçesi yazın (en az 3 karakter).' });

    await pool.query(
      'UPDATE cash_book_entries SET deleted_at = NOW(), deleted_by_user_id = ?, delete_reason = ? WHERE id = ?',
      [user.id, reason, existing.id]
    );
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'cash_book',
      entityId: existing.id,
      actionType: 'cashbook_entry_deleted',
      title: `Kasa Defteri Kaydı Silindi: ${pathOf(existing)} (${money(existing.amount)})`,
      details: `${user.name} tarafından silindi. Gerekçe: ${reason}. Kayıt: ${existing.entry_date}${existing.description ? ` · ${existing.description}` : ''}`,
      oldValue: existing,
      amount: existing.amount
    });
    emit(req);
    res.json({ success: true, message: 'Kayıt silindi ve arşivlendi.' });
  } catch (error) {
    console.error('Kasa defteri silme hatası:', error);
    res.status(500).json({ success: false, message: 'Kayıt silinemedi: ' + error.message });
  }
};

const nameTaken = async (entryType, parentId, name, excludeId = 0) => {
  const [dup] = await pool.query(
    'SELECT id FROM cash_book_categories WHERE entry_type = ? AND parent_id <=> ? AND name = ? AND id <> ?',
    [entryType, parentId, name, excludeId]
  );
  return dup.length > 0;
};

/** POST /api/cashbook/categories — Body: { entry_type, name, parent_id? } (parent_id verilirse alt kategori) */
export const createCategory = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const name = clean(req.body?.name, 100);
    let entryType = req.body?.entry_type;
    let parentId = null;
    let parentName = null;
    if (req.body?.parent_id) {
      const [rows] = await pool.query('SELECT id, entry_type, parent_id, name, system_key FROM cash_book_categories WHERE id = ?', [Number(req.body.parent_id) || 0]);
      const parent = rows[0];
      if (!parent) return res.status(404).json({ success: false, message: 'Ana kategori bulunamadı.' });
      if (parent.parent_id) return res.status(400).json({ success: false, message: 'Alt kategorinin altına kategori eklenemez (en fazla iki seviye).' });
      if (parent.system_key) return res.status(400).json({ success: false, message: `"${parent.name}" gün sonu cirosu için ayrılmıştır; altına kategori eklenemez.` });
      parentId = parent.id;
      parentName = parent.name;
      entryType = parent.entry_type;
    }
    if (!ENTRY_TYPES[entryType]) return res.status(400).json({ success: false, message: 'Kategori türünü seçin.' });
    if (!name || name.length < 2) return res.status(400).json({ success: false, message: 'Kategori adı en az 2 karakter olmalıdır.' });
    if (await nameTaken(entryType, parentId, name)) {
      return res.status(409).json({ success: false, message: parentId ? `"${parentName}" altında bu adda bir alt kategori zaten var.` : 'Bu adda bir ana kategori zaten var.' });
    }
    const [[{ next }]] = await pool.query(
      'SELECT COALESCE(MAX(order_num), 0) + 1 AS next FROM cash_book_categories WHERE entry_type = ? AND parent_id <=> ?', [entryType, parentId]
    );
    const [result] = await pool.query(
      'INSERT INTO cash_book_categories (entry_type, parent_id, name, order_num) VALUES (?, ?, ?, ?)', [entryType, parentId, name, next]
    );
    const label = parentId ? `${parentName} › ${name}` : name;
    await logActivity({
      userId: user.id, userName: user.name, entityType: 'cash_book_category', entityId: result.insertId,
      actionType: 'cashbook_category_created', title: `Kasa Defteri Kategorisi Eklendi: ${label}`,
      details: `${user.name} tarafından ${ENTRY_TYPES[entryType].toLocaleLowerCase('tr-TR')} ${parentId ? 'alt' : 'ana'} kategorisi eklendi.`
    });
    emit(req);
    res.status(201).json({ success: true, message: `"${label}" eklendi.`, id: result.insertId, ...(await optionsPayload()) });
  } catch (error) {
    console.error('Kasa defteri kategori hatası:', error);
    res.status(500).json({ success: false, message: 'Kategori eklenemedi: ' + error.message });
  }
};

/** PUT /api/cashbook/categories/:id — Body: { name?, is_active? } (kullanılmış kategori silinmez, pasife alınır) */
export const updateCategory = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const [rows] = await pool.query('SELECT * FROM cash_book_categories WHERE id = ?', [Number(req.params.id) || 0]);
    const cat = rows[0];
    if (!cat) return res.status(404).json({ success: false, message: 'Kategori bulunamadı.' });
    const name = req.body?.name !== undefined ? clean(req.body.name, 100) : cat.name;
    if (!name || name.length < 2) return res.status(400).json({ success: false, message: 'Kategori adı en az 2 karakter olmalıdır.' });
    const isActive = req.body?.is_active !== undefined ? Boolean(req.body.is_active) : Boolean(cat.is_active);
    if (cat.system_key && !isActive) {
      return res.status(400).json({ success: false, message: 'Gün sonu cirosu kategorisi pasife alınamaz (yalnızca yeniden adlandırılabilir).' });
    }
    if (await nameTaken(cat.entry_type, cat.parent_id, name, cat.id)) return res.status(409).json({ success: false, message: 'Bu adda bir kategori zaten var.' });
    await pool.query('UPDATE cash_book_categories SET name = ?, is_active = ? WHERE id = ?', [name, isActive ? 1 : 0, cat.id]);
    await logActivity({
      userId: user.id, userName: user.name, entityType: 'cash_book_category', entityId: cat.id,
      actionType: 'cashbook_category_updated', title: `Kasa Defteri Kategorisi Güncellendi: ${name}`,
      details: `${user.name} tarafından güncellendi${cat.name !== name ? ` (eski ad: ${cat.name})` : ''}; durum: ${isActive ? 'aktif' : 'pasif'}.`
    });
    emit(req);
    res.json({ success: true, message: 'Kategori güncellendi.', ...(await optionsPayload()) });
  } catch (error) {
    console.error('Kasa defteri kategori güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Kategori güncellenemedi: ' + error.message });
  }
};

/** GET /api/cashbook/export — liste ile aynı filtreler; Excel (Kasa Defteri + Kategori Özeti + KDV Özeti) */
export const exportCashBook = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const data = await buildLedger(req.query);
    const { summary, entries, range } = data;
    const periodText = range.startDate || range.endDate
      ? `${range.startDate ? range.startDate.split('-').reverse().join('.') : 'Başlangıç'} – ${range.endDate ? range.endDate.split('-').reverse().join('.') : 'Bugün'}`
      : 'Tüm kayıtlar';
    let categoryFilter = null;
    if (Number(req.query.category_id) > 0) {
      const [[c]] = await pool.query('SELECT name FROM cash_book_categories WHERE id = ?', [Number(req.query.category_id)]);
      categoryFilter = c?.name;
    }
    const filterText = [
      ENTRY_TYPES[req.query.entry_type],
      categoryFilter && `Kategori: ${categoryFilter}`,
      PAYMENT_METHODS[req.query.payment_method],
      DOCUMENT_TYPES[req.query.document_type],
      String(req.query.search || '').trim() && `Arama: "${String(req.query.search).trim()}"`,
      data.include_pos ? 'POS tahsilatları dahil' : 'POS tahsilatları hariç'
    ].filter(Boolean).join(' · ');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Özgensoy Kafeterya';
    wb.created = new Date();
    const MONEY = '#,##0.00 "₺";[Red]-#,##0.00 "₺"';
    const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173845' } };
    const softFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF5F7' } };
    const styleHeader = (row) => {
      row.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = headFill; c.alignment = { vertical: 'middle', wrapText: true }; });
      row.height = 22;
    };
    const titleBlock = (ws, title, span) => {
      ws.mergeCells(1, 1, 1, span);
      ws.getCell(1, 1).value = title;
      ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF173845' } };
      ws.mergeCells(2, 1, 2, span);
      ws.getCell(2, 1).value = `Dönem: ${periodText}   ·   ${filterText}`;
      ws.mergeCells(3, 1, 3, span);
      ws.getCell(3, 1).value = `Hazırlayan: ${user.name}   ·   ${new Date().toLocaleString('tr-TR')}`;
      ws.getCell(3, 1).font = { italic: true, color: { argb: 'FF6B8590' } };
    };

    // 1. Kasa Defteri
    const ws = wb.addWorksheet('Kasa Defteri', { views: [{ state: 'frozen', ySplit: 5 }] });
    const cols = [
      ['Tarih', 12], ['Tür', 8], ['Ana Kategori', 24], ['Alt Kategori', 22], ['Açıklama', 40], ['Belge Türü', 18], ['Belge No', 16],
      ['Cari / Firma', 24], ['VKN / TCKN', 14], ['Ödeme', 18], ['KDV %', 8], ['KDV Tutarı', 13], ['Matrah (KDV Hariç)', 16],
      ['Gelir (Giren)', 15], ['Gider (Çıkan)', 15], ['Bakiye', 16], ['Kaydeden', 18]
    ];
    ws.columns = cols.map(([, width]) => ({ width }));
    titleBlock(ws, 'KASA DEFTERİ', cols.length);
    ws.getRow(5).values = cols.map(([h]) => h);
    styleHeader(ws.getRow(5));

    const devir = ws.addRow([range.startDate ? range.startDate.split('-').reverse().join('.') : '', '', 'DEVREDEN BAKİYE', '', '', '', '', '', '', '', '', '', '', '', '', summary.opening, '']);
    devir.font = { bold: true };
    devir.eachCell(c => { c.fill = softFill; });
    entries.forEach(e => {
      const isPos = e.source !== 'manual';
      ws.addRow([
        e.entry_date.split('-').reverse().join('.'),
        ENTRY_TYPES[e.entry_type],
        e.category_name,
        e.subcategory_name || '',
        // Transfer gelir/gider sütunlarına yazılmaz; tutarı açıklamada görünür
        e.entry_type === 'transfer' ? `${money(e.amount)} aktarıldı${e.description ? ` — ${e.description}` : ''}` : (e.description || ''),
        isPos || e.document_type === 'none' ? '' : DOCUMENT_TYPES[e.document_type],
        e.document_no || '',
        e.counterparty || '',
        e.tax_number || '',
        e.entry_type === 'transfer' ? `${PAYMENT_METHODS[e.payment_method]} → ${PAYMENT_METHODS[e.transfer_to]}` : PAYMENT_METHODS[e.payment_method],
        isPos || !e.vat_rate ? '' : e.vat_rate,
        isPos || !e.vat_rate ? '' : e.vat_amount,
        isPos || !e.vat_rate ? '' : e.net_amount,
        e.entry_type === 'income' ? e.amount : '',
        e.entry_type === 'expense' ? e.amount : '',
        e.balance,
        e.created_by_name || ''
      ]);
    });
    const total = ws.addRow(['', '', 'DÖNEM TOPLAMI', '', '', '', '', '', '', '', '', '', '', summary.total_income, summary.total_expense, summary.closing, '']);
    total.font = { bold: true };
    total.eachCell(c => { c.fill = softFill; });
    ['L', 'M', 'N', 'O', 'P'].forEach(col => { ws.getColumn(col).numFmt = MONEY; });
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: cols.length } };

    // 2. Kategori Özeti (ana kategori satırları kalın, alt kategoriler girintili)
    const wc = wb.addWorksheet('Kategori Özeti');
    wc.columns = [{ width: 10 }, { width: 30 }, { width: 28 }, { width: 10 }, { width: 18 }, { width: 10 }];
    titleBlock(wc, 'KATEGORİ ÖZETİ', 6);
    wc.getRow(5).values = ['Tür', 'Ana Kategori', 'Alt Kategori', 'Kayıt', 'Tutar', 'Pay %'];
    styleHeader(wc.getRow(5));
    const addTree = (list, label, totalAmount) => list.forEach(m => {
      const row = wc.addRow([label, m.name, '', m.count, m.total, totalAmount ? m.total / totalAmount : 0]);
      row.font = { bold: true };
      row.eachCell(c => { c.fill = softFill; });
      m.children.forEach(s => wc.addRow(['', '', s.name, s.count, s.total, totalAmount ? s.total / totalAmount : 0]));
    });
    addTree(summary.income_categories, 'Gelir', summary.total_income);
    addTree(summary.expense_categories, 'Gider', summary.total_expense);
    const wcTotal = wc.addRow(['', 'NET (Gelir − Gider)', '', '', summary.net, '']);
    wcTotal.font = { bold: true };
    wc.getColumn('E').numFmt = MONEY;
    wc.getColumn('F').numFmt = '0.0%';

    // 3. KDV Özeti
    const wv = wb.addWorksheet('KDV Özeti');
    wv.columns = [{ width: 10 }, { width: 20 }, { width: 18 }, { width: 20 }, { width: 18 }];
    titleBlock(wv, 'KDV ÖZETİ (KDV GİRİLEN KAYITLAR)', 5);
    wv.getRow(5).values = ['KDV %', 'Satış Matrahı', 'Hesaplanan KDV', 'Alış/Gider Matrahı', 'İndirilecek KDV'];
    styleHeader(wv.getRow(5));
    summary.vat.by_rate.forEach(r => wv.addRow([r.rate, r.income_base, r.income_vat, r.expense_base, r.expense_vat]));
    const vTotal = wv.addRow(['Toplam', '', summary.vat.output_vat, '', summary.vat.input_vat]);
    vTotal.font = { bold: true };
    const vPay = wv.addRow(['', summary.vat.payable >= 0 ? 'Ödenecek KDV (tahmini)' : 'Devreden KDV (tahmini)', Math.abs(summary.vat.payable), '', '']);
    vPay.font = { bold: true };
    wv.addRow([]);
    wv.addRow(['Not: POS satışlarının KDV’si bu özete dahil değildir; Z raporları üzerinden mali müşavirce hesaplanır.']);
    ['B', 'C', 'D', 'E'].forEach(col => { wv.getColumn(col).numFmt = MONEY; });

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `Kasa_Defteri_${range.startDate || 'tum'}_${range.endDate || todayStr()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Kasa defteri Excel hatası:', error);
    res.status(500).json({ success: false, message: 'Excel dosyası oluşturulamadı: ' + error.message });
  }
};

// ───────────────────────────────────────────────────────────────
// Gün sonu ciro kayıtları
// ───────────────────────────────────────────────────────────────

/** GET /api/cashbook/closings/:date — o günün kaydedilmiş ayrıntılı ciro raporu */
export const getClosing = async (req, res) => {
  try {
    const date = req.params.date;
    if (!validDate(date)) return res.status(400).json({ success: false, message: 'Geçerli bir tarih girin.' });
    const [rows] = await pool.query(
      `SELECT c.id, DATE_FORMAT(c.business_date, '%Y-%m-%d') AS business_date, c.cash_amount, c.card_amount, c.net_sales,
              c.order_count, c.details, c.trigger_type, c.created_at, c.updated_at, u.name AS updated_by_name
       FROM cash_book_daily_closings c LEFT JOIN users u ON u.id = c.updated_by_user_id
       WHERE c.business_date = ?`,
      [date]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Bu gün için gün sonu kaydı yok.' });
    const c = rows[0];
    res.json({
      success: true,
      closing: {
        id: c.id,
        business_date: c.business_date,
        cash_amount: Number(c.cash_amount),
        card_amount: Number(c.card_amount),
        net_sales: Number(c.net_sales),
        order_count: c.order_count,
        trigger_type: c.trigger_type,
        created_at: c.created_at,
        updated_at: c.updated_at,
        updated_by_name: c.updated_by_name || null,
        details: JSON.parse(c.details)
      }
    });
  } catch (error) {
    console.error('Gün sonu raporu hatası:', error);
    res.status(500).json({ success: false, message: 'Gün sonu raporu alınamadı: ' + error.message });
  }
};

/** POST /api/cashbook/closings/run — kapanmamış geçmiş günleri şimdi kapatır (zamanlayıcıyı beklemeden) */
export const runPendingClosings = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const closed = await closePendingDays({ userId: user.id, userName: user.name, trigger: 'manual' });
    if (closed.length) emit(req);
    res.json({
      success: true,
      closed,
      message: closed.length ? `${closed.length} günün cirosu kasa defterine işlendi.` : 'Kapanmamış geçmiş gün yok; tüm günler kayıtlı.'
    });
  } catch (error) {
    console.error('Gün sonu çalıştırma hatası:', error);
    res.status(500).json({ success: false, message: 'Gün sonu işlenemedi: ' + error.message });
  }
};

/** POST /api/cashbook/closings/:date/recalculate — kapanmış (geçmiş) günün cirosunu güncel verilerle yeniden hesaplar */
export const recalculateClosing = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const date = req.params.date;
    if (!validDate(date)) return res.status(400).json({ success: false, message: 'Geçerli bir tarih girin.' });
    if (date >= todayStr()) return res.status(400).json({ success: false, message: 'Bugünün cirosu gün bitince (gece 00:00’dan sonra) kaydedilir.' });
    const result = await closeDay(date, { userId: user.id, userName: user.name, trigger: 'manual' });
    if (!result) return res.status(404).json({ success: false, message: 'Bu günde satış veya tahsilat yok.' });
    emit(req);
    res.json({ success: true, result, message: `${date.split('-').reverse().join('.')} cirosu yeniden hesaplandı: ${money(result.total)}.` });
  } catch (error) {
    console.error('Gün sonu yeniden hesaplama hatası:', error);
    res.status(500).json({ success: false, message: 'Yeniden hesaplanamadı: ' + error.message });
  }
};
