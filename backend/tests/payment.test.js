/*
 * Sipariş & ödeme entegrasyon testleri.
 * Ayrı, geçici bir veritabanında (DB_NAME + "_test_<zaman>") sunucuyu açar, gerçek API üzerinden
 * senaryoları çalıştırır ve bitince test veritabanını siler. Gerçek veriye dokunmaz.
 *
 * Gereksinim: çalışan MySQL ve backend/.env (DB_* ve DEV_ACCOUNT_* bilgileri).
 * Çalıştırma:  npm --prefix backend test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { startTestServer, waitForHealth, SERVER_PATH } from './helpers.js';

let ctx;
let db;
let call;
let TEST_DB;
let PORT;
let product;
let tables;

const openTable = async (tableId, quantity = 1) =>
  (await call('POST', `/orders/table/${tableId}`, { items: [{ product_id: product.id, quantity }] })).items;

before(async () => {
  ctx = await startTestServer();
  ({ db, call, dbName: TEST_DB, port: PORT } = ctx);
  tables = (await call('GET', '/tables')).tables;
  const products = (await call('GET', '/products')).products;
  product = products.find(p => Number(p.status) === 1);
  product.price = Number(product.price);
});

after(async () => {
  await ctx?.stop();
});

test('hesap kapanınca ikram edilen kalem satışa dönüşmez', async () => {
  const t = tables[0];
  const [item] = await openTable(t.id, 3);
  await call('PUT', `/orders/items/${item.id}/status`, { status: 'delivered' });
  await call('PUT', `/orders/items/${item.id}/status`, { status: 'complimentary', quantity: 1 });
  const order = await call('GET', `/orders/table/${t.id}`);
  const pay = await call('POST', `/orders/table/${t.id}/pay`, {
    payment_method: 'cash',
    amount_paid: product.price * 2,
    paid_items: order.items.map(i => ({ id: i.id, quantity: i.quantity }))
  });
  assert.ok(pay.success && !pay.isPartial, pay.message);

  const [rows] = await db.query(
    'SELECT item_status, quantity, total_price FROM order_items WHERE order_id = ? ORDER BY item_status',
    [order.order.id]
  );
  assert.deepEqual(rows.map(r => [r.item_status, r.quantity]), [['complimentary', 1], ['delivered', 2]]);
});

test('kısmi ödenen aynı ürün tek satırda birleşir', async () => {
  const t = tables[1];
  const [item] = await openTable(t.id, 3);
  await call('PUT', `/orders/items/${item.id}/status`, { status: 'delivered' });
  let pay = await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'cash', amount_paid: product.price, paid_items: [{ id: item.id, quantity: 1 }] });
  assert.ok(pay.isPartial);
  pay = await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'cash', amount_paid: product.price * 2, paid_items: [{ id: item.id, quantity: 2 }] });
  assert.ok(pay.success && !pay.isPartial, pay.message);

  const [rows] = await db.query('SELECT quantity, created_by_user_id FROM order_items WHERE order_id = ?', [item.order_id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 3);
  assert.ok(rows[0].created_by_user_id, 'kalemi ekleyen personel bilgisi korunmalı');
});

test('kalan borçtan fazla tahsilat reddedilir, bahşiş ayrıca alınabilir', async () => {
  const t = tables[2];
  await openTable(t.id, 1);
  const over = await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'cash', amount_paid: product.price * 10 });
  assert.equal(over.status, 400);
  assert.equal(over.code, 'OVERPAYMENT');
  const withTip = await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'cash', amount_paid: product.price + 10, tip: 10 });
  assert.ok(withTip.success && !withTip.isPartial, withTip.message);
});

test('kalem bazlı ödemede negatif adet ve başka masanın kalemi reddedilir', async () => {
  const [mine] = await openTable(tables[3].id, 1);
  const [other] = await openTable(tables[4].id, 1);

  const negative = await call('POST', `/orders/table/${tables[3].id}/pay`, {
    payment_method: 'cash', amount_paid: product.price, paid_items: [{ id: mine.id, quantity: -5 }]
  });
  assert.equal(negative.status, 400);

  const foreign = await call('POST', `/orders/table/${tables[3].id}/pay`, {
    payment_method: 'cash', amount_paid: product.price, paid_items: [{ id: other.id, quantity: 1 }]
  });
  assert.equal(foreign.status, 400);
  const [[otherRow]] = await db.query('SELECT quantity, is_paid FROM order_items WHERE id = ?', [other.id]);
  assert.deepEqual([otherRow.quantity, otherRow.is_paid], [1, 0]);
});

test('"tümünü teslim et" aynı ürünün satırlarını birleştirir', async () => {
  const t = tables[6];
  const [first] = await openTable(t.id, 1);
  await call('PUT', `/orders/items/${first.id}/status`, { status: 'preparing' });
  await openTable(t.id, 1); // mutfakta hazırlanan satırla birleşmez, yeni satır açılır
  const res = await call('PUT', `/orders/kitchen/table/${t.id}/deliver-all`);
  assert.ok(res.success, res.message);
  const [rows] = await db.query("SELECT quantity, item_status FROM order_items WHERE order_id = ?", [first.order_id]);
  assert.deepEqual(rows.map(r => [r.item_status, r.quantity]), [['delivered', 2]]);
});

test('kullanıcı kendi şifresini değiştirebilir', async () => {
  const current = process.env.DEV_ACCOUNT_PASSWORD;
  const wrong = await call('PUT', '/auth/password', { current_password: 'yanlis-sifre', new_password: 'yeni-sifre-123' });
  assert.equal(wrong.status, 400);
  const ok = await call('PUT', '/auth/password', { current_password: current, new_password: 'yeni-sifre-123' });
  assert.ok(ok.success, ok.message);
  ctx.useToken(ok.token); // Eski oturum artık geçersiz; yanıttaki yeni oturumla devam edilir
  const relogin = await call('POST', '/auth/login', { username: process.env.DEV_ACCOUNT_USERNAME, password: 'yeni-sifre-123' }, null);
  assert.ok(relogin.success);
});

test('eski kurulumdaki CASCADE kuralı açılışta RESTRICT yapılır', async () => {
  const ruleOf = async () => {
    const [[row]] = await db.query(
      `SELECT r.CONSTRAINT_NAME AS name, r.DELETE_RULE AS rule FROM information_schema.REFERENTIAL_CONSTRAINTS r
       WHERE r.CONSTRAINT_SCHEMA = ? AND r.TABLE_NAME = 'order_items' AND r.REFERENCED_TABLE_NAME = 'products'`,
      [TEST_DB]
    );
    return row;
  };
  // Eski sürümün şemasını taklit et
  const { name } = await ruleOf();
  await db.query(`ALTER TABLE order_items DROP FOREIGN KEY \`${name}\``);
  await db.query(`ALTER TABLE order_items ADD CONSTRAINT \`${name}\` FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE`);
  assert.equal((await ruleOf()).rule, 'CASCADE');

  // Yeniden başlatma satış geçmişine dokunmamalı (ilk testteki ikram satırı ayrı kalmalı)
  const itemsSnapshot = async () => (await db.query(
    'SELECT order_id, product_id, item_status, quantity, is_paid FROM order_items ORDER BY id'
  ))[0];
  const before = await itemsSnapshot();
  // Pasife alınan kategori (kategori ekranı yalnızca status alanını 0 yapar) yeniden başlatmada aktifleşmemeli
  const [[passiveCat]] = await db.query('SELECT id FROM categories ORDER BY id LIMIT 1');
  await db.query('UPDATE categories SET status = 0 WHERE id = ?', [passiveCat.id]);
  assert.ok(before.some(r => r.item_status === 'complimentary'), 'karşılaştırma için ikram satırı olmalı');

  // Aynı veritabanıyla ikinci bir sunucu açılışı dönüşümü yapmalı
  const port = PORT + 1;
  const second = spawn(process.execPath, [SERVER_PATH], {
    env: { ...process.env, DB_NAME: TEST_DB, PORT: String(port) },
    stdio: 'ignore'
  });
  try {
    assert.ok(await waitForHealth(port), 'ikinci sunucu açılmadı (dönüşüm hatası olabilir)');
    assert.equal((await ruleOf()).rule, 'RESTRICT');
    assert.deepEqual(await itemsSnapshot(), before, 'sunucu açılışı sipariş kalemlerini değiştirmemeli');
    const [[catAfter]] = await db.query('SELECT status FROM categories WHERE id = ?', [passiveCat.id]);
    assert.equal(catAfter.status, 0, 'pasif kategori sunucu açılışında aktif olmamalı');
    await db.query('UPDATE categories SET status = 1 WHERE id = ?', [passiveCat.id]);
  } finally {
    second.kill();
  }
});

test('ürün veritabanından silinse bile satış geçmişi zincirleme silinmez', async () => {
  const [item] = await openTable(tables[5].id, 1);
  await assert.rejects(db.query('DELETE FROM products WHERE id = ?', [product.id]), /foreign key constraint/i);
  const [[row]] = await db.query('SELECT id FROM order_items WHERE id = ?', [item.id]);
  assert.ok(row);
});

test('mutfak: uzun hazırlanan ürün teslim edildikten sonra 1 saat "son teslim edilenler"de kalır', async () => {
  const [item] = await openTable(tables[7].id, 1);
  // Sipariş 2 saat önce girilmiş olsun (uzun hazırlık), şimdi teslim ediliyor
  await db.query('UPDATE order_items SET created_at = NOW() - INTERVAL 2 HOUR WHERE id = ?', [item.id]);
  const res = await call('PUT', `/orders/items/${item.id}/status`, { status: 'delivered' });
  assert.ok(res.success, res.message);
  const kitchen = await call('GET', '/orders/kitchen');
  const shown = kitchen.orders.flatMap(o => o.items).some(i => i.id === item.id && i.item_status === 'delivered');
  assert.ok(shown, 'teslim edilen ürün listede görünmeli');
});

// Geri alma testleri kendi masalarını açar (diğer testlerin masalarıyla karışmasın)
const newTable = async (title) => {
  const res = await call('POST', '/tables', { title, table_number: title.replace(/\s+/g, '-') });
  return res.table || res;
};

test('tahsilat geri alma: yanlış seçilen ürünler tekrar ödenmemiş olur, kalan borç ve kayıtlar düzelir', async () => {
  const t = await newTable('Geri Alma 1');
  const [item] = await openTable(t.id, 5);
  // Erken kalkan müşteri 2 adet öder (yanlışlıkla seçilmiş olsun)
  const pay = await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'cash', paid_items: [{ id: item.id, quantity: 2 }] });
  assert.ok(pay.success && pay.isPartial, pay.message);
  let order = await call('GET', `/orders/table/${t.id}`);
  assert.equal(order.payments.length, 1);
  const payment = order.payments[0];
  assert.equal(Number(payment.reversible), 1);
  assert.deepEqual(payment.items.map(i => i.quantity), [2], 'tahsilatın hangi ürünü ödediği bilinir');

  // Neden yazılmadan geri alınamaz
  const noReason = await call('POST', `/orders/payments/${payment.id}/reverse`, { reason: ' ' });
  assert.equal(noReason.success, false);

  const rev = await call('POST', `/orders/payments/${payment.id}/reverse`, { reason: 'Yanlış ürünler seçildi' });
  assert.ok(rev.success, rev.message);
  assert.equal(rev.reopened_items, 1);
  assert.equal(rev.remaining, product.price * 5);

  order = await call('GET', `/orders/table/${t.id}`);
  assert.equal(order.payments.length, 0, 'tahsilat masadan kalkar');
  assert.ok(order.items.every(i => !i.is_paid), 'tüm ürünler tekrar ödenmemiş');
  assert.equal(order.items.reduce((s, i) => s + i.quantity, 0), 5);
  assert.equal(order.items.length, 1, 'ödemede bölünen satır eski hâline (tek satır) döner');
  assert.equal(Number(order.order.total_price), product.price * 5);

  const [[left]] = await db.query('SELECT COUNT(*) AS n FROM payments WHERE id = ?', [payment.id]);
  assert.equal(left.n, 0, 'raporlar ve gün sonu tahsilatı görmez');
  const [[arch]] = await db.query('SELECT reason, total_amount, items_json FROM payment_reversals WHERE payment_id = ?', [payment.id]);
  assert.equal(arch.reason, 'Yanlış ürünler seçildi');
  assert.equal(Number(arch.total_amount), product.price * 2);
  assert.equal(JSON.parse(arch.items_json)[0].qty, 2);
  const [[log]] = await db.query("SELECT title FROM audit_logs WHERE action_type = 'payment_reversed' AND entity_id = ?", [payment.id]);
  assert.match(log.title, /Tahsilat Geri Alındı/);

  // Aynı tahsilat ikinci kez geri alınamaz; doğru ürünlerle tekrar ödenip hesap kapanabilir
  assert.equal((await call('POST', `/orders/payments/${payment.id}/reverse`, { reason: 'tekrar' })).success, false);
  const close = await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'credit_card' });
  assert.ok(close.success && !close.isPartial, close.message);
});

test('tahsilat geri alma: birleşik ödenmiş satırdan yalnızca o tahsilatın adedi açılır; kapanan hesap, geçmiş gün ve eski kayıt geri alınamaz', async () => {
  const t = await newTable('Geri Alma 2');
  const [item] = await openTable(t.id, 4);
  await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'cash', paid_items: [{ id: item.id, quantity: 1 }] });
  let order = await call('GET', `/orders/table/${t.id}`);
  const unpaid = order.items.find(i => !i.is_paid);
  await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'credit_card', paid_items: [{ id: unpaid.id, quantity: 2 }] });
  order = await call('GET', `/orders/table/${t.id}`);
  const paidRows = order.items.filter(i => i.is_paid);
  assert.equal(paidRows.length, 1, 'aynı ürünün ödenen kısımları tek satırda birleşik kalır');
  assert.equal(paidRows[0].quantity, 3);
  const [first, second] = order.payments;

  const rev = await call('POST', `/orders/payments/${second.id}/reverse`, { reason: 'Yanlış tutar girildi' });
  assert.ok(rev.success, rev.message);
  order = await call('GET', `/orders/table/${t.id}`);
  const paid = order.items.filter(i => i.is_paid);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].quantity, 1, 'ilk tahsilatın ürünü ödenmiş kalır');
  assert.equal(order.items.filter(i => !i.is_paid).reduce((s, i) => s + i.quantity, 0), 3);
  assert.equal(Number(order.order.total_price), product.price * 3);

  // Geçmiş günün tahsilatı geri alınamaz
  await db.query('UPDATE payments SET created_at = created_at - INTERVAL 1 DAY WHERE id = ?', [first.id]);
  const past = await call('POST', `/orders/payments/${first.id}/reverse`, { reason: 'Yanlış ürünler seçildi' });
  assert.equal(past.success, false);
  assert.match(past.message, /bugün/);
  await db.query('UPDATE payments SET created_at = created_at + INTERVAL 1 DAY WHERE id = ?', [first.id]);

  // Özellikten önce alınmış (ürünleri kayıtlı olmayan) tahsilat geri alınamaz
  await db.query('UPDATE payments SET items_tracked = NULL WHERE id = ?', [first.id]);
  const legacy = await call('POST', `/orders/payments/${first.id}/reverse`, { reason: 'Yanlış ürünler seçildi' });
  assert.equal(legacy.success, false);
  await db.query('UPDATE payments SET items_tracked = 1 WHERE id = ?', [first.id]);

  // Hesap kapandıktan sonra geri alınamaz
  const close = await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'cash' });
  assert.ok(close.success && !close.isPartial, close.message);
  const closed = await call('POST', `/orders/payments/${first.id}/reverse`, { reason: 'Yanlış ürünler seçildi' });
  assert.equal(closed.success, false);
  assert.match(closed.message, /kapanmış/);
});

test('tahsilat geri alma: veresiye kısmı müşterinin borcundan düşülür', async () => {
  const t = await newTable('Geri Alma 3');
  const [item] = await openTable(t.id, 3);
  const pay = await call('POST', `/orders/table/${t.id}/pay`, {
    payment_method: 'veresiye', customer_name: 'Geri Alma Testi', paid_items: [{ id: item.id, quantity: 1 }]
  });
  assert.ok(pay.success, pay.message);
  const [[cust]] = await db.query("SELECT id, current_balance FROM customers WHERE name = 'Geri Alma Testi'");
  assert.equal(Number(cust.current_balance), product.price);
  const order = await call('GET', `/orders/table/${t.id}`);
  const rev = await call('POST', `/orders/payments/${order.payments[0].id}/reverse`, { reason: 'Yanlış müşteriye yazıldı' });
  assert.ok(rev.success, rev.message);
  const [[after]] = await db.query('SELECT current_balance, total_debt FROM customers WHERE id = ?', [cust.id]);
  assert.equal(Number(after.current_balance), 0);
  assert.equal(Number(after.total_debt), 0);
  const [[tx]] = await db.query("SELECT COUNT(*) AS n FROM customer_transactions WHERE customer_id = ? AND transaction_type = 'debt'", [cust.id]);
  assert.equal(tx.n, 0, 'borç hareketi kalkar');
});

test('fiş: ara ödeme fişi yalnızca o ödemenin ürünlerini, hesap fişi tüm masayı ve tüm ödemeleri gösterir', async () => {
  const t = await newTable('Fis Testi');
  const [item] = await openTable(t.id, 3);
  const partial = await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'cash', paid_items: [{ id: item.id, quantity: 1 }] });
  assert.ok(partial.success && partial.isPartial, partial.message);
  assert.ok(partial.paymentId && partial.orderId, 'yanıt fiş için ödeme ve adisyon numarasını taşır');

  const part = await call('GET', `/orders/payments/${partial.paymentId}/receipt`);
  assert.ok(part.success, part.message);
  assert.equal(part.receipt.title, 'ARA ÖDEME FİŞİ');
  assert.deepEqual(part.items.map(i => [i.quantity, i.total_price]), [[1, product.price]]);
  assert.equal(part.receipt.total_amount, product.price);

  const close = await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'credit_card', tip: 5, amount_paid: product.price * 2 + 5 });
  assert.ok(close.success && !close.isPartial, close.message);
  const full = await call('GET', `/orders/${close.orderId}/receipt`);
  assert.ok(full.success, full.message);
  assert.deepEqual(full.items.map(i => i.quantity), [3], 'aynı ürün fişte tek satır');
  assert.equal(full.receipt.payment_count, 2);
  assert.equal(full.receipt.title, null, 'hesap fişinde ek başlık yok');
  assert.equal(full.receipt.payment_method, 'mixed');
  assert.equal(full.receipt.cash_amount, product.price);
  assert.equal(full.receipt.card_amount, product.price * 2 + 5);
  assert.equal(full.receipt.tip, 5);
  assert.equal(full.receipt.total_amount, product.price * 3 + 5);
});

test('otomatik fiş ayarı açılıp kapatılabilir (varsayılan açık)', async () => {
  assert.equal((await call('GET', '/orders/receipt-settings')).auto_receipt, true);
  const off = await call('PUT', '/orders/receipt-settings', { auto_receipt: false });
  assert.ok(off.success, off.message);
  assert.equal((await call('GET', '/orders/receipt-settings')).auto_receipt, false);
  assert.equal((await call('PUT', '/orders/receipt-settings', { auto_receipt: 'evet' })).success, false, 'geçersiz değer reddedilir');
  assert.equal((await call('PUT', '/orders/receipt-settings', { auto_receipt: true })).auto_receipt, true);
});

test('kapanan hesaplar listesi: bugün kapanan masa en üstte, fişi yeniden alınabilir', async () => {
  const t = await newTable('Unutulan Fis');
  await openTable(t.id, 2);
  const close = await call('POST', `/orders/table/${t.id}/pay`, { payment_method: 'cash' });
  assert.ok(close.success && !close.isPartial, close.message);
  const list = await call('GET', '/orders/closed-receipts');
  assert.ok(list.success, list.message);
  assert.equal(list.receipts[0].order_id, close.orderId, 'en son kapanan en üstte');
  assert.equal(list.receipts[0].table_title, 'Unutulan Fis');
  assert.equal(list.receipts[0].total_amount, product.price * 2);
  assert.deepEqual(list.receipts[0].methods, ['cash']);
  const receipt = await call('GET', `/orders/${list.receipts[0].order_id}/receipt`);
  assert.equal(receipt.items[0].quantity, 2);
  // Başka bir günün listesi ayrı gelir
  const old = await call('GET', '/orders/closed-receipts?date=2000-01-01');
  assert.equal(old.receipts.length, 0);
});
