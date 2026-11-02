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
