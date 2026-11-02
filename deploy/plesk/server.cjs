// Plesk / IIS (iisnode) başlangıç dosyası. iisnode uygulamayı require() ile yükler; asıl sunucu ES modülü
// olduğu için burada içe aktarılır. iisnode, dinlenecek adresi (named pipe) process.env.PORT ile verir.
import('./backend/src/server.js').catch((error) => {
  console.error('[Sunucu] Başlatılamadı:', error);
  process.exit(1);
});
