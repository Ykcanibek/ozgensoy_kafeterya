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
  Image as ImageIcon,
  Tags,
  Package,
  Layers,
  Sparkles,
  RefreshCw,
  QrCode,
  Camera,
  CheckCircle2,
  History,
  User,
  Clock,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export default function Categories() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Drag and Drop durumları - Sadece sol tutamaçtan basılı tutunca sürükleme aktif olur
  const [dragAllowedId, setDragAllowedId] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [isReordering, setIsReordering] = useState(false);

  // Ekleme / Düzenleme Modal Durumları
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [formName, setFormName] = useState('');
  const [formStatus, setFormStatus] = useState(1); // 1: Aktif, 0: Pasif
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Silme Onay Modal Durumu
  const [deleteModalCategory, setDeleteModalCategory] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // İşlem & Değişiklik Geçmişi Modal Durumu
  const [historyModalCategory, setHistoryModalCategory] = useState(null);
  const [categoryHistory, setCategoryHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Bildirim Toast mesajı ({ message, type: 'success' | 'danger' | 'info' })
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  };

  // Kategorileri sunucudan yükle
  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Kategoriler yüklenirken hata oluştu:', err);
      showToast('Kategoriler yüklenemedi. Lütfen sunucuyu kontrol edin.');
    } finally {
      setLoading(false);
    }
  };

  // Socket.io ile gerçek zamanlı senkronizasyon
  useEffect(() => {
    fetchCategories();

    const socket = io();

    socket.on('category:created', (newCat) => {
      setCategories(prev => {
        if (prev.some(c => c.id === newCat.id)) return prev;
        return [...prev, newCat].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
      });
    });

    socket.on('category:updated', (updatedCat) => {
      setCategories(prev => prev.map(c => c.id === updatedCat.id ? { ...c, ...updatedCat } : c));
    });

    socket.on('category:deleted', ({ id }) => {
      setCategories(prev => prev.filter(c => c.id !== id));
    });

    socket.on('categories:reordered', ({ orderedIds }) => {
      setCategories(prev => {
        const map = new Map(prev.map(c => [c.id, c]));
        const reordered = [];
        orderedIds.forEach(id => {
          if (map.has(id)) {
            reordered.push(map.get(id));
            map.delete(id);
          }
        });
        // Sıralamada olmayan varsa sona ekle
        map.forEach(item => reordered.push(item));
        return reordered;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Modal açıkken arkaplandaki sayfanın kaymasını engelle (Scroll Lock)
  useEffect(() => {
    if (modalMode || deleteModalCategory || historyModalCategory) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [modalMode, deleteModalCategory, historyModalCategory]);

  // Kategori Geçmişini Aç
  const handleOpenHistoryModal = async (cat) => {
    setHistoryModalCategory(cat);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/categories/${cat.id}/history`);
      const data = await res.json();
      if (data.success) {
        setCategoryHistory(data.history || []);
      } else {
        showToast(data.message || 'Geçmiş yüklenemedi.', 'danger');
      }
    } catch (err) {
      console.error('Kategori geçmişi yüklenemedi:', err);
      showToast('Kategori geçmişi yüklenirken hata oluştu.', 'danger');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCloseHistoryModal = () => {
    setHistoryModalCategory(null);
    setCategoryHistory([]);
  };

  // Modal Aç: Yeni Ekle
  const handleOpenAddModal = () => {
    setModalMode('add');
    setSelectedCategory(null);
    setFormName('');
    setFormStatus(1);
    setImageFile(null);
    setImagePreview(null);
  };

  // Modal Aç: Düzenle
  const handleOpenEditModal = (cat) => {
    setModalMode('edit');
    setSelectedCategory(cat);
    setFormName(cat.name || '');
    setFormStatus(cat.status === 1 ? 1 : 0);
    setImageFile(null);
    setImagePreview(cat.image_url || null);
  };

  // Modal Kapat
  const handleCloseModal = () => {
    setModalMode(null);
    setSelectedCategory(null);
    setFormName('');
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Dosya seçildiğinde önizleme oluştur
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  // Seçili görseli kaldır
  const handleRemoveImage = (e) => {
    e.stopPropagation();
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Kategori Kaydet (Ekle veya Güncelle)
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Lütfen bir kategori adı girin.');
      return;
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append('name', formName.trim());
      formData.append('status', formStatus);

      if (imageFile) {
        formData.append('image', imageFile);
      } else if (!imagePreview && modalMode === 'edit') {
        // Önizleme de boşaltılmışsa resmi sil
        formData.append('image_url', '');
      }

      let url = '/api/categories';
      let method = 'POST';

      if (modalMode === 'edit') {
        url = `/api/categories/${selectedCategory.id}`;
        method = 'PUT';
      }

      const token = localStorage.getItem('kafe_token');
      const res = await fetch(url, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        showToast(modalMode === 'add' ? 'Kategori başarıyla eklendi!' : 'Kategori güncellendi!');
        handleCloseModal();
        fetchCategories();
      } else {
        showToast(data.message || 'Bir hata oluştu.');
      }
    } catch (err) {
      console.error('Kategori kaydetme hatası:', err);
      showToast('Kategori kaydedilemedi: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hızlı Durum Değiştirme Switch'i (Aktif 1 / Pasif 0)
  const handleToggleStatus = async (cat, e) => {
    e?.stopPropagation();
    const nextStatus = cat.status === 1 ? 0 : 1;

    // İyimser UI güncellemesi
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, status: nextStatus } : c));

    try {
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/categories/${cat.id}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`"${cat.name}" ${nextStatus === 1 ? 'aktif' : 'pasif'} duruma alındı.`);
      } else {
        // Geri al
        fetchCategories();
        showToast(data.message || 'Durum değiştirilemedi.');
      }
    } catch (err) {
      console.error('Durum güncelleme hatası:', err);
      fetchCategories();
      showToast('Sunucu hatası: ' + err.message);
    }
  };

  // QR Menü Görünürlük Durumu Değiştir (Açık: Yeşil, Kapalı: Kırmızı)
  const handleToggleQrStatus = async (cat, e) => {
    e?.stopPropagation();
    if (cat.status === 0) {
      showToast('Kategori pasif olduğu için QR menüde açılamaz. Önce kategoriyi aktif yapmalısınız.');
      return;
    }

    const nextQr = cat.show_in_qr === 0 ? 1 : 0;
    // İyimser UI güncellemesi
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, show_in_qr: nextQr } : c));

    try {
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/categories/${cat.id}/qr-status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ show_in_qr: nextQr })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`"${cat.name}" QR menüde ${nextQr === 1 ? 'açıldı (gösterilecek)' : 'kapatıldı (gizlendi)'}.`);
      } else {
        fetchCategories();
        showToast(data.message || 'QR menü durumu değiştirilemedi.');
      }
    } catch (err) {
      console.error('QR durum güncelleme hatası:', err);
      fetchCategories();
      showToast('Sunucu hatası: ' + err.message);
    }
  };

  // Silme Onaylama (Soft Delete -> status = -1, ürün varsa kesinlikle engeller)
  const handleConfirmDelete = async () => {
    if (!deleteModalCategory) return;

    if (deleteModalCategory.total_products > 0) {
      showToast(`Bu kategoriye bağlı ${deleteModalCategory.total_products} ürün bulunmaktadır. Kategori silinemez!`);
      return;
    }

    try {
      setIsDeleting(true);
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/categories/${deleteModalCategory.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        showToast(`"${deleteModalCategory.name}" silindi (arşive alındı).`);
        setDeleteModalCategory(null);
        fetchCategories();
      } else {
        showToast(data.message || 'Silinemedi.');
      }
    } catch (err) {
      console.error('Silme hatası:', err);
      showToast('Kategori silinirken hata oluştu.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Sürükle ve Bırak (Drag & Drop Sıralama)
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Görsel efekt için hafif şeffaflık
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

    // Sıralamayı yerel listede anında değiştir
    const updatedList = [...categories];
    const [movedItem] = updatedList.splice(draggedIndex, 1);
    updatedList.splice(dropIndex, 0, movedItem);

    // Yeni order_num değerlerini ayarla
    const orderedIds = updatedList.map(c => c.id);
    setCategories(updatedList);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Sunucuya kaydet
    try {
      setIsReordering(true);
      const token = localStorage.getItem('kafe_token');
      const res = await fetch('/api/categories/reorder', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ orderedIds })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Kategori gösterim sırası kaydedildi!');
      } else {
        fetchCategories();
        showToast(data.message || 'Sıralama kaydedilemedi.');
      }
    } catch (err) {
      console.error('Sıralama sunucu hatası:', err);
      fetchCategories();
      showToast('Sıralama sunucuya iletilemedi.');
    } finally {
      setIsReordering(false);
    }
  };

  // Filtreleme
  const filteredCategories = categories.filter(c => {
    if (!searchQuery.trim()) return true;
    return c.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalCount = categories.length;
  const activeCount = categories.filter(c => c.status === 1).length;
  const passiveCount = categories.filter(c => c.status === 0).length;

  return (
    <div className="pos-page-container">
      {/* Yan Menü (Sidebar) */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Standart Üst Başlık (Navbar) */}
      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        title="Kategori Yönetimi"
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
            <span>Yeni Kategori</span>
          </button>
        }
      />

      {/* X Ekseninde Ortalanmış, Yanları Yumuşatılmış Oval Arama Çubuğu */}
      <div className="cat-search-centered-wrapper">
        <div className="cat-search-pill-box">
          <Search size={21} color="#486b78" className="cat-search-icon" />
          <input
            type="text"
            placeholder="Kategori adı ara..."
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

      {/* Kategori Liste Görünümü (Kompakt, Yüksek Performanslı) */}
      {loading ? (
        <div className="cat-loading-state">
          <div className="cat-spinner"></div>
          <p>Kategoriler yükleniyor...</p>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="cat-empty-state">
          <div className="cat-empty-icon">
            <Coffee size={40} color="#a89280" />
          </div>
          <h3>{searchQuery ? 'Aramanızla eşleşen kategori bulunamadı' : 'Henüz hiç kategori eklenmemiş'}</h3>
          <p>{searchQuery ? 'Farklı bir arama terimi deneyin.' : 'Menünüzü oluşturmak için hemen ilk kategorinizi ekleyin.'}</p>
          {!searchQuery && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="cat-btn-primary"
            >
              <Plus size={18} />
              <span>İlk Kategoriyi Ekle</span>
            </button>
          )}
        </div>
      ) : (
        <div className="cat-list-container">
          {filteredCategories.map((cat, index) => {
            const isPassive = cat.status === 0;
            const isBeingDragged = draggedIndex === index;
            const isOver = dragOverIndex === index;

            return (
              <div
                key={cat.id}
                className={`cat-list-row ${isPassive ? 'is-passive' : ''} ${isBeingDragged ? 'is-dragging' : ''} ${isOver ? 'is-drag-over' : ''}`}
                draggable={dragAllowedId === cat.id}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={(e) => {
                  handleDragEnd(e);
                  setDragAllowedId(null);
                }}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
              >
                {/* SOL KISIM: Sürükleme Tutamacı + Sıra + Küçük Görsel Thumbnail + Ad & Bilgi */}
                <div className="cat-row-left">
                  {/* Sadece bu alandan basılı tutulunca sürükle-bırak çalışır */}
                  <div 
                    className="cat-drag-handle" 
                    title="Sırasını değiştirmek için buradan basılı tutup sürükleyin"
                    onMouseDown={() => setDragAllowedId(cat.id)}
                    onMouseUp={() => setDragAllowedId(null)}
                    onTouchStart={() => setDragAllowedId(cat.id)}
                    onTouchEnd={() => setDragAllowedId(null)}
                  >
                    <GripVertical size={18} />
                    <span className="cat-order-pill">#{index + 1}</span>
                  </div>

                  {/* Küçük Görsel Thumbnail (WebP & Lazy) */}
                  <div className="cat-thumb-wrapper">
                    {cat.image_url ? (
                      <img
                        src={cat.image_url}
                        alt={cat.name}
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
                      style={{ display: cat.image_url ? 'none' : 'flex' }}
                    >
                      <Coffee size={22} color="#346c80" />
                    </div>
                  </div>

                  {/* Kategori Adı ve Ürün Sayısı */}
                  <div className="cat-info-col">
                    <div className="cat-name-line">
                      <h3 className="cat-row-title">{cat.name}</h3>
                      {isPassive && (
                        <span className="cat-passive-badge">Pasif (Gizli)</span>
                      )}
                    </div>
                    <div className="cat-row-meta">
                      <span className="cat-product-count">
                        <Layers size={13} />
                        {cat.total_products || 0} Ürün
                      </span>
                    </div>
                  </div>
                </div>

                {/* SAĞ KISIM: İşlem Butonları (QR Barcode Butonu + Durum Switchi + Düzenle + Sil) */}
                <div className="cat-row-actions">
                  {/* QR Menü Gösterim Durumu (Yeşil: Açık, Kırmızı: Kapalı, Pasif: Pasif/Kapalı) */}
                  {(() => {
                    const isPassive = cat.status === 0;
                    const isQrOn = !isPassive && (cat.show_in_qr === 1 || cat.show_in_qr === undefined);

                    return (
                      <button
                        type="button"
                        className={`cat-qr-btn ${isPassive ? 'disabled' : isQrOn ? 'active' : 'inactive'}`}
                        onClick={(e) => handleToggleQrStatus(cat, e)}
                        title={
                          isPassive
                            ? 'Kategori pasif olduğu için QR menüde kapalıdır (Önce kategoriyi aktif yapın)'
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
                      title={cat.status === 1 ? 'Kategoriyi pasife al' : 'Kategoriyi aktife al'}
                    >
                      <input
                        type="checkbox"
                        checked={cat.status === 1}
                        onChange={(e) => handleToggleStatus(cat, e)}
                      />
                      <span className="cat-slider"></span>
                    </label>
                    <span className={`cat-status-label ${cat.status === 1 ? 'active' : 'passive'}`}>
                      {cat.status === 1 ? 'Aktif' : 'Pasif'}
                    </span>
                  </div>

                  {/* Düzenle Butonu */}
                  <button
                    type="button"
                    className="cat-action-btn edit"
                    onClick={() => handleOpenEditModal(cat)}
                    title="Kategoriyi Düzenle"
                  >
                    <Edit3 size={15} />
                    <span>Düzenle</span>
                  </button>

                  {/* Geçmiş Butonu */}
                  <button
                    type="button"
                    className="cat-action-btn history"
                    onClick={() => handleOpenHistoryModal(cat)}
                    title="Kategori Değişiklik ve İşlem Geçmişi"
                  >
                    <History size={15} />
                    <span>Geçmiş</span>
                  </button>

                  {/* Sil Butonu */}
                  <button
                    type="button"
                    className="cat-action-btn delete"
                    onClick={() => setDeleteModalCategory(cat)}
                    title="Kategoriyi Sil"
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
      {/* MODAL: KATEGORİ EKLE / DÜZENLE (KOMPAKT & KARE GÖRSEL)   */}
      {/* ======================================================== */}
      {modalMode && (
        <div className="pos-modal-overlay" onClick={handleCloseModal}>
          <div 
            className="pos-modal-content cat-modal-compact" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Başlık (Kompakt) */}
            <div className="cat-modal-header-compact">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="cat-modal-icon-badge-sm">
                  {modalMode === 'add' ? <Plus size={18} /> : <Edit3 size={18} />}
                </div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#1e292d' }}>
                  {modalMode === 'add' ? 'Yeni Kategori Ekle' : 'Kategoriyi Düzenle'}
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
              {/* ORTADA KARE GÖRSEL YÜKLEME VE ÖNİZLEME (Kategori Adının Üstünde) */}
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
                    title="Görsel yüklemek için tıklayın"
                  >
                    <div className="cat-square-icon-circle">
                      <Camera size={22} color="#346c80" />
                    </div>
                    <span className="cat-square-upload-title">Görsel Seç</span>
                    <span className="cat-square-upload-sub">Kare (1:1)</span>
                  </div>
                )}
              </div>

              {/* Kategori Adı (Görselin Altında) */}
              <div className="cat-form-group">
                <label className="cat-form-label">
                  Kategori Adı <span style={{ color: '#b84a39' }}>*</span>
                </label>
                <input
                  type="text"
                  className="cat-form-input"
                  placeholder="Örn: Sıcak İçecekler, Tatlılar..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              {/* Kategori Durumu Switch (Kompakt Tek Satır) */}
              <div className="cat-form-switch-row-compact">
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#1e292d' }}>
                    {formStatus === 1 ? 'Aktif (Menüde Göster)' : 'Pasif (Gizle)'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#486b78' }}>
                    {formStatus === 1 ? 'POS ve müşteri menüsünde görünür' : 'Menülerden geçici olarak gizlenir'}
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
                      <span>{modalMode === 'add' ? 'Kategoriyi Oluştur' : 'Değişiklikleri Kaydet'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: SİLME ONAYI (SOFT DELETE - STATUS = -1)           */}
      {/* ======================================================== */}
      {deleteModalCategory && (
        <div className="pos-modal-overlay" onClick={() => setDeleteModalCategory(null)}>
          <div 
            className="pos-modal-content cat-delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cat-delete-icon-wrapper">
              <AlertTriangle size={32} color="#b84a39" />
            </div>

            <h3 className="cat-delete-title">
              "{deleteModalCategory.name}" Kategorisini Silmek İstiyor Musunuz?
            </h3>

            {deleteModalCategory.total_products > 0 ? (
              <div className="cat-delete-blocked-box">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <AlertTriangle size={24} color="#b84a39" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ textAlign: 'left' }}>
                    <strong style={{ display: 'block', color: '#b84a39', fontSize: '0.95rem', marginBottom: '4px' }}>
                      Kategori Silinemez!
                    </strong>
                    <span style={{ fontSize: '0.86rem', color: '#1b414f', lineHeight: 1.45 }}>
                      Bu kategoriye bağlı <strong>{deleteModalCategory.total_products} adet ürün</strong> bulunmaktadır. Kategoriyi silebilmek için önce bu kategorideki ürünleri başka bir kategoriye taşımalı veya silmelisiniz.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="cat-delete-desc">
                Bu işlem kategorinin durumunu <strong>-1 (Silinmiş)</strong> yapacaktır. 
                Kategori menülerden ve POS ekranından tamamen kaldırılacaktır.
              </p>
            )}

            <div className="cat-modal-footer" style={{ marginTop: '22px' }}>
              {deleteModalCategory.total_products > 0 ? (
                <button
                  type="button"
                  onClick={() => setDeleteModalCategory(null)}
                  className="cat-btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Tamam, Anladım
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setDeleteModalCategory(null)}
                    className="cat-btn-secondary"
                    disabled={isDeleting}
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="cat-btn-danger"
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
                        <span>Evet, Kategoriyi Sil</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: KATEGORİ DEĞİŞİKLİK VE İŞLEM GEÇMİŞİ (AUDIT LOGS) */}
      {/* ======================================================== */}
      <HistoryModal
        isOpen={!!historyModalCategory}
        onClose={handleCloseHistoryModal}
        entityType="category"
        entity={historyModalCategory}
        historyList={categoryHistory}
        loading={historyLoading}
        onRefresh={() => historyModalCategory && handleOpenHistoryModal(historyModalCategory)}
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
