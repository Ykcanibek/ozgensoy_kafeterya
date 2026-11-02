// Sistem Yetkileri & İzin Kataloğu (Granular Permissions Catalog)
// Her yetki: key, label (kısa ad), description (ne işe yarar), category (modül), action (tür),
// risk ('high' = kritik / kayıp-kaçak riski taşıyan işlem), requires (önce sahip olunması gereken yetkiler)

export const PERMISSION_MODULES = [
  {
    id: 'pos',
    name: 'Masalar & Sipariş (POS)',
    description: 'Sipariş girme, adisyon kalemleri, iptal, iade ve ikram işlemleri',
    icon: 'LayoutGrid'
  },
  {
    id: 'tables',
    name: 'Salon & Masa Düzeni',
    description: 'Masa ekleme, adlandırma, sıralama ve kaldırma',
    icon: 'Armchair'
  },
  {
    id: 'payment',
    name: 'Kasa & Tahsilat',
    description: 'Nakit, kart, parçalı ve veresiye tahsilat, indirim, bahşiş ve fiş basımı',
    icon: 'CreditCard'
  },
  {
    id: 'cashbook',
    name: 'Kasa Defteri',
    description: 'İşletmenin gelir ve gider kayıtları, ana/alt kategoriler, KDV özeti ve dışa aktarma',
    icon: 'BookOpen'
  },
  {
    id: 'customers',
    name: 'Müşteriler & Cari Defter',
    description: 'Cari hesaplar, bakiye takibi, borç tahsilatı ve borç silme',
    icon: 'Users'
  },
  {
    id: 'categories',
    name: 'Kategori Yönetimi',
    description: 'Menü kategorileri, sıralama, görünürlük, ikon ve görseller',
    icon: 'Tags'
  },
  {
    id: 'products',
    name: 'Ürün & Fiyat Yönetimi',
    description: 'Ürün kartları, satış fiyatı, maliyet bilgisi ve dışa aktarma',
    icon: 'Package'
  },
  {
    id: 'waste',
    name: 'Fire & Zayi',
    description: 'Son kullanma tarihi geçen, bozulan, dökülen veya işletmede kullanılan ürün/malzeme kayıtları',
    icon: 'Trash2'
  },
  {
    id: 'kitchen',
    name: 'Mutfak Ekranı',
    description: 'Mutfak sipariş kuyruğu ve hazırlık durumları',
    icon: 'ChefHat'
  },
  {
    id: 'reports',
    name: 'Gün Sonu & Raporlar',
    description: 'Kasa özeti, geçmiş dönemler, fiş dökümü, personel karnesi ve denetim günlüğü',
    icon: 'BarChart3'
  },
  {
    id: 'staff',
    name: 'Personel Yönetimi',
    description: 'Personel hesapları, şifre işlemleri ve rol atama',
    icon: 'UserCheck'
  },
  {
    id: 'roles',
    name: 'Yetki & Rol Yönetimi',
    description: 'Rol oluşturma ve izin matrisini belirleme',
    icon: 'ShieldCheck'
  }
];

