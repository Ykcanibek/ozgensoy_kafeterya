/*
 * Kasa Defteri entegrasyon testleri (geçici test veritabanında; bkz. helpers.js).
 * Çalıştırma:  npm --prefix backend test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

let ctx;
let call;
let categories;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = ymd(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const round = (n) => Math.round(n * 100) / 100;

/** Ana kategori id'si (parent yok) ya da "Ana > Alt" için alt kategori id'si */
const cat = (type, path) => {
  const [mainName, subName] = path.split(' > ');
  const main = categories.find(c => c.entry_type === type && !c.parent_id && c.name === mainName);
  if (!subName) return main.id;
  return categories.find(c => c.parent_id === main.id && c.name === subName).id;
};
const reloadCategories = async () => { categories = (await call('GET', '/cashbook/options')).categories; };

before(async () => {
  ctx = await startTestServer();
  ({ call } = ctx);
  await reloadCategories();
});

after(async () => {
  await ctx?.stop();
});

const expense = (overrides = {}) => ({
  entry_type: 'expense', entry_date: today, amount: 250, category_id: cat('expense', 'Temizlik & Hijyen'),
  payment_method: 'cash', description: 'Temizlik malzemesi', ...overrides
});

test('varsayılan kategoriler dallanmalı kurulur', async () => {
  const faturalar = categories.find(c => c.name === 'Faturalar' && !c.parent_id);
  const subs = categories.filter(c => c.parent_id === faturalar.id).map(c => c.name);
  assert.ok(['Elektrik', 'Su', 'Doğalgaz'].every(n => subs.includes(n)));
});

test('ana kategori alt kategorilere bölünerek tek seferde girilir', async () => {
  const res = await call('POST', '/cashbook', {
    entry_type: 'expense', entry_date: today, category_id: cat('expense', 'Faturalar'), payment_method: 'bank',
    description: 'Ekim faturaları',
    lines: [
      { subcategory_id: cat('expense', 'Faturalar > Elektrik'), amount: 1840.5 },
      { subcategory_id: cat('expense', 'Faturalar > Su'), amount: 420, description: 'Sayaç 2' },
      { subcategory_id: cat('expense', 'Faturalar > Doğalgaz'), amount: 960 }
    ]
  });
  assert.equal(res.status, 201, res.message);
  assert.equal(res.entries.length, 3);
  assert.ok(res.entries.every(e => e.batch_id && e.batch_id === res.entries[0].batch_id));
  assert.equal(res.entries[1].description, 'Sayaç 2');
  assert.equal(res.entries[0].description, 'Ekim faturaları');

  const book = await call('GET', `/cashbook?startDate=${today}&endDate=${today}&include_pos=0`);
  const fat = book.summary.expense_categories.find(c => c.name === 'Faturalar');
  assert.equal(fat.total, 3220.5);
  assert.deepEqual(fat.children.map(c => c.name).sort(), ['Doğalgaz', 'Elektrik', 'Su']);
});

test('alt kategori seçmeden doğrudan ana kategoriye girilir', async () => {
  const res = await call('POST', '/cashbook', {
    entry_type: 'expense', entry_date: today, category_id: cat('expense', 'Personel Giderleri'), amount: 5000,
    payment_method: 'cash', description: 'Genel personel gideri'
  });
  assert.equal(res.status, 201, res.message);
  assert.equal(res.entry.subcategory_id, null);
  assert.equal(res.entry.batch_id, null);
});

test('ana kategori filtresi alt kategorileri de kapsar, alt kategori filtresi yalnız onu getirir', async () => {
  const all = await call('GET', `/cashbook?startDate=${today}&endDate=${today}&category_id=${cat('expense', 'Faturalar')}`);
  assert.equal(all.entries.length, 3);
  const only = await call('GET', `/cashbook?startDate=${today}&endDate=${today}&category_id=${cat('expense', 'Faturalar > Su')}`);
  assert.equal(only.entries.length, 1);
  assert.equal(only.entries[0].subcategory_name, 'Su');
});

