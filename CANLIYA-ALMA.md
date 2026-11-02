# Canlıya Alma — Veridyen VPS + ozgensoykafeterya.com

Sistem Veridyen'den alınan bir **sunucuda (VPS)** çalışır. Kafedeki laptop, tablet ve telefonlar yalnızca tarayıcıdan bağlanır.
Kafede elektrik ya da internet kesilse bile veriler sunucuda güvende kalır, müşterinin QR menüsü açılmaya devam eder.

| Adres | Ne açılır | Kim kullanır |
|---|---|---|
| `https://panel.ozgensoykafeterya.com` | Personel paneli (giriş ekranı) | Personel |
| `https://ozgensoykafeterya.com` | Yalnızca QR menü | Müşteri telefonları (masadaki QR) |

> Menü adresinden personel girişi ve personel API'si **kapalıdır**. Müşteri, QR adresini değiştirerek panele ulaşamaz.

---

## 1. Veridyen'den satın alınacaklar

1. **Alan adı:** `ozgensoykafeterya.com`
2. **Sunucu:** **VPS** (sanal sunucu) paketi. En küçük paket yeterlidir: 1–2 çekirdek, **en az 2 GB RAM**, 20 GB+ disk.
   - İşletim sistemi olarak **Ubuntu 22.04 veya 24.04** seçin.
   - Sunucu konumu Türkiye olursa daha hızlı olur.
   - **"Web hosting / paylaşımlı hosting / cPanel" paketi almayın.** Bu sistemde sürekli çalışan bir Node.js sunucusu, anlık bildirimler ve gece otomatik gün sonu var; paylaşımlı hosting bunları desteklemez.
3. Satın alınca Veridyen e-postayla şu bilgileri gönderir: sunucunun **IP adresi**, kullanıcı (`root`) ve şifresi.

## 2. Alan adını sunucuya yönlendirin (DNS)

Veridyen müşteri panelinde **Alan Adlarım → ozgensoykafeterya.com → DNS Yönetimi** bölümüne üç **A kaydı** ekleyin:

| Ad (Host) | Tür | Değer |
|---|---|---|
| `@` | A | sunucunun IP adresi |
| `www` | A | sunucunun IP adresi |
| `panel` | A | sunucunun IP adresi |

Kayıtların yayılması birkaç dakika ile birkaç saat arasında sürer. Komut isteminde `ping panel.ozgensoykafeterya.com` yazdığınızda sunucunun IP'si görünüyorsa hazırdır.

## 3. Proje dosyalarını sunucuya yükleyin

Veritabanı sunucuda **sıfırdan** kurulur; laptoptaki veriler (örnek satışlar, kasa kayıtları vb.) taşınmaz.

**WinSCP** (ücretsiz) ile sunucuya bağlanın (IP, `root`, şifre). `/var/www/ozgensoy` klasörünü oluşturup proje dosyalarını içine kopyalayın. Şunları **kopyalamayın**:

| Kopyalamayın | Neden |
|---|---|
| `backend/node_modules`, `frontend/node_modules`, `frontend/dist` | Sunucu kendisi kurar ve derler |
| `backend/.env`, `frontend/.env` | Sunucu kendi ayarlarını ve şifrelerini üretir |
| `backend/uploads` içindeki görseller, `backend/backups` | Laptoptaki deneme verilerine ait |
| `backend/sample-*.json` | Örnek veri listeleri |

## 4. Sunucuda tek komutla kurulum

