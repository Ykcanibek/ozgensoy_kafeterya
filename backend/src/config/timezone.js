import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

/*
 * İşletme saat dilimi. Gün sonu, raporlar ve "bugün" hesapları sunucunun bulunduğu yerden bağımsız olarak
 * işletmenin saatine göre yapılır (ör. UTC saatli bir bulut sunucusunda gün sonu yine İstanbul'da 00:00'da oluşur).
 * Bu dosya server.js'te İLK içe aktarılan modüldür; böylece hiçbir tarih hesabı yanlış saat diliminde yapılmaz.
 *   APP_TIMEZONE: Node.js için IANA saat dilimi (varsayılan Europe/Istanbul)
 *   DB_TIMEZONE : MySQL oturumu için UTC farkı (varsayılan +03:00; Türkiye 2016'dan beri yaz saati uygulamıyor)
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Europe/Istanbul';
export const DB_TIMEZONE = process.env.DB_TIMEZONE || '+03:00';

process.env.TZ = APP_TIMEZONE;
