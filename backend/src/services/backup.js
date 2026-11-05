import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { DB_TIMEZONE } from '../config/timezone.js';
import { uploadsDir } from '../config/upload.js';

/*
 * Otomatik yedek: her gün veritabanının tamamı sıkıştırılmış .sql dosyası olarak backend/backups/ klasörüne yazılır.
 * mysqldump gerektirmez (paylaşımlı hostingde bulunmayabilir). Klasör internete açık değildir; dosyalar yalnızca
 * yetkili kullanıcıya Yedekler ekranından indirilir. Geri yükleme: phpMyAdmin → İçe Aktar (.sql.gz doğrudan seçilebilir).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(__dirname, '../../backups');
export const BACKUP_KEEP = Math.max(1, parseInt(process.env.BACKUP_KEEP, 10) || 30);

const NAME_RE = /^yedek_(\d{8})-\d{6}\.sql\.gz$/;
const INSERT_BATCH = 200;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 30 * 1000;

const pad = (n) => String(n).padStart(2, '0');
const dayStamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const timeStamp = (d) => `${dayStamp(d)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export const isBackupName = (name) => NAME_RE.test(String(name));

export const listBackups = () => {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(isBackupName)
    .sort()
    .reverse()
    .map((name) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: stat.size, created_at: stat.mtime.toISOString() };
    });
};

const hasBackupForToday = () => {
  const prefix = `yedek_${dayStamp(new Date())}-`;
  return listBackups().some(b => b.name.startsWith(prefix));
};

// JSON sütunları metin olarak kalsın (nesneye çevrilirse SQL'e yanlış yazılır)
const rawJson = (field, next) => (field.type === 'JSON' ? field.string() : next());

async function* dumpStatements(conn) {
  yield `-- Özgensoy Kafeterya veritabanı yedeği (${new Date().toISOString()})\n`;
  yield `SET NAMES utf8mb4;\nSET time_zone = ${conn.escape(DB_TIMEZONE)};\nSET FOREIGN_KEY_CHECKS = 0;\nSET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n`;

  const [tables] = await conn.query({ sql: "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'", rowsAsArray: true });
  for (const [table] of tables) {
    const id = conn.escapeId(table);
    const [[created]] = await conn.query(`SHOW CREATE TABLE ${id}`);
    yield `DROP TABLE IF EXISTS ${id};\n${created['Create Table']};\n`;

    let batch = [];
    const rows = conn.connection.query({ sql: `SELECT * FROM ${id}`, rowsAsArray: true, dateStrings: true, typeCast: rawJson }).stream();
    for await (const row of rows) {
      batch.push(`(${row.map(v => conn.escape(v)).join(',')})`);
      if (batch.length >= INSERT_BATCH) {
        yield `INSERT INTO ${id} VALUES\n${batch.join(',\n')};\n`;
        batch = [];
      }
    }
    if (batch.length) yield `INSERT INTO ${id} VALUES\n${batch.join(',\n')};\n`;
    yield '\n';
  }
  yield 'SET FOREIGN_KEY_CHECKS = 1;\n';
}

/**
 * Yedek alır. Aynı anda ikinci bir yedek alınmaz (iki alan adı ayrı süreçte çalışır; kilit veritabanındadır).
 * @param {{ onlyIfMissing?: boolean }} options onlyIfMissing: bugünün yedeği varsa hiçbir şey yapma
 * @returns {Promise<{name: string, size: number, created_at: string} | null>} başka bir yedek sürüyorsa veya gerek yoksa null
 */
export const createBackup = async ({ onlyIfMissing = false } = {}) => {
  const conn = await pool.getConnection();
  const lockName = `backup_${process.env.DB_NAME || 'kafe_otomasyon'}`.slice(0, 64);
  let locked = false;
  const name = `yedek_${timeStamp(new Date())}.sql.gz`;
  const target = path.join(BACKUP_DIR, name);
  const partial = `${target}.part`;
  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 0) AS ok', [lockName]);
    locked = Number(lock.ok) === 1;
    if (!locked || (onlyIfMissing && hasBackupForToday())) return null;

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    // Tablolar kilitlenmeden, tek ana ait tutarlı görüntü
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    await pipeline(Readable.from(dumpStatements(conn)), zlib.createGzip(), fs.createWriteStream(partial));
    await conn.query('COMMIT');
    fs.renameSync(partial, target); // Yarım kalan dosya hiçbir zaman yedek gibi görünmesin

    listBackups().slice(BACKUP_KEEP).forEach(b => fs.rmSync(path.join(BACKUP_DIR, b.name)));
    const stat = fs.statSync(target);
    return { name, size: stat.size, created_at: stat.mtime.toISOString() };
  } catch (error) {
    fs.rmSync(partial, { force: true });
    await conn.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    conn.release();
  }
};

const walkFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walkFiles(full) : [full];
});

const tarHeader = (name, size, mtime) => {
  const h = Buffer.alloc(512);
  const octal = (value, length) => value.toString(8).padStart(length - 1, '0') + '\0';
  h.write(name, 0);
  h.write(octal(0o644, 8), 100);
  h.write(octal(0, 8), 108);
  h.write(octal(0, 8), 116);
  h.write(octal(size, 12), 124);
  h.write(octal(Math.floor(mtime / 1000), 12), 136);
  h.write('        ', 148); // Sağlama toplamı hesaplanırken boşluk sayılır
  h.write('0', 156);
  h.write('ustar\u000000', 257);
  const sum = h.reduce((total, byte) => total + byte, 0);
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return h;
};

async function* tarEntries(files) {
  for (const file of files) {
    const data = await fs.promises.readFile(file);
    const name = `uploads/${path.relative(uploadsDir, file).split(path.sep).join('/')}`;
    yield tarHeader(name, data.length, fs.statSync(file).mtimeMs);
    yield data;
    const padding = (512 - (data.length % 512)) % 512;
    if (padding) yield Buffer.alloc(padding);
  }
  yield Buffer.alloc(1024);
}

/** Ürün ve kategori görsellerinin .tar.gz akışı (görseller her gün değişmediği için yalnızca istenince hazırlanır) */
export const uploadsArchiveStream = () => Readable.from(tarEntries(walkFiles(uploadsDir))).pipe(zlib.createGzip());

/** Günde bir yedek: uygulama gece uyuyorsa ilk açıldığında alınır. */
export const startBackupScheduler = () => {
  const tick = async () => {
    try {
      const backup = await createBackup({ onlyIfMissing: true });
      if (backup) console.log(`[Yedek] Alındı: ${backup.name} (${Math.round(backup.size / 1024)} KB)`);
    } catch (error) {
      console.error('[Yedek] Alınamadı:', error.message);
    }
  };
  setTimeout(tick, FIRST_CHECK_DELAY_MS).unref();
  setInterval(tick, CHECK_INTERVAL_MS).unref();
};