test('hatalı kayıtlar reddedilir', async () => {
  // Başka ana kategorinin alt kategorisi
  const wrongSub = await call('POST', '/cashbook', expense({
    category_id: cat('expense', 'Faturalar'), amount: undefined,
    lines: [{ subcategory_id: cat('expense', 'Personel Giderleri > Maaş'), amount: 100 }]
  }));
  assert.equal(wrongSub.status, 400);
  // Alt kategori, ana kategori yerine verilirse
  const subAsMain = await call('POST', '/cashbook', expense({ category_id: cat('expense', 'Faturalar > Su') }));
  assert.equal(subAsMain.status, 400);

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal((await call('POST', '/cashbook', expense({ entry_date: ymd(tomorrow) }))).status, 400);
  assert.equal((await call('POST', '/cashbook', expense({ category_id: cat('income', 'Kira Gelirleri') }))).status, 400);
  assert.equal((await call('POST', '/cashbook', expense({ amount: -5 }))).status, 400);
  const badLine = await call('POST', '/cashbook', expense({
    category_id: cat('expense', 'Faturalar'), lines: [{ subcategory_id: cat('expense', 'Faturalar > Su'), amount: 0 }]
  }));
  assert.equal(badLine.status, 400);
});

test('KDV girilirse ayrıştırılır ve KDV özetine yansır', async () => {
  const res = await call('POST', '/cashbook', {
    entry_type: 'income', entry_date: today, category_id: cat('income', 'Etkinlik & Atölye'), payment_method: 'bank',
    lines: [{ subcategory_id: cat('income', 'Etkinlik & Atölye > Atölye Katılım Ücreti'), amount: 1200 }],
    vat_rate: 20, document_type: 'e_archive', document_no: 'EAR1', counterparty: 'Kültür Derneği'
  });
  assert.equal(res.status, 201, res.message);
  assert.equal(res.entry.vat_amount, 200);
  assert.equal(res.entry.net_amount, 1000);
  const book = await call('GET', `/cashbook?startDate=${today}&endDate=${today}&include_pos=0`);
  assert.equal(book.summary.vat.output_vat, 200);
  assert.equal(book.entries.at(-1).balance, book.summary.closing);
});

test('dönem öncesi kayıtlar devreden bakiyeye girer', async () => {
  const old = await call('POST', '/cashbook', {
    entry_type: 'income', entry_date: daysAgo(40), amount: 5000, category_id: cat('income', 'Sermaye & Devir'),
    subcategory_id: cat('income', 'Sermaye & Devir > Kasa Açılış Bakiyesi'), payment_method: 'cash'
  });
  assert.equal(old.status, 201, old.message);
  const book = await call('GET', `/cashbook?startDate=${daysAgo(10)}&endDate=${today}&include_pos=0`);
  assert.equal(book.summary.opening, 5000);
  assert.equal(book.summary.closing, round(5000 + book.summary.net));
});

test('bugünün POS tahsilatları canlı olarak görünür', async () => {
  const table = (await call('GET', '/tables')).tables[0];
  const product = (await call('GET', '/products')).products.find(p => Number(p.status) === 1);
  await call('POST', `/orders/table/${table.id}`, { items: [{ product_id: product.id, quantity: 2 }] });
  const pay = await call('POST', `/orders/table/${table.id}/pay`, { payment_method: 'cash', amount_paid: Number(product.price) * 2 });
  assert.ok(pay.success, pay.message);

  const withPos = await call('GET', `/cashbook?startDate=${today}&endDate=${today}`);
  const posRow = withPos.entries.find(e => e.source === 'pos_live' && e.payment_method === 'cash');
  assert.ok(posRow, 'POS nakit satırı olmalı');
  assert.equal(posRow.amount, Number(product.price) * 2);
  const withoutPos = await call('GET', `/cashbook?startDate=${today}&endDate=${today}&include_pos=0`);
  assert.ok(!withoutPos.entries.some(e => e.source !== 'manual'));
});

test('düzenleme alt kategoriyi ve tutarı değiştirir; silme gerekçe ister', async () => {
  const created = (await call('POST', '/cashbook', {
    entry_type: 'expense', entry_date: today, category_id: cat('expense', 'Hammadde & Malzeme'), payment_method: 'company_card',
    lines: [{ subcategory_id: cat('expense', 'Hammadde & Malzeme > Kahve & Çay'), amount: 110 }], vat_rate: 10
  })).entry;
  assert.equal(created.vat_amount, 10);

  const updated = await call('PUT', `/cashbook/${created.id}`, {
    ...created, amount: 220, subcategory_id: cat('expense', 'Hammadde & Malzeme > Süt & Süt Ürünleri')
  });
  assert.equal(updated.status, 200, updated.message);
  assert.equal(updated.entry.subcategory_name, 'Süt & Süt Ürünleri');
  assert.equal(updated.entry.vat_amount, 20);

  assert.equal((await call('DELETE', `/cashbook/${created.id}`, {})).status, 400);
  assert.equal((await call('DELETE', `/cashbook/${created.id}`, { reason: 'Mükerrer kayıt' })).status, 200);
  const [[row]] = await ctx.db.query('SELECT delete_reason FROM cash_book_entries WHERE id = ?', [created.id]);
  assert.equal(row.delete_reason, 'Mükerrer kayıt');
});

