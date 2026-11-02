#!/usr/bin/env bash
# Kodda değişiklik yüklendikten sonra çalıştırın: paketleri kurar, arayüzü derler, sunucuyu yeniden başlatır.
#   sudo bash deploy/guncelle.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
(cd "$APP_DIR/backend" && npm ci --omit=dev)
(cd "$APP_DIR/frontend" && npm ci && npm run build)
chown -R kafe:kafe "$APP_DIR"
systemctl restart ozgensoy
sleep 3
curl -fsS http://127.0.0.1:5000/api/health && echo && echo "Güncellendi."
