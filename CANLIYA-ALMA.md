# Canlıya Alma — Veridyen Node.js Hosting (cPanel) + ozgensoykafeterya.com

Sistem Veridyen'in **Junior.js** Node.js hosting paketinde (cPanel, Linux) çalışır. Kafedeki laptop, tablet ve telefonlar yalnızca tarayıcıdan bağlanır.

| Adres | Ne açılır |
|---|---|
| `https://ozgensoykafeterya.com` | Personel paneli (giriş ekranı) |
| `https://ozgensoykafeterya.com/m/<masa-anahtarı>` | Masadaki QR kodun açtığı müşteri menüsü |

---

## 0. Satın alınacaklar (Veridyen)

- **Junior.js** Node.js hosting paketi
- **ozgensoykafeterya.com** alan adı

Alan adını hosting'le birlikte Veridyen'den alırsanız DNS ayarı gerekmez, alan adı kendiliğinden hosting'e bağlanır.

## 1. Yayın paketini hazırlayın (bu bilgisayarda)

Proje klasöründe şu komutu çalıştırın:

```
node deploy/publish.mjs "C:\Users\İskender\Desktop\Yusuf\ozgensoy_publish"
```

`ozgensoy_publish` klasörünün içinde şunlar olur:

| Dosya | Ne işe yarar |
|---|---|
| `app.cjs` | Başlangıç dosyası |
| `package.json` | Sunucuda kurulacak paketlerin listesi |
| `backend/src` | Sunucu kodu |
| `backend/.env` | Ayarlar |
| `frontend/dist` | Derlenmiş arayüz |

İlk seferde `backend\.env` dosyası kendiliğinden yazılır. İçinde rastgele bir oturum anahtarı ve **geliştirici hesabı şifresi** (`DEV_ACCOUNT_PASSWORD`) bulunur. Bu şifreyi not alın.

## 2. Veritabanını açın (cPanel)

**cPanel → MySQL® Databases** (MySQL Veritabanları):

1. **Create New Database** ile bir veritabanı açın, ör. `kafe`. cPanel başına kullanıcı adınızı ekler: `kullaniciadi_kafe`. **Tam adı** not alın.
2. **Add New User** ile bir kullanıcı ve güçlü bir şifre oluşturun (tam adı `kullaniciadi_...` olur).
3. **Add User To Database** ile kullanıcıyı veritabanına ekleyin ve **ALL PRIVILEGES** (tüm yetkiler) seçin.

Sonra `ozgensoy_publish\backend\.env` dosyasını Not Defteri ile açıp şu satırları doldurun:

```
DB_HOST=localhost
DB_USER=<tam kullanıcı adı>
DB_PASSWORD=<şifre>
DB_NAME=<tam veritabanı adı>
```

Tabloları sizin oluşturmanız gerekmez. Uygulama ilk açıldığında bütün tabloları kendisi kurar.

## 3. Dosyaları yükleyin

