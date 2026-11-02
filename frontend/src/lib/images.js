// Ürün/kategori görselleri için ortak yardımcılar

/**
 * Sunucu her yüklenen görselin yanında 320px'lik küçük bir kopyasını ('-sm.webp') tutar.
 * Menü kartları, listeler ve sepet satırları bu küçük kopyayı kullanır (~3 kat daha hafif).
 */
export const thumbSrc = (url) => (typeof url === 'string' && /^\/uploads\/.+\.webp$/.test(url) && !url.endsWith('-sm.webp')
  ? url.replace(/\.webp$/, '-sm.webp')
  : url);

/**
 * <img onError> için: küçük kopya bulunamazsa önce ana görsele geçer; o da açılmazsa
 * görseli gizleyip hemen ardından gelen yedek (ikon) öğesini gösterir.
 */
export const handleThumbError = (e, fullUrl) => {
  const img = e.currentTarget;
  if (fullUrl && img.dataset.fallback !== '1' && !img.src.endsWith(fullUrl)) {
    img.dataset.fallback = '1';
    img.src = fullUrl;
    return;
  }
  img.style.display = 'none';
  if (img.nextSibling?.style) img.nextSibling.style.display = 'flex';
};

const MAX_UPLOAD_SIDE = 1600;
const PASSTHROUGH_TYPES = ['image/svg+xml', 'image/gif'];

/**
 * Seçilen fotoğrafı yüklemeden önce tarayıcıda küçültür (en uzun kenar 1600px, JPEG %90).
 * Telefonla çekilmiş 5–10 MB'lık fotoğraflar ~300 KB'a iner; yükleme mobil veride bile hızlı olur.
 * Sunucu yine kare kırpıp WebP'ye çevirir. Küçültme başarısız olursa dosya olduğu gibi gönderilir.
 */
export async function prepareImageForUpload(file) {
  if (!file || PASSTHROUGH_TYPES.includes(file.type) || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close?.();
      return file; // Zaten küçük: olduğu gibi gönder
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // Saydam PNG'lerin arka planı siyaha dönmesin
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
