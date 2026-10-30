// Sistem Yetkileri & İzin Tanımları (Granular Permissions Catalog)
// Her modül için: Görüntüleme (view), Ekleme (create), Düzenleme (edit), Silme (delete) ve Özel yetkiler

export const PERMISSION_MODULES = [
  {
    id: 'pos',
    name: 'Masalar & Sipariş (POS)',
    description: 'Masa yönetimi, sipariş açma, ürün ekleme ve adisyon kontrolleri',
    icon: 'LayoutGrid'
  },
  {
    id: 'payment',
    name: 'Kasa & Tahsilat İşlemleri',
    description: 'Nakit, kart, veresiye tahsilatı, fiş basımı ve iade işlemleri',
    icon: 'CreditCard'
  },
  {
    id: 'customers',
    name: 'Müşteriler & Cari Defter',
    description: 'Cari hesaplar, bakiye takibi ve müşteri kartı yönetimi',
    icon: 'Users'
  },
  {
    id: 'categories',
    name: 'Kategori Yönetimi',
    description: 'Menü kategorileri, sıralama, ikon ve görsel düzenlemeleri',
    icon: 'Tags'
  },
  {
    id: 'products',
    name: 'Ürün Yönetimi',
    description: 'Ürün listesi, fiyat belirleme, reçete ve stok durumu',
    icon: 'Package'
  },
  {
    id: 'kitchen',
    name: 'Mutfak Ekranı',
    description: 'Mutfak sipariş kuyruğu, hazırlık aşamaları ve sipariş teslimi',
    icon: 'ChefHat'
  },
  {
    id: 'reports',
    name: 'Gün Sonu & Raporlar',
    description: 'Finansal özet, Z-raporu, fiş dökümü, personel karnesi ve denetim',
    icon: 'BarChart3'
  },
  {
    id: 'staff',
    name: 'Personel Yönetimi',
    description: 'Personel hesapları, kullanıcı adı, şifre ve durum kontrolleri',
    icon: 'UserCheck'
  },
  {
    id: 'roles',
    name: 'Yetki & Rol Yönetimi',
    description: 'Yeni roller oluşturma, izin matrisini belirleme ve yetkilendirme',
    icon: 'ShieldCheck'
  }
];