export const ALL_PERMISSIONS = [
  // 1. Masalar & Sipariş (POS)
  { key: 'pos.view', category: 'pos', action: 'view', label: 'Masaları ve açık adisyonları görüntüleme', description: 'Salon ekranını, masa durumlarını ve masadaki siparişleri görebilir.' },
  { key: 'pos.order', category: 'pos', action: 'create', label: 'Sipariş girme / masaya ürün ekleme', description: 'Masaya ürün ekleyip siparişi mutfağa gönderebilir.', requires: ['pos.view'] },
  { key: 'pos.item_edit', category: 'pos', action: 'edit', label: 'Sipariş kaleminin adet ve notunu düzenleme', description: 'Ödenmemiş kalemin notunu, mutfakta hazırlanmaya başlamamışsa adedini değiştirebilir. Her değişiklik işlem günlüğüne yazılır.', requires: ['pos.view'] },
  { key: 'pos.deliver', category: 'pos', action: 'edit', label: 'Ürünü teslim edildi olarak işaretleme', description: 'Servis edilen ürünleri masada "Teslim Edildi" durumuna alabilir.', requires: ['pos.view'] },
  { key: 'pos.transfer', category: 'pos', action: 'edit', label: 'Masa taşıma / birleştirme', description: 'Açık adisyonu başka bir masaya taşıyabilir veya masaları birleştirebilir.', requires: ['pos.view'] },
  { key: 'pos.item_delete', category: 'pos', action: 'delete', label: 'Masadan ürün silme', description: 'Mutfakta hazırlanmaya başlamamış, ödenmemiş bir kalemi adisyondan kaldırabilir. Hazırlanan ürünler için İptal kullanılır.', risk: 'high', requires: ['pos.view'] },
  { key: 'pos.cancel', category: 'pos', action: 'delete', label: 'Ürün iptali', description: 'Kalemi "İptal" olarak işaretler; tutar adisyondan düşer ve raporda zayi olarak görünür.', risk: 'high', requires: ['pos.view'] },
  { key: 'pos.return', category: 'pos', action: 'delete', label: 'Ürün iadesi', description: 'Kalemi "İade" olarak işaretler; tutar adisyondan düşer.', risk: 'high', requires: ['pos.view'] },
  { key: 'pos.treat', category: 'pos', action: 'special', label: 'İkram tanımlama', description: 'Kalemi ücretsiz (ikram) yapabilir.', risk: 'high', requires: ['pos.view'] },
  { key: 'pos.close_empty', category: 'pos', action: 'special', label: 'Masayı ödemesiz kapatma / boşaltma', description: 'Tahsilat almadan masayı boşaltabilir.', risk: 'high', requires: ['pos.view'] },

  // 2. Salon & Masa Düzeni
  { key: 'tables.create', category: 'tables', action: 'create', label: 'Yeni masa ekleme', description: 'Salona yeni masa tanımlayabilir.', requires: ['pos.view'] },
  { key: 'tables.edit', category: 'tables', action: 'edit', label: 'Masa adı ve sıralamasını düzenleme', description: 'Masaları yeniden adlandırabilir ve sürükle-bırak ile sıralayabilir.', requires: ['pos.view'] },
  { key: 'tables.delete', category: 'tables', action: 'delete', label: 'Masa kaldırma', description: 'Boş bir masayı salondan kaldırabilir (geçmiş kayıtları korunur).', requires: ['pos.view'] },

  // 3. Kasa & Tahsilat
  { key: 'payment.view', category: 'payment', action: 'view', label: 'Adisyon tutarını ve tahsilat geçmişini görme', description: 'Hesap ekranını, kalan tutarı ve masadaki önceki tahsilatları görebilir.', requires: ['pos.view'] },
  { key: 'payment.cash_card', category: 'payment', action: 'create', label: 'Nakit / kredi kartı ile tahsilat', description: 'Hesabı nakit veya kartla kapatabilir.', requires: ['payment.view'] },
  { key: 'payment.split', category: 'payment', action: 'create', label: 'Parçalı ve kısmi ödeme alma', description: 'Ürün seçerek veya tutar bölerek kısmi ve karma tahsilat yapabilir.', requires: ['payment.cash_card'] },
  { key: 'payment.veresiye', category: 'payment', action: 'create', label: 'Veresiye (cari hesaba) yazma', description: 'Hesabı müşterinin cari hesabına borç olarak kaydedebilir.', risk: 'high', requires: ['payment.view', 'customers.view'] },
  { key: 'payment.discount', category: 'payment', action: 'special', label: 'İndirim uygulama', description: 'Tahsilatta indirim yapabilir. Rolün indirim üst sınırı ile kısıtlanabilir.', risk: 'high', requires: ['payment.view'] },
  { key: 'payment.tip', category: 'payment', action: 'special', label: 'Bahşiş girme', description: 'Tahsilata bahşiş tutarı ekleyebilir.', requires: ['payment.view'] },
  { key: 'payment.print', category: 'payment', action: 'special', label: 'Adisyon ve müşteri fişi yazdırma', description: 'Masa adisyonunu ve müşteri fişini yazdırabilir.', requires: ['payment.view'] },

  // 3b. Kasa Defteri
  { key: 'cashbook.view', category: 'cashbook', action: 'view', label: 'Kasa defterini görüntüleme', description: 'Gelir/gider kayıtlarını, kasa bakiyesini, kategori ve KDV özetlerini görebilir.' },
  { key: 'cashbook.create', category: 'cashbook', action: 'create', label: 'Gelir / gider kaydı girme', description: 'Kasa defterine yeni gelir veya gider kaydı ekleyebilir.', requires: ['cashbook.view'] },
  { key: 'cashbook.edit', category: 'cashbook', action: 'edit', label: 'Kayıt düzenleme ve kategori yönetimi', description: 'Girilmiş kayıtları düzeltebilir; ana ve alt gelir/gider kategorilerini ekleyip düzenleyebilir. Her değişiklik işlem günlüğüne yazılır.', risk: 'high', requires: ['cashbook.view'] },
  { key: 'cashbook.delete', category: 'cashbook', action: 'delete', label: 'Kayıt silme', description: 'Hatalı kaydı gerekçe yazarak iptal edebilir (kayıt arşivlenir ve işlem günlüğüne yazılır).', risk: 'high', requires: ['cashbook.view'] },
  { key: 'cashbook.export', category: 'cashbook', action: 'special', label: 'Kasa defterini Excel’e aktarma', description: 'Filtrelenmiş kayıtları, kategori ve KDV özetini Excel dosyası olarak indirebilir (mali müşavire gönderim için).', requires: ['cashbook.view'] },

  // 4. Müşteriler & Cari Defter
  { key: 'customers.view', category: 'customers', action: 'view', label: 'Müşteri listesini ve bakiyeleri görme', description: 'Cari kartları, bakiyeleri ve hesap hareketlerini görebilir.' },
  { key: 'customers.create', category: 'customers', action: 'create', label: 'Yeni müşteri / cari kart açma', description: 'Yeni müşteri kaydı oluşturabilir.', requires: ['customers.view'] },
  { key: 'customers.edit', category: 'customers', action: 'edit', label: 'Müşteri bilgilerini düzenleme', description: 'Ad, telefon ve not bilgilerini güncelleyebilir.', requires: ['customers.view'] },
  { key: 'customers.collect', category: 'customers', action: 'create', label: 'Cari borç tahsilatı', description: 'Müşterinin açık borcuna karşılık tahsilat alabilir.', requires: ['customers.view'] },
  { key: 'customers.debt_reset', category: 'customers', action: 'delete', label: 'Borç silme / sıfırlama', description: 'Müşterinin açık borcunu tahsilat almadan sıfırlayabilir.', risk: 'high', requires: ['customers.view'] },
  { key: 'customers.delete', category: 'customers', action: 'delete', label: 'Müşteriyi arşivleme', description: 'Borcu olmayan müşteriyi pasife alabilir.', requires: ['customers.view'] },

  // 5. Kategori Yönetimi
  { key: 'categories.view', category: 'categories', action: 'view', label: 'Kategorileri görüntüleme', description: 'Kategori yönetim sayfasını ve değişiklik geçmişini görebilir.' },
  { key: 'categories.create', category: 'categories', action: 'create', label: 'Yeni kategori ekleme', description: 'Yeni menü kategorisi oluşturabilir.', requires: ['categories.view'] },
  { key: 'categories.edit', category: 'categories', action: 'edit', label: 'Kategori düzenleme, sıralama ve görünürlük', description: 'Ad, ikon, görsel, sıra, aktif/pasif ve QR menü görünürlüğünü değiştirebilir.', requires: ['categories.view'] },
  { key: 'categories.delete', category: 'categories', action: 'delete', label: 'Kategori silme', description: 'İçinde ürün olmayan kategoriyi silebilir.', requires: ['categories.view'] },

  // 6. Ürün & Fiyat Yönetimi
  { key: 'products.view', category: 'products', action: 'view', label: 'Ürün listesini görüntüleme', description: 'Ürün yönetim sayfasını ve değişiklik geçmişini görebilir.' },
  { key: 'products.create', category: 'products', action: 'create', label: 'Yeni ürün tanımlama', description: 'Menüye yeni ürün ekleyebilir.', requires: ['products.view'] },
  { key: 'products.edit', category: 'products', action: 'edit', label: 'Ürün bilgilerini düzenleme', description: 'Ad, açıklama, içerik, görsel, sıra ve görünürlüğü değiştirebilir (fiyat hariç).', requires: ['products.view'] },
  { key: 'products.price', category: 'products', action: 'edit', label: 'Satış fiyatını değiştirme', description: 'Ürünlerin satış fiyatını güncelleyebilir.', risk: 'high', requires: ['products.edit'] },
  { key: 'products.view_cost', category: 'products', action: 'view', label: 'Maliyet fiyatını görme', description: 'Ürünlerin maliyet fiyatını ve kâr marjını görebilir.', requires: ['products.view'] },
  { key: 'products.export', category: 'products', action: 'special', label: 'Ürün listesini Excel’e aktarma', description: 'Menüyü Excel dosyası olarak indirebilir.', requires: ['products.view'] },
  { key: 'products.delete', category: 'products', action: 'delete', label: 'Ürünü menüden silme', description: 'Ürünü menüden kaldırabilir (geçmiş satışlar korunur).', requires: ['products.view'] },

  // 6b. Fire & Zayi
  { key: 'waste.view', category: 'waste', action: 'view', label: 'Fire & zayi kayıtlarını görüntüleme', description: 'Fire & Zayi sayfasını ve girilen kayıtları görebilir (maliyet tutarları yalnızca maliyet görme yetkisiyle).' },
  { key: 'waste.create', category: 'waste', action: 'create', label: 'Fire & zayi kaydı girme', description: 'SKT geçen, bozulan, dökülen veya işletmede kullanılan ürün/malzemeyi kaydedebilir.', requires: ['waste.view'] },
  { key: 'waste.delete', category: 'waste', action: 'delete', label: 'Fire & zayi kaydını silme', description: 'Hatalı girilen kaydı kaldırabilir (kayıt arşivlenir ve işlem günlüğüne yazılır).', risk: 'high', requires: ['waste.view'] },

  // 7. Mutfak Ekranı
  { key: 'kitchen.view', category: 'kitchen', action: 'view', label: 'Mutfak ekranını izleme', description: 'Mutfak sipariş kuyruğunu görebilir.' },
  { key: 'kitchen.update', category: 'kitchen', action: 'edit', label: 'Hazırlık durumunu güncelleme', description: 'Siparişleri Hazırlanıyor / Hazır / Teslim Edildi olarak işaretleyebilir.', requires: ['kitchen.view'] },

  // 8. Gün Sonu & Raporlar
  { key: 'reports.view', category: 'reports', action: 'view', label: 'Günlük kasa özetini görme', description: 'Bugünün ciro, tahsilat ve satış özetini görebilir.' },
  { key: 'reports.history', category: 'reports', action: 'view', label: 'Geçmiş dönem raporlarını görme', description: 'Dün, hafta, ay ve özel tarih aralıklarındaki raporlara erişebilir.', requires: ['reports.view'] },
  { key: 'reports.receipts', category: 'reports', action: 'view', label: 'Adisyon ve fiş dökümünü inceleme', description: 'Kapanan fişleri ve kalem detaylarını görebilir.', requires: ['reports.view'] },
  { key: 'reports.staff', category: 'reports', action: 'view', label: 'Personel satış karnesini görme', description: 'Personel bazlı ciro ve tahsilat performansını görebilir.', requires: ['reports.view'] },
  { key: 'reports.treats', category: 'reports', action: 'view', label: 'İkram, iade ve iptal raporunu görme', description: 'Personel bazlı zayi ve ikram takibini görebilir.', requires: ['reports.view'] },
  { key: 'reports.audit', category: 'reports', action: 'view', label: 'Denetim ve işlem günlüğünü görme', description: 'Sistemde kim, ne zaman, ne yaptı kayıtlarını görebilir.', requires: ['reports.view'] },
  { key: 'reports.z_report', category: 'reports', action: 'special', label: 'Z-raporu alma ve yazdırma', description: 'Gün sonu Z-raporunu oluşturup yazdırabilir.', requires: ['reports.view'] },

  // 9. Personel Yönetimi
  { key: 'staff.view', category: 'staff', action: 'view', label: 'Personel listesini görüntüleme', description: 'Personel hesaplarını ve durumlarını görebilir.' },
  { key: 'staff.create', category: 'staff', action: 'create', label: 'Yeni personel hesabı oluşturma', description: 'Yeni kullanıcı hesabı açabilir.', requires: ['staff.view'] },
  { key: 'staff.edit', category: 'staff', action: 'edit', label: 'Personel bilgisi ve şifresini güncelleme', description: 'Ad, telefon, kullanıcı adı ve şifreyi değiştirebilir; hesabı aktif/pasif yapabilir.', risk: 'high', requires: ['staff.view'] },
  { key: 'staff.assign_role', category: 'staff', action: 'special', label: 'Personele rol atama', description: 'Personelin rolünü (dolayısıyla yetkilerini) değiştirebilir.', risk: 'high', requires: ['staff.view', 'roles.view'] },
  { key: 'staff.delete', category: 'staff', action: 'delete', label: 'Personel hesabını silme', description: 'İşlem geçmişi olmayan hesabı kalıcı olarak silebilir (geçmişi olanlar yalnızca pasife alınır).', risk: 'high', requires: ['staff.view'] },

  // 10. Yetki & Rol Yönetimi
  { key: 'roles.view', category: 'roles', action: 'view', label: 'Rolleri ve yetki matrisini görme', description: 'Rolleri ve hangi yetkilere sahip olduklarını görebilir.' },
  { key: 'roles.create', category: 'roles', action: 'create', label: 'Yeni rol oluşturma', description: 'Yeni yetki rolü tanımlayabilir.', risk: 'high', requires: ['roles.view'] },
  { key: 'roles.edit', category: 'roles', action: 'edit', label: 'Rol yetkilerini değiştirme', description: 'Rollerin izinlerini ve limitlerini düzenleyebilir.', risk: 'high', requires: ['roles.view'] },
  { key: 'roles.delete', category: 'roles', action: 'delete', label: 'Özel rolleri silme', description: 'Personel atanmamış özel rolleri silebilir.', risk: 'high', requires: ['roles.view'] }
].map(p => ({ risk: 'normal', requires: [], ...p }));

