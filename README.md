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
* Frontend Arayüzü: `http://localhost:5173`

---

## 📌 Varsayılan Giriş Bilgileri
Veritabanı otomatik olarak oluşturulur ve aşağıdaki kullanıcılar tanımlanır:

* **Yönetici (İşletme Sahibi):**
  * Kullanıcı Adı: `admin`
  * Şifre: `admin123`
* **Kasa Görevlisi:**
  * Kullanıcı Adı: `kasa`
  * Şifre: `kasa123`
* **Mutfak Ekranı:**
  * Kullanıcı Adı: `mutfak`
  * Şifre: `mutfak123`