export const ALL_PERMISSIONS = [
  // 1. Masalar & POS
  { key: 'pos.view', label: 'Masaları & Salonu Görüntüleme', category: 'pos', action: 'view' },
  { key: 'pos.create', label: 'Yeni Masa Açma & Ürün Ekleme', category: 'pos', action: 'create' },
  { key: 'pos.edit', label: 'Masa Taşıma / Birleştirme & Not Düzenleme', category: 'pos', action: 'edit' },
  { key: 'pos.delete', label: 'Siparişi İptal Etme / Masadan Ürün Silme', category: 'pos', action: 'delete' },
  { key: 'pos.treat', label: 'İkram Tanımlama Yetkisi', category: 'pos', action: 'special' },
  { key: 'pos.discount', label: 'İndirim Uygulama Yetkisi', category: 'pos', action: 'special' },

  // 2. Kasa & Tahsilat
  { key: 'payment.view', label: 'Adisyon Tutarını & Fişleri Görme', category: 'payment', action: 'view' },
  { key: 'payment.create', label: 'Nakit & Kredi Kartı ile Hesap Kapatma', category: 'payment', action: 'create' },
  { key: 'payment.veresiye', label: 'Veresiye (Cari) Hesaba Yazdırma', category: 'payment', action: 'create' },
  { key: 'payment.mixed', label: 'Parçalı Ödeme Tahsil Etme', category: 'payment', action: 'create' },
  { key: 'payment.print', label: 'Adisyon & Müşteri Fişi Yazdırma', category: 'payment', action: 'special' },
  { key: 'payment.refund', label: 'Tahsilat İptali & İade İşlemi', category: 'payment', action: 'delete' },

  // 3. Müşteriler & Cari Defter
  { key: 'customers.view', label: 'Müşteri Listesini ve Bakiyeleri Görme', category: 'customers', action: 'view' },
  { key: 'customers.create', label: 'Yeni Müşteri / Cari Kartı Açma', category: 'customers', action: 'create' },
  { key: 'customers.edit', label: 'Müşteri Bilgilerini Düzenleme & Bakiye Tahsilatı', category: 'customers', action: 'edit' },
  { key: 'customers.delete', label: 'Müşteri Kaydını Silme', category: 'customers', action: 'delete' },

  // 4. Kategori Yönetimi
  { key: 'categories.view', label: 'Kategorileri Görüntüleme', category: 'categories', action: 'view' },
  { key: 'categories.create', label: 'Yeni Kategori Ekleme', category: 'categories', action: 'create' },
  { key: 'categories.edit', label: 'Kategori Adı, İkonu ve Sırasını Düzenleme', category: 'categories', action: 'edit' },
  { key: 'categories.delete', label: 'Kategori Silme & Pasife Alma', category: 'categories', action: 'delete' },

  // 5. Ürün Yönetimi
  { key: 'products.view', label: 'Ürün Listesini & Fiyatları Görme', category: 'products', action: 'view' },
  { key: 'products.create', label: 'Yeni Ürün Tanımlama', category: 'products', action: 'create' },
  { key: 'products.edit', label: 'Ürün Fiyatı, İçeriği ve Bilgi Güncelleme', category: 'products', action: 'edit' },
  { key: 'products.delete', label: 'Ürünü Menüden Silme', category: 'products', action: 'delete' },

  // 6. Mutfak Ekranı
  { key: 'kitchen.view', label: 'Mutfak Ekranını İzleme', category: 'kitchen', action: 'view' },
  { key: 'kitchen.edit', label: 'Siparişi Hazırlanıyor / Hazır Olarak Güncelleme', category: 'kitchen', action: 'edit' },
  { key: 'kitchen.delete', label: 'Mutfaktan Sipariş Reddi / İptal Talebi', category: 'kitchen', action: 'delete' },

  // 7. Raporlar & Finans
  { key: 'reports.view', label: 'Gün Sonu Kasa Özetini Görme', category: 'reports', action: 'view' },
  { key: 'reports.receipts', label: 'Geçmiş Adisyon & Fiş Dökümünü İnceleme', category: 'reports', action: 'view' },
  { key: 'reports.staff', label: 'Personel Satış Karnesini Görme', category: 'reports', action: 'view' },
  { key: 'reports.audit', label: 'Canlı İşlem ve Denetim Günlüğünü Görme', category: 'reports', action: 'view' },
  { key: 'reports.z_report', label: 'Z-Raporu Alma ve Yazdırma', category: 'reports', action: 'special' },

  // 8. Personel Yönetimi
  { key: 'staff.view', label: 'Personel Listesini Görüntüleme', category: 'staff', action: 'view' },
  { key: 'staff.create', label: 'Yeni Personel Hesabı Oluşturma', category: 'staff', action: 'create' },
  { key: 'staff.edit', label: 'Personel Bilgisi ve Şifresini Güncelleme', category: 'staff', action: 'edit' },
  { key: 'staff.delete', label: 'Personeli Pasife Alma & Silme', category: 'staff', action: 'delete' },

  // 9. Yetki & Rol Yönetimi
  { key: 'roles.view', label: 'Rolleri ve Yetki Listesini Görme', category: 'roles', action: 'view' },
  { key: 'roles.create', label: 'Yeni Yetki Rolü Oluşturma', category: 'roles', action: 'create' },
  { key: 'roles.edit', label: 'Rol İzinlerini ve Yetkilerini Değiştirme', category: 'roles', action: 'edit' },
  { key: 'roles.delete', label: 'Özel Rolleri Silme', category: 'roles', action: 'delete' },
];
