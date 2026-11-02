# Canlıya Alma (teknik özet)

Adım adım rehber: **[CANLIYA-ALMA.md](CANLIYA-ALMA.md)** (Veridyen Windows hosting / Plesk).

Node sunucusu derlenmiş arayüzü (`frontend/dist`) kendisi sunar: `/m/<masa-anahtarı>` → QR menü (`menu.html`),
diğer adresler → personel paneli (`index.html`). `MENU_HOST` verilirse o alan adında yalnızca menü ve `/api/public/*` açılır.

## Windows hosting (Plesk, IIS + iisnode)

- `deploy/plesk/publish.mjs <hedef>` — yayın klasörü: derlenmiş arayüz, sunucu kodu, çalışma paketleri, `web.config`, `server.cjs`
- `deploy/plesk/web.config` — tüm istekleri Node'a yönlendirir, kaynak/`.env` erişimini engeller, tek süreç (socket.io)
- `deploy/plesk/server.cjs` — iisnode başlangıç dosyası (ES modülü sunucuyu yükler; port yerine named pipe dinlenir)
- Veritabanı panelden açılır; kullanıcının `CREATE DATABASE` yetkisi olmaması sorun değildir, tablolar ilk açılışta kurulur.

## Linux VPS (Ubuntu)

- `deploy/kurulum.sh <eposta> [yedek.sql]` — Node, MySQL, Nginx, Let's Encrypt, systemd hizmeti, gece yedeği
- `deploy/guncelle.sh` — derle + yeniden başlat
- `deploy/nginx.conf` — alan adlarını Node sunucusuna (5000) iletir
