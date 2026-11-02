import React, { useState, useEffect } from 'react';
import { createSocket } from '../lib/api';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import UserSwitcher from './UserSwitcher';
import Navbar from './Navbar';
import TableOrderModal from './TableOrderModal';
import { useToast } from './ui/ToastProvider';
import { useConfirm } from './ui/ConfirmProvider';
import { 
  Coffee, 
  Menu, 
  Plus, 
  Edit2, 
  Trash2, 
  LogOut, 
  X, 
  AlertCircle,
  UtensilsCrossed,
  Settings,
  Check,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Clock,
  QrCode,
  BellRing
} from 'lucide-react';
import useQrRequests from './qr/useQrRequests';
import QrRequestsModal from './qr/QrRequestsModal';
import QrInbox from './qr/QrInbox';
import QrOrderingToggle from './qr/QrOrderingToggle';
import TableQrModal from './qr/TableQrModal';
import { printQrCards, MENU_URL_CONFIGURED, MENU_URL_WARNING } from '../lib/qrMenu';

// Masa kodu adla aynı numarayı taşıyorsa ("Masa 1" / "M-1") kartta tekrar göstermeye gerek yok
const isRedundantCode = (title, code) => {
  const digits = (s) => String(s).replace(/\D/g, '');
  return digits(code) !== '' && digits(title) === digits(code);
};

