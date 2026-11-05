import path from 'path';
import fs from 'fs';
import { logActivity, getUserFromReq } from '../config/auditLogger.js';
import {
  BACKUP_DIR, BACKUP_KEEP, isBackupName, listBackups, createBackup, uploadsArchiveStream
} from '../services/backup.js';

const logBackup = (req, actionType, title, details) => {
  const user = getUserFromReq(req);
  return logActivity({ userId: user.id, userName: user.name, entityType: 'system', actionType, title, details: `${user.name}: ${details}` });
};

export const getBackups = (req, res) => {
  try {
    res.json({ success: true, backups: listBackups(), keep: BACKUP_KEEP });
  } catch (error) {
    console.error('Yedek listesi hatası:', error);
    res.status(500).json({ success: false, message: 'Yedekler listelenemedi: ' + error.message });
  }
};

export const runBackup = async (req, res) => {
  try {
    const backup = await createBackup();
    if (!backup) return res.status(409).json({ success: false, message: 'Şu anda başka bir yedek alınıyor. Lütfen biraz sonra tekrar deneyin.' });
    await logBackup(req, 'backup_created', 'Yedek Alındı', `${backup.name} elle alındı.`);
    res.json({ success: true, message: 'Yedek alındı.', backup });
  } catch (error) {
    console.error('Yedek alma hatası:', error);
    res.status(500).json({ success: false, message: 'Yedek alınamadı: ' + error.message });
  }
};

export const downloadBackup = async (req, res) => {
  const { name } = req.params;
  // Adres parametresi doğrudan dosya yolu olur: yalnızca yedek adı biçimindeki dosyalar verilir
  if (!isBackupName(name) || !fs.existsSync(path.join(BACKUP_DIR, name))) {
    return res.status(404).json({ success: false, message: 'Yedek bulunamadı.' });
  }
  await logBackup(req, 'backup_downloaded', 'Yedek İndirildi', `${name} indirildi.`);
  res.download(path.join(BACKUP_DIR, name), name);
};

export const downloadUploads = async (req, res) => {
  await logBackup(req, 'backup_downloaded', 'Görsel Yedeği İndirildi', 'Ürün ve kategori görselleri indirildi.');
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', 'attachment; filename="gorseller.tar.gz"');
  const archive = uploadsArchiveStream();
  archive.on('error', (error) => {
    console.error('Görsel yedeği hatası:', error);
    res.destroy(error);
  });
  archive.pipe(res);
};