export const PERMISSION_KEYS = new Set(ALL_PERMISSIONS.map(p => p.key));
const PERMISSION_BY_KEY = new Map(ALL_PERMISSIONS.map(p => [p.key, p]));

/**
 * Geçersiz anahtarları atar ve her yetkinin ön koşullarını (requires) otomatik ekler.
 * Örn: ['products.price'] -> ['products.price', 'products.edit', 'products.view']
 */
export function normalizePermissions(keys = []) {
  const result = new Set();
  const visit = (key) => {
    if (!PERMISSION_KEYS.has(key) || result.has(key)) return;
    result.add(key);
    PERMISSION_BY_KEY.get(key).requires.forEach(visit);
  };
  keys.forEach(visit);
  return [...result];
}

/**
 * Eski katalog anahtarlarının yeni karşılıkları (mevcut rollerin yetki kaybetmemesi için tek seferlik taşıma).
 */
export const LEGACY_PERMISSION_MAP = {
  'pos.create': ['pos.order'],
  'pos.edit': ['pos.item_edit', 'pos.deliver', 'pos.transfer', 'tables.edit'],
  'pos.delete': ['pos.item_delete', 'pos.cancel'],
  'pos.discount': ['payment.discount'],
  'payment.create': ['payment.cash_card', 'payment.tip'],
  'payment.mixed': ['payment.split'],
  'payment.refund': ['pos.return'],
  'customers.edit': ['customers.edit', 'customers.collect'],
  'products.edit': ['products.edit', 'products.price', 'products.export'],
  'products.view': ['products.view', 'products.view_cost'],
  'kitchen.edit': ['kitchen.update'],
  'kitchen.delete': [],
  'reports.view': ['reports.view', 'reports.history'],
  'reports.staff': ['reports.staff', 'reports.treats'],
  'reports.audit': ['reports.audit', 'reports.treats']
};

