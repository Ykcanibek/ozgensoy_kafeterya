import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Uploads ana dizini
const uploadsDir = path.resolve(__dirname, '../../uploads');

// Hedef klasörleri otomatik oluştur
export function ensureUploadsDir(subfolder = '') {
  const targetDir = path.join(uploadsDir, subfolder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

// Multer memory storage (Dosyayı RAM'de tutup Sharp ile doğrudan optimize edip diske basacağız)
const storage = multer.memoryStorage();

// Sadece görsel dosyalarına izin ver
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|gif|svg/;
  const isMime = allowedTypes.test(file.mimetype);
  const isExt = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (isMime && isExt) {
    return cb(null, true);
  }
  cb(new Error('Sadece resim dosyaları (.jpg, .jpeg, .png, .webp) yüklenebilir!'));
};

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Maksimum 10MB kabul et (Sharp ile sıkıştırılacak)
  fileFilter
});

/**
 * Görseli WebP formatına dönüştürüp, küçülterek yüksek performansla kaydeder
 * @param {Buffer} buffer - Multer dosya buffer'ı
 * @param {string} subfolder - 'categories' veya 'products'
 * @param {number} width - Maksimum genişlik (varsayılan 500px)
 * @param {number} height - Maksimum yükseklik (varsayılan 500px)
 * @returns {Promise<string>} - '/uploads/categories/img-123.webp' biçiminde relative URL
 */
export async function optimizeAndSaveImage(buffer, subfolder = 'categories', width = 500, height = 500) {
  const targetDir = ensureUploadsDir(subfolder);
  const filename = `${subfolder}-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const filepath = path.join(targetDir, filename);

  await sharp(buffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'center'
    })
    .webp({ quality: 82, effort: 4 })
    .toFile(filepath);

  return `/uploads/${subfolder}/${filename}`;
}
