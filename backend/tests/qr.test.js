/*
 * QR menü (müşteri tarafı) uçtan uca testleri: masadaki QR → menü → sipariş isteği → personel onayı →
 * mutfak → müşterinin durumu görmesi → hesap kapanınca listenin sıfırlanması. Geçici test veritabanında çalışır.
 * Çalıştırma:  npm --prefix backend test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from '../../frontend/node_modules/socket.io-client/build/esm-debug/index.js';
import { startTestServer } from './helpers.js';

let ctx;
let call;
let tables;
const pub = async (method, path, body) => {
  const res = await fetch(`http://localhost:${ctx.port}/api/public${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, ...(await res.json()) };
};
const SESSION_A = 'telefonA_1234567890abcd';
const SESSION_B = 'telefonB_1234567890abcd';

before(async () => {
  ctx = await startTestServer();
  ({ call } = ctx);
  tables = (await call('GET', '/tables')).tables;
});

after(async () => {
  await ctx?.stop();
});

test('geçersiz ya da kaldırılmış masanın QR kodu açılmaz', async () => {
  assert.equal((await pub('GET', '/menu/olmayan-anahtar-1234567')).status, 404);
  assert.equal((await pub('GET', '/menu/kisa')).status, 404);
  const created = await call('POST', '/tables', { title: 'Geçici Masa', table_number: 'M-99' });
  const token = created.table?.qr_code_token || created.qr_code_token;
  assert.equal((await pub('GET', `/menu/${token}`)).status, 200);
  await call('DELETE', `/tables/${created.table?.id || created.id}`);
  assert.equal((await pub('GET', `/menu/${token}`)).status, 404, 'kaldırılan masanın QR kodu çalışmamalı');
});

test('müşteri menüyü görür, sipariş verir; personel onaylayınca mutfağa düşer ve müşteri durumu görür', async () => {
  const table = tables[0];
  const menu = await pub('GET', `/menu/${table.qr_code_token}`);
  assert.equal(menu.status, 200);
  assert.equal(menu.table.title, table.title);
  assert.ok(menu.ordering_enabled);
  assert.ok(menu.products.length > 0);
  const product = menu.products[0];

  // Müşterinin telefonu canlı kanala bağlanır
  const socket = io(`http://localhost:${ctx.port}/menu`, { auth: { token: table.qr_code_token }, transports: ['websocket'] });
  await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject); });
  let signals = 0;
  socket.on('menu:orders-changed', () => { signals += 1; });

  // İstemcinin gönderdiği fiyat dikkate alınmaz
  const order = await pub('POST', `/menu/${table.qr_code_token}/orders`, {
    session: SESSION_A, note: 'Hepsi birlikte gelsin',
    items: [{ product_id: product.id, quantity: 2, price: 1, note: 'Şekersiz' }]
  });
  assert.equal(order.status, 201, order.message);

  let mine = await pub('GET', `/menu/${table.qr_code_token}/orders?session=${SESSION_A}`);
  assert.equal(mine.orders[0].status, 'pending');
  assert.equal(mine.orders[0].mine, true);
  assert.equal(mine.orders[0].estimated_total, product.price * 2);
  // Aynı masadaki başka telefon da görür ama "benim" olarak değil
  const other = await pub('GET', `/menu/${table.qr_code_token}/orders?session=${SESSION_B}`);
  assert.equal(other.orders[0].mine, false);

  // Personel panelinde onay bekliyor
  const inbox = await call('GET', '/qr-orders');
  const request = inbox.requests.find(r => r.id === order.request_id);
  assert.ok(request, 'istek personel kutusuna düşmeli');
  const approve = await call('POST', `/qr-orders/${order.request_id}/approve`);
  assert.ok(approve.success, approve.message);

  // Masanın adisyonunda ve mutfakta
  const tableOrder = await call('GET', `/orders/table/${table.id}`);
  assert.equal(tableOrder.items[0].quantity, 2);
  assert.equal(Number(tableOrder.items[0].unit_price), product.price);
  assert.equal(tableOrder.items[0].note, 'Şekersiz');
  const kitchen = await call('GET', '/orders/kitchen');
  assert.ok(kitchen.orders.some(o => o.table_id === table.id));

  // Mutfak hazırladıkça müşteri ilerlemeyi görür
  await call('PUT', `/orders/items/${tableOrder.items[0].id}/status`, { status: 'ready' });
  mine = await pub('GET', `/menu/${table.qr_code_token}/orders?session=${SESSION_A}`);
  assert.equal(mine.orders[0].status, 'approved');
  assert.equal(mine.orders[0].progress[0].status, 'ready');
  await new Promise(r => setTimeout(r, 300));
  assert.ok(signals >= 2, 'müşteri ekranı onay ve durum değişikliğinde canlı sinyal almalı');
  socket.close();

  // Hesap kapanınca masanın QR sipariş listesi sıfırlanır (sonraki müşteri öncekilerin siparişini görmez)
  const pay = await call('POST', `/orders/table/${table.id}/pay`, { payment_method: 'cash', amount_paid: product.price * 2 });
  assert.ok(pay.success && !pay.isPartial, pay.message);
  const afterClose = await pub('GET', `/menu/${table.qr_code_token}/orders?session=${SESSION_B}`);
  assert.equal(afterClose.orders.length, 0);
});

test('reddedilen sipariş müşteriye nedeniyle görünür; sipariş alma kapalıyken sipariş gönderilemez', async () => {
  const table = tables[1];
  const product = (await pub('GET', `/menu/${table.qr_code_token}`)).products[0];
  const order = await pub('POST', `/menu/${table.qr_code_token}/orders`, { session: SESSION_A, items: [{ product_id: product.id, quantity: 1 }] });
  await call('POST', `/qr-orders/${order.request_id}/reject`, { reason: 'Ürün tükendi' });
  const mine = await pub('GET', `/menu/${table.qr_code_token}/orders?session=${SESSION_A}`);
  assert.equal(mine.orders[0].status, 'rejected');
  assert.equal(mine.orders[0].reject_reason, 'Ürün tükendi');

  await call('PUT', '/qr-orders/settings', { ordering_enabled: false });
  const menu = await pub('GET', `/menu/${table.qr_code_token}`);
  assert.equal(menu.ordering_enabled, false, 'menü yine açılır, sipariş kapalı görünür');
  const blocked = await pub('POST', `/menu/${table.qr_code_token}/orders`, { session: SESSION_A, items: [{ product_id: product.id, quantity: 1 }] });
  assert.equal(blocked.status, 403);
  await call('PUT', '/qr-orders/settings', { ordering_enabled: true });
});

test('kötüye kullanım sınırları: geçersiz adet, satışta olmayan ürün, çok sayıda bekleyen istek', async () => {
  const table = tables[2];
  const product = (await pub('GET', `/menu/${table.qr_code_token}`)).products[0];
  assert.equal((await pub('POST', `/menu/${table.qr_code_token}/orders`, { session: SESSION_A, items: [{ product_id: product.id, quantity: 500 }] })).status, 400);
  assert.equal((await pub('POST', `/menu/${table.qr_code_token}/orders`, { session: SESSION_A, items: [{ product_id: 999999, quantity: 1 }] })).status, 400);
  assert.equal((await pub('POST', `/menu/${table.qr_code_token}/orders`, { session: 'kisa', items: [{ product_id: product.id, quantity: 1 }] })).status, 400);
  // Aynı telefondan en fazla 3 onay bekleyen istek
  for (let i = 0; i < 3; i++) {
    assert.equal((await pub('POST', `/menu/${table.qr_code_token}/orders`, { session: SESSION_B, items: [{ product_id: product.id, quantity: 1 }] })).status, 201);
  }
  assert.equal((await pub('POST', `/menu/${table.qr_code_token}/orders`, { session: SESSION_B, items: [{ product_id: product.id, quantity: 1 }] })).status, 429);
});

test('QR anahtarı sunucu yeniden başlasa da değişmez (masaya yapıştırılan kod geçerli kalır)', async () => {
  const before = (await call('GET', '/tables')).tables.map(t => t.qr_code_token);
  // Rastgele bir anahtar da tesadüfen "qr_" ile başlayabilir; yeniden başlatmada yenilenmemeli
  await ctx.db.query("UPDATE restaurant_tables SET qr_code_token = 'qr_GuvenliRastgeleAnahtar1' WHERE id = ?", [tables[3].id]);
  const { spawn } = await import('child_process');
  const { SERVER_PATH, waitForHealth } = await import('./helpers.js');
  const port = ctx.port + 2;
  const second = spawn(process.execPath, [SERVER_PATH], { env: { ...process.env, DB_NAME: ctx.dbName, PORT: String(port) }, stdio: 'ignore' });
  try {
    assert.ok(await waitForHealth(port));
    const [rows] = await ctx.db.query('SELECT id, qr_code_token FROM restaurant_tables ORDER BY id');
    assert.equal(rows.find(r => r.id === tables[3].id).qr_code_token, 'qr_GuvenliRastgeleAnahtar1');
    rows.filter(r => r.id !== tables[3].id && before.includes(r.qr_code_token)).forEach(r => assert.ok(r.qr_code_token));
  } finally {
    second.kill();
  }
});

test('menü alan adından yalnızca QR menü API\'si açılır; personel girişi ve API\'si kapalıdır', async () => {
  const http = await import('http');
  const get = (path, host, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ port: ctx.port, path, method, headers: { Host: host } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(await get('/api/tables', 'menu.test'), 404);
  assert.equal(await get('/api/auth/login', 'menu.test', 'POST'), 404);
  assert.equal(await get(`/api/public/menu/${tables[0].qr_code_token}`, 'menu.test'), 200);
  // Panel adresinde personel API'si oturum ister (404 değil)
  assert.equal(await get('/api/tables', `localhost:${ctx.port}`), 401);
});
