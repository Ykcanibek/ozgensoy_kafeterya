import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Vite, config dosyasında __dirname sağlar
const r = (p) => resolve(__dirname, p);

// QR menü adresleri (/m/<masa-anahtarı>) müşteri uygulamasını (menu.html) açar; diğer tüm adresler personel paneli (index.html).
// Canlıda aynı yönlendirmeyi Node sunucusu yapar (bkz. backend/src/server.js, CANLIYA-ALMA.md).
const QR_ROUTE = /^\/m\/[A-Za-z0-9_-]+\/?(\?.*)?$/;
const qrMenuRoute = () => {
  const rewrite = (req, _res, next) => {
    if (req.url && QR_ROUTE.test(req.url)) req.url = '/menu.html';
    next();
  };
  return {
    name: 'qr-menu-route',
    // Dikkat: bu kancalar bir fonksiyon döndürürse Vite onu sonradan çağırır; bu yüzden hiçbir şey döndürmüyoruz
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); }
  };
};

export default defineConfig({
  plugins: [react(), qrMenuRoute()],
  build: {
    rollupOptions: {
      // İki ayrı giriş: personel paneli ve müşteri QR menüsü (müşteri telefonu panel kodunu indirmez)
      input: {
        main: r('./index.html'),
        menu: r('./menu.html')
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true
      }
    }
  }
});
