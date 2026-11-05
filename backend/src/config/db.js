import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DB_TIMEZONE } from './timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  // Tarihler JS ↔ MySQL arasında işletme saatine göre çevrilir
  timezone: DB_TIMEZONE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Veritabanı yoksa oluşturup sonra havuza bağlanan fonksiyon
export async function createDatabaseIfNotExists() {
  try {
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });
    const dbName = process.env.DB_NAME || 'kafe_otomasyon';
    try {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    } catch (error) {
      // Paylaşımlı hosting (Plesk vb.): kullanıcının veritabanı oluşturma yetkisi yoktur; veritabanı panelden açılmıştır.
      // Gerçekten yoksa havuz bağlantısı aşağıda açık bir hatayla durur.
      if (!['ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR'].includes(error.code)) throw error;
    }
    const [[exists]] = await connection.query('SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [dbName]);
    await connection.end();
    // Yetkisi olmadığı veritabanını MySQL kullanıcıdan gizler: "yok" ile "kullanıcı bağlı değil" burada ayırt edilemez
    if (!exists.n) throw new Error(`'${dbName}' veritabanı bulunamadı ya da '${dbConfig.user}' kullanıcısının bu veritabanında yetkisi yok. Barındırma panelinden veritabanını açın, kullanıcıyı veritabanına ekleyip tüm yetkileri (ALL PRIVILEGES) verin ve adını DB_NAME'e yazın.`);
    console.log(`[MySQL] Veritabanı '${dbName}' hazır.`);
  } catch (error) {
    console.error('[MySQL] Veritabanı oluşturma/bağlantı hatası:', error.message);
    throw error;
  }
}

// Veritabanına bağlı pool
export const pool = mysql.createPool({
  ...dbConfig,
  database: process.env.DB_NAME || 'kafe_otomasyon'
});

// Her bağlantının MySQL oturumu işletme saatinde çalışır: NOW(), CURDATE(), DATE(...) ve TIMESTAMP sütunları
// sunucu hangi saat dilimindeyse olsun İstanbul saatine göre hesaplanır (gün sonu sınırı doğru gece yarısıdır)
pool.pool.on('connection', (connection) => {
  connection.query('SET time_zone = ?', [DB_TIMEZONE]);
});

export default pool;
