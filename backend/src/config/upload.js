import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Uploads ana dizini
export const uploadsDir = path.resolve(__dirname, '../../uploads');

// Görsel işleme kütüphanesi (sharp) ilk kullanımda yüklenir: sunucuda yüklenemezse (ör. eski Linux) yalnızca görsel
// yükleme hata verir, sistemin geri kalanı çalışmaya devam eder.
let sharpModule;
const loadSharp = async () => {
  if (!sharpModule) {
    try {
      sharpModule = (await import('sharp')).default;
    } catch (error) {
      console.error('[Görsel] sharp yüklenemedi:', error.message);
      throw new Error('Görsel işleme bu sunucuda kullanılamıyor; yöneticinize bildirin.');
    }
    // Dosya önbelleği kapalı: açık kalan dosya tutamaçları Windows'ta görsellerin silinmesini (EBUSY) engelliyordu
    sharpModule.cache(false);
  }
  return sharpModule;
};

/**
 * Görsel boyutları (kare, 1:1). Ana görsel önizleme ve büyük gösterimler için,
 * küçük görsel (-sm) POS menü kartları, listeler ve sepet satırları için kullanılır.
 * Küçük görsel ~10–20 KB olduğundan menü ekranı onlarca ürünle bile hızlı açılır.
 */
export const IMAGE_SIZE = 640;
export const THUMB_SIZE = 320;
const THUMB_SUFFIX = '-sm';
const MIN_SOURCE_SIZE = 64; // Bundan küçük görseller kabul edilmez (bulanık görünür)
const MAX_INPUT_PIXELS = 40_000_000; // ~40 MP üstü (sıkıştırma bombası vb.) işlenmez

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
  cb(new Error('Sadece resim dosyaları (.jpg, .png, .webp, .gif, .svg) yüklenebilir!'));
};

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Maksimum 10MB kabul et (Sharp ile sıkıştırılacak)
  fileFilter
});

/** '/uploads/x/y.webp' -> '/uploads/x/y-sm.webp' */
export const thumbUrlOf = (imageUrl) => imageUrl.replace(/\.webp$/, `${THUMB_SUFFIX}.webp`);

const pipelineFor = (sharp, input) => sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
  .rotate(); // Telefon fotoğraflarının EXIF yönünü uygula (yan/ters görünmesin); meta veri (konum vb.) atılır

const writeSquare = (pipeline, size, quality, filepath) => pipeline
  .clone()
  .resize(size, size, { fit: 'cover', position: 'attention' }) // Kare kırpma; görselin en dikkat çeken bölgesini ortalar
  .webp({ quality, effort: 5, smartSubsample: true })
  .toFile(filepath);

/**
 * Görseli doğrular, kare kırpar ve iki boyutta WebP olarak kaydeder (ana + küçük).
 * @param {Buffer} buffer - Multer dosya buffer'ı
 * @param {string} subfolder - 'categories' veya 'products'
 * @returns {Promise<string>} - Ana görselin adresi ('/uploads/products/products-123.webp'); küçük görsel '-sm' ekiyle yanında durur
 */
export async function optimizeAndSaveImage(buffer, subfolder = 'categories') {
  // Dosya gerçekten okunabilir bir görsel mi? (uzantısı değiştirilmiş dosyalar burada elenir)
  const sharp = await loadSharp();
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new Error('Dosya okunamadı; geçerli bir resim dosyası seçin');
  }
  if (!meta.width || !meta.height) throw new Error('Dosya okunamadı; geçerli bir resim dosyası seçin');
  if (Math.min(meta.width, meta.height) < MIN_SOURCE_SIZE) {
    throw new Error(`Görsel çok küçük (en az ${MIN_SOURCE_SIZE}×${MIN_SOURCE_SIZE} piksel olmalı)`);
  }

  const targetDir = ensureUploadsDir(subfolder);
  const base = `${subfolder}-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const mainPath = path.join(targetDir, `${base}.webp`);
  const thumbPath = path.join(targetDir, `${base}${THUMB_SUFFIX}.webp`);

  const pipeline = pipelineFor(sharp, buffer);
  try {
    await Promise.all([
      writeSquare(pipeline, IMAGE_SIZE, 80, mainPath),
      writeSquare(pipeline, THUMB_SIZE, 74, thumbPath)
    ]);
  } catch (error) {
    // Yarım kalan dosyaları bırakma
    for (const p of [mainPath, thumbPath]) if (fs.existsSync(p)) fs.unlinkSync(p);
    throw error;
  }

  return `/uploads/${subfolder}/${base}.webp`;
}

const resolveUploadPath = (imageUrl) => {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('/uploads/')) return null;
  const filePath = path.resolve(uploadsDir, imageUrl.replace(/^\/uploads\//, ''));
  return filePath.startsWith(uploadsDir + path.sep) ? filePath : null;
};

/**
 * Yüklenmiş bir görseli (ve küçük kopyasını) diskten siler ('/uploads/...' adresi).
 * Yalnızca uploads klasörü içindeki dosyalara dokunur. Hata olursa işlemi durdurmaz; yalnızca uyarı yazar.
 */
export function removeUploadedImage(imageUrl) {
  for (const url of typeof imageUrl === 'string' ? [imageUrl, thumbUrlOf(imageUrl)] : []) {
    try {
      const filePath = resolveUploadPath(url);
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.warn('Eski görsel silinemedi:', e.message);
    }
  }
}

/**
 * Eskiden yüklenmiş ve küçük kopyası (-sm) olmayan görseller için küçük kopyayı oluşturur.
 * Sunucu açılışında bir kez çalışır; var olan dosyalara dokunmaz.
 */
export async function ensureThumbnails() {
  let created = 0;
  let sharp;
  for (const sub of ['products', 'categories']) {
    const dir = ensureUploadsDir(sub);
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.webp') || name.endsWith(`${THUMB_SUFFIX}.webp`)) continue;
      const thumbPath = path.join(dir, name.replace(/\.webp$/, `${THUMB_SUFFIX}.webp`));
      if (fs.existsSync(thumbPath)) continue;
      try {
        sharp ??= await loadSharp();
        // Dosya önce belleğe okunur; sharp kaynak dosyayı açık tutmaz
        await writeSquare(pipelineFor(sharp, fs.readFileSync(path.join(dir, name))), THUMB_SIZE, 74, thumbPath);
        created += 1;
      } catch (e) {
        console.warn(`[Görsel] Küçük kopya oluşturulamadı (${name}):`, e.message);
      }
    }
  }
  if (created) console.log(`[Görsel] ${created} görsel için küçük kopya oluşturuldu.`);
}
