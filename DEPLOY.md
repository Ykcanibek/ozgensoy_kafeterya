# Canlıya Alma (teknik özet)

Adım adım kurulum rehberi: **[CANLIYA-ALMA.md](CANLIYA-ALMA.md)** (Veridyen Ubuntu VPS).

- `deploy/kurulum.sh` — ilk kurulum (Node, MySQL, Nginx, SSL, systemd hizmeti, gece yedeği)
- `deploy/guncelle.sh` — kod güncellemesinden sonra derle + yeniden başlat
- `deploy/nginx.conf` — üç alan adını da Node sunucusuna (5000) ileten ters vekil ayarı

Tek proje, tek backend, tek veritabanı; Node derlenmiş arayüzü kendisi sunar:

| Adres | Ne açılır |
|---|---|
| `panel.ozgensoykafeterya.com` | Personel paneli (`dist/index.html`) |
| `ozgensoykafeterya.com/m/<masa-anahtarı>` | Masaya özel QR menü (`dist/menu.html`) |

`MENU_HOST` ile belirtilen menü alan adında yalnızca `/api/public/*` ve menü sayfası açılır; personel API'si 404 döner.
Her masanın QR kodunda tahmin edilemez bir anahtar vardır. Kod kaybolur/kopyalanırsa Masalar → QR → **Kodu yenile**.
