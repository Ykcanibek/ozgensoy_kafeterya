import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { io } from '../../frontend/node_modules/socket.io-client/build/esm-debug/index.js';
import { startTestServer } from './helpers.js';

let ctx;
let call;

const socketRejected = (token) => new Promise((resolve, reject) => {
  const socket = io(`http://localhost:${ctx.port}`, { auth: { token }, transports: ['websocket'], reconnection: false });
  socket.on('connect', () => { socket.disconnect(); resolve(false); });
  socket.on('connect_error', (error) => { socket.disconnect(); error.message === 'UNAUTHENTICATED' ? resolve(true) : reject(error); });
});

before(async () => {
  ctx = await startTestServer();
  ({ call } = ctx);
});

after(async () => {
  await ctx?.stop();
});

const newStaff = async (username, password) => {
  const roles = (await call('GET', '/roles')).roles;
  const staff = await call('POST', '/staff', { name: username, username, password, role_id: roles.find(r => r.slug === 'waiter').id });
  assert.equal(staff.success, true, staff.message);
  const login = await call('POST', '/auth/login', { username, password }, null);
  assert.equal(login.success, true, login.message);
  return { id: staff.staff?.id ?? staff.user?.id ?? login.user.id, token: login.token };
};

test('kullanıcı şifresini değiştirince diğer oturumlar kapanır, kendi cihazı devam eder', async () => {
  const { token: oldToken } = await newStaff('oturum1', 'deneme123');
  assert.equal((await call('GET', '/auth/me', undefined, oldToken)).status, 200);
  assert.equal(await socketRejected(oldToken), false);

  const changed = await call('PUT', '/auth/password', { current_password: 'deneme123', new_password: 'yenisifre456' }, oldToken);
  assert.equal(changed.success, true, changed.message);

  assert.equal((await call('GET', '/auth/me', undefined, oldToken)).status, 401, 'eski oturum geçersiz');
  assert.equal(await socketRejected(oldToken), true, 'eski oturum canlı bağlantı da açamaz');
  const me = await call('GET', '/auth/me', undefined, changed.token);
  assert.equal(me.status, 200, 'bu cihaz yeni oturumla devam eder');
  assert.equal((await call('GET', '/auth/me', undefined, me.token)).status, 200, 'yenilenen oturum da geçerli');
});

test('yönetici şifre sıfırlayınca personelin açık oturumu kapanır', async () => {
  const { id, token } = await newStaff('oturum2', 'deneme123');
  const reset = await call('PUT', `/staff/${id}/password`, { password: 'sifirlanan789' });
  assert.equal(reset.success, true, reset.message);
  assert.equal((await call('GET', '/auth/me', undefined, token)).status, 401);
  assert.equal((await call('POST', '/auth/login', { username: 'oturum2', password: 'sifirlanan789' }, null)).success, true);
});

test('eski biçimdeki oturum (sürüm bilgisi yok) şifre değişmediyse geçerli kalır', async () => {
  const { id } = jwt.decode(ctx.token);
  const legacy = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  assert.equal((await call('GET', '/auth/me', undefined, legacy)).status, 200, 'güncelleme sonrası kimse oturumdan düşmez');
});

test('güvenlik başlıkları gönderilir, sunucu teknolojisi söylenmez', async () => {
  const res = await fetch(`http://localhost:${ctx.port}/api/health`);
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(!csp.includes('googleapis'));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('tahsilat indeksleri kurulu', async () => {
  const [rows] = await ctx.db.query('SHOW INDEX FROM payments');
  const names = rows.map(r => r.Key_name);
  assert.ok(names.includes('idx_payments_order'));
  assert.ok(names.includes('idx_payments_created'));
});
