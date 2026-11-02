/*
 * Paylaşımlı hosting için yayın klasörü hazırlar: arayüzü derler, sunucu dosyalarını kopyalar, hostinge özel
 * başlangıç dosyalarını ekler.
 *
 *   node deploy/publish.mjs <hedef-klasör>            cPanel / Linux Node.js hosting (Phusion Passenger) — varsayılan
 *   node deploy/publish.mjs <hedef-klasör> --plesk    Plesk / Windows hosting (IIS + iisnode)
 *
 * cPanel: klasörün içindekiler Node.js uygulama klasörüne (ör. ~/ozgensoy) yüklenir; paketler sunucuda
 *         "Run NPM Install" ile kurulur (Linux'a özel paketler bu bilgisayarda kurulamaz).
 * Plesk:  klasörün içindekiler httpdocs'a yüklenir; Windows paketleri (node_modules) burada kurulup birlikte gider.
 *
 * Hedefteki backend/.env ve backend/uploads (sunucuya özel ayar ve görseller) korunur; .env yoksa
 * rastgele oturum anahtarı ve geliştirici şifresiyle bir taslak yazılır (veritabanı bilgilerini doldurun).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const MODE = args.includes('--plesk') ? 'plesk' : 'cpanel';
const target = args.find(a => !a.startsWith('--'));
const OUT = target ? path.resolve(target) : null;
const MENU_URL = process.env.VITE_MENU_URL || 'https://ozgensoykafeterya.com';
if (!OUT) {
  console.error('Kullanım: node deploy/publish.mjs <hedef-klasör> [--plesk]');
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

console.log(`=== Yayın klasörü (${MODE}): ${OUT} ===`);
fs.mkdirSync(OUT, { recursive: true });
// Sunucuya özel olanlar (backend/.env, backend/uploads) dışında eski yayını temizle
const KEEP = new Set(['.env', 'uploads']);
for (const entry of fs.readdirSync(OUT)) {
  if (entry !== 'backend') fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
}
if (fs.existsSync(path.join(OUT, 'backend'))) {
  for (const entry of fs.readdirSync(path.join(OUT, 'backend'))) {
    if (!KEEP.has(entry)) fs.rmSync(path.join(OUT, 'backend', entry), { recursive: true, force: true });
  }
}

copy('backend/src', 'backend/src');
copy('frontend/dist', 'frontend/dist');
fs.mkdirSync(path.join(OUT, 'backend', 'uploads'), { recursive: true });

const backendPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/package.json'), 'utf8'));
if (MODE === 'cpanel') {
  copy('deploy/cpanel/app.cjs', 'app.cjs');
  // cPanel paketleri uygulama klasörünün kökündeki package.json'dan kurar; backend/src bu dosyanın "type": "module"
  // ayarını ve kökteki node_modules'u kullanır
  fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({
    name: 'ozgensoy-kafeterya',
    version: backendPkg.version,
    private: true,
    type: 'module',
    main: 'app.cjs',
    scripts: { start: 'node app.cjs' },
    engines: { node: '>=20.9' },
    dependencies: backendPkg.dependencies
  }, null, 2) + '\n');
  copy('backend/package-lock.json', 'package-lock.json');
} else {
  copy('deploy/plesk/web.config', 'web.config');
  copy('deploy/plesk/server.cjs', 'server.cjs');
  copy('backend/package.json', 'backend/package.json');
  copy('backend/package-lock.json', 'backend/package-lock.json');
  console.log('=== Sunucu paketleri (yalnızca çalışma için gerekenler) ===');
  run('npm ci --omit=dev --no-audit --no-fund', path.join(OUT, 'backend'));
}

const envFile = path.join(OUT, 'backend', '.env');
if (!fs.existsSync(envFile)) {
  const devPassword = crypto.randomBytes(12).toString('base64url');
  fs.writeFileSync(envFile, `# Özgensoy Kafeterya — canlı ayarlar. Bu dosyayı kimseyle paylaşmayın.

# Hosting panelinde (cPanel → MySQL Databases) açtığınız veritabanının bilgileri
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

CORS_ORIGIN=https://ozgensoykafeterya.com,https://www.ozgensoykafeterya.com
TRUST_PROXY=true

# Panel ve menü aynı adreste çalışır; boş bırakın. (Panel ayrı bir adrese taşınırsa menü alan adı yazılır.)
MENU_HOST=

APP_TIMEZONE=Europe/Istanbul
DB_TIMEZONE=+03:00
`);
  console.log('backend/.env taslağı yazıldı: veritabanı bilgilerini doldurun. Geliştirici hesabı: superadmin (şifre dosyada).');
} else {
  console.log('Mevcut backend/.env korundu.');
}
console.log(MODE === 'cpanel'
  ? '\nTamam. Klasörün içindekileri cPanel\'de Node.js uygulama klasörüne (ör. ozgensoy) yükleyin.'
  : '\nTamam. Klasörün içindekileri Plesk\'te sitenin httpdocs klasörüne yükleyin.');
