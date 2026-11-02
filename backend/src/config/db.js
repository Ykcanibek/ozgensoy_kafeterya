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
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.end();
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
