#!/usr/bin/env bash
# Özgensoy Kafeterya — Ubuntu VPS ilk kurulum (bir kere çalıştırılır).
#
#   sudo bash deploy/kurulum.sh <eposta> [laptoptan-alinan-yedek.sql]
#
# Yaptıkları: Node.js 22, MySQL, Nginx, ücretsiz SSL (Let's Encrypt) kurar; veritabanını ve ayrı bir veritabanı
# kullanıcısı oluşturur; (verildiyse) yedeği içeri aktarır; arayüzü derler; sunucuyu sistem hizmeti olarak başlatır
# (çökerse / yeniden başlatmada kendiliğinden açılır); her gece 03:00'te yedek alır; güvenlik duvarını açar.
# Not: SSL için alan adının DNS kayıtları (A kaydı) bu sunucunun IP'sine yönlenmiş olmalıdır.
set -euo pipefail

DOMAIN="${DOMAIN:-ozgensoykafeterya.com}"
PANEL="panel.$DOMAIN"
EMAIL="${1:-}"
SQL_DUMP="${2:-}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER=kafe
DB_NAME=kafe_otomasyon
ENV_FILE="$APP_DIR/backend/.env"

[ "$(id -u)" -eq 0 ] || { echo "Bu betik sudo ile çalıştırılmalı."; exit 1; }
[ -n "$EMAIL" ] || { echo "Kullanım: sudo bash deploy/kurulum.sh <eposta> [yedek.sql]"; exit 1; }
case "$APP_DIR" in /root*) echo "Projeyi /root altına değil /var/www/ozgensoy klasörüne koyun."; exit 1;; esac
[ -z "$SQL_DUMP" ] || [ -f "$SQL_DUMP" ] || { echo "Yedek dosyası bulunamadı: $SQL_DUMP"; exit 1; }

echo "=== 1/8 Paketler ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates nginx mysql-server certbot python3-certbot-nginx ufw
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
timedatectl set-timezone Europe/Istanbul || true

echo "=== 2/8 Uygulama kullanıcısı ==="
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"

echo "=== 3/8 Veritabanı ==="
DB_PASS="$(openssl rand -hex 24)"
mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'kafe'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER 'kafe'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO 'kafe'@'localhost';
FLUSH PRIVILEGES;
SQL
if [ -n "$SQL_DUMP" ]; then
  echo "Yedek içeri aktarılıyor: $SQL_DUMP"
  mysql "$DB_NAME" < "$SQL_DUMP"
fi

echo "=== 4/8 Ayar dosyaları ==="
set_env() { # anahtar değer — varsa değiştirir, yoksa ekler
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/backend/.env.example" "$ENV_FILE"
  set_env JWT_SECRET "$(openssl rand -hex 48)"
  set_env DEV_ACCOUNT_NAME "Süper Admin"
  set_env DEV_ACCOUNT_USERNAME superadmin
  DEV_PASS="$(openssl rand -base64 12 | tr -d '/+=')"
  set_env DEV_ACCOUNT_PASSWORD "$DEV_PASS"
  echo ">>> Geliştirici hesabı: superadmin / $DEV_PASS  (ilk girişte değiştirin)"
fi
grep -q '^JWT_SECRET=.\{32,\}' "$ENV_FILE" || set_env JWT_SECRET "$(openssl rand -hex 48)"
set_env PORT 5000
set_env DB_HOST localhost
set_env DB_USER kafe
set_env DB_PASSWORD "$DB_PASS"
set_env DB_NAME "$DB_NAME"
set_env CORS_ORIGIN "https://$PANEL,https://$DOMAIN"
set_env TRUST_PROXY true
set_env MENU_HOST "$DOMAIN,www.$DOMAIN"
set_env APP_TIMEZONE Europe/Istanbul
set_env DB_TIMEZONE +03:00
echo "VITE_MENU_URL=https://$DOMAIN" > "$APP_DIR/frontend/.env"
chmod 600 "$ENV_FILE"

echo "=== 5/8 Paketler ve derleme ==="
rm -rf "$APP_DIR/backend/node_modules" "$APP_DIR/frontend/node_modules"   # Windows'tan kopyalanan modüller Linux'ta çalışmaz
(cd "$APP_DIR/backend" && npm ci --omit=dev)
(cd "$APP_DIR/frontend" && npm ci && npm run build)
mkdir -p "$APP_DIR/backend/uploads" "$APP_DIR/backend/backups"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "=== 6/8 Sistem hizmeti ==="
cat > /etc/systemd/system/ozgensoy.service <<UNIT
[Unit]
Description=Ozgensoy Kafeterya
After=network.target mysql.service
Requires=mysql.service

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/backend
Environment=NODE_ENV=production
ExecStart=$(command -v node) src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now ozgensoy
systemctl restart ozgensoy

echo "=== 7/8 Nginx + SSL ==="
sed -e "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/ozgensoy
ln -sf /etc/nginx/sites-available/ozgensoy /etc/nginx/sites-enabled/ozgensoy
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ufw allow OpenSSH >/dev/null && ufw allow 'Nginx Full' >/dev/null && ufw --force enable
certbot --nginx --non-interactive --agree-tos -m "$EMAIL" --redirect \
  -d "$DOMAIN" -d "www.$DOMAIN" -d "$PANEL" \
  || echo "!!! SSL alınamadı: DNS kayıtları henüz bu sunucuya yönlenmemiş olabilir. Sonra tekrar: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN -d $PANEL"

echo "=== 8/8 Gece yedeği (03:00) ==="
echo "0 3 * * * $APP_USER cd $APP_DIR/backend && $(command -v node) scripts/backup.js >> backups/yedek.log 2>&1" > /etc/cron.d/ozgensoy-yedek

sleep 3
curl -fsS http://127.0.0.1:5000/api/health && echo && echo "Kurulum tamam: https://$PANEL  |  QR menü: https://$DOMAIN"
