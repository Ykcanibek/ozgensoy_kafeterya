# Canlıya Alma — Veridyen Windows Hosting (Plesk) + ozgensoykafeterya.com

Sistem Veridyen'deki Windows hosting'de, Plesk panelinden yönetilerek çalışır. Kafedeki laptop, tablet ve telefonlar yalnızca tarayıcıdan bağlanır.

| Adres | Ne açılır |
|---|---|
| `https://ozgensoykafeterya.com` | Personel paneli (giriş ekranı) |
| `https://ozgensoykafeterya.com/m/<masa-anahtarı>` | Masadaki QR kodun açtığı müşteri menüsü |

> İsterseniz paneli ayrı bir adrese (`panel.ozgensoykafeterya.com`) alıp ana adresten personel girişini tamamen kapatabilirsiniz. Bkz. **Ek: Ayrı panel adresi**.

---

## 0. Satın almadan önce Veridyen'e sorun

Windows hosting paketinde şunların **hepsi** olmalı:

1. **Node.js desteği** (Plesk'te "Node.js" simgesi), **sürüm 20 veya üstü.** Olmazsa sistem çalışmaz. Bazı Windows paketlerinde yalnızca ASP.NET bulunur.
2. **MySQL veya MariaDB** veritabanı. Yalnızca MSSQL yetmez.
3. **Let's Encrypt** ücretsiz SSL (genelde vardır).
4. *(İyi olur)* IIS **WebSocket** desteği. Yoksa da çalışır; anlık bildirimler biraz daha geç gelir.
5. *(İyi olur)* Uygulama havuzunun boşta kapanmaması (**idle timeout = 0**). Gece gün sonu işlemi için gerekli değildir, ama ilk açılış hızlanır.

## 1. Yayın paketini hazırlayın (bu bilgisayarda)

Proje klasöründe:

```
node deploy/plesk/publish.mjs "C:\Users\İskender\Desktop\Yusuf\ozgensoy_publish"
```

Bu komut arayüzü derler ve sunucuya gidecek her şeyi `ozgensoy_publish` klasörüne koyar: `web.config`, `server.cjs`, `backend`, `frontend/dist`. Yalnızca çalışma için gereken Windows paketleri de içindedir, sunucuda `npm install` gerekmez.

İlk seferde `backend\.env` ayar dosyası da yazılır. İçinde rastgele bir oturum anahtarı ve **geliştirici hesabı şifresi** (`DEV_ACCOUNT_PASSWORD`) bulunur. Bu şifreyi not alın.

## 2. Veritabanını açın (Plesk)

**Plesk → Web Siteleri ve Alan Adları → Veritabanları → Veritabanı Ekle**

- Tür: **MySQL** (veya MariaDB)
- Veritabanı adı, kullanıcı adı ve şifre belirleyin. Plesk ada bir önek ekleyebilir (ör. `ozgensoy_kafe`); **tam adı** not alın.
- Sunucu adresi genelde `localhost`'tur. Plesk farklı bir adres gösteriyorsa onu kullanın.

Sonra `ozgensoy_publish\backend\.env` dosyasını Not Defteri ile açıp doldurun:

```
DB_HOST=localhost
DB_USER=<Plesk'teki kullanıcı adı>
DB_PASSWORD=<Plesk'teki şifre>
DB_NAME=<Plesk'teki tam veritabanı adı>
```

Tabloları sizin oluşturmanız gerekmez. Uygulama ilk açıldığında bütün tabloları kendisi kurar.

## 3. Dosyaları yükleyin

1. `ozgensoy_publish` klasörünün **içindekileri** zip yapın: hepsini seçin → sağ tık → Gönder → Sıkıştırılmış klasör.
2. **Plesk → Dosya Yöneticisi → httpdocs** klasörüne girin. Varsayılan dosyaları (`index.html`, `default.aspx` vb.) silin.
3. Zip'i yükleyin, üzerine sağ tıklayıp **Arşivi Çıkar**. Sonra zip'i silin.
4. `httpdocs` içinde şunlar görünmeli: `web.config`, `server.cjs`, `backend`, `frontend`.

## 4. Node.js'i açın

**Plesk → Web Siteleri ve Alan Adları → Node.js**

| Ayar | Değer |
|---|---|
| Node.js sürümü | 20 veya üstü (varsa 22) |
| Belge kökü (Document Root) | `/httpdocs` |
| Uygulama kökü (Application Root) | `/httpdocs` |
| Uygulama başlangıç dosyası | `server.cjs` |
| Uygulama modu | production |

**Node.js'i Etkinleştir** düğmesine basın.

> Plesk bu adımda `web.config` dosyasını kendi şablonuyla değiştirebilir. Site açılmazsa, değiştirilmiş dosyadaki `nodeProcessCommandLine="..."` satırını (Node sürümünün yolu) not alın. Sonra bizim `web.config` dosyamızı tekrar yükleyin ve o satırı içindeki `<iisnode ...>` etiketine ekleyin.

## 5. SSL (https)

- **Plesk → SSL/TLS Sertifikaları → Let's Encrypt** ile `ozgensoykafeterya.com` ve `www` için ücretsiz sertifika alın.
- **Barındırma Ayarları**'nda "**HTTP'den HTTPS'e kalıcı yönlendirme**" seçeneğini açın.

## 6. Kontrol

- `https://ozgensoykafeterya.com/api/health` adresi `"status":"ok"` göstermeli.
- `https://ozgensoykafeterya.com` adresinde giriş ekranı açılmalı. **superadmin** kullanıcı adı ve `.env` dosyasındaki `DEV_ACCOUNT_PASSWORD` şifresiyle girin.
- Hata olursa kayıtlar **Dosya Yöneticisi → httpdocs → iisnode** klasöründedir.

## 7. Açılıştan önce

1. Personel hesaplarını açın.
2. Örnek ürünleri silin ya da düzenleyin, gerçek ürünleri ve görsellerini girin.
3. Masaları son hâline getirin (varsayılan 12 masa gelir).
4. **Masalar → QR** ekranından QR kodlarını yazdırıp masalara yapıştırın. Telefonla bir tanesini okutup test edin.
   - Masa adını/numarasını değiştirmek QR'ı bozmaz. **Masayı silmek** o masanın QR'ını geçersiz yapar.
5. Bir deneme siparişi verin: QR okut → sipariş ver → panelde onayla → mutfakta görün → hesabı kapat.

## Güncelleme (kodda değişiklik olduğunda)

1. Bu bilgisayarda `node deploy/plesk/publish.mjs "C:\Users\İskender\Desktop\Yusuf\ozgensoy_publish"` komutunu çalıştırın. Mevcut `.env` korunur.
2. Klasördeki dosyaları httpdocs'a yükleyin. **`backend\.env` ve `backend\uploads` hariç**: bunlar sunucudaki ayarlar ve ürün görselleridir, üzerine yazmayın.
3. **Plesk → Node.js → Uygulamayı Yeniden Başlat.**

## Yedekleme

- **Plesk → Yedekleme Yöneticisi** ile her gün otomatik yedek planlayın (dosyalar + veritabanı).
- Ara sıra **Veritabanları → Dışa aktar** ile bilgisayarınıza da bir kopya indirin.

## Paylaşımlı hosting'e özgü notlar

- IIS, bir süre istek gelmeyince uygulamayı uyutabilir; ilk istek birkaç saniye sürebilir. Bu, verilere zarar vermez.
- Gece gün sonu kaydı: Uygulama gece uyuyorsa, sabah ilk açıldığında eksik günler otomatik olarak kasa defterine işlenir. Kayıtlar yine doğru güne yazılır.
- `web.config` içindeki `nodeProcessCountPerApplication="1"` ayarını değiştirmeyin; anlık bildirimler tek süreçle çalışır.
- **Plesk'te aynı klasöre bakan bir "alt alan adı" (subdomain) açmayın.** İkinci bir kopya çalışır ve anlık bildirimler iki kopya arasında bölünür.

## Ek: Ayrı panel adresi (isteğe bağlı)

Paneli `panel.ozgensoykafeterya.com` adresine alıp ana adresi yalnızca menüye ayırmak için:

1. **Plesk → Alan Adı Takma Adı Ekle (Domain Alias)** → `panel.ozgensoykafeterya.com`. Takma ad aynı uygulamayı kullanır; alt alan adı değil, **takma ad** olmalıdır.
2. SSL sertifikasına bu adresi de ekleyin.
3. `backend\.env` içinde şu satırı yazın ve uygulamayı yeniden başlatın:
   ```
   MENU_HOST=ozgensoykafeterya.com,www.ozgensoykafeterya.com
   ```
4. Artık `ozgensoykafeterya.com` yalnızca QR menüyü açar, personel girişi `panel.ozgensoykafeterya.com` adresinden yapılır. QR kodları değişmez.

Plesk takma ad olarak `panel.` ile başlayan bir adı kabul etmezse bu adımı atlayın; sistem tek adresle sorunsuz çalışır.

---

Kendi Linux sunucunuza (VPS) kurmak isterseniz: `deploy/kurulum.sh` ve `DEPLOY.md`.
