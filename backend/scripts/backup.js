/*
 * Veritabanı yedeği: backend/.env ayarlarıyla mysqldump çalıştırır ve backend/backups/ klasörüne
 * tarihli bir .sql dosyası yazar. En yeni BACKUP_KEEP (varsayılan 30) yedek tutulur, eskileri silinir.
 *
 * Kullanım:  npm --prefix backend run backup
 * Geri yükleme: mysql -u root -p kafe_otomasyon < backups/<dosya>.sql
 *
 * mysqldump PATH'te değilse .env içine MYSQLDUMP_PATH yazın
 * (ör. MYSQLDUMP_PATH=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe).
 * Her gün otomatik almak için Windows Görev Zamanlayıcı'ya / cron'a bu komutu ekleyin.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_NAME = process.env.DB_NAME || 'kafe_otomasyon';
const KEEP = Math.max(1, parseInt(process.env.BACKUP_KEEP, 10) || 30);
const BACKUP_DIR = path.resolve(__dirname, '../backups');

const findMysqldump = () => {
  if (process.env.MYSQLDUMP_PATH) return process.env.MYSQLDUMP_PATH;
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\MySQL';
    try {
      for (const dir of fs.readdirSync(base).filter(d => d.startsWith('MySQL Server')).sort().reverse()) {
        const exe = path.join(base, dir, 'bin', 'mysqldump.exe');
        if (fs.existsSync(exe)) return exe;
      }
    } catch { /* MySQL varsayılan konumda değil */ }
  }
  return 'mysqldump';
};

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const file = path.join(BACKUP_DIR, `${DB_NAME}_${stamp()}.sql`);
const out = fs.createWriteStream(file);

const args = [
  `--host=${process.env.DB_HOST || 'localhost'}`,
  `--user=${process.env.DB_USER || 'root'}`,
  '--single-transaction', // tablolar kilitlenmeden tutarlı yedek (InnoDB)
  '--routines',
  '--default-character-set=utf8mb4',
  DB_NAME
];
// Şifre komut satırında görünmesin diye ortam değişkeniyle verilir
const child = spawn(findMysqldump(), args, { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' } });

let stderr = '';
child.stdout.pipe(out);
child.stderr.on('data', (d) => { stderr += d; });
child.on('error', (err) => {
  fs.rmSync(file, { force: true });
  console.error(`mysqldump çalıştırılamadı (${err.message}). .env içine MYSQLDUMP_PATH ekleyin.`);
  process.exit(1);
});
child.on('close', (code) => {
  out.end(() => {
    if (code !== 0) {
      fs.rmSync(file, { force: true });
      console.error(`Yedek alınamadı (çıkış kodu ${code}):\n${stderr.trim()}`);
      process.exit(1);
    }
    const sizeKb = Math.round(fs.statSync(file).size / 1024);
    console.log(`Yedek alındı: ${file} (${sizeKb} KB)`);

    const old = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith(`${DB_NAME}_`) && f.endsWith('.sql'))
      .sort()
      .slice(0, -KEEP);
    old.forEach(f => fs.rmSync(path.join(BACKUP_DIR, f)));
    if (old.length) console.log(`${old.length} eski yedek silindi (en yeni ${KEEP} yedek tutuluyor).`);
  });
});
