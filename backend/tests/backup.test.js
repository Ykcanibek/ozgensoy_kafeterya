import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import mysql from 'mysql2/promise';
import { startTestServer } from './helpers.js';

let ctx;
let call;
const download = async (url) => {
  const res = await fetch(`http://localhost:${ctx.port}/api${url}`, { headers: { Authorization: `Bearer ${ctx.token}` } });
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
};

before(async () => {
  ctx = await startTestServer();
  ({ call } = ctx);
});

after(async () => {
  await ctx?.stop();
});

test('yedek geri yüklenince tüm tablolar ve zor karakterler birebir geri gelir', async () => {
  const tricky = `Çay'ın \\ "özel" ; -- 🍵 ${Date.now()}`;
  const table = (await call('GET', '/tables')).tables[0];
  const [[product]] = await ctx.db.query('SELECT id FROM products LIMIT 1');
  await ctx.db.query('UPDATE products SET name = ?, price = 123.45 WHERE id = ?', [tricky, product.id]);
  const saved = await call('POST', `/orders/table/${table.id}`, { items: [{ product_id: product.id, quantity: 2 }] });
  assert.equal(saved.success, true, saved.message);

  const made = await call('POST', '/backups');
  assert.equal(made.status, 200, made.message);
  const list = await call('GET', '/backups');
  assert.equal(list.backups[0].name, made.backup.name);

  const file = await download(`/backups/${made.backup.name}/download`);
  assert.equal(file.status, 200);
  const sql = zlib.gunzipSync(file.body).toString('utf8');

  const scratch = `${ctx.dbName}_geri`;
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true
  });
  try {
    await conn.query(`CREATE DATABASE \`${scratch}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${scratch}\``);
    await conn.query(sql);

    await ctx.db.query("SET time_zone = '+03:00'");
    await conn.query("SET time_zone = '+03:00'");
    const [tables] = await ctx.db.query({ sql: 'SHOW TABLES', rowsAsArray: true });
    assert.ok(tables.length > 10);
    for (const [name] of tables) {
      const options = { sql: `SELECT * FROM \`${name}\``, dateStrings: true, rowsAsArray: true };
      const [original] = await ctx.db.query(options);
      const [restored] = await conn.query(options);
      // "Yedek alındı/indirildi" denetim kayıtları yedekten sonra yazıldığı için kıyas dışında kalır
      const expected = name === 'audit_logs' ? original.filter(r => !r.includes('backup_created') && !r.includes('backup_downloaded')) : original;
      assert.deepEqual(restored, expected, `${name} tablosu farklı`);
    }
    const [[back]] = await conn.query('SELECT name, price FROM products WHERE id = ?', [product.id]);
    assert.equal(back.name, tricky);
    assert.equal(Number(back.price), 123.45);
  } finally {
    await conn.query(`DROP DATABASE IF EXISTS \`${scratch}\``);
    await conn.end();
  }
});

test('yedek adresi yalnızca yedek dosyalarını verir ve yetki ister', async () => {
  assert.equal((await download('/backups/..%2F.env/download')).status, 404);
  assert.equal((await download('/backups/yedek_1.sql.gz/download')).status, 404);
  fs.writeFileSync(path.join(ctx.backupDir, 'gizli.txt'), 'x');
  assert.equal((await download('/backups/gizli.txt/download')).status, 404);

  assert.equal((await fetch(`http://localhost:${ctx.port}/api/backups`)).status, 401);

  const roles = (await call('GET', '/roles')).roles;
  const waiter = roles.find(r => r.slug === 'waiter');
  const staff = await call('POST', '/staff', { name: 'Yedek Test', username: 'yedektest', password: 'deneme123', role_id: waiter.id });
  assert.equal(staff.success, true, staff.message);
  const login = await call('POST', '/auth/login', { username: 'yedektest', password: 'deneme123' }, null);
  assert.equal((await call('GET', '/backups', undefined, login.token)).status, 403);
});

test('görsel yedeği geçerli bir tar arşividir', async () => {
  const res = await download('/backups/uploads/download');
  assert.equal(res.status, 200);
  const tar = zlib.gunzipSync(res.body);
  assert.equal(tar.length % 512, 0);
  assert.equal(tar.subarray(tar.length - 1024).every(b => b === 0), true);
  if (tar.length > 1024) {
    const header = tar.subarray(0, 512);
    assert.ok(header.toString('utf8', 0, 100).startsWith('uploads/'));
    assert.equal(header.toString('utf8', 257, 262), 'ustar');
    const stored = parseInt(header.toString('utf8', 148, 154), 8);
    const copy = Buffer.from(header);
    copy.fill(32, 148, 156);
    assert.equal(copy.reduce((s, b) => s + b, 0), stored);
  }
});
