import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import HistoryModal from './HistoryModal';
import { 
  Plus, 
  Search, 
  GripVertical, 
  Edit3, 
  Trash2, 
  Upload, 
  X, 
  Check, 
  AlertTriangle, 
  Coffee, 
  Utensils,
  Image as ImageIcon,
  Tags,
  Package,
  Layers,
  Sparkles,
  Camera,
  Coins,
  FileText,
  AlignLeft,
  ChevronDown,
  QrCode,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  History,
  User,
  Clock,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Sürükle ve Bırak Durumları - Sadece sol tutamaçtan basılı tutulduğunda aktif olur
  const [dragAllowedId, setDragAllowedId] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [isReordering, setIsReordering] = useState(false);

  // Ekleme / Düzenleme Modal Durumları
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [formName, setFormName] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCostPrice, setFormCostPrice] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIngredients, setFormIngredients] = useState('');
  const [formStatus, setFormStatus] = useState(1); // 1: Aktif, 0: Pasif
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Silme Onay Modal Durumu
  const [deleteModalProduct, setDeleteModalProduct] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Ürün Hareket Geçmişi Modal Durumu
  const [historyModalProduct, setHistoryModalProduct] = useState(null);
  const [productHistory, setProductHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Excel Dışa Aktarma Modal Durumu
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportSelectedCategories, setExportSelectedCategories] = useState([]);
  const [exportSelectedColumns, setExportSelectedColumns] = useState({
    category: true,
    price: true,
    cost_price: false, // Maliyet varsayılan olarak kapalı (kullanıcı isterse açabilir)
    status: true,
    show_in_qr: true,
    description: true,
    ingredients: true
  });

  // Bildirim Toast mesajı ({ message, type: 'success' | 'danger' | 'info' })
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  };

  // Excel Dışa Aktarma Modalı Aç (Tüm kategoriler varsayılan seçili gelir)
  const handleOpenExportModal = () => {
    setExportSelectedCategories(categories.map(c => c.id));
    setIsExportModalOpen(true);
  };

  const handleSelectAllCategories = () => {
    setExportSelectedCategories(categories.map(c => c.id));
  };

  const handleDeselectAllCategories = () => {
    setExportSelectedCategories([]);
  };

  const handleToggleCategory = (catId) => {
    setExportSelectedCategories(prev =>
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  const handleToggleColumn = (colKey) => {
    setExportSelectedColumns(prev => ({
      ...prev,
      [colKey]: !prev[colKey]
    }));
  };

  // Seçilen Kategori ve Kolon Filtreleriyle Excel Dosyasını İndir
  const handleExecuteExportExcel = async () => {
    if (exportSelectedCategories.length === 0) {
      showToast('Lütfen dışa aktarmak için en az bir kategori seçin.', 'danger');
      return;
    }

    try {
      setIsExporting(true);
      showToast('Excel dosyası hazırlanıyor...', 'info');

      const response = await fetch('/api/products/export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          category_ids: exportSelectedCategories,
          columns: exportSelectedColumns
        })
      });

      if (!response.ok) {
        throw new Error('Dosya indirilemedi.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Kafe_Urun_Listesi_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setIsExportModalOpen(false);
      showToast('Ürün listesi Excel olarak başarıyla indirildi.', 'success');
    } catch (err) {
      console.error('Excel indirme hatası:', err);
      showToast('Excel dosyası indirilemedi: ' + err.message, 'danger');
    } finally {
      setIsExporting(false);
    }
  };

  // Ürünleri sunucudan getir
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error('Ürünler yüklenirken hata oluştu:', err);
      showToast('Ürünler yüklenemedi. Lütfen sunucuyu kontrol edin.');
    } finally {
      setLoading(false);
    }
  };

  // Aktif kategorileri sunucudan getir (Dropdown ve Filtre için)
  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Kategoriler yüklenirken hata:', err);
    }
  };

  // Socket.io Gerçek Zamanlı Senkronizasyon
  useEffect(() => {
    fetchProducts();
    fetchCategories();

    const socket = io();

    socket.on('product:created', (newProd) => {
      setProducts(prev => {
        if (prev.some(p => p.id === newProd.id)) return prev;
        return [newProd, ...prev];
      });
    });

    socket.on('product:updated', (updatedProd) => {
      setProducts(prev => prev.map(p => p.id === updatedProd.id ? { ...p, ...updatedProd } : p));
    });

    socket.on('product:deleted', ({ id }) => {
      setProducts(prev => prev.filter(p => p.id !== id));
    });

    socket.on('products:reordered', ({ orderedIds }) => {
      setProducts(prev => {
        const map = new Map(prev.map(p => [p.id, p]));
        const reordered = [];
        orderedIds.forEach(id => {
          if (map.has(id)) {
            reordered.push(map.get(id));
            map.delete(id);
          }
        });
        map.forEach(item => reordered.push(item));
        return reordered;
      });
    });

    // Kategori güncellenirse (adı değişti vs.) tekrar çek
    socket.on('category:updated', () => fetchCategories());
    socket.on('category:created', () => fetchCategories());
    socket.on('category:deleted', () => fetchCategories());

    return () => {
      socket.disconnect();
    };
  }, []);

  // Modal açıkken arkaplandaki sayfanın kaymasını engelle (Scroll Lock)
  useEffect(() => {
    if (modalMode || deleteModalProduct || isExportModalOpen || historyModalProduct) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [modalMode, deleteModalProduct, isExportModalOpen, historyModalProduct]);

  // Ürün Geçmişi Modalı Aç
  const handleOpenHistoryModal = async (prod) => {
    setHistoryModalProduct(prod);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/products/${prod.id}/history`);
      const data = await res.json();
      if (data.success) {
        setProductHistory(data.history || []);
      } else {
        showToast(data.message || 'Ürün geçmişi yüklenemedi.', 'danger');
      }
    } catch (err) {
      console.error('Ürün geçmişi yükleme hatası:', err);
      showToast('Ürün geçmişi yüklenirken hata oluştu.', 'danger');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCloseHistoryModal = () => {
    setHistoryModalProduct(null);
    setProductHistory([]);
  };

  // Modal Aç: Yeni Ürün
  const handleOpenAddModal = () => {
    setModalMode('add');
    setSelectedProduct(null);
    setFormName('');
    // Kategori alanı başlangıçta BOŞ gelsin, kullanıcı kendisi seçsin
    setFormCategoryId('');
    setFormPrice('');
    setFormCostPrice('');
    setFormDescription('');
    setFormIngredients('');
    setFormStatus(1);
    setImageFile(null);
    setImagePreview(null);
    setRemoveExistingImage(false);
  };

  // Modal Aç: Ürün Düzenle
  const handleOpenEditModal = (product) => {
    setModalMode('edit');
    setSelectedProduct(product);
    setFormName(product.name || '');
    setFormCategoryId(product.category_id ? product.category_id.toString() : '');
    setFormPrice(product.price ? product.price.toString() : '');
    setFormCostPrice(product.cost_price ? product.cost_price.toString() : '');
    setFormDescription(product.description || '');
    setFormIngredients(product.ingredients || '');
    setFormStatus(product.status !== undefined ? product.status : 1);
    setImageFile(null);
    setImagePreview(product.image_url || null);
    setRemoveExistingImage(false);
  };

  const handleCloseModal = () => {
    setModalMode(null);
    setSelectedProduct(null);
    setImageFile(null);
    setImagePreview(null);
  };

  // Görsel Seçimi (Sharp ile backendde 500x500 WebP yapılacak)
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        showToast('Lütfen geçerli bir resim dosyası seçin (.jpg, .png, .webp)');
        return;
      }
      setImageFile(file);
      setRemoveExistingImage(false);
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Görseli Temizle
  const handleRemoveImage = (e) => {
    e.stopPropagation();
    setImageFile(null);
    setImagePreview(null);
    setRemoveExistingImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Form Gönderimi (Ekleme / Güncelleme)
  const handleSubmitForm = async (e) => {
    e.preventDefault();

    if (!formName.trim()) {
      showToast('Lütfen ürün adını giriniz.', 'danger');
      return;
    }
    if (!formCategoryId) {
      showToast('Lütfen bir kategori seçiniz.', 'danger');
      return;
    }
    if (!formPrice || isNaN(Number(formPrice)) || Number(formPrice) < 0) {
      showToast('Lütfen geçerli bir satış fiyatı giriniz.', 'danger');
      return;
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append('name', formName.trim());
      formData.append('category_id', formCategoryId);
      formData.append('price', formPrice);
      if (formCostPrice !== '' && !isNaN(Number(formCostPrice))) {
        formData.append('cost_price', formCostPrice);
      }
      if (formDescription.trim()) {
        formData.append('description', formDescription.trim());
      }
      if (formIngredients.trim()) {
        formData.append('ingredients', formIngredients.trim());
      }
      formData.append('status', formStatus.toString());

      if (imageFile) {
        formData.append('image', imageFile);
      }

      if (modalMode === 'edit') {
        if (removeExistingImage && !imageFile) {
          formData.append('remove_image', 'true');
        }

        const token = localStorage.getItem('kafe_token');
        const res = await fetch(`/api/products/${selectedProduct.id}`, {
          method: 'PUT',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          showToast(`"${formName}" başarıyla güncellendi.`, 'success');
          handleCloseModal();
          fetchProducts();
        } else {
          showToast(data.message || 'Ürün güncellenemedi.', 'danger');
        }
      } else {
        // Yeni Ürün Ekle
        const token = localStorage.getItem('kafe_token');
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          showToast(`"${formName}" başarıyla eklendi.`, 'success');
          handleCloseModal();
          fetchProducts();
        } else {
          showToast(data.message || 'Ürün eklenemedi.', 'danger');
        }
      }
    } catch (err) {
      console.error('Kaydetme hatası:', err);
      showToast('İşlem sırasında hata oluştu: ' + err.message, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ürün Durumu Değiştir (Aktif / Pasif)
  const handleToggleStatus = async (product, e) => {
    e?.stopPropagation();
    const nextStatus = product.status === 1 ? 0 : 1;
    
    // İyimser UI güncellemesi
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: nextStatus, is_available: nextStatus } : p));

    try {
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/products/${product.id}/status`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          `"${product.name}" ${nextStatus === 1 ? 'aktifleştirildi (satışa açıldı)' : 'pasife alındı (satışa kapatıldı)'}.`,
          nextStatus === 1 ? 'success' : 'info'
        );
      } else {
        fetchProducts();
        showToast(data.message || 'Durum değiştirilemedi.', 'danger');
      }
    } catch (err) {
      console.error('Durum güncelleme hatası:', err);
      fetchProducts();
      showToast('Sunucu hatası: ' + err.message, 'danger');
    }
  };

  // QR Menü Görünürlük Durumu Değiştir (Açık: Yeşil, Kapalı: Kırmızı)
  const handleToggleQrStatus = async (product, e) => {
    e?.stopPropagation();
    if (product.status === 0) {
      showToast('Ürün pasif olduğu için QR menüde açılamaz. Önce ürünü aktif yapmalısınız.', 'danger');
      return;
    }

    const nextQr = product.show_in_qr === 0 ? 1 : 0;
    // İyimser UI güncellemesi
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, show_in_qr: nextQr } : p));

    try {
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/products/${product.id}/qr-status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ show_in_qr: nextQr })
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          `"${product.name}" QR menüde ${nextQr === 1 ? 'açıldı (müşteri menüsünde gösterilecek)' : 'gizlendi'}.`,
          nextQr === 1 ? 'success' : 'info'
        );
      } else {
        fetchProducts();
        showToast(data.message || 'QR menü durumu değiştirilemedi.', 'danger');
      }
    } catch (err) {
      console.error('QR durum güncelleme hatası:', err);
      fetchProducts();
      showToast('Sunucu hatası: ' + err.message, 'danger');
    }
  };

  // Ürün Sil (Soft delete -> status = -1)
  const handleConfirmDelete = async () => {
    if (!deleteModalProduct) return;

    try {
      setIsDeleting(true);
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/products/${deleteModalProduct.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        showToast(`"${deleteModalProduct.name}" silindi.`, 'danger');
        setDeleteModalProduct(null);
        fetchProducts();
      } else {
        showToast(data.message || 'Silinemedi.', 'danger');
      }
    } catch (err) {
      console.error('Silme hatası:', err);
      showToast('Ürün silinirken hata oluştu.', 'danger');
    } finally {
      setIsDeleting(false);
    }
  };

  // Sürükle ve Bırak (Drag & Drop Sıralama)
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      e.target.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updatedList = [...products];
    const [movedItem] = updatedList.splice(draggedIndex, 1);
    updatedList.splice(dropIndex, 0, movedItem);

    const orderedIds = updatedList.map(p => p.id);
    setProducts(updatedList);
    setDraggedIndex(null);
    setDragOverIndex(null);

    try {
      setIsReordering(true);
      const token = localStorage.getItem('kafe_token');
      const res = await fetch('/api/products/reorder', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ orderedIds })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Ürün gösterim sırası kaydedildi!', 'success');
      } else {
        fetchProducts();
        showToast(data.message || 'Sıralama kaydedilemedi.', 'danger');
      }
    } catch (err) {
      console.error('Sıralama hatası:', err);
      fetchProducts();
      showToast('Sıralama sunucuya iletilemedi.', 'danger');
    } finally {
      setIsReordering(false);
    }
  };

  // Filtreleme
  const filteredProducts = products.filter(p => {
    // Kategori filtresi
    if (selectedCategoryFilter !== 'all' && p.category_id !== parseInt(selectedCategoryFilter, 10)) {
      return false;
    }
    // Arama filtresi
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = p.name?.toLowerCase().includes(q);
    const catMatch = p.category_name?.toLowerCase().includes(q);
    const descMatch = p.description?.toLowerCase().includes(q);
    const ingMatch = p.ingredients?.toLowerCase().includes(q);
    return nameMatch || catMatch || descMatch || ingMatch;
  });

  const totalCount = products.length;
  const activeCount = products.filter(p => p.status === 1).length;
  const passiveCount = products.filter(p => p.status === 0).length;

  return (
    <div className="pos-page-container">
      {/* Yan Menü (Sidebar) */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        activePage="products"
      />

      {/* Standart Üst Başlık (Navbar) */}
      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        title="Ürün Yönetimi"
        stats={
          <>
            <div className="pos-stat-pill" style={{ background: '#d3e5eb', color: '#346c80' }}>
              <span>Toplam:</span> <strong>{totalCount}</strong>
            </div>
            <div className="pos-stat-pill" style={{ background: '#eaf6ed', color: '#1e7e34' }}>
              <span>Aktif:</span> <strong>{activeCount}</strong>
            </div>
            {passiveCount > 0 && (
              <div className="pos-stat-pill" style={{ background: '#fbf4ea', color: '#b56d10' }}>
                <span>Pasif:</span> <strong>{passiveCount}</strong>
              </div>
            )}
          </>
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleOpenExportModal}
              className="pos-edit-btn"
              title="Excel Dışa Aktarma Seçenekleri"
              style={{
                background: '#ffffff',
                color: '#1e7e34',
                border: '1.5px solid #a3d9b0',
                boxShadow: '0 2px 6px rgba(30, 126, 52, 0.08)'
              }}
            >
              <FileSpreadsheet size={16} />
              <span>Dışa Aktar</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="pos-edit-btn"
              style={{
                background: '#346c80',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 2px 8px rgba(52, 108, 128, 0.25)'
              }}
            >
              <Plus size={16} />
              <span>Yeni Ürün</span>
            </button>
          </div>
        }
      />

      {/* X Ekseninde Ortalanmış, Kategori Dropdown Seçimli Oval Arama Çubuğu */}
      <div className="cat-search-centered-wrapper">
        <div className="prod-search-filter-box">
          {/* Sol Kısım: Kategori Seçim Dropdown */}
          <div className="prod-category-select-wrap">
            <select
              className="prod-cat-dropdown-filter"
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              title="Kategoriye Göre Filtrele"
            >
              <option value="all">Tüm Kategoriler ({products.length})</option>
              {categories.map(cat => {
                const catProductCount = products.filter(p => p.category_id === cat.id).length;
                return (
                  <option key={cat.id} value={cat.id.toString()}>
                    {cat.name} ({catProductCount})
                  </option>
                );
              })}
            </select>
            <ChevronDown size={14} color="#486b78" className="prod-cat-select-arrow" />
          </div>

          <div className="prod-filter-divider"></div>

          {/* Sağ Kısım: Arama Girişi */}
          <div className="prod-search-input-wrap">
            <Search size={19} color="#486b78" className="cat-search-icon" />
            <input
              type="text"
              placeholder="Ürün adı, içerik veya açıklama ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                type="button" 
                className="cat-search-clear-btn"
                onClick={() => setSearchQuery('')}
                title="Aramayı Temizle"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ürün Liste Görünümü (Kompakt, Yüksek Performanslı) */}
      {loading ? (
        <div className="cat-loading-state">
          <div className="cat-spinner"></div>
          <p>Ürünler yükleniyor...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="cat-empty-state">
          <div className="cat-empty-icon">
            <Utensils size={40} color="#a89280" />
          </div>
          <h3>{searchQuery || selectedCategoryFilter !== 'all' ? 'Aramanızla eşleşen ürün bulunamadı' : 'Henüz hiç ürün eklenmemiş'}</h3>
          <p>{searchQuery || selectedCategoryFilter !== 'all' ? 'Farklı bir arama terimi veya kategori filtresi deneyin.' : 'Menünüzü oluşturmak için hemen ilk ürününüzü ekleyin.'}</p>
          {!searchQuery && selectedCategoryFilter === 'all' && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="cat-btn-primary"
            >
              <Plus size={18} />
              <span>İlk Ürünü Ekle</span>
            </button>
          )}
        </div>
      ) : (
        <div className="cat-list-container">
          {filteredProducts.map((prod, index) => {
            const isPassive = prod.status === 0;
            const isBeingDragged = draggedIndex === index;
            const isOver = dragOverIndex === index;

            return (
              <div
                key={prod.id}
                className={`cat-list-row ${isPassive ? 'is-passive' : ''} ${isBeingDragged ? 'is-dragging' : ''} ${isOver ? 'is-drag-over' : ''}`}
                draggable={dragAllowedId === prod.id}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={(e) => {
                  handleDragEnd(e);
                  setDragAllowedId(null);
                }}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
              >
                {/* SOL KISIM: Sürükleme Tutamacı + Sıra + Kare Görsel Thumbnail + Ad & Kategori & Fiyat (Hepsi Tek Satırda) */}
                <div className="cat-row-left">
                  {/* Sadece bu tutamaçtan basılı tutulunca sürükle-bırak çalışır */}
                  <div 
                    className="cat-drag-handle" 
                    title="Sırasını değiştirmek için buradan basılı tutup sürükleyin"
                    onMouseDown={() => setDragAllowedId(prod.id)}
                    onMouseUp={() => setDragAllowedId(null)}
                    onTouchStart={() => setDragAllowedId(prod.id)}
                    onTouchEnd={() => setDragAllowedId(null)}
                  >
                    <GripVertical size={18} />
                    <span className="cat-order-pill">#{index + 1}</span>
                  </div>

                  {/* Küçük Kare Görsel Thumbnail (WebP & Lazy) */}
                  <div className="cat-thumb-wrapper">
                    {prod.image_url ? (
                      <img
                        src={prod.image_url}
                        alt={prod.name}
                        className="cat-thumb-img"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.nextSibling) {
                            e.currentTarget.nextSibling.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div 
                      className="cat-thumb-placeholder"
                      style={{ display: prod.image_url ? 'none' : 'flex' }}
                    >
                      <Utensils size={20} color="#346c80" />
                    </div>
                  </div>

                  {/* 3 FARKLI KOLON ŞEKLİNDE HİZALANMIŞ BİLGİ ALANI */}
                  <div className="prod-columns-container">
                    {/* KOLON 1: Ürün Adı & Varsa Pasif Etiketi */}
                    <div className="prod-col-name">
                      <h3 className="cat-row-title">{prod.name}</h3>
                      {isPassive && (
                        <span className="cat-passive-badge">Pasif</span>
                      )}
                    </div>

                    {/* KOLON 2: Kategori */}
                    <div className="prod-col-category">
                      {prod.category_name ? (
                        <span className="prod-category-badge" title={`Kategori: ${prod.category_name}`}>
                          <Tags size={12} />
                          <span>{prod.category_name}</span>
                        </span>
                      ) : (
                        <span style={{ color: '#5d818f', fontSize: '0.8rem' }}>-</span>
                      )}
                    </div>

                    {/* KOLON 3: Satış Fiyatı & Varsa Maliyet */}
                    <div className="prod-col-price">
                      <span className="prod-price-val">₺{parseFloat(prod.price || 0).toFixed(2)}</span>
                      {prod.cost_price && (
                        <span className="prod-cost-val" title="Ürün Maliyeti">
                          Maliyet: ₺{parseFloat(prod.cost_price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* SAĞ KISIM: İşlem Butonları (QR Barcode Butonu + Durum Switchi + Düzenle + Sil) */}
                <div className="cat-row-actions">
                  {/* QR Menü Gösterim Durumu (Yeşil: Açık, Kırmızı: Kapalı, Pasif: Pasif/Kapalı) */}
                  {(() => {
                    const isPassive = prod.status === 0;
                    const isQrOn = !isPassive && (prod.show_in_qr === 1 || prod.show_in_qr === undefined);

                    return (
                      <button
                        type="button"
                        className={`cat-qr-btn ${isPassive ? 'disabled' : isQrOn ? 'active' : 'inactive'}`}
                        onClick={(e) => handleToggleQrStatus(prod, e)}
                        title={
                          isPassive
                            ? 'Ürün pasif olduğu için QR menüde kapalıdır (Önce ürünü aktif yapın)'
                            : isQrOn
                              ? 'QR Menüde Açık (Müşteriler Görebilir) - Kapatmak için tıklayın'
                              : 'QR Menüde Kapalı (Gizli) - Açmak için tıklayın'
                        }
                      >
                        <QrCode size={16} />
                        <span className="cat-qr-btn-text">
                          {isPassive ? 'QR Kapalı' : isQrOn ? 'QR Açık' : 'QR Gizli'}
                        </span>
                      </button>
                    );
                  })()}

                  {/* Aktif / Pasif Toggle Switch */}
                  <div className="cat-status-switch-wrapper" onClick={(e) => e.stopPropagation()}>
                    <label 
                      className="cat-switch" 
                      title={prod.status === 1 ? 'Ürünü pasife al' : 'Ürünü aktife al'}
                    >
                      <input
                        type="checkbox"
                        checked={prod.status === 1}
                        onChange={(e) => handleToggleStatus(prod, e)}
                      />
                      <span className="cat-slider"></span>
                    </label>
                    <span className={`cat-status-label ${prod.status === 1 ? 'active' : 'passive'}`}>
                      {prod.status === 1 ? 'Aktif' : 'Pasif'}
                    </span>
                  </div>

                  {/* Düzenle Butonu */}
                  <button
                    type="button"
                    className="cat-action-btn edit"
                    onClick={() => handleOpenEditModal(prod)}
                    title="Ürünü Düzenle"
                  >
                    <Edit3 size={15} />
                    <span>Düzenle</span>
                  </button>

                  {/* Geçmiş Butonu */}
                  <button
                    type="button"
                    className="cat-action-btn history"
                    onClick={() => handleOpenHistoryModal(prod)}
                    title="Ürün Fiyat, İsim ve Değişiklik Geçmişi"
                  >
                    <History size={15} />
                    <span>Geçmiş</span>
                  </button>

                  {/* Sil Butonu */}
                  <button
                    type="button"
                    className="cat-action-btn delete"
                    onClick={() => setDeleteModalProduct(prod)}
                    title="Ürünü Sil"
                  >
                    <Trash2 size={15} />
                    <span>Sil</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ÜRÜN EKLE / DÜZENLE (KOMPAKT, KARE GÖRSEL, 2-KOLON) */}
      {/* ======================================================== */}
      {modalMode && (
        <div className="pos-modal-overlay" onClick={handleCloseModal}>
          <div 
            className="pos-modal-content cat-modal-compact prod-modal-wide" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Başlık */}
            <div className="cat-modal-header-compact">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="cat-modal-icon-badge-sm">
                  {modalMode === 'add' ? <Plus size={18} /> : <Edit3 size={18} />}
                </div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#1e292d' }}>
                  {modalMode === 'add' ? 'Yeni Ürün Ekle' : 'Ürünü Düzenle'}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={handleCloseModal}
                className="cat-modal-close-btn-sm"
                title="Kapat"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="cat-modal-form-compact">
              {/* ORTADA KARE GÖRSEL YÜKLEME VE ÖNİZLEME (Şimdilik İsteğe Bağlı / Opsiyonel) */}
              <div className="cat-square-upload-container">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  style={{ display: 'none' }}
                />

                {imagePreview ? (
                  <div className="cat-square-preview-box">
                    <img 
                      src={imagePreview} 
                      alt="Önizleme" 
                      className="cat-square-preview-img"
                      onClick={() => fileInputRef.current?.click()}
                      title="Görseli değiştirmek için tıklayın"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="cat-square-remove-btn"
                      title="Görseli Kaldır"
                    >
                      <X size={13} />
                    </button>
                    <div 
                      className="cat-square-change-tag"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera size={13} />
                      <span>Değiştir</span>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="cat-square-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                    title="Ürün görseli yüklemek için tıklayın (İsteğe Bağlı)"
                  >
                    <div className="cat-square-icon-circle">
                      <Camera size={22} color="#346c80" />
                    </div>
                    <span className="cat-square-upload-title">Resim Yükle</span>
                    <span className="cat-square-upload-sub">İsteğe Bağlı (Kare)</span>
                  </div>
                )}
              </div>

              {/* 1. Satır: Ürün Adı & Kategori (2 Kolon) */}
              <div className="prod-form-grid-2">
                <div className="cat-form-group" style={{ marginBottom: 0 }}>
                  <label className="cat-form-label">
                    Ürün Adı <span style={{ color: '#b84a39' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="cat-form-input"
                    placeholder="Örn: Latte, Karışık Tost..."
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="cat-form-group" style={{ marginBottom: 0 }}>
                  <label className="cat-form-label">
                    Kategori <span style={{ color: '#b84a39' }}>*</span>
                  </label>
                  <select
                    className="prod-form-select"
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                    required
                  >
                    <option value="" disabled>Kategori Seçiniz</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} {cat.status === 0 ? '(Pasif)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. Satır: Satış Fiyatı & Ürün Maliyeti (2 Kolon) */}
              <div className="prod-form-grid-2">
                <div className="cat-form-group" style={{ marginBottom: 0 }}>
                  <label className="cat-form-label">
                    Satış Fiyatı (₺) <span style={{ color: '#b84a39' }}>*</span>
                  </label>
                  <div className="prod-currency-input-wrap">
                    <span className="prod-currency-symbol">₺</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="cat-form-input prod-currency-input"
                      placeholder="0.00"
                      value={formPrice}
                      onChange={(e) => setFormPrice(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="cat-form-group" style={{ marginBottom: 0 }}>
                  <label className="cat-form-label">
                    Ürün Maliyeti (₺) <span style={{ fontSize: '0.74rem', color: '#486b78', fontWeight: 'normal' }}>(İsteğe Bağlı)</span>
                  </label>
                  <div className="prod-currency-input-wrap">
                    <span className="prod-currency-symbol">₺</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="cat-form-input prod-currency-input"
                      placeholder="0.00"
                      value={formCostPrice}
                      onChange={(e) => setFormCostPrice(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* 3. Satır: Kısa Açıklama (İsteğe Bağlı) */}
              <div className="cat-form-group" style={{ marginBottom: 0 }}>
                <label className="cat-form-label">
                  Kısa Açıklama <span style={{ fontSize: '0.74rem', color: '#486b78', fontWeight: 'normal' }}>(İsteğe Bağlı)</span>
                </label>
                <input
                  type="text"
                  className="cat-form-input"
                  placeholder="Örn: Espresso ve kadifemsi süt kreması ile..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              {/* 4. Satır: İçindekiler / Malzemeler (İsteğe Bağlı) */}
              <div className="cat-form-group" style={{ marginBottom: 0 }}>
                <label className="cat-form-label">
                  İçindekiler / Malzemeler <span style={{ fontSize: '0.74rem', color: '#486b78', fontWeight: 'normal' }}>(İsteğe Bağlı)</span>
                </label>
                <input
                  type="text"
                  className="cat-form-input"
                  placeholder="Örn: Espresso, Tam yağlı süt, Karamel şurubu..."
                  value={formIngredients}
                  onChange={(e) => setFormIngredients(e.target.value)}
                />
              </div>

              {/* 5. Satır: Ürün Durumu (Aktif/Pasif Kompakt Switch) */}
              <div className="cat-form-switch-row-compact">
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#1e292d' }}>
                    {formStatus === 1 ? 'Aktif (Satışa Açık)' : 'Pasif (Satışa Kapalı)'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#486b78' }}>
                    {formStatus === 1 ? 'POS ve müşteri menüsünde sipariş edilebilir' : 'Menülerde görünmez ve sipariş verilemez'}
                  </div>
                </div>

                <label className="cat-switch">
                  <input
                    type="checkbox"
                    checked={formStatus === 1}
                    onChange={(e) => setFormStatus(e.target.checked ? 1 : 0)}
                  />
                  <span className="cat-slider"></span>
                </label>
              </div>

              {/* Modal Aksiyon Butonları */}
              <div className="cat-modal-footer-compact">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="cat-btn-secondary"
                  disabled={isSubmitting}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="cat-btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <div className="cat-btn-spinner"></div>
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>{modalMode === 'add' ? 'Ürünü Ekle' : 'Değişiklikleri Kaydet'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SİLME ONAY MODALI                                        */}
      {/* ======================================================== */}
      {deleteModalProduct && (
        <div className="pos-modal-overlay" onClick={() => setDeleteModalProduct(null)}>
          <div 
            className="pos-modal-content cat-delete-modal" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '380px' }}
          >
            <div className="cat-delete-icon-wrapper">
              <AlertTriangle size={32} color="#b84a39" />
            </div>

            <h3 className="cat-delete-title">Ürünü Sil</h3>
            <p className="cat-delete-desc">
              <strong>"{deleteModalProduct.name}"</strong> adlı ürünü silmek istediğinize emin misiniz? Bu ürün menülerden kaldırılacaktır.
            </p>

            <div className="cat-modal-footer-compact" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="cat-btn-secondary"
                onClick={() => setDeleteModalProduct(null)}
                disabled={isDeleting}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="cat-btn-danger"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <div className="cat-btn-spinner"></div>
                    <span>Siliniyor...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Evet, Sil</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* EXCEL DIŞA AKTARMA AYARLARI MODALI                       */}
      {/* ======================================================== */}
      {isExportModalOpen && (
        <div className="pos-modal-overlay" onClick={() => !isExporting && setIsExportModalOpen(false)}>
          <div 
            className="pos-modal-content export-modal-dialog" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Başlığı */}
            <div className="export-modal-header">
              <div className="export-modal-title-group">
                <div className="export-modal-icon-badge">
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 className="export-modal-title">Excel Dışa Aktarma Seçenekleri</h3>
                  <p className="export-modal-subtitle">
                    Belgede yer almasını istediğiniz kategorileri ve alanları özelleştirin.
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => !isExporting && setIsExportModalOpen(false)}
                className="cat-modal-close-btn-sm"
                disabled={isExporting}
                title="Kapat"
              >
                <X size={16} />
              </button>
            </div>

            {/* 2 Kolonlu Gövde: Solda Kategoriler, Sağda Sütunlar */}
            <div className="export-columns-split">
              {/* Sol Kolon: Aktarılacak Kategoriler */}
              <div className="export-split-col">
                <div className="export-section-head">
                  <span className="export-section-title">
                    <Layers size={15} color="#346c80" />
                    Kategoriler ({exportSelectedCategories.length}/{categories.length})
                  </span>
                  <div className="export-section-actions">
                    <button 
                      type="button" 
                      className="export-quick-btn"
                      onClick={handleSelectAllCategories}
                    >
                      Tümünü Seç
                    </button>
                    <span style={{ color: '#d1c5ba', fontSize: '0.75rem' }}>•</span>
                    <button 
                      type="button" 
                      className="export-quick-btn"
                      onClick={handleDeselectAllCategories}
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                <div className="export-scroll-list">
                  {categories.map((cat) => {
                    const isChecked = exportSelectedCategories.includes(cat.id);
                    const count = products.filter(p => p.category_id === cat.id).length;
                    return (
                      <label 
                        key={cat.id} 
                        className={`export-check-card ${isChecked ? 'checked' : ''}`}
                      >
                        <div className="export-check-left">
                          <input 
                            type="checkbox"
                            className="export-check-input"
                            checked={isChecked}
                            onChange={() => handleToggleCategory(cat.id)}
                          />
                          <span className="export-check-text">{cat.name}</span>
                        </div>
                        <span className="export-badge-tag">{count} ürün</span>
                      </label>
                    );
                  })}
                </div>
                {exportSelectedCategories.length === 0 && (
                  <p style={{ color: '#b84a39', fontSize: '0.78rem', marginTop: '6px', fontWeight: '600' }}>
                    ⚠️ En az 1 kategori seçmelisiniz.
                  </p>
                )}
              </div>

              {/* Sağ Kolon: Belgede Görünecek Sütunlar */}
              <div className="export-split-col">
                <div className="export-section-head">
                  <span className="export-section-title">
                    <Utensils size={15} color="#346c80" />
                    Tablo Sütunları
                  </span>
                  <span style={{ fontSize: '0.73rem', color: '#486b78' }}>
                    İsteğe bağlı gizleyin
                  </span>
                </div>

                <div className="export-scroll-list">
                  {/* Ürün Adı (Sabit / Her zaman var) */}
                  <label className="export-check-card checked disabled-locked" title="Ürün Adı raporda zorunlu olarak yer alır">
                    <div className="export-check-left">
                      <input 
                        type="checkbox" 
                        className="export-check-input" 
                        checked={true} 
                        disabled={true} 
                      />
                      <span className="export-check-text">Ürün Adı</span>
                    </div>
                    <span className="export-badge-tag">Sabit</span>
                  </label>

                  {/* Kategori Adı */}
                  <label className={`export-check-card ${exportSelectedColumns.category ? 'checked' : ''}`}>
                    <div className="export-check-left">
                      <input 
                        type="checkbox" 
                        className="export-check-input" 
                        checked={exportSelectedColumns.category} 
                        onChange={() => handleToggleColumn('category')}
                      />
                      <span className="export-check-text">Kategori Adı</span>
                    </div>
                  </label>

                  {/* Satış Fiyatı */}
                  <label className={`export-check-card ${exportSelectedColumns.price ? 'checked' : ''}`}>
                    <div className="export-check-left">
                      <input 
                        type="checkbox" 
                        className="export-check-input" 
                        checked={exportSelectedColumns.price} 
                        onChange={() => handleToggleColumn('price')}
                      />
                      <span className="export-check-text">Satış Fiyatı (₺)</span>
                    </div>
                  </label>

                  {/* Maliyet Fiyatı */}
                  <label className={`export-check-card ${exportSelectedColumns.cost_price ? 'checked' : ''}`}>
                    <div className="export-check-left">
                      <input 
                        type="checkbox" 
                        className="export-check-input" 
                        checked={exportSelectedColumns.cost_price} 
                        onChange={() => handleToggleColumn('cost_price')}
                      />
                      <span className="export-check-text">Maliyet Fiyatı</span>
                    </div>
                    <span className="export-badge-tag highlight">Özel</span>
                  </label>

                  {/* QR Menü Durumu */}
                  <label className={`export-check-card ${exportSelectedColumns.show_in_qr ? 'checked' : ''}`}>
                    <div className="export-check-left">
                      <input 
                        type="checkbox" 
                        className="export-check-input" 
                        checked={exportSelectedColumns.show_in_qr} 
                        onChange={() => handleToggleColumn('show_in_qr')}
                      />
                      <span className="export-check-text">QR Menü Durumu</span>
                    </div>
                  </label>

                  {/* Ürün Durumu */}
                  <label className={`export-check-card ${exportSelectedColumns.status ? 'checked' : ''}`}>
                    <div className="export-check-left">
                      <input 
                        type="checkbox" 
                        className="export-check-input" 
                        checked={exportSelectedColumns.status} 
                        onChange={() => handleToggleColumn('status')}
                      />
                      <span className="export-check-text">Ürün Durumu</span>
                    </div>
                  </label>

                  {/* Kısa Açıklama */}
                  <label className={`export-check-card ${exportSelectedColumns.description ? 'checked' : ''}`}>
                    <div className="export-check-left">
                      <input 
                        type="checkbox" 
                        className="export-check-input" 
                        checked={exportSelectedColumns.description} 
                        onChange={() => handleToggleColumn('description')}
                      />
                      <span className="export-check-text">Kısa Açıklama</span>
                    </div>
                  </label>

                  {/* İçindekiler / Malzemeler */}
                  <label className={`export-check-card ${exportSelectedColumns.ingredients ? 'checked' : ''}`}>
                    <div className="export-check-left">
                      <input 
                        type="checkbox" 
                        className="export-check-input" 
                        checked={exportSelectedColumns.ingredients} 
                        onChange={() => handleToggleColumn('ingredients')}
                      />
                      <span className="export-check-text">İçindekiler / Malzemeler</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Alt Kısmı (Footer) */}
            <div className="export-modal-footer">
              <span className="export-summary-text">
                {exportSelectedCategories.length} kategori • {
                  Object.values(exportSelectedColumns).filter(Boolean).length + 1
                } sütun seçili
              </span>
              <div className="export-footer-buttons">
                <button
                  type="button"
                  className="cat-btn-secondary"
                  onClick={() => setIsExportModalOpen(false)}
                  disabled={isExporting}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="export-download-btn"
                  onClick={handleExecuteExportExcel}
                  disabled={isExporting || exportSelectedCategories.length === 0}
                >
                  {isExporting ? (
                    <>
                      <div className="cat-btn-spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}></div>
                      <span>Hazırlanıyor...</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet size={16} />
                      <span>Excel Olarak İndir</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ÜRÜN DEĞİŞİKLİK VE HAREKET GEÇMİŞİ (AUDIT LOGS)   */}
      {/* ======================================================== */}
      <HistoryModal
        isOpen={!!historyModalProduct}
        onClose={handleCloseHistoryModal}
        entityType="product"
        entity={historyModalProduct}
        historyList={productHistory}
        loading={historyLoading}
        onRefresh={() => historyModalProduct && handleOpenHistoryModal(historyModalProduct)}
      />

      {/* Toast Bildirim Kutusu (Duruma Özel Renkler & Simgeler) */}
      {toast && (
        <div className={`cat-toast ${toast.type || 'info'}`}>
          <div className="cat-toast-icon">
            {toast.type === 'success' && <CheckCircle2 size={20} color="#4ade80" />}
            {toast.type === 'danger' && <Trash2 size={20} color="#f87171" />}
            {toast.type === 'info' && <Sparkles size={20} color="#e5a968" />}
          </div>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