test('kasa personeli başkasının kaydını düzenleyemez, kendi günlük kaydını düzeltebilir', async () => {
  const adminEntry = (await call('POST', '/cashbook', expense({ description: 'Yönetici kaydı' }))).entry;
  const cashier = (await call('GET', '/roles')).roles.find(r => r.slug === 'cashier');
  const staff = await call('POST', '/staff', { name: 'Test Kasiyer', username: 'testkasiyer', password: 'kasiyer123', role_id: cashier.id });
  assert.ok(staff.success, staff.message);
  const cashierToken = (await call('POST', '/auth/login', { username: 'testkasiyer', password: 'kasiyer123' }, null)).token;

  assert.equal((await call('PUT', `/cashbook/${adminEntry.id}`, { ...adminEntry, amount: 1 }, cashierToken)).status, 403);
  assert.equal((await call('DELETE', `/cashbook/${adminEntry.id}`, { reason: 'deneme' }, cashierToken)).status, 403);
  const own = (await call('POST', '/cashbook', expense({ description: 'Kasiyer kaydı' }), cashierToken)).entry;
  assert.equal((await call('PUT', `/cashbook/${own.id}`, { ...own, amount: 300 }, cashierToken)).status, 200);
  assert.equal((await call('GET', '/cashbook/export', null, cashierToken)).status, 403);
});

test('ana ve alt kategori eklenir; aynı ad aynı seviyede reddedilir; pasif alt kategoriye kayıt girilemez', async () => {
  const main = await call('POST', '/cashbook/categories', { entry_type: 'expense', name: 'Etkinlik Giderleri' });
  assert.equal(main.status, 201, main.message);
  const sub = await call('POST', '/cashbook/categories', { parent_id: main.id, name: 'Malzeme' });
  assert.equal(sub.status, 201, sub.message);
  // Aynı ad başka ana kategori altında serbest, aynı ana kategori altında yasak
  assert.equal((await call('POST', '/cashbook/categories', { parent_id: cat('expense', 'Faturalar'), name: 'Malzeme' })).status, 201);
  assert.equal((await call('POST', '/cashbook/categories', { parent_id: main.id, name: 'Malzeme' })).status, 409);
  // Üçüncü seviye yok
  assert.equal((await call('POST', '/cashbook/categories', { parent_id: sub.id, name: 'Boya' })).status, 400);

  await call('PUT', `/cashbook/categories/${sub.id}`, { is_active: false });
  const rejected = await call('POST', '/cashbook', expense({ category_id: main.id, lines: [{ subcategory_id: sub.id, amount: 50 }] }));
  assert.equal(rejected.status, 400);
});

test('Excel dışa aktarma dosya döner', async () => {
  const res = await call('GET', `/cashbook/export?startDate=${daysAgo(60)}&endDate=${today}`);
  assert.equal(res.status, 200);
  assert.match(res.contentType, /spreadsheetml/);
  assert.ok(res.size > 3000);
});

