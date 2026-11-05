/*
 * Test altyapısı: her test dosyası kendi geçici veritabanında (DB_NAME + "_test_<zaman>") ayrı bir sunucu açar,
 * gerçek API üzerinden çalışır ve bitince veritabanını siler. Gerçek veriye dokunmaz.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const SERVER_PATH = path.resolve(__dirname, '../src/server.js');

export const waitForHealth = async (port) => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/api/health`)).ok) return true;
    } catch { /* henüz açılmadı */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};

export async function startTestServer() {
  const dbName = `${process.env.DB_NAME || 'kafe_otomasyon'}_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const port = 5600 + Math.floor(Math.random() * 300);
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kafe-yedek-'));
  const server = spawn(process.execPath, [SERVER_PATH], {
    // Sunucu bilerek başka saat diliminde başlatılır: uygulama kendi saat dilimini (İstanbul) sabitlemeli
    env: { ...process.env, DB_NAME: dbName, PORT: String(port), TZ: 'America/New_York', MENU_HOST: 'menu.test', BACKUP_DIR: backupDir },
    stdio: 'ignore'
  });
  if (!(await waitForHealth(port))) {
    server.kill();
    throw new Error('Test sunucusu açılmadı');
  }
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName
  });
  const api = `http://localhost:${port}/api`;
  let token = null;

  const call = async (method, url, body, auth = token) => {
    const res = await fetch(api + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const type = res.headers.get('content-type') || '';
    return type.includes('json') ? { status: res.status, ...(await res.json()) } : { status: res.status, contentType: type, size: (await res.arrayBuffer()).byteLength };
  };

  const login = await call('POST', '/auth/login', {
    username: process.env.DEV_ACCOUNT_USERNAME, password: process.env.DEV_ACCOUNT_PASSWORD
  }, null);
  if (!login.success) throw new Error('Geliştirici hesabıyla giriş yapılamadı');
  token = login.token;

  return {
    dbName,
    port,
    db,
    backupDir,
    call,
    get token() { return token; },
    useToken(next) { token = next; },
    async stop() {
      server.kill();
      await db.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      fs.rmSync(backupDir, { recursive: true, force: true });
      await db.end();
    }
  };
}
