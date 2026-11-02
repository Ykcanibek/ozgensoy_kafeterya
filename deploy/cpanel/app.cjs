// cPanel "Setup Node.js App" (Phusion Passenger) başlangıç dosyası. Passenger uygulamayı require() ile yükler;
// asıl sunucu ES modülü olduğu için burada içe aktarılır. Dinlenecek adresi Passenger kendisi ayarlar.
import('./backend/src/server.js').catch((error) => {
  console.error('[Sunucu] Başlatılamadı:', error);
  process.exit(1);
});
