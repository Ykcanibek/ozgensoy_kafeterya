// Uygulama sayfaları ve her sayfayı açmak için gereken yetkiler (en az biri yeterli).
// Menü, rota korumaları ve giriş sonrası yönlendirme bu listeyi kullanır.
export const PAGES = [
  { path: '/pos', label: 'Masalar & POS', permissions: ['pos.view'] },
  { path: '/mutfak', label: 'Mutfak Ekranı', permissions: ['kitchen.view'] },
  { path: '/musteriler', label: 'Müşteriler & Cari', permissions: ['customers.view'] },
  { path: '/kasa-defteri', label: 'Kasa Defteri', permissions: ['cashbook.view'] },
  { path: '/kategoriler', label: 'Kategori Yönetimi', permissions: ['categories.view'] },
  { path: '/urunler', label: 'Ürün Yönetimi', permissions: ['products.view'] },
  { path: '/fire-zayi', label: 'Fire & Zayi', permissions: ['waste.view'] },
  { path: '/raporlar', label: 'Gün Sonu & Raporlar', permissions: ['reports.view'] },
  { path: '/personel', label: 'Personel Yönetimi', permissions: ['staff.view'] },
  { path: '/yetkiler', label: 'Yetki & Rol Yönetimi', permissions: ['roles.view'] }
];

export const pagePermissions = (path) => PAGES.find(p => p.path === path)?.permissions || [];

// Kullanıcının açabildiği ilk sayfa (giriş sonrası ve yetkisiz sayfa denemelerinde kullanılır)
export const firstAllowedPath = (canAny) => PAGES.find(p => canAny(p.permissions))?.path || null;