test('gün sonu: geçmiş günün cirosu ayrıntılı raporuyla kasa defterine işlenir, tekrar çalışınca çoğalmaz', async () => {
  // Bugün bir masa satışı yap, sonra zamanlarını dün'e çek (gece kapanışını taklit etmek için)
  const table = (await call('GET', '/tables')).tables[2];
  const product = (await call('GET', '/products')).products.find(p => Number(p.status) === 1);
  const price = Number(product.price);
  const order = await call('POST', `/orders/table/${table.id}`, { items: [{ product_id: product.id, quantity: 3 }] });
  const orderId = order.order.id;
  const pay1 = await call('POST', `/orders/table/${table.id}/pay`, { payment_method: 'credit_card', amount_paid: price, paid_items: [{ id: order.items[0].id, quantity: 1 }] });
  assert.ok(pay1.success, pay1.message);
  const pay2 = await call('POST', `/orders/table/${table.id}/pay`, { payment_method: 'cash', amount_paid: price * 2 + 10, tip: 10 });
  assert.ok(pay2.success && !pay2.isPartial, pay2.message);
  const yesterday = daysAgo(1);
  await ctx.db.query('UPDATE orders SET created_at = created_at - INTERVAL 1 DAY, closed_at = closed_at - INTERVAL 1 DAY WHERE id = ?', [orderId]);
  await ctx.db.query('UPDATE order_items SET created_at = created_at - INTERVAL 1 DAY WHERE order_id = ?', [orderId]);
  await ctx.db.query('UPDATE payments SET created_at = created_at - INTERVAL 1 DAY WHERE order_id = ?', [orderId]);

  const run = await call('POST', '/cashbook/closings/run');
  assert.ok(run.success, run.message);
  assert.ok(run.closed.some(c => c.date === yesterday), 'dün kapatılmalı');

  const book = await call('GET', `/cashbook?startDate=${yesterday}&endDate=${yesterday}`);
  const daily = book.entries.filter(e => e.source === 'pos_daily');
  assert.equal(daily.length, 2, 'nakit ve kart için iki satır');
  assert.equal(daily.find(e => e.payment_method === 'cash').amount, price * 2 + 10, 'bahşiş (₺10) işletmeye kalır, ciroya işlenir');
  assert.equal(daily.find(e => e.payment_method === 'card').amount, price);
  assert.ok(!book.entries.some(e => e.source === 'pos_live'), 'kapanan gün canlı olarak tekrar sayılmaz');
  assert.equal(daily[0].category_name, 'Günlük Ciro (POS)');

  const report = await call('GET', `/cashbook/closings/${yesterday}`);
  assert.equal(report.status, 200, report.message);
  assert.equal(report.closing.details.sales.order_count, 1);
  assert.equal(report.closing.details.sales.net, price * 3);
  assert.equal(report.closing.details.collections.tip, 10);
  assert.deepEqual(report.closing.details.tips, { cash: 10, card: 0, total: 10 });
  assert.equal(report.closing.cash_amount + report.closing.card_amount, report.closing.details.sales.net + 10, 'deftere işlenen ciro = net satış + bahşiş');
  assert.equal(report.closing.cash_amount + report.closing.card_amount, report.closing.details.collections.drawer_total, 'deftere işlenen = kasaya giren');
  assert.ok(report.closing.details.products.some(p => p.product_name === product.name && p.qty === 3));
  assert.equal(report.closing.trigger_type, 'manual');

  // Tüm raporlarda aynı rakam: net ciro = ürün satışı + bahşiş
  const ciro = price * 3 + 10;
  assert.equal(report.closing.details.sales.revenue, ciro);
  const summary = await call('GET', `/reports/sales-summary?startDate=${yesterday}&endDate=${yesterday}`);
  assert.equal(summary.sales.revenue, ciro);
  assert.equal(summary.sales.net, price * 3, 'ürün satışı ayrıca korunur');
  assert.equal(summary.sales.tip, 10);
  assert.equal(summary.sales.average_ticket, ciro);
  assert.equal(summary.trend.points.reduce((sum, p) => sum + p.net, 0), ciro, 'satış eğrisi');
  assert.equal(summary.distribution.hours.reduce((sum, h) => sum + h.net, 0), ciro, 'saat dağılımı');
  const closedOrders = await call('GET', `/reports/orders?startDate=${yesterday}&endDate=${yesterday}`);
  assert.equal(closedOrders.orders.reduce((sum, o) => sum + o.net, 0), ciro, 'adisyon listesi');
  const detail = await call('GET', `/reports/orders/${closedOrders.orders[0].id}`);
  assert.equal(detail.totals.revenue, ciro, 'adisyon detayı');
  const tableReport = await call('GET', `/reports/tables?startDate=${yesterday}&endDate=${yesterday}`);
  assert.equal(tableReport.totals.net, ciro, 'masa raporu');

  // Tekrar çalıştırma ve yeniden hesaplama satırları çoğaltmaz
  const again = await call('POST', '/cashbook/closings/run');
  assert.ok(!again.closed.some(c => c.date === yesterday));
  const recalc = await call('POST', `/cashbook/closings/${yesterday}/recalculate`);
  assert.equal(recalc.status, 200, recalc.message);
  const after = await call('GET', `/cashbook?startDate=${yesterday}&endDate=${yesterday}`);
  assert.equal(after.entries.filter(e => e.source === 'pos_daily').length, 2);

  // Otomatik satırlar elle düzenlenemez/silinemez; sistem kategorisine elle kayıt girilemez
  const auto = after.entries.find(e => e.source === 'pos_daily');
  assert.equal((await call('PUT', `/cashbook/${auto.id}`, { ...auto, amount: 1 })).status, 400);
  assert.equal((await call('DELETE', `/cashbook/${auto.id}`, { reason: 'deneme' })).status, 400);
  assert.equal((await call('POST', '/cashbook', expense({ entry_type: 'income', category_id: auto.category_id }))).status, 400);
  assert.equal((await call('POST', `/cashbook/closings/${today}/recalculate`)).status, 400);
});