/**
 * Varsayılan sistem rolleri (ilk kurulumda oluşturulur).
 * 'admin' rolü her zaman tüm yetkilere sahiptir ve yetkileri değiştirilemez.
 */
export const DEFAULT_ROLES = [
  {
    name: 'İşletme Sahibi',
    slug: 'admin',
    description: 'Tüm sisteme tam erişim. Bu rolün yetkileri kısıtlanamaz.',
    color: '#b45309',
    permissions: ALL_PERMISSIONS.map(p => p.key)
  },
  {
    name: 'Kasa Personeli',
    slug: 'cashier',
    description: 'Hesap kapatma, ödeme alma, fiş basımı, cari tahsilat ve günlük kasa özeti',
    color: '#0284c7',
    max_discount_percent: 10,
    permissions: [
      'pos.view', 'pos.order', 'pos.item_edit', 'pos.deliver', 'pos.transfer',
      'payment.view', 'payment.cash_card', 'payment.split', 'payment.veresiye', 'payment.discount', 'payment.tip', 'payment.print',
      'customers.view', 'customers.create', 'customers.edit', 'customers.collect',
      'categories.view', 'products.view',
      'waste.view', 'waste.create',
      'reports.view', 'reports.receipts', 'reports.z_report',
      'cashbook.view', 'cashbook.create'
    ]
  },
  {
    name: 'Garson',
    slug: 'waiter',
    description: 'Sipariş girme, adisyon takibi, servis ve masa taşıma',
    color: '#059669',
    permissions: [
      'pos.view', 'pos.order', 'pos.item_edit', 'pos.deliver', 'pos.transfer',
      'payment.view', 'payment.print',
      'customers.view',
      'waste.view', 'waste.create'
    ]
  },
  {
    name: 'Mutfak',
    slug: 'kitchen',
    description: 'Mutfak sipariş kuyruğunu görme ve hazırlık durumunu güncelleme',
    color: '#ea580c',
    permissions: ['kitchen.view', 'kitchen.update', 'waste.view', 'waste.create']
  }
];
