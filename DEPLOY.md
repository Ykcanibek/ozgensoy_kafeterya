# Canlıya Alma (teknik özet)

Adım adım rehber: **[CANLIYA-ALMA.md](CANLIYA-ALMA.md)** (Veridyen Node.js hosting / cPanel).

Node sunucusu derlenmiş arayüzü (`frontend/dist`) kendisi sunar: `/m/<masa-anahtarı>` → QR menü (`menu.html`),
diğer adresler → personel paneli (`index.html`). `MENU_HOST` verilirse o alan adında yalnızca menü ve `/api/public/*` açılır.
Veritabanı panelden açılabilir (kullanıcının `CREATE DATABASE` yetkisi gerekmez); tablolar ilk açılışta kurulur.

Yayın klasörü: `node deploy/publish.mjs <hedef> [--plesk]`

## cPanel / Linux Node.js hosting (Phusion Passenger) — varsayılan

- `deploy/cpanel/app.cjs` — Passenger başlangıç dosyası (ES modülü sunucuyu yükler)
- Yayın kökünde `package.json` (`"type": "module"`, yalnızca çalışma paketleri); paketler sunucuda "Run NPM Install" ile kurulur
- Uygulama kökü `public_html` dışında tutulur (`.env` internetten erişilemez)

## Plesk / Windows hosting (IIS + iisnode) — `--plesk`

- `deploy/plesk/web.config` — tüm istekleri Node'a yönlendirir, kaynak/`.env` erişimini engeller, tek süreç (socket.io)
- `deploy/plesk/server.cjs` — iisnode başlangıç dosyası (port yerine named pipe dinlenir)
- Windows paketleri (node_modules) yayın klasörüne kurulup birlikte yüklenir

## Linux VPS (Ubuntu)

- `deploy/kurulum.sh <eposta> [yedek.sql]` — Node, MySQL, Nginx, Let's Encrypt, systemd hizmeti, gece yedeği
- `deploy/guncelle.sh` — derle + yeniden başlat
- `deploy/nginx.conf` — alan adlarını Node sunucusuna (5000) iletir