export default function TableList() {
  const { user, logout, can, canAny } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  // QR menü siparişleri: onay bekleyenler ve masa QR kodu penceresi
  // (yeni sipariş sesi ve mesajı her sayfada çalışan QrNotifier'dadır)
  const [showQrRequests, setShowQrRequests] = useState(false);
  const [qrTable, setQrTable] = useState(null);
  const { requests: qrRequests, reload: reloadQr } = useQrRequests({ enabled: can('pos.view') });
  // Salon düzeni yetkileri: masa ekleme / düzenleme-sıralama / kaldırma
  const canManageTables = canAny(['tables.create', 'tables.edit', 'tables.delete']);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal durumları
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeOrderTable, setActiveOrderTable] = useState(null);
  
  // Form alanları
  const [tableTitle, setTableTitle] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [formError, setFormError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Masaları sunucudan çek
  const fetchTables = async () => {
    try {
      const res = await axios.get('/api/tables');
      if (res.data.success) {
        setTables(res.data.tables);
      }
    } catch (error) {
      console.error('Masalar getirilemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();

    const socket = createSocket();

    socket.on('table:created', (newTable) => {
      setTables((prev) => [...prev, newTable]);
    });

    // Sipariş, ödeme, iptal vb. sonrası masa durumu/tutarı/açılış saati değişir; güncel hali sunucudan al
    socket.on('table:updated', () => {
      fetchTables();
    });

    // QR sipariş geldi / onaylandı / reddedildi: masa kartlarındaki QR rozeti güncellensin
    socket.on('qr:request', () => {
      fetchTables();
    });

    socket.on('table:deleted', ({ id }) => {
      setTables((prev) => prev.filter((t) => t.id !== id));
    });

    socket.on('tables:reordered', (tableIds) => {
      setTables((prev) => {
        const sorted = [...prev].sort((a, b) => {
          return tableIds.indexOf(a.id) - tableIds.indexOf(b.id);
        });
        return sorted;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Sürükle ve Bırak (Drag & Drop) State'leri
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState(null);

  const handleDragStart = (e, index) => {
    if (!isEditMode) return;
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragEnter = (index) => {
    if (!isEditMode) return;
    if (draggedItemIndex !== index) {
      setDragOverItemIndex(index);
    }
  };

  const handleDragOver = (e) => {
    if (!isEditMode) return;
    e.preventDefault(); // Drop işlemine izin ver
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, dropIndex) => {
    if (!isEditMode) return;
    e.preventDefault();

    if (draggedItemIndex === null || draggedItemIndex === dropIndex) {
      setDraggedItemIndex(null);
      setDragOverItemIndex(null);
      return;
    }

    const newTables = [...tables];
    const draggedItem = newTables.splice(draggedItemIndex, 1)[0];
    newTables.splice(dropIndex, 0, draggedItem);

    setTables(newTables);
    setDraggedItemIndex(null);
    setDragOverItemIndex(null);

    // Yeni sıralamayı veritabanına kaydet
    try {
      const tableIds = newTables.map((t) => t.id);
      await axios.post('/api/tables/reorder', { tableIds });
    } catch (err) {
      console.error('Sıralama sunucuya kaydedilemedi:', err);
    }
  };

  const handleDragEnd = () => {
    setDraggedItemIndex(null);
    setDragOverItemIndex(null);
  };

  // Masaların sırasını bir yukarı veya bir aşağı taşı (mobil & dokunmatik cihazlar için kolaylık)
  const moveTableOrder = async (index, direction, e) => {
    e.stopPropagation();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tables.length) return;

    const newTables = [...tables];
    const item = newTables.splice(index, 1)[0];
    newTables.splice(targetIndex, 0, item);
    setTables(newTables);

    try {
      const tableIds = newTables.map((t) => t.id);
      await axios.post('/api/tables/reorder', { tableIds });
    } catch (err) {
      console.error('Sıralama sunucuya kaydedilemedi:', err);
    }
  };

  // Masa Ekle
  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!tableTitle.trim()) {
      setFormError('Lütfen masa adını giriniz.');
      return;
    }

    setFormError('');
    setActionLoading(true);

    try {
      const res = await axios.post('/api/tables', {
        title: tableTitle,
        table_number: tableNumber
      });
      if (res.data.success) {
        setShowAddModal(false);
        setTableTitle('');
        setTableNumber('');
        fetchTables();
      }
    } catch (error) {
      setFormError(error.response?.data?.message || 'Masa eklenirken bir hata oluştu.');
    } finally {
      setActionLoading(false);
    }
  };

  // Masa Düzenle
  const handleEditTable = async (e) => {
    e.preventDefault();
    if (!tableTitle.trim()) {
      setFormError('Lütfen masa adını giriniz.');
      return;
    }

    setFormError('');
    setActionLoading(true);

    try {
      const res = await axios.put(`/api/tables/${selectedTable.id}`, {
        title: tableTitle
      });
      if (res.data.success) {
        setShowEditModal(false);
        setSelectedTable(null);
        setTableTitle('');
        fetchTables();
      }
    } catch (error) {
      setFormError(error.response?.data?.message || 'Masa güncellenirken bir hata oluştu.');
    } finally {
      setActionLoading(false);
    }
  };

  // Masayı Kaldır (Soft Delete - Geçmiş siparişleri korur)
  const handleDeleteTable = async (tableId, e) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Masa kaldırılsın mı?',
      message: 'Masa salondan kaldırılacak. Geçmiş sipariş ve satış kayıtları korunur.',
      confirmLabel: 'Masayı kaldır',
      danger: true
    });
    if (!ok) return;

    try {
      const res = await axios.delete(`/api/tables/${tableId}`);
      if (res.data.success) {
        showToast(res.data.message || 'Masa kaldırıldı.', 'deleted');
        fetchTables();
      }
    } catch (error) {
      showToast(error.response?.data?.message || 'Masa kaldırılamadı.', 'error');
    }
  };

  const openEditModal = (table, e) => {
    e.stopPropagation();
    setSelectedTable(table);
    setTableTitle(table.title);
    setTableNumber(table.table_number);
    setFormError('');
    setShowEditModal(true);
  };

  // İstatistikler
  const totalTables = tables.length;
  const emptyCount = tables.filter(t => t.status === 'empty').length;
  const occupiedCount = tables.filter(t => t.status === 'occupied').length;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'occupied':
        return { 
          label: 'Dolu', 
          bg: '#fbf0ed', 
          border: '#f3c7be', 
          color: '#c65742'
        };
      case 'bill_requested':
        return { 
          label: 'Hesap İstendi', 
          bg: '#fef7e7', 
          border: '#fae3a6', 
          color: '#b88214'
        };
      case 'empty':
      default:
        return { 
          label: 'Boş', 
          bg: '#eef5f0', 
          border: '#cce3d2', 
          color: '#4d8058'
        };
    }
  };

  // Dolu masaların "açık kalma süresi" dakikada bir güncellenir
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (openedAt) => {
    if (!openedAt) return null;
    const minutes = Math.max(0, Math.floor((now - new Date(openedAt).getTime()) / 60000));
    if (minutes < 1) return 'Yeni';
    if (minutes < 60) return `${minutes} dk`;
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return m ? `${h} sa ${m} dk` : `${h} sa`;
  };
  const isLongStay = (openedAt) => openedAt && now - new Date(openedAt).getTime() > 90 * 60000;
  const formatMoney = (v) => `₺${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="pos-page-container">
      
      {/* YANDAN AÇILAN MODAL ÇEKMECESİ (Sidebar Drawer) */}
      <Sidebar 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activePage="tables"
      />

      {/* ÜST BAR (Ortak Navbar Bileşeni) */}
      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        style={{ marginBottom: isEditMode ? '12px' : '20px' }}
        stats={
          <>
            <div className="pos-stat-pill pos-stat-pill-total">
              Toplam: <strong>{totalTables}</strong>
            </div>
            <div className="pos-stat-pill pos-stat-pill-empty">
              Boş: <strong>{emptyCount}</strong>
            </div>
            <div className="pos-stat-pill pos-stat-pill-occupied">
              Dolu: <strong>{occupiedCount}</strong>
            </div>
            {can('pos.view') && <QrOrderingToggle canEdit={can('tables.edit')} />}
          </>
        }
        actions={canManageTables && (
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className="pos-edit-btn"
            style={{
              background: isEditMode ? '#346c80' : '#dbe9ee',
              color: isEditMode ? '#ffffff' : '#1b414f',
              border: '1.5px solid',
              borderColor: isEditMode ? '#346c80' : '#6293a3',
              boxShadow: isEditMode ? '0 4px 12px rgba(52, 108, 128, 0.25)' : 'none'
            }}
            title={isEditMode ? 'Bitir' : 'Düzenle'}
          >
            {isEditMode ? <Check size={16} /> : <Settings size={16} />}
            <span>{isEditMode ? 'Bitir' : 'Düzenle'}</span>
          </button>
        )}
      />

      {/* DÜZENLEME MODU AKTİF UYARI & İŞLEM ÇUBUĞU */}
      {isEditMode && (
        <div style={{
          background: 'linear-gradient(135deg, #fbf6ee 0%, #f5ece0 100%)',
          borderRadius: '14px',
          padding: '10px 14px',
          border: '1.5px dashed #6293a3',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          animation: 'fadeIn 0.2s ease',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 200px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#b88214',
              animation: 'pulse 1.5s infinite',
              flexShrink: 0
            }}></span>
            <style>{`@keyframes pulse { 0% { transform: scale(0.9); opacity: 0.8; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.9); opacity: 0.8; } }`}</style>
            <div>
              <strong style={{ fontSize: '0.84rem', color: '#1b414f', marginRight: '4px' }}>
                Düzenleme Modu:
              </strong>
              <span style={{ fontSize: '0.78rem', color: '#486b78' }}>
                Masaları sürükleyip bırakarak sırasını değiştirebilirsiniz.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {can('tables.create') && (
            <button
              onClick={() => {
                setTableTitle('');
                setTableNumber(`M-${tables.length + 1}`);
                setFormError('');
                setShowAddModal(true);
              }}
              style={{
                background: 'linear-gradient(135deg, #346c80 0%, #1b414f 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 4px 12px rgba(52, 108, 128, 0.2)',
                touchAction: 'manipulation'
              }}
            >
              <Plus size={14} />
              <span>Yeni Masa</span>
            </button>
            )}

            {can('tables.edit') && tables.length > 0 && (
            <button
              type="button"
              className="pos-card-btn-qr"
              style={{ padding: '7px 12px', fontSize: '0.8rem', borderRadius: '8px' }}
              onClick={async () => {
                if (!MENU_URL_CONFIGURED && !(await confirm({
                  title: 'Menü adresi ayarlanmamış',
                  message: MENU_URL_WARNING,
                  confirmLabel: 'Yine de yazdır'
                }))) return;
                printQrCards(tables).catch(err => showToast(err.message, 'error'));
              }}
              title="Tüm masaların QR kodlarını yazdırılabilir kartlar olarak açar"
            >
              <QrCode size={14} /> Tüm QR kodlarını yazdır
            </button>
            )}
            <button
              onClick={() => setIsEditMode(false)}
              style={{
                background: '#ffffff',
                border: '1px solid #6293a3',
                color: '#346c80',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                touchAction: 'manipulation'
              }}
            >
              Tamamla
            </button>
          </div>
        </div>
      )}

      {/* ONAY BEKLEYEN QR SİPARİŞLERİ */}
      {!isEditMode && (
        <QrInbox
          requests={qrRequests}
          onShowAll={() => setShowQrRequests(true)}
          onOpenTable={(tableId) => {
            const table = tables.find(t => t.id === tableId);
            if (table) setActiveOrderTable(table);
            else setShowQrRequests(true);
          }}
        />
      )}

      {/* MASALAR IZGARASI (Mobilde 2 Sütun, Masaüstünde Çok Sütun) */}
      <div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#486b78' }}>
            <p>Masalar yükleniyor...</p>
          </div>
        ) : tables.length === 0 ? (
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '60px 20px',
            textAlign: 'center',
            border: '1px solid #b6ced6',
            color: '#486b78'
          }}>
            <Coffee size={40} color="#6293a3" style={{ marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.2rem', color: '#1e292d', marginBottom: '6px' }}>Henüz Masa Eklenmemiş</h3>
            <p style={{ fontSize: '0.9rem' }}>Yukarıdaki "Düzenle" butonuna basarak yeni masalarınızı ekleyebilirsiniz.</p>
          </div>
        ) : (
          <div className="pos-tables-grid">
            {tables.map((table, index) => {
              const statusInfo = getStatusBadge(table.status);
              const isOccupied = table.status === 'occupied' || table.status === 'bill_requested';
              const isDragging = draggedItemIndex === index;
              const isDragOver = dragOverItemIndex === index;

              return (
                <div
                  key={table.id}
                  className={`pos-table-card is-${table.status || 'empty'} ${isEditMode ? 'is-editing' : ''} ${!isEditMode && Number(table.pending_qr_count) > 0 ? 'has-qr' : ''}`}
                  draggable={isEditMode && can('tables.edit')}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  // Normal görünüm (boş / dolu / hesap istendi) CSS sınıflarındadır; burada yalnızca sürükle-bırak ve düzenleme durumu
                  style={isEditMode ? {
                    background: isDragOver ? '#fcf8f3' : undefined,
                    border: isDragOver ? '2.5px solid #346c80' : '2px dashed #3d778c',
                    boxShadow: isDragOver ? '0 16px 36px rgba(52, 108, 128, 0.25)' : '0 6px 18px rgba(61, 119, 140, 0.12)',
                    opacity: isDragging ? 0.35 : 1,
                    transform: isDragOver ? 'scale(1.02)' : isDragging ? 'scale(0.96)' : 'none',
                    cursor: 'grab',
                    userSelect: 'none'
                  } : undefined}
                  onClick={() => {
                    if (!isEditMode) {
                      setActiveOrderTable(table);
                    }
                  }}
                >
                  {/* ÜST SATIR: Sıra Numarası Rozeti (Düzenleme Modu) & Durum Rozeti (Sağ Üst) */}
                  <div className="pos-card-top-row">
                    {isEditMode ? (
                      <div className="pos-card-order-badge" title="Sürükleyip bırakarak masanın sırasını değiştirebilirsiniz">
                        <GripVertical size={13} />
                        <span>#{index + 1}</span>
                      </div>
                    ) : isOccupied && formatElapsed(table.opened_at) ? (
                      <span
                        className={`pos-card-elapsed ${isLongStay(table.opened_at) ? 'long' : ''}`}
                        title={`Masa ${new Date(table.opened_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} itibarıyla açık`}
                      >
                        <Clock size={12} />
                        {formatElapsed(table.opened_at)}
                      </span>
                    ) : (
                      <div />
                    )}

                    {isOccupied ? (
                      <span className="pos-card-status-pill">
                        <i className="pos-card-status-dot" />
                        <span className="pos-status-text-full">{statusInfo.label}</span>
                        <span className="pos-status-text-short">
                          {statusInfo.label === 'Hesap İstendi' ? 'Hesap' : statusInfo.label}
                        </span>
                      </span>
                    ) : (
                      <span
                        className="pos-table-status-badge"
                        style={{
                          background: statusInfo.bg,
                          color: statusInfo.color,
                          border: `1px solid ${statusInfo.border}`
                        }}
                      >
                        {statusInfo.label}
                      </span>
                    )}
                  </div>

                  {/* ORTA KISIM: Y Ekseninde Masanın Ortasında, Sola Yaslı Masa Adı ve Kodu */}
                  <div className="pos-card-center-row">
                    <h3 className="pos-table-title">
                      {table.title || table.table_number}
                    </h3>
                    {/* Kod, adla aynı bilgiyi veriyorsa ("Masa 1" / "M-1") yalnızca düzenleme modunda gösterilir */}
                    {table.table_number && table.title && table.title !== table.table_number &&
                      (isEditMode || !isRedundantCode(table.title, table.table_number)) && (
                      <span className="pos-table-code">
                        {table.table_number}
                      </span>
                    )}
                  </div>

                  {/* ALT KISIM: Sağ Altta Masa Tutarı (Düzenleme Modunda Butonlar + Tutar) */}
                  <div className="pos-card-bottom-row">
                    {isEditMode ? (
                      <div className="pos-card-edit-actions">
                        {can('tables.edit') && (
                        <button
                          onClick={(e) => openEditModal(table, e)}
                          className="pos-card-btn-edit"
                          title="Masa Adını Değiştir"
                        >
                          <Edit2 size={12} />
                          <span>Düzenle</span>
                        </button>
                        )}

                        {can('tables.edit') && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setQrTable(table); }}
                          className="pos-card-btn-qr"
                          title="Masanın QR kodunu göster / indir / yazdır"
                        >
                          <QrCode size={12} />
                          <span>QR</span>
                        </button>
                        )}

                        {can('tables.delete') && (
                        <button
                          onClick={(e) => handleDeleteTable(table.id, e)}
                          disabled={isOccupied}
                          className="pos-card-btn-delete"
                          title="Masayı Kaldır"
                        >
                          <Trash2 size={12} />
                          <span>Sil</span>
                        </button>
                        )}
                      </div>
                    ) : (
                      <div />
                    )}

                    {isOccupied && (
                      <span className="pos-card-amount">{formatMoney(table.active_total)}</span>
                    )}
                  </div>

                  {/* Bu masadan gelen, onay bekleyen QR sipariş */}
                  {!isEditMode && Number(table.pending_qr_count) > 0 && (
                    <span className="pos-card-qr-badge">
                      <BellRing size={12} />
                      {Number(table.pending_qr_count) > 1 ? `${table.pending_qr_count} yeni sipariş` : 'Yeni sipariş'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* YENİ MASA EKLE MODALI */}
      {showAddModal && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.25rem', fontWeight: '700', color: '#1e292d', margin: 0 }}>
                Yeni Masa Ekle
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', color: '#7f969f', cursor: 'pointer', padding: '6px' }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{
                background: '#fdf2f0',
                border: '1px solid #f6cfc7',
                borderRadius: '10px',
                padding: '10px 14px',
                color: '#b84a39',
                fontSize: '0.86rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddTable}>
              <div className="cafe-input-wrapper" style={{ marginBottom: '16px' }}>
                <label className="cafe-label">Masa Başlığı / Adı</label>
                <input
                  type="text"
                  className="cafe-input"
                  placeholder="Örn: Masa 13, Bahçe 2, Teras 1"
                  value={tableTitle}
                  onChange={(e) => setTableTitle(e.target.value)}
                  style={{ paddingLeft: '16px' }}
                  autoFocus
                />
              </div>

              <div className="cafe-input-wrapper" style={{ marginBottom: '22px' }}>
                <label className="cafe-label">Masa Kodu (İsteğe Bağlı)</label>
                <input
                  type="text"
                  className="cafe-input"
                  placeholder="Örn: M-13"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  style={{ paddingLeft: '16px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    flex: 1,
                    background: '#dbe9ee',
                    border: '1px solid #b6ced6',
                    color: '#324f5a',
                    padding: '12px',
                    borderRadius: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    minHeight: '44px'
                  }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #346c80 0%, #1b414f 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    minHeight: '44px'
                  }}
                >
                  {actionLoading ? 'Ekleniyor...' : 'Masayı Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MASA DÜZENLE MODALI */}
      {showEditModal && selectedTable && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.25rem', fontWeight: '700', color: '#1e292d', margin: 0 }}>
                Masa Adını Düzenle
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: 'none', border: 'none', color: '#7f969f', cursor: 'pointer', padding: '6px' }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{
                background: '#fdf2f0',
                border: '1px solid #f6cfc7',
                borderRadius: '10px',
                padding: '10px 14px',
                color: '#b84a39',
                fontSize: '0.86rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditTable}>
              <div className="cafe-input-wrapper" style={{ marginBottom: '22px' }}>
                <label className="cafe-label">Masa Adı</label>
                <input
                  type="text"
                  className="cafe-input"
                  value={tableTitle}
                  onChange={(e) => setTableTitle(e.target.value)}
                  style={{ paddingLeft: '16px' }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{
                    flex: 1,
                    background: '#dbe9ee',
                    border: '1px solid #b6ced6',
                    color: '#324f5a',
                    padding: '12px',
                    borderRadius: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    minHeight: '44px'
                  }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #346c80 0%, #1b414f 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    minHeight: '44px'
                  }}
                >
                  {actionLoading ? 'Güncelleniyor...' : 'Güncelle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Masa Sipariş & Adisyon Ekranı Modalı */}
      {activeOrderTable && (
        <TableOrderModal 
          key={activeOrderTable.id}
          table={activeOrderTable}
          onClose={() => setActiveOrderTable(null)}
          onTableUpdated={fetchTables}
          onTableSwitched={setActiveOrderTable}
        />
      )}

      {/* Onay bekleyen tüm QR siparişleri */}
      {showQrRequests && (
        <QrRequestsModal
          requests={qrRequests}
          canAct={can('pos.order')}
          onClose={() => setShowQrRequests(false)}
          onChanged={() => { reloadQr(); fetchTables(); }}
        />
      )}

      {/* Masanın QR kodu */}
      {qrTable && (
        <TableQrModal
          table={qrTable}
          canRegenerate={can('tables.edit')}
          onClose={() => setQrTable(null)}
          onRegenerated={fetchTables}
        />
      )}

    </div>
  );
}
