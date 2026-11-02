/*
 * Plesk (Windows hosting) için yayın klasörü hazırlar: arayüzü derler, sunucu dosyalarını ve yalnızca çalışma
 * için gereken paketleri (node_modules) kopyalar, web.config + server.cjs ekler. Çıkan klasörün İÇİNDEKİLER
 * sitenin httpdocs klasörüne yüklenir.
 *
 *   node deploy/plesk/publish.mjs "C:\Users\...\ozgensoy_publish"
 *
 * Hedefteki backend/.env ve backend/uploads (sunucuya özel ayar ve görseller) korunur; .env yoksa
 * rastgele oturum anahtarı ve geliştirici şifresiyle bir taslak yazılır (veritabanı bilgilerini doldurun).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
const MENU_URL = process.env.VITE_MENU_URL || 'https://ozgensoykafeterya.com';
if (!OUT) {
  console.error('Kullanım: node deploy/plesk/publish.mjs <hedef-klasör>');
  process.exit(1);
}
if (OUT === ROOT || OUT.startsWith(ROOT + path.sep)) {
  console.error('Hedef klasör proje klasörünün dışında olmalı.');
  process.exit(1);
}

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, VITE_MENU_URL: MENU_URL } });
// fs.cpSync, Windows'ta Türkçe karakterli yollarda (ör. C:\Users\İskender) EIO hatası verebiliyor; bu yüzden elle kopyalanır
const copyRecursive = (src, dest) => {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) copyRecursive(path.join(src, entry), path.join(dest, entry));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
};
const copy = (from, to) => copyRecursive(path.join(ROOT, from), path.join(OUT, to));

console.log(`=== Arayüz derleniyor (QR adresi: ${MENU_URL}) ===`);
run('npm run build', path.join(ROOT, 'frontend'));

console.log(`=== Yayın klasörü: ${OUT} ===`);
fs.mkdirSync(OUT, { recursive: true });
// Sunucuya özel olanlar dışında eski yayını temizle
const KEEP = new Set(['.env', 'uploads']);
for (const entry of fs.readdirSync(OUT)) {
  if (entry !== 'backend') fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
}
if (fs.existsSync(path.join(OUT, 'backend'))) {
  for (const entry of fs.readdirSync(path.join(OUT, 'backend'))) {
    if (!KEEP.has(entry)) fs.rmSync(path.join(OUT, 'backend', entry), { recursive: true, force: true });
  }
}

copy('deploy/plesk/web.config', 'web.config');
copy('deploy/plesk/server.cjs', 'server.cjs');
copy('backend/src', 'backend/src');
copy('backend/package.json', 'backend/package.json');
copy('backend/package-lock.json', 'backend/package-lock.json');
copy('frontend/dist', 'frontend/dist');
fs.mkdirSync(path.join(OUT, 'backend', 'uploads'), { recursive: true });

console.log('=== Sunucu paketleri (yalnızca çalışma için gerekenler) ===');
run('npm ci --omit=dev --no-audit --no-fund', path.join(OUT, 'backend'));

const envFile = path.join(OUT, 'backend', '.env');
if (!fs.existsSync(envFile)) {
  const devPassword = crypto.randomBytes(12).toString('base64url');
  fs.writeFileSync(envFile, `# Özgensoy Kafeterya — canlı ayarlar (Plesk). Bu dosyayı kimseyle paylaşmayın.

# Plesk → Veritabanları bölümünde açtığınız veritabanının bilgileri
DB_HOST=localhost
DB_USER=
DB_PASSWORD=
DB_NAME=

# Oturum imzalama anahtarı (otomatik üretildi; değiştirirseniz herkes yeniden giriş yapar)
JWT_SECRET=${crypto.randomBytes(48).toString('hex')}

# İlk açılışta oluşturulan gizli geliştirici hesabı (giriş yaptıktan sonra şifreyi değiştirebilirsiniz)
DEV_ACCOUNT_NAME=Süper Admin
DEV_ACCOUNT_USERNAME=superadmin
DEV_ACCOUNT_PASSWORD=${devPassword}
DEV_ACCOUNT_PHONE=

CORS_ORIGIN=https://ozgensoykafeterya.com,https://www.ozgensoykafeterya.com,https://panel.ozgensoykafeterya.com
TRUST_PROXY=true

# Panel ayrı bir adresten (panel.ozgensoykafeterya.com, Plesk'te "alan adı takma adı") açılıyorsa aşağıdakini
# açın: menü adresinde personel girişi kapanır. Panel ve menü aynı adresteyse BOŞ bırakın.
MENU_HOST=

APP_TIMEZONE=Europe/Istanbul
DB_TIMEZONE=+03:00
`);
  console.log(`backend/.env taslağı yazıldı: veritabanı bilgilerini doldurun. Geliştirici hesabı: superadmin (şifre dosyada).`);
} else {
  console.log('Mevcut backend/.env korundu.');
}
console.log('\nTamam. Klasörün içindekileri Plesk\'te sitenin httpdocs klasörüne yükleyin.');
