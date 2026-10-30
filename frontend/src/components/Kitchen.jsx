import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import {
  ChefHat,
  Coffee,
  Clock,
  CheckCircle2,
  AlertCircle,
  Volume2,
  VolumeX,
  RefreshCw,
  Search,
  Check,
  RotateCcw,
  Sparkles,
  Utensils,
  Layers,
  ArrowRight,
  Flame,
  User,
  Maximize,
  Minimize,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import './kitchen.css';

/**
 * Nazik Mutfak Bildirim Zili (Web Audio API - Harici dosya gerektirmez)
 */
const playKitchenChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // 1. Ton (C6 / 1046.5 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1046.5, ctx.currentTime);
    gain1.gain.setValueAtTime(0.18, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);

    // 2. Ton (E6 / 1318.5 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.22, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.6);
  } catch (err) {
    // Tarayıcı otomatik ses engeline karşı sessizce geç
  }
};

/**
 * Geçen Süreyi Hesaplama ve Renk Kodu Belirleme (Saat ve Gün Formatlı)
 */
const getElapsedTimeInfo = (createdAt) => {
  if (!createdAt) return { text: 'Yeni', className: 'fresh', minutes: 0 };
  try {
    const diffMs = new Date() - new Date(createdAt);
    const minutes = Math.floor(diffMs / 60000);

    if (minutes < 1) {
      return { text: 'Az önce', className: 'fresh', minutes };
    } else if (minutes < 5) {
      return { text: `${minutes} dk önce`, className: 'fresh', minutes };
    } else if (minutes < 15) {
      return { text: `${minutes} dk önce`, className: 'warning', minutes };
    } else if (minutes < 60) {
      return { text: `${minutes} dk önce`, className: 'urgent', minutes };
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const rem = minutes % 60;
      return { text: `${hours}s ${rem > 0 ? `${rem}dk` : ''} önce`, className: 'urgent', minutes };
    } else {
      const days = Math.floor(minutes / 1440);
      return { text: `${days} gün önce`, className: 'urgent', minutes };
    }
  } catch (e) {
    return { text: 'Yeni', className: 'fresh', minutes: 0 };
  }
};