1. `ozgensoy_publish` klasörünün **içindekileri** zip yapın: hepsini seçin → sağ tık → Gönder → Sıkıştırılmış klasör.
2. **cPanel → File Manager** (Dosya Yöneticisi) açın. Sağ üstteki **Settings**'ten **Show Hidden Files** seçeneğini işaretleyin (`.env` dosyasını görebilmek için).
3. **Ana klasörde** (`/home/kullaniciadi`, **public_html'in içinde değil**) `ozgensoy` adında bir klasör oluşturun.
   Uygulama dosyaları internetten erişilemeyen bu klasörde durur; `.env` içindeki şifreler güvende kalır.
4. Zip'i `ozgensoy` klasörüne yükleyin, sağ tık → **Extract**. Sonra zip'i silin.
5. `ozgensoy` klasöründe şunlar görünmeli: `app.cjs`, `package.json`, `backend`, `frontend`.

## 4. Node.js uygulamasını oluşturun

**cPanel → Setup Node.js App → Create Application**

| Ayar | Değer |
|---|---|
| Node.js version | **22** (yoksa 20 veya üstü) |
| Application mode | **Production** |
| Application root | `ozgensoy` |
| Application URL | `ozgensoykafeterya.com` (yol kısmı **boş**) |
| Application startup file | `app.cjs` |

1. **Create** düğmesine basın.
2. Aynı sayfada **Run NPM Install** düğmesine basın ve paketler kurulana kadar bekleyin (1–2 dakika).
3. **Restart** düğmesine basın.

> "node_modules klasörü var" uyarısı çıkarsa `ozgensoy` içindeki `node_modules` klasörünü silip tekrar **Run NPM Install** deyin.

## 5. public_html'i temizleyin

**File Manager → public_html**: varsayılan dosyaları (`index.html`, `index.php`, `default.html` vb.) silin. Bu dosyalar dururken site uygulama yerine onları gösterir.

**`.htaccess` dosyasını silmeyin.** Node.js uygulamasının ayarı oradadır.

## 6. SSL (https)

- **cPanel → SSL/TLS Status → Run AutoSSL** ile ücretsiz sertifika alın. Alan adı yeni bağlandıysa birkaç saat sürebilir.
- **cPanel → Domains** sayfasında alan adının yanındaki **Force HTTPS Redirect** seçeneğini açın.

## 7. Kontrol

- `https://ozgensoykafeterya.com/api/health` adresi `"status":"ok"` göstermeli.
- `https://ozgensoykafeterya.com` adresinde giriş ekranı açılmalı. **superadmin** kullanıcı adı ve `.env` dosyasındaki `DEV_ACCOUNT_PASSWORD` şifresiyle girin.
- Açılmazsa: **Setup Node.js App** sayfasındaki uygulamada **Restart** deneyin. Hata kayıtları `ozgensoy/stderr.log` dosyasındadır.

## 8. Açılıştan önce

1. Personel hesaplarını açın.
2. Örnek ürünleri silin ya da düzenleyin, gerçek ürünleri ve görsellerini girin.
3. Masaları son hâline getirin (varsayılan 12 masa gelir).
4. **Masalar → QR** ekranından QR kodlarını yazdırıp masalara yapıştırın. Telefonla bir tanesini okutup test edin.
   - Masa adını/numarasını değiştirmek QR'ı bozmaz.
   - **Masayı silmek** o masanın QR'ını geçersiz yapar.
5. Bir deneme siparişi verin: QR okut → sipariş ver → panelde onayla → mutfakta görün → hesabı kapat.

## Güncelleme (kodda değişiklik olduğunda)

1. Bu bilgisayarda `node deploy/publish.mjs "C:\Users\İskender\Desktop\Yusuf\ozgensoy_publish"` komutunu çalıştırın. Mevcut `.env` dosyası korunur.
2. Klasördeki dosyaları `ozgensoy` klasörüne yükleyin. **`backend/.env` ve `backend/uploads` hariç**: bunlar sunucudaki ayarlar ve ürün görselleridir, üzerine yazmayın.
3. `package.json` değiştiyse **Run NPM Install**, ardından her durumda **Restart**.

## Yedekleme

- **cPanel → Backup** (veya varsa **JetBackup**) bölümünden veritabanı ve dosya yedeği indirebilirsiniz.
- **phpMyAdmin → veritabanı → Export** ile hızlıca veritabanı yedeği alabilirsiniz. Haftada bir bilgisayarınıza indirmeniz iyi olur.

## Paylaşımlı hosting'e özgü notlar

- **Uyku:** Bir süre kimse girmezse uygulama uyutulabilir; sonraki ilk açılış birkaç saniye sürer. Verilere zarar vermez.
- **Gece gün sonu kaydı:** Uygulama gece uyuyorsa, sabah ilk açıldığında eksik günler otomatik olarak kasa defterine işlenir. Kayıtlar yine doğru güne yazılır.
- **Anlık bildirimler:** Hosting WebSocket desteklemiyorsa sistem kendiliğinden başka bir bağlantı yöntemine geçer; bildirimler birkaç saniye geç gelebilir.
- **Alt alan adı (subdomain):** Panel için alt alan adına ayrı bir Node.js uygulaması **açmayın**. İkinci bir kopya çalışır ve anlık bildirimler iki kopya arasında bölünür.
- **Ürün görselleri:** Görsel yüklerken "Görsel işleme bu sunucuda kullanılamıyor" hatası alırsanız Veridyen desteğine "sharp paketi çalışmıyor" diye bildirin. Sistemin geri kalanı bu durumda da çalışır.

---

Diğer kurulum seçenekleri (Plesk/Windows, Linux VPS): `DEPLOY.md`.
