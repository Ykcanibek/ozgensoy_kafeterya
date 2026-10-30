import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import './reports.css';
import { 
  BarChart3, 
  Users, 
  Receipt, 
  Gift, 
  RotateCcw, 
  Calendar, 
  Search, 
  TrendingUp, 
  CreditCard, 
  Banknote, 
  Percent, 
  Clock, 
  User, 
  Sparkles, 
  RefreshCw,
  Printer,
  ChevronDown,
  ChevronUp,
  Coffee,
  ShoppingBag,
  Award,
  Trophy,
  X,
  FileText,
  BadgePercent,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Info,
  ArrowRight
} from 'lucide-react';

export default function Reports() {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Sekmeler: 'overview' (Finansal Özet) | 'receipts' (Adisyonlar) | 'staff' (Personel) | 'treats' (İkram/İptal) | 'audit' (Günlük)
  const [activeTab, setActiveTab] = useState('overview');

  // Tarih Filtresi: 'today' | 'yesterday' | 'week' | 'month' | 'custom'
  // Varsayılan olarak açılışta İLK O GÜNÜ (bugün) gösterir
  const [dateFilter, setDateFilter] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Veri Durumları
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Adisyon Fiş Detayı Pop-up Modal Durumu (Seçili fiş objesi)
  const [selectedReceiptModal, setSelectedReceiptModal] = useState(null);
  const [receiptDetailData, setReceiptDetailData] = useState({});
  const [loadingReceiptId, setLoadingReceiptId] = useState(null);

  // Müşteri Fişi Termal Yazdırma Modalı
  const [printingReceipt, setPrintingReceipt] = useState(null);

  // Fiş Filtresi (Nakit / Kart / Veresiye / Tümü)
  const [receiptPaymentFilter, setReceiptPaymentFilter] = useState('all');
  const [receiptSearchQuery, setReceiptSearchQuery] = useState('');

  // Denetim Günlüğü Arama & Tür Filtresi
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState('all');

  // Z-Raporu Termal Yazdırma Modalı
  const [isZReportOpen, setIsZReportOpen] = useState(false);
  const [showHourlyChart, setShowHourlyChart] = useState(false);

  // Tarih Parametrelerini Hesapla
  const getDateRange = () => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (dateFilter === 'today') {
      const ymd = toYMD(today);
      return { 
        startDate: ymd, 
        endDate: ymd, 
        label: `Bugün, ${today.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        badgeTitle: 'GÜNLÜK RAPOR'
      };
    }
    if (dateFilter === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      const ymd = toYMD(yest);
      return { 
        startDate: ymd, 
        endDate: ymd, 
        label: `Dün, ${yest.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        badgeTitle: 'DÜNKÜ KASA'
      };
    }
    if (dateFilter === 'week') {
      // Pazartesi'den bugüne (Bu Hafta)
      const day = today.getDay(); // 0: Pazar, 1: Pazartesi...
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(today);
      monday.setDate(today.getDate() + diffToMonday);
      const startYmd = toYMD(monday);
      const endYmd = toYMD(today);
      const mondayStr = monday.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      const todayStr = today.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
      return { 
        startDate: startYmd, 
        endDate: endYmd, 
        label: `Bu Hafta (${mondayStr} - ${todayStr})`,
        badgeTitle: 'HAFTALIK RAPOR'
      };
    }
    if (dateFilter === 'month') {
      // Bu Ayın 1'inden Bugüne
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const startYmd = toYMD(monthStart);
      const endYmd = toYMD(today);
      const monthName = today.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
      return { 
        startDate: startYmd, 
        endDate: endYmd, 
        label: `Bu Ay (1 - ${today.getDate()} ${monthName})`,
        badgeTitle: 'AYLIK RAPOR'
      };
    }
    if (dateFilter === 'year') {
      // Bu Yılın Başından Bugüne
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const startYmd = toYMD(yearStart);
      const endYmd = toYMD(today);
      return { 
        startDate: startYmd, 
        endDate: endYmd, 
        label: `Bu Yıl (${today.getFullYear()})`,
        badgeTitle: 'YILLIK RAPOR'
      };
    }
    if (dateFilter === 'all') {
      return { 
        startDate: '', 
        endDate: '', 
        label: 'Tüm Kayıtlar (İlk Günden Bugüne)',
        badgeTitle: 'GENEL TOPLAM'
      };
    }
    if (dateFilter === 'custom') {
      const sFormatted = customStartDate ? new Date(customStartDate + 'T00:00:00').toLocaleDateString('tr-TR') : 'Başlangıç';
      const eFormatted = customEndDate ? new Date(customEndDate + 'T00:00:00').toLocaleDateString('tr-TR') : 'Bitiş';
      return {
        startDate: customStartDate || '',
        endDate: customEndDate || '',
        label: `${sFormatted} ➔ ${eFormatted}`,
        badgeTitle: 'ÖZEL ARALIK'
      };
    }
    return { label: 'Tüm Zamanlar', badgeTitle: 'RAPOR DÖNEMİ' };
  };

  // Verileri Sunucudan Çek
  const fetchReportData = async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const token = localStorage.getItem('kafe_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [summaryRes, receiptsRes, staffRes, auditRes] = await Promise.all([
        fetch(`/api/reports/summary?${params.toString()}`, { headers }),
        fetch(`/api/reports/receipts?${params.toString()}&limit=200`, { headers }),
        fetch(`/api/reports/staff-performance?${params.toString()}`, { headers }),
        fetch(`/api/reports/audit-logs?${params.toString()}&limit=200`, { headers })
      ]);

      const [summaryData, receiptsData, staffData, auditData] = await Promise.all([
        summaryRes.json(),
        receiptsRes.json(),
        staffRes.json(),
        auditRes.json()
      ]);

      if (summaryData.success) setSummary(summaryData.summary);
      if (receiptsData.success) setReceipts(receiptsData.receipts || []);
      if (staffData.success) setStaffList(staffData.report || []);
      if (auditData.success) setAuditLogs(auditData.logs || []);
    } catch (err) {
      console.error('Rapor verisi çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [dateFilter, customStartDate, customEndDate]);

  // Modal açıkken arka plan kaydırmasını (scroll) engelle
  useEffect(() => {
    if (selectedReceiptModal || printingReceipt || isZReportOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedReceiptModal, printingReceipt, isZReportOpen]);

  // Tek Bir Fişin Pop-up Modalını Aç ve Ürün Kalemlerini Getir
  const openReceiptModal = async (rc) => {
    setSelectedReceiptModal(rc);
    if (!receiptDetailData[rc.id]) {
      try {
        setLoadingReceiptId(rc.id);
        const token = localStorage.getItem('kafe_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`/api/reports/receipt/${rc.id}`, { headers });
        const data = await res.json();
        if (data.success) {
          setReceiptDetailData(prev => ({ ...prev, [rc.id]: data.items || [] }));
        }
      } catch (err) {
        console.error('Fiş detayı çekilemedi:', err);
      } finally {
        setLoadingReceiptId(null);
      }
    }
  };

  // Müşteri Fişi Yazdırma Modalı Aç
  const handleOpenPrintSlip = async (rc) => {
    let items = receiptDetailData[rc.id];
    if (!items) {
      try {
        setLoadingReceiptId(rc.id);
        const token = localStorage.getItem('kafe_token');
        const res = await fetch(`/api/reports/receipt/${rc.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (data.success) {
          items = data.items || [];
          setReceiptDetailData(prev => ({ ...prev, [rc.id]: items }));
        }
      } catch (err) {
        console.error('Fiş detayı çekilemedi:', err);
      } finally {
        setLoadingReceiptId(null);
      }
    }
    setPrintingReceipt({ receipt: rc, items: items || [] });
  };

  // Hesaplanan Yüzdeler (Ödeme Yöntemi Dağılımı)
  const totalRevenue = summary?.total_revenue || 0;
  const cashAmount = summary?.total_cash || 0;
  const cardAmount = summary?.total_credit || 0;
  const veresiyeAmount = summary?.total_veresiye || 0;
  const discountAmount = summary?.total_discount || 0;
  const tipAmount = summary?.total_tip || 0;

  const cashPercent = totalRevenue > 0 ? Math.round((cashAmount / totalRevenue) * 100) : 0;
  const cardPercent = totalRevenue > 0 ? Math.round((cardAmount / totalRevenue) * 100) : 0;
  const veresiyePercent = totalRevenue > 0 ? Math.round((veresiyeAmount / totalRevenue) * 100) : 0;

  // Filtreli Fiş Listesi
  const filteredReceipts = receipts.filter(rc => {
    if (receiptPaymentFilter !== 'all') {
      if (receiptPaymentFilter === 'cash' && rc.payment_method !== 'cash') return false;
      if (receiptPaymentFilter === 'credit_card' && rc.payment_method !== 'credit_card') return false;
      if (receiptPaymentFilter === 'veresiye' && rc.payment_method !== 'veresiye') return false;
      if (receiptPaymentFilter === 'mixed' && rc.payment_method !== 'mixed') return false;
    }
    if (!receiptSearchQuery.trim()) return true;
    const q = receiptSearchQuery.toLowerCase();
    return (
      (rc.table_title && rc.table_title.toLowerCase().includes(q)) ||
      (rc.customer_name && rc.customer_name.toLowerCase().includes(q)) ||
      (rc.closed_by_user_name && rc.closed_by_user_name.toLowerCase().includes(q)) ||
      String(rc.id).includes(q) ||
      (rc.order_number && rc.order_number.toLowerCase().includes(q)) ||
      (rc.order_number && rc.order_number.replace(/-/g, '').toLowerCase().includes(q))
    );
  });

  // Filtreli Adisyonların Toplam Cirosu
  const filteredReceiptsTotal = filteredReceipts.reduce((acc, rc) => acc + parseFloat(rc.total_amount || 0), 0);

  // Filtreli Denetim Günlüğü
  const filteredAuditLogs = auditLogs.filter(log => {
    if (auditEntityFilter !== 'all' && log.entity_type !== auditEntityFilter) {
      return false;
    }
    if (!auditSearch.trim()) return true;
    const q = auditSearch.toLowerCase();
    return (
      (log.title && log.title.toLowerCase().includes(q)) ||
      (log.details && log.details.toLowerCase().includes(q)) ||
      (log.user_name && log.user_name.toLowerCase().includes(q)) ||
      (log.table_title && log.table_title.toLowerCase().includes(q))
    );
  });

  // En yüksek saatlik ciro (grafik ölçekleme için)
  const maxHourlyRevenue = Math.max(...(summary?.hourlyDistribution || []).map(h => h.revenue), 1);

  // Personel karnesini ciroya göre azalan sırala
  const sortedStaffList = [...staffList].sort((a, b) => 
    (parseFloat(b.total_revenue) || 0) - (parseFloat(a.total_revenue) || 0) ||
    (parseInt(b.total_payments_count) || 0) - (parseInt(a.total_payments_count) || 0)
  );
  const totalStaffRevenue = sortedStaffList.reduce((acc, st) => acc + (parseFloat(st.total_revenue) || 0), 0);

  return (
    <div className="pos-page-container">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        activePage="reports" 
      />

      {/* Üst Bar (Navbar) */}
      <Navbar 
        onOpenSidebar={() => setIsSidebarOpen(true)}
        title="Gün Sonu & Finansal Raporlar"
        actions={
          <div className="rep-nav-actions-wrap">
            <button
              type="button"
              onClick={() => setIsZReportOpen(true)}
              className="pos-edit-btn rep-nav-action-btn print"
              title="Z-Raporu / Gün Sonu Fişi Yazdır"
            >
              <Printer size={15} />
              <span className="rep-nav-btn-text">Z-Raporu Yazdır</span>
            </button>
            <button
              type="button"
              onClick={fetchReportData}
              className="pos-edit-btn rep-nav-action-btn refresh"
              title="Verileri Yenile"
            >
              <RefreshCw size={15} className={loading ? 'cat-spin' : ''} />
              <span className="rep-nav-btn-text">Yenile</span>
            </button>
          </div>
        }
      />

      {/* ======================================================== */}
      {/* 1. ÜST TARİH KONTROL ÇUBUĞU (Bugün Varsayılan)            */}
      {/* ======================================================== */}
      <div className="rep-header-bar">
        {/* Tarih Filtreleme Butonları */}
        <div className="rep-date-pills">
          <button 
            type="button"
            className={`rep-date-pill ${dateFilter === 'today' ? 'active' : ''}`}
            onClick={() => setDateFilter('today')}
          >
            Bugün
          </button>
          <button 
            type="button"
            className={`rep-date-pill ${dateFilter === 'yesterday' ? 'active' : ''}`}
            onClick={() => setDateFilter('yesterday')}
          >
            Dün
          </button>
          <button 
            type="button"
            className={`rep-date-pill ${dateFilter === 'week' ? 'active' : ''}`}
            onClick={() => setDateFilter('week')}
          >
            Bu Hafta
          </button>
          <button 
            type="button"
            className={`rep-date-pill ${dateFilter === 'month' ? 'active' : ''}`}
            onClick={() => setDateFilter('month')}
          >
            Bu Ay
          </button>
          <button 
            type="button"
            className={`rep-date-pill ${dateFilter === 'year' ? 'active' : ''}`}
            onClick={() => setDateFilter('year')}
          >
            Bu Yıl
          </button>
          <button 
            type="button"
            className={`rep-date-pill ${dateFilter === 'all' ? 'active' : ''}`}
            onClick={() => setDateFilter('all')}
          >
            Tümü
          </button>
          <button 
            type="button"
            className={`rep-date-pill ${dateFilter === 'custom' ? 'active' : ''}`}
            onClick={() => setDateFilter('custom')}
          >
            <Calendar size={14} />
            <span>Özel Tarih Aralığı</span>
          </button>
        </div>

        {/* Özel Tarih Seçici Inputları */}
        {dateFilter === 'custom' && (
          <div className="rep-custom-date-box">
            <input 
              type="date" 
              value={customStartDate} 
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="rep-date-input"
            />
            <span style={{ color: '#486b78', fontWeight: 800 }}>➔</span>
            <input 
              type="date" 
              value={customEndDate} 
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="rep-date-input"
            />
          </div>
        )}

        {/* Seçili Rapor Dönemi Rozeti (Sağ Kısım - Şık ve Vurgulu) */}
        <div className="rep-selected-date-badge">
          <div className="rep-date-badge-icon">
            <Calendar size={15} />
          </div>
          <div className="rep-date-badge-content">
            <span className="rep-date-badge-label">{getDateRange().badgeTitle || 'RAPOR DÖNEMİ'}</span>
            <span className="rep-date-badge-val">{getDateRange().label}</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. ANA NAVİGASYON SEKMELERİ                             */}
      {/* ======================================================== */}
      <div className="rep-tabs-bar">
        <button
          type="button"
          className={`rep-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <TrendingUp size={16} />
          <span>Gün Sonu Kasa Özeti</span>
        </button>

        <button
          type="button"
          className={`rep-tab-btn ${activeTab === 'receipts' ? 'active' : ''}`}
          onClick={() => setActiveTab('receipts')}
        >
          <Receipt size={16} />
          <span>Adisyon & Fişler</span>
          <span className="rep-tab-badge">{receipts.length}</span>
        </button>

        <button
          type="button"
          className={`rep-tab-btn ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveTab('staff')}
        >
          <Users size={16} />
          <span>Personel Karnesi</span>
        </button>

        <button
          type="button"
          className={`rep-tab-btn ${activeTab === 'treats' ? 'active' : ''}`}
          onClick={() => setActiveTab('treats')}
        >
          <Gift size={16} />
          <span>İkram & İptal Takip</span>
        </button>

        <button
          type="button"
          className={`rep-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <Clock size={16} />
          <span>İşlem Günlüğü</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* SEKME 1: GÜN SONU KASA ÖZETİ (FERAH, NET & BÜTÜNCÜL)      */}
      {/* ======================================================== */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* REFERANS GÖRSEL TEMELİNDE ÖZGENSOY PREMİUM KASA KONSOLU */}
          <div className="rep-pos-summary-wrapper">
            {/* 1. SOL VURGULU CİRO KARTI (SLATE-TEAL & EMERALD) */}
            <div className="rep-pos-total-badge">
              <div className="rep-pos-total-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="rep-pos-total-dot"></span>
                  <span>TOPLAM KASA CİROSU</span>
                </div>
                <span className="rep-pos-total-pill-tag">FİİLİ GİRİŞ</span>
              </div>

              <div className="rep-pos-total-val">
                {totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="rep-pos-total-currency">₺</span>
              </div>

              <div className="rep-pos-total-sub">
                <span>Nakit + Kart Girişi</span>
                <span>Ort. ₺{(summary?.average_ticket || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* DİKEY İNCE AYIRICI */}
            <div className="rep-pos-v-divider"></div>

            {/* SAĞ 4 PREMİUM BEYAZ KART */}
            <div className="rep-pos-subcards-row">
              {/* KART 1: NAKİT & KREDİ KARTI */}
              <div className="rep-pos-subcard">
                {/* Üst: Nakit */}
                <div className="rep-pos-subitem">
                  <div className="rep-pos-sublabel-row">
                    <div className="rep-pos-sublabel-left">
                      <span className="rep-pos-dot" style={{ background: '#10b981' }}></span>
                      <span>NAKİT KASA</span>
                    </div>
                  </div>
                  <div className="rep-pos-subamount" style={{ color: '#059669' }}>
                    {cashAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="cur">₺</span>
                  </div>
                  <span className="rep-pos-subcaption">Kasa Çekmecesi</span>
                </div>

                {/* Alt: Kredi Kartı */}
                <div className="rep-pos-subitem bottom">
                  <div className="rep-pos-sublabel-row">
                    <div className="rep-pos-sublabel-left">
                      <span className="rep-pos-dot" style={{ background: '#0284c7' }}></span>
                      <span>KREDİ KARTI / POS</span>
                    </div>
                  </div>
                  <div className="rep-pos-subamount" style={{ color: '#0284c7' }}>
                    {cardAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="cur">₺</span>
                  </div>
                  <span className="rep-pos-subcaption">Banka Hesabı</span>
                </div>
              </div>

              {/* KART 2: VERESİYE & CARİ DURUMU */}
              <div className="rep-pos-subcard">
                {/* Üst: Veresiye Tahsilatı */}
                <div className="rep-pos-subitem">
                  <div className="rep-pos-sublabel-row">
                    <div className="rep-pos-sublabel-left">
                      <span className="rep-pos-dot" style={{ background: '#8b5cf6' }}></span>
                      <span>VERESİYE TAHSİLATI</span>
                    </div>
                    <Info size={12} color="#94a3b8" title="Ödenen cari borçlar (Kasaya dahil edildi)" />
                  </div>
                  <div className="rep-pos-subamount" style={{ color: '#7c3aed' }}>
                    {(summary?.total_veresiye_collected || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="cur">₺</span>
                  </div>
                  <span className="rep-pos-subcaption">Kasaya Dahil Edildi</span>
                </div>

                {/* Alt: Açık Hesap / Veresiye (Ciro Dışı) */}
                <div className="rep-pos-subitem bottom">
                  <div className="rep-pos-sublabel-row">
                    <div className="rep-pos-sublabel-left">
                      <span className="rep-pos-dot" style={{ background: '#f59e0b' }}></span>
                      <span>AÇIK HESAP (VERESİYE)</span>
                    </div>
                    <Info size={12} color="#94a3b8" title="O gün hesaba yazılan borç (Ciroya dahil değildir)" />
                  </div>
                  <div className="rep-pos-subamount" style={{ color: '#d97706' }}>
                    {veresiyeAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="cur">₺</span>
                  </div>
                  <span className="rep-pos-subcaption" style={{ color: '#b45309', fontWeight: 700 }}>Ciro Dışı Alacak</span>
                </div>
              </div>

              {/* KART 3: KAPANAN ADİSYON & BAHŞİŞ */}
              <div className="rep-pos-subcard">
                {/* Üst: Adisyon */}
                <div className="rep-pos-subitem">
                  <div className="rep-pos-sublabel-row">
                    <div className="rep-pos-sublabel-left">
                      <span className="rep-pos-dot" style={{ background: '#4f46e5' }}></span>
                      <span>KAPANAN ADİSYON</span>
                    </div>
                  </div>
                  <div className="rep-pos-subamount" style={{ color: '#4f46e5' }}>
                    {summary?.total_orders_paid || 0}
                    <span className="cur" style={{ fontSize: '0.85rem' }}> Adet</span>
                  </div>
                  <span className="rep-pos-subcaption">Ödemesi Alınan Masalar</span>
                </div>

                {/* Alt: Bahşiş */}
                <div className="rep-pos-subitem bottom">
                  <div className="rep-pos-sublabel-row">
                    <div className="rep-pos-sublabel-left">
                      <span className="rep-pos-dot" style={{ background: '#15803d' }}></span>
                      <span>ALINAN BAHŞİŞ</span>
                    </div>
                    <Info size={12} color="#94a3b8" title="Ödeme yöntemine göre kasaya dahil edildi" />
                  </div>
                  <div className="rep-pos-subamount" style={{ color: '#15803d' }}>
                    {tipAmount > 0 ? `+${tipAmount.toFixed(2)}` : '0,00'}
                    <span className="cur">₺</span>
                  </div>
                  <span className="rep-pos-subcaption">Kasaya Dahil Edildi</span>
                </div>
              </div>

              {/* KART 4: İKRAM & İSKONTO */}
              <div className="rep-pos-subcard">
                {/* Üst: İkram & İptal */}
                <div className="rep-pos-subitem">
                  <div className="rep-pos-sublabel-row">
                    <div className="rep-pos-sublabel-left">
                      <span className="rep-pos-dot" style={{ background: '#0d9488' }}></span>
                      <span>İKRAM & İPTAL</span>
                    </div>
                    <Info size={12} color="#94a3b8" title="Fire ve ikramlar (Ciroya dahil edilmez)" />
                  </div>
                  <div className="rep-pos-subamount" style={{ color: '#0d9488' }}>
                    +{((summary?.total_complimentary || 0) + (summary?.total_returned || 0) + (summary?.total_cancelled || 0)).toFixed(2)}
                    <span className="cur">₺</span>
                  </div>
                  <span className="rep-pos-subcaption">Ciro Dışı Fire/İkram</span>
                </div>

                {/* Alt: İskonto (İndirim) */}
                <div className="rep-pos-subitem bottom">
                  <div className="rep-pos-sublabel-row">
                    <div className="rep-pos-sublabel-left">
                      <span className="rep-pos-dot" style={{ background: '#ef4444' }}></span>
                      <span>İSKONTO / İNDİRİM</span>
                    </div>
                    <Info size={12} color="#94a3b8" title="Adisyondan düşülen toplam indirim" />
                  </div>
                  <div className="rep-pos-subamount" style={{ color: discountAmount > 0 ? '#dc2626' : '#64748b' }}>
                    {discountAmount > 0 ? `-${discountAmount.toFixed(2)}` : '0,00'}
                    <span className="cur">₺</span>
                  </div>
                  <span className="rep-pos-subcaption">Adisyondan Düşülen</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. SADE ANALİZ BÖLÜMÜ (Kategori Dağılımı & Çok Satanlar) */}
          <div className="rep-analytics-grid">
            {/* Kategori Satış Dağılımı */}
            <div className="rep-card-box">
              <div className="rep-card-header">
                <h4 className="rep-card-title">
                  <Coffee size={16} color="#346c80" />
                  <span>Kategori Satış Dağılımı</span>
                </h4>
                <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>
                  {(summary?.categoryBreakdown || []).length} Kategori
                </span>
              </div>
              <div className="rep-card-body">
                {(summary?.categoryBreakdown || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '0.84rem' }}>
                    Bu tarih aralığında satılan ürün bulunamadı.
                  </div>
                ) : (
                  (summary?.categoryBreakdown || []).map((cat) => {
                    const catPct = totalRevenue > 0 ? Math.round((cat.total_amount / totalRevenue) * 100) : 0;
                    return (
                      <div key={cat.category_id} className="rep-cat-row">
                        <div className="rep-cat-row-top">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong style={{ color: '#1e292d' }}>{cat.category_name}</strong>
                            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>({cat.total_quantity} Adet)</span>
                          </div>
                          <div>
                            <strong style={{ color: '#346c80' }}>₺{cat.total_amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong>
                            <span style={{ fontSize: '0.74rem', color: '#64748b', marginLeft: '6px' }}>%{catPct}</span>
                          </div>
                        </div>
                        <div className="rep-cat-progress-bg">
                          <div className="rep-cat-progress-fill" style={{ width: `${catPct}%` }}></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* En Çok Satan Ürünler (Tümü - Kaydırılabilir) */}
            <div className="rep-card-box">
              <div className="rep-card-header">
                <h4 className="rep-card-title">
                  <Award size={16} color="#346c80" />
                  <span>En Çok Satan Ürünler</span>
                </h4>
                <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>
                  {(summary?.topProducts || []).length} Ürün (Ciro & Adet)
                </span>
              </div>
              <div className="rep-card-body">
                {(summary?.topProducts || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '0.84rem' }}>
                    Bu tarih aralığında satılan ürün bulunamadı.
                  </div>
                ) : (
                  (summary?.topProducts || []).map((prod, idx) => (
                    <div key={prod.product_id} className="rep-product-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`rep-rank-badge ${idx === 0 ? 'top1' : idx === 1 ? 'top2' : idx === 2 ? 'top3' : ''}`}>
                          #{idx + 1}
                        </span>
                        <div>
                          <strong style={{ color: '#1e292d', fontSize: '0.86rem' }}>{prod.product_name}</strong>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{prod.category_name}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ color: '#15803d', fontSize: '0.88rem' }}>
                          ₺{prod.total_amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {prod.total_quantity} Adet Satıldı
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 3. SAATLİK SATIŞ & YOĞUNLUK GRAFİĞİ (SÜREKLİ AÇIK) */}
          {(summary?.hourlyDistribution || []).length > 0 && (
            <div className="rep-hourly-chart-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={18} color="#346c80" />
                  <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1e292d' }}>
                    Saatlik Satış & Sipariş Yoğunluk Grafiği
                  </span>
                </div>
                <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>
                  24 Saatlik Dağılım (00:00 - 23:00)
                </span>
              </div>

              <div className="rep-hourly-bars">
                {Array.from({ length: 24 }).map((_, h) => {
                  const data = (summary?.hourlyDistribution || []).find(item => item.hour === h);
                  const rev = data ? data.revenue : 0;
                  const count = data ? data.order_count : 0;
                  const heightPercent = maxHourlyRevenue > 0 && rev > 0 ? Math.max(12, Math.round((rev / maxHourlyRevenue) * 100)) : 0;

                  return (
                    <div key={h} className="rep-hourly-col">
                      {rev > 0 && (
                        <div 
                          className="rep-hourly-bar" 
                          style={{ height: `${heightPercent}%` }}
                          title={`Saat ${h}:00 - ₺${rev.toFixed(2)} (${count} Adisyon)`}
                        ></div>
                      )}
                      <span className="rep-hourly-label">{h}:00</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SEKME 2: ADİSYON / FİŞ DÖKÜMÜ                             */}
      {/* ======================================================== */}
      {activeTab === 'receipts' && (
        <div className="rep-table-card">
          {/* ÜST ARAÇ ÇUBUĞU (TOOLBAR) */}
          <div className="rep-table-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Arama Kutusu */}
              <div className="rep-table-search-box">
                <Search size={15} color="#486b78" />
                <input
                  type="text"
                  placeholder="Masa, fiş no, müşteri ara..."
                  value={receiptSearchQuery}
                  onChange={(e) => setReceiptSearchQuery(e.target.value)}
                />
                {receiptSearchQuery && (
                  <button 
                    type="button" 
                    onClick={() => setReceiptSearchQuery('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Ödeme Türü Filtre Butonları */}
              <div className="rep-filter-pills">
                <button
                  type="button"
                  className={`rep-filter-pill ${receiptPaymentFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setReceiptPaymentFilter('all')}
                >
                  Tümü ({receipts.length})
                </button>
                <button
                  type="button"
                  className={`rep-filter-pill ${receiptPaymentFilter === 'cash' ? 'active' : ''}`}
                  onClick={() => setReceiptPaymentFilter('cash')}
                >
                  <span className="rep-pill-dot" style={{ background: '#10b981' }}></span>
                  Nakit ({receipts.filter(rc => rc.payment_method === 'cash').length})
                </button>
                <button
                  type="button"
                  className={`rep-filter-pill ${receiptPaymentFilter === 'credit_card' ? 'active' : ''}`}
                  onClick={() => setReceiptPaymentFilter('credit_card')}
                >
                  <span className="rep-pill-dot" style={{ background: '#0284c7' }}></span>
                  Kredi Kartı ({receipts.filter(rc => rc.payment_method === 'credit_card').length})
                </button>
                <button
                  type="button"
                  className={`rep-filter-pill ${receiptPaymentFilter === 'veresiye' ? 'active' : ''}`}
                  onClick={() => setReceiptPaymentFilter('veresiye')}
                >
                  <span className="rep-pill-dot" style={{ background: '#f59e0b' }}></span>
                  Veresiye ({receipts.filter(rc => rc.payment_method === 'veresiye').length})
                </button>
                <button
                  type="button"
                  className={`rep-filter-pill ${receiptPaymentFilter === 'mixed' ? 'active' : ''}`}
                  onClick={() => setReceiptPaymentFilter('mixed')}
                >
                  <span className="rep-pill-dot" style={{ background: '#8b5cf6' }}></span>
                  Parçalı ({receipts.filter(rc => rc.payment_method === 'mixed').length})
                </button>
              </div>
            </div>

            {/* Sağ Bilgi Rozeti */}
            <div className="rep-table-info-pill">
              <span>{filteredReceipts.length} Fiş</span>
              <span className="rep-pill-sep">•</span>
              <strong style={{ color: '#047857' }}>
                ₺{filteredReceiptsTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          </div>

          {/* TABLO ALANI */}
          <div style={{ overflowX: 'auto' }}>
            <table className="rep-modern-table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Fiş No / Saat</th>
                  <th style={{ width: '140px' }}>Masa</th>
                  <th>Ödeme Yöntemi</th>
                  <th>Müşteri / Cari</th>
                  <th>Kapatan Personel</th>
                  <th>İndirim / Bahşiş</th>
                  <th style={{ textAlign: 'right', width: '140px' }}>Tutar</th>
                  <th style={{ textAlign: 'center', width: '155px' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <Receipt size={32} color="#94a3b8" />
                        <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#334155' }}>
                          Fiş Kaydı Bulunamadı
                        </span>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                          Seçilen filtre ve tarih aralığına uygun adisyon bulunmuyor.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredReceipts.map((rc) => (
                    <tr 
                      key={rc.id}
                      className="rep-table-row"
                      onClick={() => openReceiptModal(rc)}
                    >
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="rep-receipt-code" title={`Kasa Fiş Sıra No: #${rc.id}`}>
                              #{rc.id}
                            </span>
                            {rc.order_number && (
                              <span 
                                className="rep-order-ref-pill"
                                title={`Masa Sipariş Oturumu: ${rc.order_number}`}
                              >
                                #{rc.order_number.replace(/-/g, '').slice(0, 8).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <span className="rep-receipt-time">
                            {new Date(rc.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong style={{ color: '#173845', fontSize: '0.90rem' }}>
                            {rc.table_title || 'Masa'}
                          </strong>
                          {rc.table_number && (
                            <span className="rep-table-num-pill">
                              {rc.table_number}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span 
                            className="rep-method-pill"
                            style={{
                              background: rc.payment_method === 'cash' ? '#ecfdf5' : rc.payment_method === 'credit_card' ? '#e0f2fe' : rc.payment_method === 'veresiye' ? '#fef3c7' : '#f5f3ff',
                              color: rc.payment_method === 'cash' ? '#047857' : rc.payment_method === 'credit_card' ? '#0369a1' : rc.payment_method === 'veresiye' ? '#b45309' : '#6d28d9',
                              border: `1px solid ${rc.payment_method === 'cash' ? '#a7f3d0' : rc.payment_method === 'credit_card' ? '#bae6fd' : rc.payment_method === 'veresiye' ? '#fde68a' : '#ddd6fe'}`
                            }}
                          >
                            {rc.payment_method === 'cash' && '💵 Nakit'}
                            {rc.payment_method === 'credit_card' && '💳 Kredi Kartı'}
                            {rc.payment_method === 'veresiye' && '📝 Veresiye (Cari)'}
                            {rc.payment_method === 'mixed' && '🔀 Parçalı Ödeme'}
                          </span>
                          {rc.payment_method === 'mixed' && (
                            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                              N: ₺{parseFloat(rc.cash_amount || 0).toFixed(0)} • K: ₺{parseFloat(rc.card_amount || 0).toFixed(0)}
                              {parseFloat(rc.veresiye_amount || 0) > 0 && ` • V: ₺${parseFloat(rc.veresiye_amount).toFixed(0)}`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {rc.customer_name ? (
                          <span className="rep-customer-badge">
                            👤 {rc.customer_name}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="rep-user-avatar">
                            {(rc.closed_by_user_name || 'P').charAt(0).toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.84rem', color: '#1e292d', fontWeight: 600 }}>
                            {rc.closed_by_user_name || 'Personel'}
                          </span>
                        </div>
                      </td>
                      <td>
                        {parseFloat(rc.discount || 0) > 0 || parseFloat(rc.tip || 0) > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {parseFloat(rc.discount) > 0 && (
                              <span className="rep-discount-pill">
                                🏷️ -₺{parseFloat(rc.discount).toFixed(2)}
                              </span>
                            )}
                            {parseFloat(rc.tip) > 0 && (
                              <span className="rep-tip-pill">
                                🪙 +₺{parseFloat(rc.tip).toFixed(2)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <strong className="rep-amount-highlight">
                          ₺{parseFloat(rc.total_amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="rep-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openReceiptModal(rc);
                            }}
                            title="Adisyon & Fiş Detayını İncele"
                          >
                            <span>Detay</span>
                            <ArrowRight size={13} />
                          </button>
                          <button
                            type="button"
                            className="rep-action-btn print"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPrintSlip(rc);
                            }}
                            title="Müşteri Fişi Yazdır"
                          >
                            <Printer size={13} />
                            <span>Fiş</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SEKME 3: PERSONEL SATIŞ VE TAHSİLAT KARNESİ              */}
      {/* ======================================================== */}
      {activeTab === 'staff' && (
        <div className="rep-table-card">
          <div className="rep-table-toolbar">
            <div className="rep-table-title-box">
              <h3 className="rep-table-title">Personel Bazlı Satış & Ciro Karnesi</h3>
              <span className="rep-table-desc">
                Masalardan tahsilat alan personellerin ciro dağılımı ve işlem adetleri
              </span>
            </div>
            <div className="rep-table-info-pill">
              <span>{sortedStaffList.length} Personel</span>
              <span className="rep-pill-sep">•</span>
              <strong style={{ color: '#047857' }}>
                ₺{totalStaffRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="rep-modern-table">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Rol</th>
                  <th>İşlem Adedi</th>
                  <th style={{ width: '130px' }}>Ciro Payı</th>
                  <th>Nakit</th>
                  <th>Kredi Kartı</th>
                  <th>Toplam Ciro</th>
                  <th>İndirim</th>
                  <th>Bahşiş</th>
                  <th style={{ textAlign: 'center' }}>Teslim</th>
                </tr>
              </thead>
              <tbody>
                {sortedStaffList.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                      Bu tarih aralığında personel kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  sortedStaffList.map((st) => {
                    const ciro = parseFloat(st.total_revenue) || 0;
                    const sharePercent = totalStaffRevenue > 0 ? ((ciro / totalStaffRevenue) * 100).toFixed(1) : 0;

                    return (
                      <tr key={st.user_id} className="rep-staff-tr">
                        {/* Personel Bilgisi */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div className="rep-staff-avatar-circle">
                              {st.name?.slice(0, 1)?.toUpperCase() || 'P'}
                            </div>
                            <div>
                              <div style={{ fontWeight: '800', color: '#173845', fontSize: '0.92rem' }}>
                                {st.name}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                @{st.username}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Rol */}
                        <td>
                          <span className={`rep-role-pill ${st.role}`}>
                            {st.role === 'admin' ? 'Yönetici' : st.role === 'kitchen' ? 'Mutfak' : st.role === 'cashier' ? 'Kasa' : 'Personel'}
                          </span>
                        </td>

                        {/* İşlem Adedi */}
                        <td>
                          <span className="rep-staff-count-pill">
                            <strong>{st.total_payments_count}</strong> Fiş
                          </span>
                        </td>

                        {/* Ciro Payı & Mini Bar */}
                        <td>
                          <div className="rep-share-container">
                            <div className="rep-share-label-row">
                              <span className="rep-share-percent">%{sharePercent}</span>
                            </div>
                            <div className="rep-share-bar-bg">
                              <div 
                                className="rep-share-bar-fill"
                                style={{ width: `${Math.min(Math.max(sharePercent, ciro > 0 ? 5 : 0), 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>

                        {/* Nakit */}
                        <td style={{ fontWeight: '700', color: '#334155' }}>
                          ₺{parseFloat(st.cash_revenue || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Kredi Kartı */}
                        <td style={{ fontWeight: '700', color: '#334155' }}>
                          ₺{parseFloat(st.credit_revenue || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Toplam Ciro */}
                        <td>
                          <strong className="rep-amount-highlight" style={{ fontSize: '1.05rem' }}>
                            ₺{ciro.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </strong>
                        </td>

                        {/* İndirim */}
                        <td>
                          {parseFloat(st.total_discount || 0) > 0 ? (
                            <span className="rep-discount-pill">
                              ₺{parseFloat(st.total_discount).toFixed(2)}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>-</span>
                          )}
                        </td>

                        {/* Bahşiş */}
                        <td>
                          {parseFloat(st.total_tip || 0) > 0 ? (
                            <span className="rep-tip-pill">
                              +₺{parseFloat(st.total_tip).toFixed(2)}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>-</span>
                          )}
                        </td>

                        {/* Teslim Edilen Ürün */}
                        <td style={{ textAlign: 'center' }}>
                          <span className="rep-badge-pill" style={{ background: '#f1f5f9', color: '#475569', fontWeight: '800', border: '1px solid #e2e8f0' }}>
                            {st.delivered_count || 0} Adet
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SEKME 4: PERSONEL İKRAM, İADE VE İPTAL TAKİP RAPORU      */}
      {/* ======================================================== */}
      {activeTab === 'treats' && (
        <div className="report-table-wrapper">
          <div className="report-table-header">
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#1e292d' }}>
              İkram, İade ve İptal Takip Raporu
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Hangi personel tarafından ne kadar ikram yapıldı, kaç adet sipariş iptal veya iade edildi
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="report-data-table">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Rol</th>
                  <th>İkram Adedi</th>
                  <th>Toplam İkram Tutarı</th>
                  <th>İade Adedi</th>
                  <th>Toplam İade Tutarı</th>
                  <th>İptal Adedi</th>
                  <th>Toplam İptal Tutarı</th>
                  <th>Toplam Fire / Kayıp</th>
                </tr>
              </thead>
              <tbody>
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#486b78' }}>
                      Bu tarih aralığında personel kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  staffList.map((st) => {
                    const totalLoss = st.complimentary_total + st.return_total + st.cancel_total;
                    return (
                      <tr key={st.user_id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="report-user-circle">
                              {st.name?.slice(0, 1)?.toUpperCase() || 'P'}
                            </div>
                            <strong>{st.name}</strong>
                          </div>
                        </td>
                        <td>
                          <span className={`audit-role-badge ${st.role === 'admin' ? 'admin' : ''}`}>
                            {st.role === 'admin' ? 'Yönetici' : 'Personel'}
                          </span>
                        </td>
                        <td>
                          <span className="report-badge-pill" style={{ background: '#fef3c7', color: '#b45309' }}>
                            {st.complimentary_count} Adet
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: '#b45309' }}>₺{st.complimentary_total.toFixed(2)}</strong>
                        </td>
                        <td>
                          <span className="report-badge-pill" style={{ background: '#eef2ff', color: '#4338ca' }}>
                            {st.return_count} Adet
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: '#4338ca' }}>₺{st.return_total.toFixed(2)}</strong>
                        </td>
                        <td>
                          <span className="report-badge-pill" style={{ background: '#fdf2f2', color: '#b84a39' }}>
                            {st.cancel_count} Adet
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: '#b84a39' }}>₺{st.cancel_total.toFixed(2)}</strong>
                        </td>
                        <td>
                          <strong style={{ color: totalLoss > 0 ? '#b84a39' : '#486b78' }}>
                            ₺{totalLoss.toFixed(2)}
                          </strong>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SEKME 5: CANLI DENETİM VE HAREKET GÜNLÜĞÜ (AUDIT LOGS)    */}
      {/* ======================================================== */}
      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="reports-audit-filter-bar">
            <div className="cat-search-pill-box" style={{ maxWidth: '400px', margin: 0 }}>
              <Search size={18} color="#486b78" className="cat-search-icon" />
              <input
                type="text"
                placeholder="Personel, masa no, ürün adı veya işlem ara..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                style={{ fontSize: '0.86rem' }}
              />
            </div>

            <div className="reports-audit-type-pills">
              <button
                type="button"
                className={`report-type-pill ${auditEntityFilter === 'all' ? 'active' : ''}`}
                onClick={() => setAuditEntityFilter('all')}
              >
                Tüm Hareketler
              </button>
              <button
                type="button"
                className={`report-type-pill ${auditEntityFilter === 'product' ? 'active' : ''}`}
                onClick={() => setAuditEntityFilter('product')}
              >
                Ürün Değişiklikleri
              </button>
              <button
                type="button"
                className={`report-type-pill ${auditEntityFilter === 'category' ? 'active' : ''}`}
                onClick={() => setAuditEntityFilter('category')}
              >
                Kategori Değişiklikleri
              </button>
              <button
                type="button"
                className={`report-type-pill ${auditEntityFilter === 'order' ? 'active' : ''}`}
                onClick={() => setAuditEntityFilter('order')}
              >
                Siparişler
              </button>
              <button
                type="button"
                className={`report-type-pill ${auditEntityFilter === 'payment' ? 'active' : ''}`}
                onClick={() => setAuditEntityFilter('payment')}
              >
                Ödeme & Tahsilat
              </button>
              <button
                type="button"
                className={`report-type-pill ${auditEntityFilter === 'order_item' ? 'active' : ''}`}
                onClick={() => setAuditEntityFilter('order_item')}
              >
                İkram / İptal
              </button>
            </div>
          </div>

          <div className="report-table-wrapper">
            <div className="report-table-header">
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#1e292d' }}>
                Kayıtlı Sistem Hareketleri ({filteredAuditLogs.length} Kayıt)
              </h3>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
              <table className="report-data-table">
                <thead>
                  <tr>
                    <th>Zaman</th>
                    <th>Personel</th>
                    <th>Masa / Varlık</th>
                    <th>İşlem Başlığı</th>
                    <th>Açıklama & Değişiklik</th>
                    <th>Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#486b78' }}>
                        Arama kriterlerine uygun işlem kaydı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => {
                      const isMoney = parseFloat(log.amount || 0) > 0;
                      return (
                        <tr key={log.id}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#5d818f' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} />
                              <span>
                                {new Date(log.created_at).toLocaleString('tr-TR', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong style={{ fontSize: '0.86rem' }}>{log.user_name || 'Sistem'}</strong>
                              {log.user_role && (
                                <span className={`audit-role-badge ${log.user_role === 'admin' ? 'admin' : ''}`}>
                                  {log.user_role === 'admin' ? 'Yönetici' : 'Personel'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            {log.table_title ? (
                              <span className="report-badge-pill" style={{ background: '#d3e5eb', color: '#346c80' }}>
                                {log.table_title}
                              </span>
                            ) : (
                              <span style={{ color: '#5d818f', fontSize: '0.8rem' }}>{log.entity_type}</span>
                            )}
                          </td>
                          <td>
                            <strong style={{ fontSize: '0.86rem', color: '#1e292d' }}>
                              {log.title}
                            </strong>
                          </td>
                          <td style={{ fontSize: '0.82rem', color: '#5c4f45', maxWidth: '380px' }}>
                            {log.details || '-'}
                          </td>
                          <td>
                            {isMoney ? (
                              <strong style={{ color: '#1e7e34' }}>₺{parseFloat(log.amount).toFixed(2)}</strong>
                            ) : (
                              <span style={{ color: '#c4b5a5' }}>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. Z-RAPORU & GÜN SONU YAZDIRMA MODALI (TERMAL ÇIKTI)    */}
      {/* ======================================================== */}
      {isZReportOpen && (
        <div className="zreport-modal-backdrop" onClick={() => setIsZReportOpen(false)}>
          <div className="zreport-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="zreport-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                <Printer size={18} />
                <span>Gün Sonu Z-Raporu Önizleme</span>
              </div>
              <button 
                type="button" 
                onClick={() => setIsZReportOpen(false)}
                style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="zreport-modal-body">
              {/* Termal Fiş Önizleme Alanı */}
              <div className="zreport-ticket">
                <div className="zreport-title-center">
                  <h3 style={{ margin: '0 0 2px 0', fontSize: '1.25rem', fontFamily: 'Montserrat, sans-serif', fontWeight: 800 }}>
                    ÖZGENSOY KAFETERYA
                  </h3>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>*** GÜN SONU Z-RAPORU ***</div>
                  <div style={{ fontSize: '0.74rem', color: '#475569' }}>Rapor Tarihi: {getDateRange().label}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Basım: {new Date().toLocaleString('tr-TR')}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Kullanıcı: {user?.name || 'Kasiyer'}</div>
                </div>

                <div className="zreport-divider"></div>

                <div style={{ fontWeight: 800, margin: '4px 0', textAlign: 'center' }}>MALİ SATIŞ ÖZETİ</div>

                <div className="zreport-row">
                  <span>Kapanan Adisyon:</span>
                  <strong>{summary?.total_orders_paid || 0} Adet</strong>
                </div>
                <div className="zreport-row">
                  <span>Ortalama Sepet:</span>
                  <strong>₺{(summary?.average_ticket || 0).toFixed(2)}</strong>
                </div>

                <div className="zreport-divider"></div>

                <div className="zreport-row" style={{ fontSize: '0.94rem', fontWeight: 800 }}>
                  <span>TOPLAM KASA CİROSU:</span>
                  <span>₺{totalRevenue.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#64748b', textAlign: 'right', marginTop: '-2px', marginBottom: '4px' }}>
                  (Nakit + Kart Fiili Girişi)
                </div>

                <div className="zreport-double-divider"></div>

                <div style={{ fontWeight: 800, margin: '4px 0' }}>TAHSİLAT DAĞILIMI</div>
                <div className="zreport-row">
                  <span>Nakit Kasa (%{cashPercent}):</span>
                  <strong>₺{cashAmount.toFixed(2)}</strong>
                </div>
                <div className="zreport-row">
                  <span>Kredi Kartı (%{cardPercent}):</span>
                  <strong>₺{cardAmount.toFixed(2)}</strong>
                </div>
                {parseFloat(summary?.total_veresiye_collected || 0) > 0 && (
                  <div className="zreport-row" style={{ color: '#7c3aed' }}>
                    <span>Veresiye Tahsilatı (Kasada):</span>
                    <strong>₺{parseFloat(summary?.total_veresiye_collected).toFixed(2)}</strong>
                  </div>
                )}
                {veresiyeAmount > 0 && (
                  <div className="zreport-row" style={{ color: '#b45309' }}>
                    <span>Açık Hesap / Veresiye (Ciro Dışı):</span>
                    <strong>₺{veresiyeAmount.toFixed(2)}</strong>
                  </div>
                )}

                <div className="zreport-divider"></div>

                <div style={{ fontWeight: 800, margin: '4px 0' }}>İNDİRİM & İKRAM & FIRE</div>
                <div className="zreport-row">
                  <span>Toplam İndirim:</span>
                  <span>₺{discountAmount.toFixed(2)}</span>
                </div>
                <div className="zreport-row">
                  <span>Alınan Bahşiş:</span>
                  <span>₺{tipAmount.toFixed(2)}</span>
                </div>
                <div className="zreport-row">
                  <span>İkram Edilen:</span>
                  <span>₺{(summary?.total_complimentary || 0).toFixed(2)} ({summary?.complimentary_count || 0} Ad.)</span>
                </div>
                <div className="zreport-row">
                  <span>İade & İptal (Zayiat):</span>
                  <span>₺{((summary?.total_returned || 0) + (summary?.total_cancelled || 0)).toFixed(2)}</span>
                </div>

                {/* Kategori Bazlı Dağılım */}
                {(summary?.categoryBreakdown || []).length > 0 && (
                  <>
                    <div className="zreport-divider"></div>
                    <div style={{ fontWeight: 800, margin: '4px 0' }}>KATEGORİ BAZLI SATIŞ</div>
                    {(summary?.categoryBreakdown || []).map(c => (
                      <div key={c.category_id} className="zreport-row" style={{ fontSize: '0.78rem' }}>
                        <span>{c.category_name} ({c.total_quantity}x):</span>
                        <strong>₺{c.total_amount.toFixed(2)}</strong>
                      </div>
                    ))}
                  </>
                )}

                <div className="zreport-double-divider"></div>

                <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '0.74rem' }}>
                  <div>MALİ DEĞERİ YOKTUR - GÜN SONU KASA DÖKÜMÜ</div>
                  <div style={{ marginTop: '8px' }}>Kasiyer İmza: ........................</div>
                </div>
              </div>
            </div>

            <div className="zreport-modal-footer">
              <button 
                type="button"
                className="rep-receipt-print-btn"
                onClick={() => window.print()}
              >
                <Printer size={16} />
                <span>Yazdır</span>
              </button>
              <button 
                type="button"
                className="rep-receipt-close-btn"
                onClick={() => setIsZReportOpen(false)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ADİSYON / FİŞ KALEM DETAYI POP-UP MODALI                 */}
      {/* ======================================================== */}
      {selectedReceiptModal && (
        <div className="rep-modal-backdrop" onClick={() => setSelectedReceiptModal(null)}>
          <div className="rep-receipt-modal-box" onClick={(e) => e.stopPropagation()}>
            {/* Modal Başlığı */}
            <div className="rep-receipt-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="rep-receipt-modal-icon">
                  <Receipt size={20} />
                </div>
                <div>
                  <h3 className="rep-receipt-modal-title">
                    Adisyon & Fiş Detayı
                    <span className="rep-receipt-modal-id" title="Kasa Fiş Sıra No">Fiş #{selectedReceiptModal.id}</span>
                    {selectedReceiptModal.order_number && (
                      <span className="rep-receipt-modal-order-id" title={`Masa Sipariş Oturum Kodu (UUID): ${selectedReceiptModal.order_number}`}>
                        Oturum #{selectedReceiptModal.order_number.replace(/-/g, '').slice(0, 8).toUpperCase()}
                      </span>
                    )}
                  </h3>
                  <div className="rep-receipt-modal-subtitle">
                    {new Date(selectedReceiptModal.created_at).toLocaleString('tr-TR')}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  type="button" 
                  className="rep-modal-close-btn print"
                  onClick={() => {
                    const items = receiptDetailData[selectedReceiptModal.id] || [];
                    setPrintingReceipt({ receipt: selectedReceiptModal, items });
                  }}
                  title="Müşteri Fişi Yazdır"
                >
                  <Printer size={16} />
                </button>
                <button 
                  type="button" 
                  className="rep-modal-close-btn"
                  onClick={() => setSelectedReceiptModal(null)}
                  title="Kapat"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Gövdesi */}
            <div className="rep-receipt-modal-body">
              {/* Üst Bilgi Kartı */}
              <div className="rep-receipt-info-grid">
                <div className="rep-receipt-info-item">
                  <span className="info-label">Masa</span>
                  <span className="info-val">
                    {selectedReceiptModal.table_title || 'Masa'}
                    {selectedReceiptModal.table_number && ` (${selectedReceiptModal.table_number})`}
                  </span>
                </div>
                {selectedReceiptModal.order_number && (
                  <div className="rep-receipt-info-item">
                    <span className="info-label">Masa Sipariş Kodu</span>
                    <span 
                      className="info-val rep-copyable-code"
                      onClick={() => {
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(selectedReceiptModal.order_number);
                          alert(`Masa Sipariş Kodu panoya kopyalandı:\n${selectedReceiptModal.order_number}`);
                        }
                      }}
                      title={`Tam GUID: ${selectedReceiptModal.order_number} (Panoya kopyalamak için tıklayın)`}
                    >
                      #{selectedReceiptModal.order_number.replace(/-/g, '').slice(0, 8).toUpperCase()}
                      <span style={{ fontSize: '0.72rem', opacity: 0.75 }}>📋 Kopyala</span>
                    </span>
                  </div>
                )}
                <div className="rep-receipt-info-item">
                  <span className="info-label">Ödeme Yöntemi</span>
                  <span className="info-val">
                    {selectedReceiptModal.payment_method === 'cash' && '💵 Nakit'}
                    {selectedReceiptModal.payment_method === 'credit_card' && '💳 Kredi Kartı'}
                    {selectedReceiptModal.payment_method === 'veresiye' && '📝 Veresiye (Cari)'}
                    {selectedReceiptModal.payment_method === 'mixed' && '🔀 Parçalı Ödeme'}
                  </span>
                </div>
                <div className="rep-receipt-info-item">
                  <span className="info-label">Kapatan Personel</span>
                  <span className="info-val">{selectedReceiptModal.closed_by_user_name || 'Personel'}</span>
                </div>
                <div className="rep-receipt-info-item">
                  <span className="info-label">Müşteri / Cari</span>
                  <span className="info-val">
                    {selectedReceiptModal.customer_name ? `👤 ${selectedReceiptModal.customer_name}` : 'Genel Müşteri'}
                  </span>
                </div>
                <div className="rep-receipt-info-item">
                  <span className="info-label">Fiş Tarihi</span>
                  <span className="info-val" style={{ fontSize: '0.82rem' }}>
                    {new Date(selectedReceiptModal.created_at).toLocaleString('tr-TR')}
                  </span>
                </div>
              </div>

              {/* Sipariş Kalemleri Bölümü */}
              <div className="rep-modal-items-section">
                <div className="rep-modal-section-title">
                  <Coffee size={15} color="#346c80" />
                  <span>Sipariş Kalemleri</span>
                  <span className="rep-items-count">
                    {(receiptDetailData[selectedReceiptModal.id] || []).length} Kalem
                  </span>
                </div>

                {loadingReceiptId === selectedReceiptModal.id ? (
                  <div style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={24} className="cat-spin" style={{ marginBottom: '8px' }} />
                    <div style={{ fontWeight: 700 }}>Ürün kalemleri yükleniyor...</div>
                  </div>
                ) : (receiptDetailData[selectedReceiptModal.id] || []).length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>
                    Bu fişe ait ürün kalemi bulunamadı veya sipariş doğrudan tahsil edildi.
                  </div>
                ) : (
                  <div className="rep-modal-table-wrap">
                    <table className="rep-modal-items-table">
                      <thead>
                        <tr>
                          <th>Ürün Adı</th>
                          <th style={{ textAlign: 'center' }}>Adet</th>
                          <th style={{ textAlign: 'right' }}>Birim Fiyat</th>
                          <th style={{ textAlign: 'right' }}>Tutar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(receiptDetailData[selectedReceiptModal.id] || []).map((it) => (
                          <tr key={it.id}>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <strong style={{ color: '#173845', fontSize: '0.90rem' }}>{it.product_name}</strong>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                                  {it.category_name && (
                                    <span className="rep-drawer-cat-badge">{it.category_name}</span>
                                  )}
                                  {it.note && (
                                    <span className="rep-drawer-note-badge">Not: {it.note}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#346c80' }}>
                              {it.quantity}x
                            </td>
                            <td style={{ textAlign: 'right', color: '#64748b', fontSize: '0.86rem' }}>
                              ₺{parseFloat(it.unit_price).toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#15803d' }}>
                              ₺{parseFloat(it.total_price).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Finansal Özet Kartı */}
              <div className="rep-modal-finance-card">
                {parseFloat(selectedReceiptModal.discount || 0) > 0 && (
                  <div className="finance-row discount">
                    <span>Uygulanan İndirim / İskonto:</span>
                    <strong>-₺{parseFloat(selectedReceiptModal.discount).toFixed(2)}</strong>
                  </div>
                )}
                {parseFloat(selectedReceiptModal.tip || 0) > 0 && (
                  <div className="finance-row tip">
                    <span>Alınan Bahşiş:</span>
                    <strong>+₺{parseFloat(selectedReceiptModal.tip).toFixed(2)}</strong>
                  </div>
                )}
                {selectedReceiptModal.payment_method === 'mixed' && (
                  <div className="finance-row mixed-split">
                    <span>Ödeme Dağılımı:</span>
                    <span>
                      Nakit: ₺{parseFloat(selectedReceiptModal.cash_amount || 0).toFixed(2)} • Kart: ₺{parseFloat(selectedReceiptModal.card_amount || 0).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="finance-total-row">
                  <span>TAHSİL EDİLEN TUTAR</span>
                  <span className="total-val">
                    ₺{parseFloat(selectedReceiptModal.total_amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Alt Butonları */}
            <div className="rep-receipt-modal-footer">
              <button
                type="button"
                className="rep-modal-btn print"
                onClick={() => {
                  const items = receiptDetailData[selectedReceiptModal.id] || [];
                  setPrintingReceipt({ receipt: selectedReceiptModal, items });
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)'
                }}
              >
                <Printer size={16} />
                <span>Müşteri Fişi Yazdır</span>
              </button>
              <button
                type="button"
                className="rep-modal-btn close"
                onClick={() => setSelectedReceiptModal(null)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MÜŞTERİ ADİSYON / FİŞİ TERMAL YAZDIRMA MODALI            */}
      {/* ======================================================== */}
      {printingReceipt && (
        <div className="zreport-modal-backdrop" onClick={() => setPrintingReceipt(null)}>
          <div className="zreport-modal-content customer-receipt-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="zreport-modal-header customer-receipt-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Printer size={18} />
                <span style={{ fontWeight: 800 }}>Müşteri Fişi Önizleme & Yazdır</span>
              </div>
              <button 
                type="button" 
                className="rep-modal-close-btn"
                onClick={() => setPrintingReceipt(null)}
                title="Kapat"
              >
                <X size={16} />
              </button>
            </div>

            <div className="zreport-modal-body" style={{ background: '#f8fafc', padding: '18px', overscrollBehavior: 'contain', display: 'flex', justifyContent: 'center' }}>
              <div className="customer-receipt-ticket">
                {/* İşletme Başlığı */}
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '1px', color: '#000000' }}>
                    ÖZGENSOY
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, letterSpacing: '0.5px', color: '#000000', marginTop: '2px' }}>
                    MÜZE • KÜTÜPHANE
                  </div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, letterSpacing: '0.5px', color: '#000000', marginTop: '2px' }}>
                    KAFETERYA
                  </div>
                </div>

                <div className="pos-paper-divider" style={{ borderTop: '1.5px dashed #000000', margin: '8px 0' }}></div>

                {/* Sadeleştirilmiş Üst Bilgiler (2-3 Kompakt Satır) */}
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#000000', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Tarih: {new Date(printingReceipt.receipt.created_at).toLocaleDateString('tr-TR')} {new Date(printingReceipt.receipt.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>Fiş: <strong>#{printingReceipt.receipt.id}</strong></span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Masa: {printingReceipt.receipt.table_title || 'Masa'}{printingReceipt.receipt.table_number ? ` (${printingReceipt.receipt.table_number})` : ''}</span>
                    <span>Personel: {printingReceipt.receipt.closed_by_user_name?.split(' ')[0] || 'Kasiyer'}</span>
                  </div>
                  {printingReceipt.receipt.customer_name && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Müşteri:</span>
                      <strong>{printingReceipt.receipt.customer_name}</strong>
                    </div>
                  )}
                </div>

                <div className="pos-paper-divider" style={{ borderTop: '1.5px dashed #000000', margin: '8px 0' }}></div>

                {/* Sadeleştirilmiş 2 Sütunlu Ürün Listesi */}
                <div style={{ margin: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.80rem', fontWeight: 900, color: '#000000', borderBottom: '1.5px solid #000000', paddingBottom: '3px', marginBottom: '6px' }}>
                    <span>ÜRÜN</span>
                    <span>TUTAR</span>
                  </div>

                  {printingReceipt.items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '8px 0', color: '#000000', fontWeight: 700, fontSize: '0.82rem' }}>
                      Kasa Tahsilatı
                    </div>
                  ) : (
                    printingReceipt.items.map((it, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.86rem', fontWeight: 700, color: '#000000', padding: '3px 0' }}>
                        <span style={{ flex: 1, paddingRight: '8px' }}>
                          {it.product_name} <span style={{ fontWeight: 900 }}>x{it.quantity}</span>
                        </span>
                        <span style={{ fontWeight: 800 }}>
                          ₺{parseFloat(it.total_price).toFixed(2)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="pos-paper-divider" style={{ borderTop: '1.5px dashed #000000', margin: '8px 0' }}></div>

                {/* Sadeleştirilmiş Finansal Özet */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.84rem', fontWeight: 700, color: '#000000' }}>
                  {/* Ara toplam sadece indirim veya bahşiş varsa gösterilir */}
                  {(parseFloat(printingReceipt.receipt.discount || 0) > 0 || parseFloat(printingReceipt.receipt.tip || 0) > 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Ara Toplam:</span>
                      <span>₺{printingReceipt.items.reduce((s, i) => s + parseFloat(i.total_price || 0), 0).toFixed(2)}</span>
                    </div>
                  )}

                  {parseFloat(printingReceipt.receipt.discount || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>İndirim:</span>
                      <span>-₺{parseFloat(printingReceipt.receipt.discount).toFixed(2)}</span>
                    </div>
                  )}

                  {parseFloat(printingReceipt.receipt.tip || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Bahşiş:</span>
                      <span>+₺{parseFloat(printingReceipt.receipt.tip).toFixed(2)}</span>
                    </div>
                  )}

                  <div className="pos-paper-divider" style={{ borderTop: '1.5px solid #000000', margin: '4px 0' }}></div>

                  {/* Genel Toplam */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.12rem', fontWeight: 900 }}>
                    <span>TOPLAM:</span>
                    <span>₺{parseFloat(printingReceipt.receipt.total_amount).toFixed(2)}</span>
                  </div>

                  {/* Ödeme Türü (Sadece tutarı > 0 olanlar) */}
                  <div style={{ marginTop: '4px', fontSize: '0.80rem' }}>
                    {printingReceipt.receipt.payment_method === 'cash' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Ödeme:</span>
                        <span style={{ fontWeight: 800 }}>Nakit</span>
                      </div>
                    )}
                    {printingReceipt.receipt.payment_method === 'credit_card' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Ödeme:</span>
                        <span style={{ fontWeight: 800 }}>Kredi Kartı</span>
                      </div>
                    )}
                    {printingReceipt.receipt.payment_method === 'veresiye' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Ödeme:</span>
                        <span style={{ fontWeight: 800 }}>Veresiye (Cari)</span>
                      </div>
                    )}
                    {printingReceipt.receipt.payment_method === 'mixed' && (
                      <div>
                        <div style={{ fontWeight: 800 }}>Ödeme: Parçalı</div>
                        <div style={{ paddingLeft: '6px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {parseFloat(printingReceipt.receipt.cash_amount || 0) > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>• Nakit:</span>
                              <span>₺{parseFloat(printingReceipt.receipt.cash_amount).toFixed(2)}</span>
                            </div>
                          )}
                          {parseFloat(printingReceipt.receipt.card_amount || 0) > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>• Kredi Kartı:</span>
                              <span>₺{parseFloat(printingReceipt.receipt.card_amount).toFixed(2)}</span>
                            </div>
                          )}
                          {parseFloat(printingReceipt.receipt.veresiye_amount || 0) > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>• Veresiye:</span>
                              <span>₺{parseFloat(printingReceipt.receipt.veresiye_amount).toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pos-paper-divider" style={{ borderTop: '1.5px dashed #000000', margin: '8px 0' }}></div>

                {/* Sade Alt Mesaj */}
                <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '0.74rem', fontWeight: 700, color: '#000000' }}>
                  <div style={{ fontWeight: 800 }}>Afiyet Olsun, Yine Bekleriz!</div>
                  <div style={{ fontSize: '0.66rem', marginTop: '3px', letterSpacing: '0.5px' }}>
                    *** MALİ DEĞERİ YOKTUR ***
                  </div>
                </div>
              </div>
            </div>

            <div className="zreport-modal-footer">
              <button 
                type="button"
                className="rep-receipt-print-btn"
                onClick={() => window.print()}
              >
                <Printer size={16} />
                <span>Yazdır (Ctrl+P)</span>
              </button>
              <button 
                type="button"
                className="rep-receipt-close-btn"
                onClick={() => setPrintingReceipt(null)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