export default function Kitchen() {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Mutfak Verileri
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total_pending: 0, total_preparing: 0, total_ready: 0 });

  // Arayüz Filtre ve Tercihleri
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'pending' | 'preparing' | 'ready' | 'delivered'
  const [viewMode, setViewMode] = useState('tickets'); // 'tickets' | 'summary'
  const [searchQuery, setSearchQuery] = useState('');
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    return localStorage.getItem('kafe_kds_sound') !== 'false';
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Masalardaki teslim edilmiş kalemleri gösterme/gizleme durumu (table_id: boolean)
  const [expandedDeliveredTables, setExpandedDeliveredTables] = useState({});

  // Tek tıkla ürün adı ve notun tamamını açma/kapatma durumu (item_id: boolean)
  const [expandedItemIds, setExpandedItemIds] = useState({});
  const toggleItemExpand = (itemId) => {
    setExpandedItemIds(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Masa genel sipariş notunu tek tıkla açma/kapatma durumu (table_id: boolean)
  const [expandedOrderNotes, setExpandedOrderNotes] = useState({});
  const toggleOrderNoteExpand = (tableId) => {
    setExpandedOrderNotes(prev => ({
      ...prev,
      [tableId]: !prev[tableId]
    }));
  };

  // Toast Bildirimleri
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Zaman Takibi (Her 15 saniyede bir süreleri güncelle)
  const [, setClockTicker] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setClockTicker(t => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  // Tam Ekran Değişikliğini Dinle
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Ses Tercihini Kaydet
  const toggleSound = () => {
    setIsSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('kafe_kds_sound', next ? 'true' : 'false');
      return next;
    });
  };

  // Mutfak Verilerini API'den Çek
  const fetchKitchenOrders = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const token = localStorage.getItem('kafe_token');
      const res = await fetch('/api/orders/kitchen', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
        setSummary(data.summary || []);
        setStats({
          total_pending: data.total_pending || 0,
          total_preparing: data.total_preparing || 0,
          total_ready: data.total_ready || 0
        });
      }
    } catch (err) {
      console.error('Mutfak siparişleri yüklenemedi:', err);
      if (!isSilent) showToast('Siparişler sunucudan alınamadı.', 'danger');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchKitchenOrders();
  }, []);

  // Socket.io Gerçek Zamanlı Dinleyiciler
  useEffect(() => {
    const socket = io();

    socket.on('order:created', (data) => {
      fetchKitchenOrders(true);
      if (isSoundEnabled) {
        playKitchenChime();
      }
      showToast(`🔔 Yeni Sipariş: ${data.order?.table_id ? `Masa ${data.order.table_id}` : 'Masa'}`, 'info');
    });

    socket.on('order:item_status_updated', () => {
      fetchKitchenOrders(true);
    });

    socket.on('order:updated', () => {
      fetchKitchenOrders(true);
    });

    socket.on('table:updated', () => {
      fetchKitchenOrders(true);
    });

    return () => {
      socket.disconnect();
    };
  }, [isSoundEnabled]);

  // Tek Bir Kalemin Durumunu Değiştir
  const handleUpdateItemStatus = async (itemId, newStatus) => {
    try {
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/orders/items/${itemId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await res.json();
      if (data.success) {
        setOrders(prevOrders => {
          return prevOrders.map(ord => {
            const updatedItems = ord.items.map(it => {
              if (it.id === itemId) {
                return { ...it, item_status: newStatus };
              }
              return it;
            });
            return { ...ord, items: updatedItems };
          });
        });

        const statusMap = {
          preparing: 'Hazırlanıyor olarak işaretlendi.',
          ready: 'Servise Hazır olarak işaretlendi.',
          delivered: 'Teslim edildi.',
          pending: 'Mutfağa geri alındı.'
        };
        showToast(statusMap[newStatus] || 'Durum güncellendi.', 'success');
        fetchKitchenOrders(true);
      } else {
        showToast(data.message || 'Durum güncellenemedi.', 'danger');
      }
    } catch (err) {
      console.error('Durum değiştirme hatası:', err);
      showToast('Sunucu hatası oluştu.', 'danger');
    }
  };

  // Masadaki Tüm Ürünleri Tek Tıkla Teslim Et
  const handleDeliverAllTable = async (tableId, tableTitle) => {
    try {
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/orders/kitchen/table/${tableId}/deliver-all`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      const data = await res.json();
      if (data.success) {
        showToast(`${tableTitle} masasındaki tüm siparişler teslim edildi.`, 'success');
        fetchKitchenOrders(true);
      } else {
        showToast(data.message || 'İşlem gerçekleştirilemedi.', 'danger');
      }
    } catch (err) {
      console.error('Tümünü teslim etme hatası:', err);
      showToast('Sunucu hatası oluştu.', 'danger');
    }
  };

  const toggleDeliveredSection = (tableId) => {
    setExpandedDeliveredTables(prev => ({
      ...prev,
      [tableId]: !prev[tableId]
    }));
  };

  // Akıllı Filtrelenmiş Sipariş Fişleri
  const filteredOrders = useMemo(() => {
    return orders.map(ord => {
      const allItems = ord.items || [];
      const activeItems = allItems.filter(i => ['pending', 'preparing', 'ready'].includes(i.item_status));
      const deliveredItems = allItems.filter(i => i.item_status === 'delivered');

      let displayActive = activeItems;
      let displayDelivered = deliveredItems;

      // Sekme Filtrelemesi
      if (activeFilter === 'pending') {
        displayActive = activeItems.filter(i => i.item_status === 'pending');
        displayDelivered = [];
      } else if (activeFilter === 'preparing') {
        displayActive = activeItems.filter(i => i.item_status === 'preparing');
        displayDelivered = [];
      } else if (activeFilter === 'ready') {
        displayActive = activeItems.filter(i => i.item_status === 'ready');
        displayDelivered = [];
      } else if (activeFilter === 'delivered') {
        displayActive = [];
        displayDelivered = deliveredItems;
      } else {
        // 'all' sekmesi: Yalnızca bekleyen/hazırlanan aktif kalemler ana odakta gösterilir.
        // Eğer masanın HİÇ aktif kalemi kalmamışsa (hepsi teslim edilmişse), 'all' sekmesini kalabalıklaştırmasın;
        // o masa yalnızca 'Son Teslim Edilenler' sekmesinde gösterilir!
        if (activeItems.length === 0 && deliveredItems.length > 0) {
          return null; // Aktif ekrandan çıkar
        }
      }

      // Arama Filtrelemesi
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTable = ord.table_title.toLowerCase().includes(q) || (ord.table_number && ord.table_number.toLowerCase().includes(q));
        if (!matchesTable) {
          displayActive = displayActive.filter(i => i.product_name.toLowerCase().includes(q) || (i.note && i.note.toLowerCase().includes(q)));
          displayDelivered = displayDelivered.filter(i => i.product_name.toLowerCase().includes(q) || (i.note && i.note.toLowerCase().includes(q)));
        }
      }

      if (displayActive.length === 0 && displayDelivered.length === 0) {
        return null;
      }

      return {
        ...ord,
        activeItems: displayActive,
        deliveredItems: displayDelivered,
        hasPendingOrPreparing: displayActive.some(i => ['pending', 'preparing', 'ready'].includes(i.item_status))
      };
    }).filter(Boolean);
  }, [orders, activeFilter, searchQuery]);

  return (
    <div className="pos-page-container">
      {/* Sol Çekmece Menü */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        activePage="kitchen" 
      />

      {/* Üst Bar (Navbar) */}
      <Navbar 
        onOpenSidebar={() => setIsSidebarOpen(true)} 
        title="Mutfak Ekranı"
        stats={
          <>
            <div className="pos-stat-pill pos-stat-pill-total">
              Masalar: <strong>{filteredOrders.length}</strong>
            </div>
            <div className="pos-stat-pill" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
              Mutfakta: <strong>{stats.total_pending}</strong>
            </div>
            <div className="pos-stat-pill" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
              Hazırlanıyor: <strong>{stats.total_preparing}</strong>
            </div>
            <div className="pos-stat-pill" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>
              Hazır: <strong>{stats.total_ready}</strong>
            </div>
          </>
        }
      />

      {/* Toast Bildirim Kutusu */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: toast.type === 'danger' ? '#dc2626' : toast.type === 'info' ? '#0284c7' : '#15803d',
          color: '#ffffff',
          padding: '10px 18px',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 700,
          fontSize: '0.88rem',
          fontFamily: "'Outfit', sans-serif"
        }}>
          {toast.type === 'danger' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Ana KDS Paneli */}
      <div style={{ marginTop: '12px' }}>
        
        {/* Üst Filtre & Araçlar Barı */}
        <div className="kds-top-bar">
          <div className="kds-controls-row">
            {/* Durum Sekmeleri */}
            <div className="kds-filter-tabs">
              <button
                type="button"
                className={`kds-tab-btn ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                <Utensils size={14} />
                <span>Aktif Siparişler</span>
                <span className="kds-tab-counter">
                  {orders.reduce((s, o) => s + (o.items || []).filter(i => i.item_status !== 'delivered').length, 0)}
                </span>
              </button>

              <button
                type="button"
                className={`kds-tab-btn ${activeFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setActiveFilter('pending')}
              >
                <Clock size={14} />
                <span>Mutfakta</span>
                {stats.total_pending > 0 && (
                  <span className="kds-tab-counter">{stats.total_pending}</span>
                )}
              </button>

              <button
                type="button"
                className={`kds-tab-btn ${activeFilter === 'preparing' ? 'active' : ''}`}
                onClick={() => setActiveFilter('preparing')}
              >
                <Flame size={14} />
                <span>Hazırlanıyor</span>
                {stats.total_preparing > 0 && (
                  <span className="kds-tab-counter">{stats.total_preparing}</span>
                )}
              </button>

              <button
                type="button"
                className={`kds-tab-btn ${activeFilter === 'ready' ? 'active' : ''}`}
                onClick={() => setActiveFilter('ready')}
              >
                <Sparkles size={14} />
                <span>Servise Hazır</span>
                {stats.total_ready > 0 && (
                  <span className="kds-tab-counter">{stats.total_ready}</span>
                )}
              </button>

              <button
                type="button"
                className={`kds-tab-btn ${activeFilter === 'delivered' ? 'active' : ''}`}
                onClick={() => setActiveFilter('delivered')}
              >
                <CheckCircle2 size={14} />
                <span>Son Teslim Edilenler</span>
              </button>
            </div>

            {/* Sağ Araçlar: Arama, Görünüm Modu, Tam Ekran, Ses & Yenile */}
            <div className="kds-actions-group">
              {/* Hızlı Arama */}
              <div style={{ position: 'relative', width: '150px' }}>
                <Search size={14} color="#6293a3" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Masa veya ürün..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 8px 5px 28px',
                    borderRadius: '8px',
                    border: '1.5px solid #b6ced6',
                    background: '#f8fafc',
                    fontSize: '0.8rem',
                    fontFamily: "'Outfit', sans-serif",
                    color: '#1e292d',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Görünüm Değiştirici (Fiş vs Toplu Özet) */}
              <button
                type="button"
                className="kds-action-toggle-btn"
                onClick={() => setViewMode(prev => prev === 'tickets' ? 'summary' : 'tickets')}
                title={viewMode === 'tickets' ? 'Toplu Ürün Özet Görünümüne Geç' : 'Masa Fişleri Görünümüne Geç'}
              >
                <Layers size={14} />
                <span>{viewMode === 'tickets' ? 'Toplu Özet' : 'Fişler'}</span>
              </button>

              {/* Tam Ekran Modu (Tabletler için F11 eşdeğeri) */}
              <button
                type="button"
                className="kds-action-toggle-btn"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekrana Geç'}
              >
                {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                <span>{isFullscreen ? 'Küçült' : 'Tam Ekran'}</span>
              </button>

              {/* Ses Bildirimi Aç/Kapat */}
              <button
                type="button"
                className={`kds-action-toggle-btn ${isSoundEnabled ? 'sound-on' : 'sound-off'}`}
                onClick={toggleSound}
                title={isSoundEnabled ? 'Sesli bildirimi kapat' : 'Sesli bildirimi aç'}
              >
                {isSoundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                <span>{isSoundEnabled ? 'Ses Açık' : 'Sessiz'}</span>
              </button>

              {/* Yenile Butonu */}
              <button
                type="button"
                className="kds-action-toggle-btn"
                onClick={() => fetchKitchenOrders(false)}
                title="Siparişleri Yenile"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* İÇERİK: FİŞLER (TICKETS) VEYA TOPLU ÖZET (SUMMARY)      */}
        {/* ======================================================== */}
        {loading && orders.length === 0 ? (
          <div className="kds-empty-box">
            <div className="kds-empty-icon">
              <RefreshCw size={28} className="animate-spin" />
            </div>
            <h3 className="kds-empty-title">Mutfak Siparişleri Yükleniyor...</h3>
            <p className="kds-empty-desc">Lütfen bekleyin, açık siparişler listeleniyor.</p>
          </div>
        ) : viewMode === 'summary' ? (
          /* ======================================================== */
          /* TOPLU ÜRÜN ÖZETİ (BATCH / BARISTA MODU)                  */
          /* ======================================================== */
          summary.length === 0 ? (
            <div className="kds-empty-box">
              <div className="kds-empty-icon">
                <ChefHat size={32} />
              </div>
              <h3 className="kds-empty-title">Hazırlanacak Ürün Yok</h3>
              <p className="kds-empty-desc">Şu anda mutfakta bekleyen veya hazırlanan herhangi bir ürün bulunmuyor.</p>
            </div>
          ) : (
            <div className="kds-summary-grid">
              {summary.map(item => (
                <div key={item.product_id} className="kds-summary-card">
                  <div className="kds-summary-header">
                    <div>
                      <h4 className="kds-summary-title">{item.product_name}</h4>
                      {item.category_name && (
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{item.category_name}</span>
                      )}
                    </div>
                    <span className="kds-summary-badge">
                      {item.total_quantity}x
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '5px', fontSize: '0.72rem' }}>
                    {item.pending_quantity > 0 && (
                      <span className="kds-status-pill pending">
                        {item.pending_quantity} Mutfakta
                      </span>
                    )}
                    {item.preparing_quantity > 0 && (
                      <span className="kds-status-pill preparing">
                        {item.preparing_quantity} Hazırlanıyor
                      </span>
                    )}
                    {item.ready_quantity > 0 && (
                      <span className="kds-status-pill ready">
                        {item.ready_quantity} Hazır
                      </span>
                    )}
                  </div>

                  <div className="kds-summary-tables-list">
                    {item.tables.map((t, idx) => (
                      <div key={idx} className="kds-summary-table-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <strong style={{ color: '#1e292d' }}>{t.table_title}</strong>
                          {t.note && (
                            <span style={{ fontSize: '0.72rem', color: '#b45309', background: '#fef3c7', padding: '1px 5px', borderRadius: '4px' }}>
                              {t.note}
                            </span>
                          )}
                        </div>
                        <span style={{ fontWeight: 800, color: '#346c80' }}>
                          {t.quantity} Adet
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* ======================================================== */
          /* KLASİK RESTORAN / KAFE FİŞ GÖRÜNÜMÜ (TICKETS GRID)       */
          /* ======================================================== */
          filteredOrders.length === 0 ? (
            <div className="kds-empty-box">
              <div className="kds-empty-icon">
                <ChefHat size={32} />
              </div>
              <h3 className="kds-empty-title">Aktif Mutfak Siparişi Bulunmuyor</h3>
              <p className="kds-empty-desc">
                {activeFilter === 'all'
                  ? 'Harika! Mutfakta bekleyen sipariş kalmadı, tüm masalara teslim edildi.'
                  : `Seçili filtrede ("${activeFilter}") sipariş bulunmuyor.`}
              </p>
            </div>
          ) : (
            <div className="kds-tickets-grid">
              {filteredOrders.map(order => {
                const timeInfo = getElapsedTimeInfo(order.order_created_at);
                const isDeliveredExpanded = Boolean(expandedDeliveredTables[order.table_id]);

                return (
                  <div 
                    key={order.table_id} 
                    className={`kds-ticket-card ${timeInfo.className === 'urgent' && order.hasPendingOrPreparing ? 'urgent' : ''}`}
                  >
                    {/* Fiş Üst Barı: Masa Adı & Canlı Süre Rozeti (SABİT ÜST) */}
                    <div className="kds-ticket-header">
                      <div className="kds-ticket-title-wrap">
                        <h3 className="kds-ticket-table-title">{order.table_title}</h3>
                        {order.table_number && (
                          <span className="kds-ticket-table-code">{order.table_number}</span>
                        )}
                      </div>

                      {/* Canlı Süre Sayacı */}
                      <div className={`kds-elapsed-badge ${timeInfo.className}`} title={`Sipariş Saati: ${new Date(order.order_created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}>
                        <Clock size={11} />
                        <span>{timeInfo.text}</span>
                      </div>
                    </div>

                    {/* Fiş Meta Bilgisi (Garson & Saat) */}
                    <div className="kds-ticket-meta">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={12} />
                        <span>{order.created_by_name || 'Personel'}</span>
                      </div>
                      <span>
                        Saat: <strong>{new Date(order.order_created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</strong>
                      </span>
                    </div>

                    {/* Varsa Genel Masa Notu (Tıklanabilir) */}
                    {order.order_note && (
                      <div 
                        className={`kds-order-note-banner ${expandedOrderNotes[order.table_id] ? 'expanded' : ''}`}
                        onClick={() => toggleOrderNoteExpand(order.table_id)}
                        role="button"
                        tabIndex={0}
                        title={expandedOrderNotes[order.table_id] ? "Masa notunu daralt" : "Masa notunun tamamını görmek için tıklayın"}
                      >
                        <AlertCircle size={13} style={{ flexShrink: 0 }} />
                        <span>Masa Notu: {order.order_note}</span>
                      </div>
                    )}

                    {/* Kalemler Listesi (KENDİ İÇİNDE KAYDIRILABİLİR ALAN) */}
                    <div className="kds-ticket-items">
                      {/* 1. AKTİF KALEMLER (Mutfakta, Hazırlanıyor, Hazır) */}
                      {order.activeItems.map(item => {
                        const isItemExpanded = Boolean(expandedItemIds[item.id]);

                        return (
                          <div 
                            key={item.id} 
                            className={`kds-item-row status-${item.item_status || 'pending'} ${isItemExpanded ? 'expanded' : ''}`}
                          >
                            {/* Sol: Adet + İsim + Varsa Not (Tek Tıkla Tam Metin Gösterir) */}
                            <div 
                              className="kds-item-left-compact"
                              onClick={() => toggleItemExpand(item.id)}
                              role="button"
                              tabIndex={0}
                              title={isItemExpanded ? "Metni daraltmak için tıklayın" : "Tam ürün adını ve notu görmek için tıklayın"}
                            >
                              <span className="kds-item-qty">{item.quantity}x</span>
                              <div className={`kds-item-text-group ${isItemExpanded ? 'expanded' : ''}`}>
                                <span className="kds-item-name" title={item.product_name}>
                                  {item.product_name}
                                </span>
                                {item.note && (
                                  <span className="kds-item-note-inline" title={item.note}>
                                    ⚠️ {item.note}
                                  </span>
                                )}
                              </div>
                            </div>

                          {/* Sağ: Kompakt Hızlı Aksiyon Butonları */}
                          <div className="kds-item-actions-compact">
                            {/* Mutfakta -> Hazırla & Teslim Et */}
                            {item.item_status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  className="kds-btn-action prepare"
                                  onClick={() => handleUpdateItemStatus(item.id, 'preparing')}
                                  title="Hazırlanıyor durumuna al"
                                >
                                  <Flame size={12} />
                                  <span>Hazırla</span>
                                </button>
                                <button
                                  type="button"
                                  className="kds-btn-action deliver"
                                  onClick={() => handleUpdateItemStatus(item.id, 'delivered')}
                                  title="Teslim Edildi yap"
                                >
                                  <Check size={13} />
                                  <span>Teslim</span>
                                </button>
                              </>
                            )}

                            {/* Hazırlanıyor -> Geri Al, Hazır & Teslim Et */}
                            {item.item_status === 'preparing' && (
                              <>
                                <button
                                  type="button"
                                  className="kds-btn-action undo"
                                  onClick={() => handleUpdateItemStatus(item.id, 'pending')}
                                  title="Mutfakta durumuna geri al"
                                >
                                  <RotateCcw size={11} />
                                </button>
                                <button
                                  type="button"
                                  className="kds-btn-action ready"
                                  onClick={() => handleUpdateItemStatus(item.id, 'ready')}
                                  title="Servise Hazır yap"
                                >
                                  <Sparkles size={12} />
                                  <span>Hazır</span>
                                </button>
                                <button
                                  type="button"
                                  className="kds-btn-action deliver"
                                  onClick={() => handleUpdateItemStatus(item.id, 'delivered')}
                                  title="Teslim Edildi yap"
                                >
                                  <Check size={13} />
                                  <span>Teslim</span>
                                </button>
                              </>
                            )}

                            {/* Hazır -> Geri Al & Teslim Et */}
                            {item.item_status === 'ready' && (
                              <>
                                <button
                                  type="button"
                                  className="kds-btn-action undo"
                                  onClick={() => handleUpdateItemStatus(item.id, 'preparing')}
                                  title="Hazırlanıyor durumuna geri al"
                                >
                                  <RotateCcw size={11} />
                                </button>
                                <button
                                  type="button"
                                  className="kds-btn-action deliver"
                                  onClick={() => handleUpdateItemStatus(item.id, 'delivered')}
                                  title="Masaya Teslim Edildi"
                                >
                                  <Check size={14} />
                                  <span>Teslim Et</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                      {/* 2. TESLİM EDİLMİŞ KALEMLER (Varsa açılır/kapanır kompakt bölüm) */}
                      {order.deliveredItems.length > 0 && (
                        <div>
                          {order.activeItems.length > 0 ? (
                            <>
                              <button
                                type="button"
                                className="kds-delivered-collapse-toggle"
                                onClick={() => toggleDeliveredSection(order.table_id)}
                              >
                                <span>{order.deliveredItems.length} Teslim Edilen Kalem</span>
                                {isDeliveredExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>

                              {isDeliveredExpanded && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px' }}>
                                  {order.deliveredItems.map(item => {
                                    const isItemExpanded = Boolean(expandedItemIds[item.id]);

                                    return (
                                      <div key={item.id} className={`kds-item-row status-delivered ${isItemExpanded ? 'expanded' : ''}`}>
                                        <div 
                                          className="kds-item-left-compact"
                                          onClick={() => toggleItemExpand(item.id)}
                                          role="button"
                                          tabIndex={0}
                                          title={isItemExpanded ? "Metni daraltmak için tıklayın" : "Tam ürün adını ve notu görmek için tıklayın"}
                                        >
                                          <span className="kds-item-qty">{item.quantity}x</span>
                                          <div className={`kds-item-text-group ${isItemExpanded ? 'expanded' : ''}`}>
                                            <span className="kds-item-name" title={item.product_name}>
                                              {item.product_name}
                                            </span>
                                            {item.note && (
                                              <span className="kds-item-note-inline" title={item.note}>
                                                ⚠️ {item.note}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="kds-item-actions-compact">
                                          <span className="kds-delivered-badge-compact">
                                            <Check size={12} color="#16a34a" /> Teslim
                                          </span>
                                          <button
                                            type="button"
                                            className="kds-btn-action undo"
                                            onClick={() => handleUpdateItemStatus(item.id, 'ready')}
                                            title="Teslimatı geri al"
                                          >
                                            <RotateCcw size={11} />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          ) : (
                            // Yalnızca teslim edilenler sekmesinde direkt listele
                            order.deliveredItems.map(item => {
                              const isItemExpanded = Boolean(expandedItemIds[item.id]);

                              return (
                                <div key={item.id} className={`kds-item-row status-delivered ${isItemExpanded ? 'expanded' : ''}`}>
                                  <div 
                                    className="kds-item-left-compact"
                                    onClick={() => toggleItemExpand(item.id)}
                                    role="button"
                                    tabIndex={0}
                                    title={isItemExpanded ? "Metni daraltmak için tıklayın" : "Tam ürün adını ve notu görmek için tıklayın"}
                                  >
                                    <span className="kds-item-qty">{item.quantity}x</span>
                                    <div className={`kds-item-text-group ${isItemExpanded ? 'expanded' : ''}`}>
                                      <span className="kds-item-name" title={item.product_name}>
                                        {item.product_name}
                                      </span>
                                      {item.note && (
                                        <span className="kds-item-note-inline" title={item.note}>
                                          ⚠️ {item.note}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="kds-item-actions-compact">
                                    <span className="kds-delivered-badge-compact">
                                      <Check size={12} color="#16a34a" /> Teslim Edildi
                                    </span>
                                    <button
                                      type="button"
                                      className="kds-btn-action undo"
                                      onClick={() => handleUpdateItemStatus(item.id, 'ready')}
                                      title="Teslimatı geri al"
                                    >
                                      <RotateCcw size={11} />
                                      <span>Geri Al</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    {/* Fiş Altı: Tüm Masayı Tek Tıkla Teslim Et (SABİT ALT) */}
                    <div className="kds-ticket-footer">
                      <button
                        type="button"
                        className="kds-btn-deliver-all"
                        disabled={!order.hasPendingOrPreparing}
                        onClick={() => handleDeliverAllTable(order.table_id, order.table_title)}
                        title={order.hasPendingOrPreparing ? 'Masanın tüm bekleyen ürünlerini tek tıkla teslim et' : 'Tüm ürünler teslim edildi'}
                      >
                        <CheckCircle2 size={15} />
                        <span>
                          {order.hasPendingOrPreparing ? 'Tüm Masayı Teslim Et' : 'Tümü Teslim Edildi'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
