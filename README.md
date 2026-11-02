# Kafe & Restoran POS Otomasyon Sistemi

Özgensoy Kafeterya için geliştirilmiş tam teşekküllü Kafe & Restoran POS Otomasyon Sistemi.

## 🚀 Hızlı Başlangıç (Evde Kurulum Adımları)

### 1. Depoyu İndirin (Clone)
```bash
git clone <github-repo-url>
cd Kafe_Otomasyon_Proje
```

### 2. Backend Kurulumu & Çalıştırma
```bash
cd backend
npm install

# .env dosyasını oluşturun (örnek şablondan)
cp .env.example .env
# Not: .env dosyasındaki DB_PASSWORD ve veritabanı ayarlarınızı yerel MySQL şifrenize göre düzenleyin.

# Backend sunucusunu başlatın
npm run dev
# veya: node src/server.js
```
* Backend API: `http://localhost:5000`

### 3. Frontend Kurulumu & Çalıştırma
```bash
cd ../frontend
npm install

# Frontend geliştirici sunucusunu başlatın
npm run dev
```
* Frontend Arayüzü: `http://localhost:3000`

---

## 📌 İlk Giriş
Kullanıcı tablosu boşsa sistem ilk açılışta yalnızca `backend/.env` içindeki `DEV_ACCOUNT_*` bilgileriyle gizli bir geliştirici hesabı oluşturur (yönetici yetkisinde, personel listesinde görünmez).
İşletme sahibi ve personel hesapları bu hesapla giriş yapılıp **Personel Yönetimi** sayfasından oluşturulur.

---

## 🧪 Testler
Sipariş ve ödeme akışları gerçek API üzerinden test edilir. Testler geçici, ayrı bir veritabanı açar ve bitince siler; gerçek verilere dokunmaz (MySQL çalışıyor olmalı).
```bash
npm --prefix backend test
```

## 💾 Veritabanı Yedeği
```bash
npm --prefix backend run backup
```
Yedek `backend/backups/` klasörüne tarihli `.sql` dosyası olarak yazılır; en yeni 30 yedek tutulur (`BACKUP_KEEP` ile değiştirilebilir).
`mysqldump` bulunamazsa `backend/.env` içine `MYSQLDUMP_PATH` ekleyin. Her gün otomatik yedek için bu komutu Windows Görev Zamanlayıcı'ya ekleyin.
Geri yükleme: `mysql -u root -p kafe_otomasyon < backend/backups/<dosya>.sql`
