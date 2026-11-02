import { pool } from './db.js';

/*
 * İşletme ayarları (app_settings tablosu, anahtar-değer).
 * Bilinen ayarlar ve varsayılanları burada tanımlıdır; tabloda kayıt yoksa varsayılan kullanılır.
 */
const DEFAULTS = {
  qr_ordering_enabled: '1' // QR menüden sipariş alma açık mı
};

export const getSetting = async (key) => {
  const [rows] = await pool.query('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
  return rows[0]?.setting_value ?? DEFAULTS[key] ?? null;
};

export const setSetting = async (key, value, userId = null) => {
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by_user_id) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by_user_id = VALUES(updated_by_user_id)`,
    [key, String(value), userId]
  );
};

export const isQrOrderingEnabled = async () => (await getSetting('qr_ordering_enabled')) === '1';