test('sunucu yabancı saat diliminde çalışsa da işletme saatini (İstanbul) kullanır', async () => {
  const res = await fetch(`http://localhost:${ctx.port}/api/health`);
  const health = await res.json();
  assert.equal(health.timezone, 'Europe/Istanbul');
  const istanbulNow = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date()).replace(',', '');
  // Dakika sınırına denk gelirse 1 dakikalık farka izin ver
  const minutes = (s) => new Date(s.replace(' ', 'T') + ':00Z').getTime() / 60000;
  assert.ok(Math.abs(minutes(health.local_time) - minutes(istanbulNow)) <= 1, `uygulama saati ${health.local_time}, beklenen ${istanbulNow}`);
  assert.ok(Math.abs(minutes(health.db_time) - minutes(istanbulNow)) <= 1, `veritabanı saati ${health.db_time}, beklenen ${istanbulNow}`);
});

test('POS kart tahsilatı ile şirket kredi kartı ayrı hesaplardır', async () => {
  const cardExpense = await call('POST', '/cashbook', expense({ payment_method: 'card' }));
  assert.equal(cardExpense.status, 400, 'POS kart hesabından gider ödenemez');
  const companyIncome = await call('POST', '/cashbook', {
    entry_type: 'income', entry_date: today, amount: 100, category_id: cat('income', 'Diğer Gelirler'), payment_method: 'company_card'
  });
  assert.equal(companyIncome.status, 400, 'şirket kartına gelir girilmez');
  const ok = await call('POST', '/cashbook', expense({ payment_method: 'company_card', amount: 300 }));
  assert.equal(ok.status, 201, ok.message);
});

test('hesaplar arası transfer gelir/gider sayılmaz, yalnızca hesap bakiyelerini değiştirir', async () => {
  const before = await call('GET', `/cashbook?startDate=${today}&endDate=${today}&include_pos=0`);
  const res = await call('POST', '/cashbook', {
    entry_type: 'transfer', entry_date: today, payment_method: 'bank', transfer_to: 'company_card', amount: 500,
    description: 'Kredi kartı ekstresi ödendi'
  });
  assert.equal(res.status, 201, res.message);
  const after = await call('GET', `/cashbook?startDate=${today}&endDate=${today}&include_pos=0`);
  assert.equal(after.summary.total_income, before.summary.total_income);
  assert.equal(after.summary.total_expense, before.summary.total_expense);
  assert.equal(after.summary.closing, before.summary.closing, 'toplam bakiye değişmez');
  const acc = (book, m) => book.summary.by_method.find(x => x.method === m).closing;
  assert.equal(acc(after, 'bank'), round(acc(before, 'bank') - 500));
  assert.equal(acc(after, 'company_card'), round(acc(before, 'company_card') + 500));
  const row = after.entries.find(e => e.id === res.entry.id);
  assert.equal(row.balance, after.entries[after.entries.indexOf(row) - 1]?.balance ?? after.summary.opening);

  // Hesap filtresi transferin iki ucunu da gösterir; aynı hesaba transfer ve tür değişikliği reddedilir
  const bankOnly = await call('GET', `/cashbook?startDate=${today}&endDate=${today}&payment_method=company_card&include_pos=0`);
  assert.ok(bankOnly.entries.some(e => e.id === res.entry.id));
  assert.equal((await call('POST', '/cashbook', { entry_type: 'transfer', entry_date: today, payment_method: 'bank', transfer_to: 'bank', amount: 10 })).status, 400);
  assert.equal((await call('PUT', `/cashbook/${res.entry.id}`, { ...res.entry, entry_type: 'expense' })).status, 400);
  const edit = await call('PUT', `/cashbook/${res.entry.id}`, { ...res.entry, amount: 650 });
  assert.equal(edit.status, 200, edit.message);
  assert.equal(edit.entry.amount, 650);
});

test('bahşişi personele dağıtmak için Personel Giderleri › Bahşiş Ödemesi kategorisi hazır gelir', async () => {
  const { categories } = await call('GET', '/cashbook/options');
  const parent = categories.find(c => c.entry_type === 'expense' && !c.parent_id && c.name === 'Personel Giderleri');
  assert.ok(parent, 'Personel Giderleri ana kategorisi olmalı');
  const sub = categories.find(c => c.parent_id === parent.id && c.name === 'Bahşiş Ödemesi');
  assert.ok(sub, 'Bahşiş Ödemesi alt kategorisi olmalı');
  const res = await call('POST', '/cashbook', {
    entry_type: 'expense', entry_date: today, category_id: parent.id, subcategory_id: sub.id,
    amount: 10, payment_method: 'cash', description: 'Günün bahşişi personele dağıtıldı'
  });
  assert.ok(res.success, res.message);
});
