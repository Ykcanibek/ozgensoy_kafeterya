/*
 * Elle veritabanı yedeği: backend/.env ayarlarıyla backend/backups/ klasörüne tarihli bir .sql.gz dosyası yazar.
 * En yeni BACKUP_KEEP (varsayılan 30) yedek tutulur. Sunucu çalışırken de günde bir yedek kendiliğinden alınır.
 *
 * Kullanım:  npm --prefix backend run backup
 * Geri yükleme: phpMyAdmin → İçe Aktar ya da  gunzip -c backups/<dosya>.sql.gz | mysql -u root -p kafe_otomasyon
 */
import { createBackup } from '../src/services/backup.js';
import { pool } from '../src/config/db.js';

try {
  const backup = await createBackup();
  console.log(backup ? `Yedek alındı: ${backup.name} (${Math.round(backup.size / 1024)} KB)` : 'Şu anda başka bir yedek alınıyor.');
} catch (error) {
  console.error(`Yedek alınamadı: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