WinSCP'de **Komutlar → PuTTY'yi aç** seçin (ya da Windows'ta `ssh root@<IP>`). Ardından şunu çalıştırın:

```
cd /var/www/ozgensoy
sudo bash deploy/kurulum.sh eposta@adresiniz.com
```

Betik sırasıyla şunları yapar:

- Node.js, MySQL ve Nginx kurar; sunucu saatini İstanbul'a ayarlar.
- Boş veritabanını ve bu sisteme ait ayrı bir veritabanı kullanıcısını, rastgele güçlü bir şifreyle oluşturur.
- Canlı ayarları yazar (`backend/.env`, `frontend/.env`) ve arayüzü derler.
- Sunucu ilk açılışta bütün tabloları kendisi oluşturur. Yanında yetki rolleri, kasa defteri kategorileri, 12 masa, birkaç örnek ürün ve gizli geliştirici hesabı da gelir. Satış ve kasa kaydı olmaz.
- **Geliştirici hesabının şifresini ekrana bir kez yazar** (`superadmin / ...`). Bu şifreyi not alın.
- Sunucuyu **sistem hizmeti** olarak başlatır. Çökerse ya da VPS yeniden başlarsa kendiliğinden açılır.
- **HTTPS (SSL kilidi)** sertifikasını ücretsiz Let's Encrypt'ten alır ve otomatik yeniler. E-posta adresi, sertifika süresi dolmadan gelecek uyarılar içindir.
- Her gece **03:00'te veritabanı yedeği** alır (`backend/backups`, son 30 gün).
- Güvenlik duvarında yalnızca SSH, HTTP ve HTTPS'i açık bırakır.

En sonda `Kurulum tamam` yazısı çıkar.

> "SSL alınamadı" yazarsa DNS kayıtları henüz yayılmamıştır. Biraz bekleyip ekrandaki `certbot` komutunu tekrar çalıştırın.

## 5. Kontrol

Telefonun mobil verisiyle (Wi‑Fi kapalı) deneyin:

- `https://panel.ozgensoykafeterya.com` → giriş ekranı açılmalı. Kurulumun verdiği `superadmin` şifresiyle girin.
- `https://ozgensoykafeterya.com` → "QR kodu okutun" ekranı açılmalı.

## 6. QR kodları ve açılış

1. Panelden işletmeyi hazırlayın:
   - Personel hesaplarını açın.
   - Örnek ürünleri silin ya da düzenleyin, gerçek ürünleri ve görsellerini girin.
   - Masaları son hâline getirin (ad/numara; varsayılan 12 masa gelir).
2. **Masalar → QR** ekranından QR kodlarını yazdırın ve masalara yapıştırın. Bir tanesini telefonla okutup test edin.
   - Masa adını/numarasını değiştirmek QR'ı bozmaz.
   - **Masayı silmek** o masanın QR'ını geçersiz yapar; masaları silmeyin.
3. Bir deneme siparişi verin: QR okut → sipariş ver → panelde onayla → mutfakta görün → hesabı kapat.
4. Geliştirici (superadmin) ve personel şifrelerini güçlü şifrelerle değiştirin.

> Laptoptaki sistem bundan sonra kullanılmamalı. Aksi hâlde siparişler iki ayrı yere kaydedilir.

## Bakım

| Ne zaman | Ne yapılır |
|---|---|
| Kodda değişiklik geldiğinde | Dosyaları WinSCP ile yükleyin, sonra `sudo bash /var/www/ozgensoy/deploy/guncelle.sh` |
| Sunucu durumu | `systemctl status ozgensoy` |
| Hata kayıtları | `journalctl -u ozgensoy -n 100` |
| Yeniden başlatma | `sudo systemctl restart ozgensoy` |
| Elle yedek | `cd /var/www/ozgensoy/backend && sudo -u kafe node scripts/backup.js` |
| Yedeği geri yükleme | `mysql kafe_otomasyon < backend/backups/<dosya>.sql` |

- **Yedekleri ara sıra sunucu dışına indirin** (WinSCP ile `backend/backups` klasöründen). Veridyen'in ücretli "VPS yedekleme" seçeneği de ek güvence sağlar.
- Gece 00:00'dan sonra günlük ciro kasa defterine otomatik işlenir. Sunucu o saatte kapalıysa açıldığında eksik günler kendiliğinden kapatılır.

## Teknik notlar

- Nginx yalnızca HTTPS'i karşılar ve her şeyi Node sunucusuna (`127.0.0.1:5000`) iletir (`deploy/nginx.conf`). Node, derlenmiş arayüzü (`frontend/dist`) kendisi sunar: `/m/<anahtar>` QR menüyü, diğer adresler paneli açar.
- Menü alan adı kısıtı `backend/.env` içindeki `MENU_HOST=ozgensoykafeterya.com,www.ozgensoykafeterya.com` ayarıyla yapılır.
- QR adresi `frontend/.env` içindeki `VITE_MENU_URL=https://ozgensoykafeterya.com` ile belirlenir. Değiştirilirse arayüz yeniden derlenmeli ve QR'lar yeniden yazdırılmalıdır.
