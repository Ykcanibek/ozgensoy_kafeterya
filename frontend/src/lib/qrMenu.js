import QRCode from 'qrcode';

/**
 * QR menünün yayınlandığı adres. Canlıda .env içinde VITE_MENU_URL=https://ozgensoykafeterya.com verilir;
 * verilmezse (geliştirme ortamı) panelin açık olduğu adres kullanılır.
 */
export const MENU_BASE_URL = (import.meta.env.VITE_MENU_URL || window.location.origin).replace(/\/+$/, '');

/** Menü adresi ayarlanmış mı? Ayarlanmadıysa basılan QR kodlar müşterinin telefonunda açılmayabilir. */
export const MENU_URL_CONFIGURED = Boolean(import.meta.env.VITE_MENU_URL);
export const MENU_URL_WARNING = 'Menü adresi ayarlanmamış: QR kodlar şu an bu bilgisayarın adresini gösteriyor ve müşterinin telefonunda açılmayabilir. '
  + 'Canlıya geçmeden önce frontend/.env dosyasına VITE_MENU_URL=https://ozgensoykafeterya.com yazıp projeyi yeniden derleyin, QR kodları ondan sonra yazdırın.';

/** Masaya özel menü bağlantısı */
export const tableMenuUrl = (token) => `${MENU_BASE_URL}/m/${token}`;

/** QR kod görseli (PNG, data URL) */
export const qrDataUrl = (text, size = 512) => QRCode.toDataURL(text, {
  width: size,
  margin: 1,
  errorCorrectionLevel: 'M',
  color: { dark: '#1a1714', light: '#ffffff' }
});

// İndirilen dosyalar düz siyah-beyaz olur: tasarım programlarında renklendirmesi ve basılması en kolay biçim
const DOWNLOAD_OPTS = { margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } };

const fileSlug = (title) => `qr-${String(title || 'masa')
  .toLocaleLowerCase('tr-TR')
  .replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c]))
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'masa'}`;

const saveFile = (href, filename) => {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/** Masa QR kodunu indirir. format: 'png' (2000px, baskıya uygun) | 'svg' (vektör, kayıpsız boyutlandırılır) */
export const downloadTableQr = async (table, token, format = 'png') => {
  const text = tableMenuUrl(token);
  if (format === 'svg') {
    const svg = await QRCode.toString(text, { ...DOWNLOAD_OPTS, type: 'svg' });
    const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    saveFile(href, `${fileSlug(table.title)}.svg`);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return;
  }
  saveFile(await QRCode.toDataURL(text, { ...DOWNLOAD_OPTS, width: 2000 }), `${fileSlug(table.title)}.png`);
};

const escapeHtml =(s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Masaların QR kartlarını yazdırılabilir bir sayfada açar (A4'e 2 sütun; masaya konacak kartlar).
 * tables: [{ title, qr_code_token }]
 */
export const printQrCards = async (tables) => {
  const win = window.open('', '_blank');
  if (!win) throw new Error('Yazdırma penceresi açılamadı. Tarayıcının açılır pencere iznini kontrol edin.');
  win.document.write('<p style="font-family:sans-serif;padding:24px">QR kodlar hazırlanıyor…</p>');
  const cards = await Promise.all(tables.map(async t => ({
    title: t.title,
    url: tableMenuUrl(t.qr_code_token),
    img: await qrDataUrl(tableMenuUrl(t.qr_code_token), 600)
  })));
  win.document.open();
  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Masa QR Kodları</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Sans:wght@500;700&display=swap" rel="stylesheet">
<style>
  /* QR menüyle aynı kimlik: fildişi kâğıt, lacivert ve altın */
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'DM Sans', Arial, sans-serif; color: #221c18; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
  .card { position: relative; background: #fbf7ef; border: 0.4mm solid #b38f4e; padding: 8mm 6mm 7mm; text-align: center; break-inside: avoid; }
  .card::before { content: ''; position: absolute; inset: 1.6mm; border: 0.2mm solid rgba(34, 28, 24, 0.3); pointer-events: none; }
  .brand { font-family: 'Playfair Display', Georgia, serif; font-weight: 700; font-size: 20pt; line-height: 1; }
  .sub-brand { margin-top: 2mm; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #5b5047; }
  .atelier { font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 10pt; color: #1f3d63; margin-top: 0.6mm; }
  .table { display: inline-block; margin: 4mm 0 4mm; padding: 1.2mm 6mm; background: #1f3d63; color: #fbf3e4; font-family: 'Playfair Display', Georgia, serif; font-weight: 700; font-size: 14pt; }
  img { width: 56mm; height: 56mm; display: block; margin: 0 auto; padding: 2mm; background: #fff; border: 0.3mm solid #e3d8c6; }
  .hint { margin-top: 4mm; font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 12pt; }
  .sub { font-size: 7.5pt; color: #95887c; margin-top: 1mm; }
</style></head><body><div class="grid">
${cards.map(c => `<div class="card">
  <div class="brand">Özgensoy</div>
  <div class="sub-brand">Müze · Kütüphane · Kafeterya</div>
  <div class="atelier">&amp; Kültür Sanat Atölyesi</div>
  <div class="table">${escapeHtml(c.title)}</div>
  <img src="${c.img}" alt="">
  <div class="hint">Menü ve sipariş için okutun</div>
  <div class="sub">Siparişiniz garson onayıyla hazırlanır</div>
</div>`).join('')}
</div><script>window.onload = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => window.print(), 300));<\/script></body></html>`);
  win.document.close();
};
