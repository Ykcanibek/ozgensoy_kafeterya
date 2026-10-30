import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import './customers.css';
import {
  Users,
  UserPlus,
  Search,
  Phone,
  FileText,
  Clock,
  User,
  CreditCard,
  Banknote,
  Percent,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  ChevronUp,
  X,
  Edit2,
  Trash2,
  DollarSign,
  Coffee,
  Receipt,
  Coins,
  Layers,
  Calendar,
  RotateCcw
} from 'lucide-react';

/**
 * Türkçe kurallarına uygun Title Case formatlayıcı
 * Örn: "ahmet can şahin" -> "Ahmet Can Şahin"
 */
export const toTitleCaseTr = (text) => {
  if (!text) return '';
  return text
    .split(' ')
    .map(word => {
      if (!word) return '';
      return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1).toLocaleLowerCase('tr-TR');
    })
    .join(' ');
};

/**
 * Başında silinemez '0' olan telefon numarasını işleme
 */
export const formatLeadingZeroPhone = (val) => {
  if (!val) return '0';
  let cleaned = val.replace(/[^\d]/g, '');
  if (!cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  return cleaned.slice(0, 11);
};

export default function Customers() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState({
    total_customers_count: 0,
    total_receivables: '0.00',
    total_debt_accumulated: '0.00',
    total_collected: '0.00'
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'with_debt' | 'zero_debt'

  // Modallar
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);

  // Birleşik Ekstre & Tahsilat Modalı (2 Kolon)
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedTxIds, setExpandedTxIds] = useState([]);
  const [mobileActiveTab, setMobileActiveTab] = useState('pay'); // 'ledger' | 'pay'

  // Tahsilat Formu State'leri
  const [payAmount, setPayAmount] = useState('0'); // Kapatılacak Borç Tutarı
  const [payMethod, setPayMethod] = useState('cash'); // 'cash' | 'credit_card' | 'mixed'
  const [mixedCash, setMixedCash] = useState('0');
  const [mixedCard, setMixedCard] = useState('0.00');
  const [discountVal, setDiscountVal] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  // Ekleme / Düzenleme Formu State'i
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('0');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [formError, setFormError] = useState('');

  // Özel Ekrana Özel Toast Bildirimi State
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const showToast = (message, type = 'success', duration = 3800) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, type, id: Date.now() });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, duration);
  };

  // Müşteri Arşive Alma / Silme Onay Modalı State
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  // Müşteri Borcunu Sıfırlama Modalı State
  const [showResetDebtDialog, setShowResetDebtDialog] = useState(false);
  const [resetDebtNotes, setResetDebtNotes] = useState('');
  const [isSubmittingResetDebt, setIsSubmittingResetDebt] = useState(false);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Müşterileri Çek
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/customers?search=${encodeURIComponent(searchQuery)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setCustomers(data.customers || []);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Müşteri listesi çekilemedi:', err);
      showToast('Müşteriler yüklenirken bir hata oluştu.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [searchQuery]);

  // Seçili Müşterinin Detayını Çek
  const fetchCustomerDetail = async (id) => {
    if (!id) return;
    try {
      setDetailLoading(true);
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/customers/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setCustomerDetail(data);
      } else {
        showToast(data.message || 'Müşteri detayları alınamadı.', 'danger');
      }
    } catch (err) {
      console.error('Müşteri detay hatası:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Tek Buton: Birleşik Ekstre & Tahsilat Modalını Aç
  const handleOpenUnifiedModal = (cust) => {
    setSelectedCustomer(cust);
    setMobileActiveTab(parseFloat(cust.current_balance || 0) > 0.05 ? 'pay' : 'ledger');
    setPayAmount('0');
    setPayMethod('cash');
    setMixedCash('0');
    setMixedCard('0.00');
    setDiscountVal('');
    setPayNotes('');
    setExpandedTxIds([]);
    fetchCustomerDetail(cust.id);
  };

  const handleCloseUnifiedModal = () => {
    setSelectedCustomer(null);
    setCustomerDetail(null);
    setExpandedTxIds([]);
    setShowResetDebtDialog(false);
    setResetDebtNotes('');
  };

  // Yeni Müşteri Modalını Aç
  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('0');
    setFormNotes('');
    setFormError('');
    setShowAddModal(true);
  };

  // Müşteri Düzenle
  const handleOpenEditModal = (cust) => {
    setEditingCustomer(cust);
    setFormName(cust.name || '');
    setFormPhone(cust.phone && cust.phone.length > 1 ? cust.phone : '0');
    setFormNotes(cust.notes || '');
    setFormError('');
    setShowAddModal(true);
  };

  // Müşteri İsim Değişimi: Anlık Otomatik Title Case
  const handleNameChange = (e) => {
    const raw = e.target.value;
    const formatted = toTitleCaseTr(raw);
    setFormName(formatted);
    if (formError) setFormError('');
  };

  // Telefon Değişimi: Başında silinemez '0'
  const handlePhoneChange = (e) => {
    const raw = e.target.value;
    const formatted = formatLeadingZeroPhone(raw);
    setFormPhone(formatted);
  };

  // Formu Kaydet
  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Müşteri adı zorunludur.');
      return;
    }

    try {
      setIsSubmittingForm(true);
      setFormError('');
      const token = localStorage.getItem('kafe_token');
      const url = editingCustomer ? `/api/customers/${editingCustomer.id}` : '/api/customers';
      const method = editingCustomer ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: formName.trim(),
          phone: formPhone,
          notes: formNotes.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast(editingCustomer ? 'Müşteri başarıyla güncellendi.' : 'Yeni müşteri başarıyla eklendi.', 'success');
        setShowAddModal(false);
        fetchCustomers();
        if (selectedCustomer && editingCustomer && selectedCustomer.id === editingCustomer.id) {
          fetchCustomerDetail(selectedCustomer.id);
          setSelectedCustomer(prev => ({
            ...prev,
            name: formName.trim(),
            phone: formPhone,
            notes: formNotes.trim()
          }));
        }
      } else {
        setFormError(data.message || 'İşlem başarısız.');
      }
    } catch (err) {
      console.error('Müşteri kaydetme hatası:', err);
      setFormError('Sunucu bağlantı hatası oluştu.');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Müşteri Arşive Alma / Silme Başlat (Açık borcu kontrol eder)
  const handleInitiateDelete = (cust) => {
    const balance = parseFloat(cust.current_balance || 0);
    if (balance > 0.05) {
      showToast(`Bu müşterinin ₺${balance.toFixed(2)} tutarında açık borcu bulunmaktadır. Borcu kapatılmadan arşive alınamaz.`, 'warning');
      return;
    }
    setCustomerToDelete(cust);
  };

  // Müşteri Arşive Alma Onaylandığında Çalışır
  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;

    try {
      setIsDeletingCustomer(true);
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/customers/${customerToDelete.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        showToast(`"${customerToDelete.name}" başarıyla arşive alındı.`, 'success');
        if (selectedCustomer?.id === customerToDelete.id) {
          handleCloseUnifiedModal();
        }
        setCustomerToDelete(null);
        fetchCustomers();
      } else {
        showToast(data.message || 'Müşteri arşive alınamadı.', 'danger');
      }
    } catch (err) {
      console.error('Müşteri silme hatası:', err);
      showToast('Silme işlemi sırasında sunucu hatası oluştu.', 'danger');
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  // Müşteri Borcunu Sıfırla (İşletme İnisiyatifi ile Borç Silme)
  const handleResetDebt = async (e) => {
    if (e) e.preventDefault();
    if (!selectedCustomer) return;

    const currentBal = parseFloat(selectedCustomer.current_balance || 0);
    if (currentBal <= 0.05) {
      showToast('Bu müşterinin zaten açık bir borcu bulunmamaktadır.', 'warning');
      setShowResetDebtDialog(false);
      return;
    }

    try {
      setIsSubmittingResetDebt(true);
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/customers/${selectedCustomer.id}/reset-debt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          notes: resetDebtNotes.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast(`₺${currentBal.toFixed(2)} tutarındaki borç başarıyla sıfırlandı.`, 'success');
        fetchCustomers();
        fetchCustomerDetail(selectedCustomer.id);
        setSelectedCustomer(prev => prev ? { ...prev, current_balance: 0 } : null);
        setPayAmount('0');
        setMixedCash('0');
        setMixedCard('0.00');
        setDiscountVal('');
        setTipVal('');
        setPayNotes('');
        setResetDebtNotes('');
        setShowResetDebtDialog(false);
      } else {
        showToast(data.message || 'Borç sıfırlanamadı.', 'danger');
      }
    } catch (err) {
      console.error('Borç sıfırlama hatası:', err);
      showToast('Borç sıfırlama işlemi sırasında sunucu hatası oluştu.', 'danger');
    } finally {
      setIsSubmittingResetDebt(false);
    }
  };

  // Parçalı Nakit Değişimi
  const handleMixedCashChange = (val) => {
    setMixedCash(val);
    const parsedSettle = parseFloat(payAmount || 0);
    const disc = Math.max(0, parseFloat(discountVal || 0));
    const netPayable = Math.max(0, parsedSettle - disc);
    const cashNum = parseFloat(val || 0);
    const cardNum = Math.max(0, netPayable - cashNum);
    setMixedCard(cardNum.toFixed(2));
  };

  // Parçalı Kart Değişimi
  const handleMixedCardChange = (val) => {
    setMixedCard(val);
    const parsedSettle = parseFloat(payAmount || 0);
    const disc = Math.max(0, parseFloat(discountVal || 0));
    const netPayable = Math.max(0, parsedSettle - disc);
    const cardNum = parseFloat(val || 0);
    const cashNum = Math.max(0, netPayable - cardNum);
    setMixedCash(cashNum.toFixed(2));
  };

  // Tahsilatı Kaydet
  const handleProcessPayment = async (e) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const parsedSettle = parseFloat(payAmount || 0);
    const disc = Math.max(0, parseFloat(discountVal || 0));
    const custBalance = parseFloat(selectedCustomer.current_balance || 0);

    if (parsedSettle <= 0) {
      showToast('Kapatılacak borç tutarı 0₺ den büyük olmalıdır.', 'warning');
      return;
    }

    if (parsedSettle > custBalance + 0.05) {
      showToast(`Kapatılacak borç tutarı müşterinin mevcut borcundan (₺${custBalance.toFixed(2)}) fazla olamaz.`, 'warning');
      return;
    }

    if (disc > parsedSettle) {
      showToast('İndirim tutarı kapatılacak borçtan fazla olamaz.', 'warning');
      return;
    }

    const netPayable = Math.max(0, parsedSettle - disc);

    try {
      setIsSubmittingPay(true);
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/customers/${selectedCustomer.id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          settle_amount: parsedSettle,
          amount: netPayable,
          payment_method: payMethod,
          cash_amount: payMethod === 'mixed' ? (parseFloat(mixedCash) || 0) : undefined,
          card_amount: payMethod === 'mixed' ? (parseFloat(mixedCard) || 0) : undefined,
          discount: disc,
          notes: payNotes.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast(
          disc > 0 
            ? `₺${parsedSettle.toFixed(2)} tutarındaki borç kapatıldı (₺${disc.toFixed(2)} İndirim, ₺${netPayable.toFixed(2)} Tahsilat).`
            : `₺${parsedSettle.toFixed(2)} tutarında tahsilat başarıyla kaydedildi.`,
          'success'
        );
        // Listeyi yenile
        fetchCustomers();
        // Sol kolondaki ekstre detayını yenile
        fetchCustomerDetail(selectedCustomer.id);
        // Kalan bakiyeyi hesapla ve güncelle
        const newBal = Math.max(0, custBalance - parsedSettle);
        setSelectedCustomer(prev => prev ? { ...prev, current_balance: newBal } : null);
        setPayAmount('0');
        setMixedCash('0');
        setMixedCard('0.00');
        setDiscountVal('');
        setPayNotes('');
      } else {
        showToast(data.message || 'Tahsilat gerçekleştirilemedi.', 'danger');
      }
    } catch (err) {
      console.error('Tahsilat hatası:', err);
      showToast('Tahsilat işlemi sırasında sunucu hatası oluştu.', 'danger');
    } finally {
      setIsSubmittingPay(false);
    }
  };

  // Hareket Detayı Aç / Kapat
  const toggleTxExpand = (txId) => {
    setExpandedTxIds(prev => 
      prev.includes(txId) ? prev.filter(id => id !== txId) : [...prev, txId]
    );
  };

  // Filtrelenmiş Müşteriler
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const bal = parseFloat(c.current_balance || 0);
      if (filterTab === 'with_debt') return bal > 0.05;
      if (filterTab === 'zero_debt') return bal <= 0.05;
      return true;
    });
  }, [customers, filterTab]);

  return (
    <div className="pos-page-container">
      {/* Özel Ekrana Özel Toast Bildirimi */}
      {toast && (
        <aside className="cust-toast-viewport" aria-live="assertive">
          <div className={`cust-toast-card ${toast.type || 'info'}`}>
            <div className="cust-toast-icon-badge">
              {toast.type === 'success' && <CheckCircle2 size={18} />}
              {toast.type === 'danger' && <AlertCircle size={18} />}
              {toast.type === 'warning' && <AlertTriangle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
            </div>

            <div className="cust-toast-body">
              <span className="cust-toast-title">
                {toast.type === 'success' && 'Başarılı'}
                {toast.type === 'danger' && 'İşlem Başarısız'}
                {toast.type === 'warning' && 'Dikkat'}
                {toast.type === 'info' && 'Bilgilendirme'}
              </span>
              <p className="cust-toast-msg">{toast.message}</p>
            </div>

            <button
              type="button"
              className="cust-toast-close-btn"
              onClick={() => {
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                setToast(null);
              }}
              title="Kapat"
            >
              <X size={15} />
            </button>

            <div className="cust-toast-progress">
              <div className="cust-toast-progress-fill" />
            </div>
          </div>
        </aside>
      )}

      {/* Yan Menü (Sidebar) */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        activePage="customers"
      />

      {/* Standart Üst Başlık (Navbar) */}
      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        title="Müşteriler & Cari"
        stats={
          <>
            <div className="pos-stat-pill" style={{ background: '#d3e5eb', color: '#346c80' }}>
              <span>Müşteri:</span> <strong>{stats.total_customers_count || customers.length}</strong>
            </div>
            <div className="pos-stat-pill" style={{ background: '#fdf2f2', color: '#b84a39' }}>
              <span>Açık Borç:</span> <strong>₺{parseFloat(stats.total_receivables || 0).toFixed(2)}</strong>
            </div>
            <div className="pos-stat-pill" style={{ background: '#eaf6ed', color: '#1e7e34' }}>
              <span>Tahsilat:</span> <strong>₺{parseFloat(stats.total_collected || 0).toFixed(2)}</strong>
            </div>
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
              boxShadow: '0 2px 8px rgba(52, 108, 128, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <UserPlus size={16} />
            <span>Yeni Müşteri Ekle</span>
          </button>
        }
      />

      {/* ARAMA (SOL) VE FİLTRELEME ROZETLERİ (SAĞ) */}
      <div className="cust-toolbar-row">
        {/* Sol: Oval Arama Çubuğu */}
        <div className="cust-search-pill-box">
          <Search size={20} color="#486b78" />
          <input
            type="text"
            placeholder="Müşteri adı, telefon veya açıklama ile ara..."
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
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sağ: Filtre Rozetleri (Tümü, Borcu Olanlar, Borcu Olmayanlar) */}
        <div className="cust-filter-pills">
          <button
            type="button"
            className={`cust-filter-pill ${filterTab === 'all' ? 'active' : ''}`}
            onClick={() => setFilterTab('all')}
          >
            Tümü ({customers.length})
          </button>
          <button
            type="button"
            className={`cust-filter-pill debt ${filterTab === 'with_debt' ? 'active' : ''}`}
            onClick={() => setFilterTab('with_debt')}
          >
            <span className="pill-text-desktop">Borcu Olanlar</span>
            <span className="pill-text-mobile">Borçlu</span>
            {' '}({customers.filter(c => parseFloat(c.current_balance || 0) > 0.05).length})
          </button>
          <button
            type="button"
            className={`cust-filter-pill clean ${filterTab === 'zero_debt' ? 'active' : ''}`}
            onClick={() => setFilterTab('zero_debt')}
          >
            <span className="pill-text-desktop">Borcu Olmayanlar</span>
            <span className="pill-text-mobile">Borçsuz</span>
            {' '}({customers.filter(c => parseFloat(c.current_balance || 0) <= 0.05).length})
          </button>
        </div>
      </div>

      {/* MÜŞTERİ LİSTESİ (TABLO / KOMPAKT LİSTE FORMATI) */}
      {loading ? (
        <div className="customers-loading-state">
          <div className="cust-spinner"></div>
          <p>Müşteriler getiriliyor...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="customers-empty-state">
          <Users size={48} color="#c5b7ab" />
          <h3>Müşteri Bulunamadı</h3>
          <p>
            {searchQuery
              ? 'Arama kriterlerinize uygun müşteri kaydı bulunamadı.'
              : 'Henüz sistemde kayıtlı bir müşteri bulunmuyor.'}
          </p>
          <button
            type="button"
            className="customers-btn-primary"
            onClick={handleOpenAddModal}
          >
            <UserPlus size={16} />
            <span>İlk Müşteriyi Ekle</span>
          </button>
        </div>
      ) : (
        <div className="cust-table-card">
          {/* Masaüstü Tablo Görünümü */}
          <div className="cust-table-responsive desktop-only">
            <table className="cust-table">
              <thead>
                <tr>
                  <th style={{ width: '280px' }}>Müşteri Bilgisi</th>
                  <th>Kısa Açıklama (Not)</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>Toplam Borç</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>Tahsil Edilen</th>
                  <th style={{ textAlign: 'right', width: '140px' }}>Kalan Borç</th>
                  <th style={{ textAlign: 'center', width: '130px' }}>Durum</th>
                  <th style={{ textAlign: 'center', width: '200px' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(cust => {
                  const bal = parseFloat(cust.current_balance || 0);
                  const totalDebt = parseFloat(cust.total_debt || 0);
                  const totalPaid = parseFloat(cust.total_paid || 0);
                  const hasDebt = bal > 0.05;

                  return (
                    <tr key={cust.id} className={hasDebt ? 'has-debt-row' : ''}>
                      {/* Müşteri Bilgisi (Avatar + İsim + Telefon) */}
                      <td>
                        <div className="cust-table-user-cell">
                          <div className={`cust-table-avatar ${hasDebt ? 'debt' : 'clean'}`}>
                            {cust.name.slice(0, 2).toLocaleUpperCase('tr-TR')}
                          </div>
                          <div className="cust-table-identity">
                            <strong className="cust-table-name" title={cust.name}>
                              {cust.name}
                            </strong>
                            <div className="cust-table-phone">
                              <Phone size={12} />
                              <span>{cust.phone && cust.phone.length > 1 ? cust.phone : 'Telefon yok'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Açıklama */}
                      <td>
                        {cust.notes ? (
                          <div className="cust-table-note" title={cust.notes}>
                            <FileText size={13} className="note-icon" />
                            <span>{cust.notes}</span>
                          </div>
                        ) : (
                          <span className="cust-table-note-empty">—</span>
                        )}
                      </td>

                      {/* Toplam Borç */}
                      <td style={{ textAlign: 'right' }}>
                        <span className="cust-table-amount gray">
                          ₺{totalDebt.toFixed(2)}
                        </span>
                      </td>

                      {/* Tahsil Edilen */}
                      <td style={{ textAlign: 'right' }}>
                        <span className="cust-table-amount green">
                          ₺{totalPaid.toFixed(2)}
                        </span>
                      </td>

                      {/* Kalan Borç */}
                      <td style={{ textAlign: 'right' }}>
                        <span className={`cust-table-amount bold ${hasDebt ? 'debt' : 'clean'}`}>
                          ₺{bal.toFixed(2)}
                        </span>
                      </td>

                      {/* Durum Rozeti */}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`cust-status-badge ${hasDebt ? 'badge-debt' : 'badge-clean'}`}>
                          {hasDebt ? 'Açık Borç' : 'Hesap Temiz'}
                        </span>
                      </td>

                      {/* Tek Birleşik Buton (Hesap & Tahsilat) + Düzenle + Sil */}
                      <td>
                        <div className="cust-table-actions">
                          <button
                            type="button"
                            className="cust-btn-unified-action"
                            onClick={() => handleOpenUnifiedModal(cust)}
                            title="Hesap hareketlerini incele ve borç tahsilatı yap"
                          >
                            <Receipt size={14} />
                            <span>Hesap & Tahsilat</span>
                          </button>

                          <button
                            type="button"
                            className="cust-row-icon-btn"
                            title="Bilgileri Düzenle"
                            onClick={() => handleOpenEditModal(cust)}
                          >
                            <Edit2 size={14} />
                          </button>

                          <button
                            type="button"
                            className="cust-row-icon-btn danger"
                            title="Müşteriyi Arşive Al"
                            onClick={() => handleInitiateDelete(cust)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobilde Modern Dokunmatik Kart Listesi Görünümü */}
          <div className="cust-mobile-cards-list mobile-only">
            {filteredCustomers.map(cust => {
              const bal = parseFloat(cust.current_balance || 0);
              const totalDebt = parseFloat(cust.total_debt || 0);
              const totalPaid = parseFloat(cust.total_paid || 0);
              const hasDebt = bal > 0.05;

              return (
                <div key={cust.id} className={`cust-mobile-card ${hasDebt ? 'has-debt' : ''}`}>
                  <div className="cust-mcard-top">
                    <div className="cust-mcard-identity">
                      <div className={`cust-table-avatar ${hasDebt ? 'debt' : 'clean'}`}>
                        {cust.name.slice(0, 2).toLocaleUpperCase('tr-TR')}
                      </div>
                      <div className="cust-mcard-info">
                        <strong className="cust-mcard-name">{cust.name}</strong>
                        <div className="cust-mcard-phone">
                          <Phone size={12} />
                          <span>{cust.phone && cust.phone.length > 1 ? cust.phone : 'Telefon yok'}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`cust-status-badge ${hasDebt ? 'badge-debt' : 'badge-clean'}`}>
                      {hasDebt ? `₺${bal.toFixed(2)}` : 'Borçsuz'}
                    </span>
                  </div>

                  {cust.notes && (
                    <div className="cust-mcard-notes">
                      <FileText size={12} />
                      <span>{cust.notes}</span>
                    </div>
                  )}

                  <div className="cust-mcard-stats">
                    <div className="mcard-stat">
                      <span className="mstat-label">Toplam Borç</span>
                      <strong className="mstat-val">₺{totalDebt.toFixed(2)}</strong>
                    </div>
                    <div className="mcard-stat">
                      <span className="mstat-label">Tahsil Edilen</span>
                      <strong className="mstat-val green">₺{totalPaid.toFixed(2)}</strong>
                    </div>
                    <div className="mcard-stat highlight">
                      <span className="mstat-label">Kalan Borç</span>
                      <strong className={`mstat-val ${hasDebt ? 'debt' : 'clean'}`}>₺{bal.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="cust-mcard-actions">
                    <button
                      type="button"
                      className="cust-btn-unified-action"
                      onClick={() => handleOpenUnifiedModal(cust)}
                    >
                      <Receipt size={15} />
                      <span>Hesap & Tahsilat</span>
                    </button>

                    <div className="cust-mcard-icons">
                      <button
                        type="button"
                        className="cust-row-icon-btn"
                        title="Düzenle"
                        onClick={() => handleOpenEditModal(cust)}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        className="cust-row-icon-btn danger"
                        title="Arşive Al"
                        onClick={() => handleInitiateDelete(cust)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. MÜŞTERİ EKLE / DÜZENLE MODALI                         */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="pos-receipt-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="cust-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="cust-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="cust-modal-icon">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="cust-modal-title">
                    {editingCustomer ? 'Müşteri Bilgilerini Düzenle' : 'Yeni Müşteri Oluştur'}
                  </h3>
                  <p className="cust-modal-subtitle">
                    Zorunlu alan sadece isimdir. Baş harfler otomatik büyütülür.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="cust-modal-close-btn"
                onClick={() => setShowAddModal(false)}
                title="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="cust-modal-form">
              {formError && (
                <div className="cust-form-alert danger">
                  <AlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              {/* İsim Alanı (Zorunlu + Otomatik Title Case) */}
              <div className="cust-form-group">
                <label className="cust-form-label">
                  Müşteri Adı Soyadı <span className="req">* (Zorunlu)</span>
                </label>
                <div className="cust-input-wrapper">
                  <User size={16} className="cust-input-icon" />
                  <input
                    type="text"
                    required
                    placeholder="Örn: Ahmet Can Yılmaz"
                    value={formName}
                    onChange={handleNameChange}
                    autoFocus
                    className="cust-input"
                  />
                </div>
                <span className="cust-input-hint">
                  Baş harfler otomatik olarak büyük harfe çevrilir.
                </span>
              </div>

              {/* Telefon Alanı (Başında silinemez '0') */}
              <div className="cust-form-group">
                <label className="cust-form-label">
                  Telefon Numarası <span className="opt">(İsteğe bağlı)</span>
                </label>
                <div className="cust-input-wrapper">
                  <Phone size={16} className="cust-input-icon" />
                  <input
                    type="tel"
                    placeholder="05XXXXXXXXX"
                    value={formPhone}
                    onChange={handlePhoneChange}
                    onKeyDown={(e) => {
                      if ((e.key === 'Backspace' || e.key === 'Delete') && e.target.selectionStart <= 1 && formPhone.length <= 1) {
                        e.preventDefault();
                      }
                    }}
                    className="cust-input font-mono"
                  />
                </div>
                <span className="cust-input-hint">
                  Başlangıçtaki "0" sabittir ve silinemez.
                </span>
              </div>

              {/* Kısa Açıklama (Kim olduğunu anımsatacak işler) */}
              <div className="cust-form-group">
                <label className="cust-form-label">
                  Kısa Açıklama & Anımsatıcı Not <span className="opt">(İsteğe bağlı)</span>
                </label>
                <div className="cust-input-wrapper">
                  <FileText size={16} className="cust-input-icon" style={{ alignSelf: 'flex-start', marginTop: '10px' }} />
                  <textarea
                    rows="3"
                    placeholder="Örn: Köşe berber Ali Usta, yan dükkan eczacı, mavi arabalı Mehmet Bey vb."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="cust-textarea"
                  ></textarea>
                </div>
                <span className="cust-input-hint">
                  Müşterinin kim olduğunu personele hatırlatacak kısa bir açıklama.
                </span>
              </div>

              {/* Form Butonları */}
              <div className="cust-modal-foot">
                <button
                  type="button"
                  className="cust-btn-cancel"
                  onClick={() => setShowAddModal(false)}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="customers-btn-primary"
                  disabled={isSubmittingForm}
                >
                  {isSubmittingForm ? (
                    <>
                      <div className="cust-spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }}></div>
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>{editingCustomer ? 'Değişiklikleri Kaydet' : 'Müşteriyi Ekle'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. BİRLEŞİK 2 KOLONLU MODAL (SOL: DETAY, SAĞ: TAHSİLAT)   */}
      {/* ======================================================== */}
      {selectedCustomer && (
        <div className="pos-receipt-modal-overlay" onClick={handleCloseUnifiedModal}>
          <div className="cust-unified-dialog" onClick={(e) => e.stopPropagation()}>
            {/* Modal Üst Başlık */}
            <div className="cust-unified-head">
              <div className="cust-unified-head-left">
                <div className={`cust-avatar lg ${parseFloat(selectedCustomer.current_balance || 0) > 0.05 ? 'debt' : 'clean'}`}>
                  {selectedCustomer.name?.slice(0, 2).toLocaleUpperCase('tr-TR') || 'M'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 className="cust-unified-title">{selectedCustomer.name}</h2>
                    <span className={`cust-status-badge ${parseFloat(selectedCustomer.current_balance || 0) > 0.05 ? 'badge-debt' : 'badge-clean'}`}>
                      {parseFloat(selectedCustomer.current_balance || 0) > 0.05
                        ? `₺${parseFloat(selectedCustomer.current_balance).toFixed(2)} Açık Borç`
                        : 'Borcu Yok (₺0.00)'}
                    </span>
                  </div>
                  <div className="cust-unified-meta">
                    <span className="meta-phone">
                      <Phone size={13} />
                      {selectedCustomer.phone && selectedCustomer.phone.length > 1
                        ? selectedCustomer.phone
                        : 'Telefon belirtilmedi'}
                    </span>
                    {selectedCustomer.notes && (
                      <span className="meta-notes">
                        <FileText size={13} />
                        {selectedCustomer.notes}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="cust-unified-head-right">
                <button
                  type="button"
                  className="cust-modal-close-btn"
                  onClick={handleCloseUnifiedModal}
                  title="Kapat"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Mobilde Gösterilen Sekme Çubuğu (Detay vs Tahsilat) */}
            <div className="cust-mobile-tabs">
              <button
                type="button"
                className={`cust-mobile-tab-btn ${mobileActiveTab === 'ledger' ? 'active' : ''}`}
                onClick={() => setMobileActiveTab('ledger')}
              >
                <Clock size={15} />
                <span>Hesap Hareketleri</span>
                {customerDetail?.transactions?.length > 0 && (
                  <span className="cust-tab-count">{customerDetail.transactions.length}</span>
                )}
              </button>

              <button
                type="button"
                className={`cust-mobile-tab-btn ${mobileActiveTab === 'pay' ? 'active' : ''}`}
                onClick={() => setMobileActiveTab('pay')}
              >
                <Banknote size={15} />
                <span>Borç Tahsilatı</span>
                {parseFloat(selectedCustomer.current_balance || 0) > 0.05 && (
                  <span className="cust-tab-debt-badge">
                    ₺{parseFloat(selectedCustomer.current_balance).toFixed(2)}
                  </span>
                )}
              </button>
            </div>

            {/* İki Kolonlu Gövde: Sol Kolon Ekstre, Sağ Kolon Tahsilat */}
            <div className="cust-unified-body">
              {/* SOL KOLON: CARİ EKSTRE & SİPARİŞ GEÇMİŞİ */}
              <div className={`cust-col-left ${mobileActiveTab === 'ledger' ? 'mobile-show' : 'mobile-hide'}`}>
                <div className="cust-col-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} color="#346c80" />
                    <h3>Cari Hesap Hareketleri & Sipariş Detayı</h3>
                  </div>
                  <span className="cust-tx-count-pill">
                    {customerDetail?.transactions?.length || 0} İşlem
                  </span>
                </div>

                {/* Bakiye Özeti Mini Kartlar */}
                <div className="cust-detail-summary-cards">
                  <div className="detail-sum-card debt">
                    <span className="sum-card-label">Toplam Borç</span>
                    <strong className="sum-card-val">
                      ₺{parseFloat(customerDetail?.customer?.total_debt || selectedCustomer.total_debt || 0).toFixed(2)}
                    </strong>
                  </div>

                  <div className="detail-sum-card paid">
                    <span className="sum-card-label">Toplam Tahsilat</span>
                    <strong className="sum-card-val">
                      ₺{parseFloat(customerDetail?.customer?.total_paid || selectedCustomer.total_paid || 0).toFixed(2)}
                    </strong>
                  </div>

                  <div className="detail-sum-card remaining">
                    <span className="sum-card-label">Kalan Borç</span>
                    <strong className="sum-card-val">
                      ₺{parseFloat(selectedCustomer.current_balance || 0).toFixed(2)}
                    </strong>
                  </div>
                </div>

                {/* İşlem Listesi */}
                <div className="cust-ledger-scroll-area">
                  {detailLoading ? (
                    <div className="customers-loading-state" style={{ padding: '30px 10px', boxShadow: 'none' }}>
                      <div className="cust-spinner"></div>
                      <p>Ekstre verileri getiriliyor...</p>
                    </div>
                  ) : !customerDetail?.transactions || customerDetail.transactions.length === 0 ? (
                    <div className="ledger-empty-box">
                      <Receipt size={32} color="#d4c9bf" />
                      <p>Bu müşteriye ait henüz bir işlem hareketi bulunmuyor.</p>
                    </div>
                  ) : (
                    <div className="ledger-timeline">
                      {customerDetail.transactions.map((tx) => {
                        const isDebt = tx.transaction_type === 'debt';
                        const isReset = tx.transaction_type === 'debt_reset';
                        const isExpanded = expandedTxIds.includes(tx.id);
                        const txAmount = parseFloat(tx.amount || 0);
                        const hasItems = Array.isArray(tx.order_items) && tx.order_items.length > 0;

                        const formattedDate = new Date(tx.created_at).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        });
                        const formattedTime = new Date(tx.created_at).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        });

                        return (
                          <div key={tx.id} className={`ledger-item ${isReset ? 'reset-item' : isDebt ? 'debt-item' : 'pay-item'}`}>
                            <div className={`ledger-item-icon ${isReset ? 'reset' : isDebt ? 'debt' : 'pay'}`}>
                              {isReset ? (
                                <RotateCcw size={15} />
                              ) : isDebt ? (
                                <ArrowDownLeft size={15} />
                              ) : (
                                <ArrowUpRight size={15} />
                              )}
                            </div>

                            <div className="ledger-item-main">
                              <div className="ledger-item-top">
                                <div>
                                  <div className="ledger-type-badge-row">
                                    <span className={`ledger-type-badge ${isReset ? 'reset' : isDebt ? 'debt' : 'pay'}`}>
                                      {isReset ? 'Borç Sıfırlandı' : isDebt ? 'Veresiye / Borç' : 'Tahsilat Alındı'}
                                    </span>
                                    {tx.table_title && (
                                      <span className="ledger-table-badge">
                                        <Coffee size={11} />
                                        {tx.table_title}
                                      </span>
                                    )}
                                    {!isDebt && !isReset && tx.payment_method && (
                                      <span className="ledger-method-badge">
                                        {tx.payment_method === 'cash' ? 'Nakit' : tx.payment_method === 'credit_card' ? 'Kredi Kartı' : 'Parçalı'}
                                      </span>
                                    )}
                                  </div>

                                  <div className="ledger-meta-row">
                                    <span><Calendar size={11} /> {formattedDate} {formattedTime}</span>
                                    <span>
                                      <User size={11} /> 
                                      {isReset ? 'Sıfırlayan: ' : isDebt ? 'Yazan: ' : 'Tahsil Eden: '}
                                      <strong>{tx.created_by_user_name || 'Personel'}</strong>
                                    </span>
                                  </div>
                                </div>

                                <div className="ledger-amount-col">
                                  <span className={`ledger-amount ${isReset ? 'text-reset' : isDebt ? 'text-debt' : 'text-paid'}`}>
                                    {isReset ? `-₺${txAmount.toFixed(2)}` : isDebt ? `+₺${txAmount.toFixed(2)}` : `-₺${txAmount.toFixed(2)}`}
                                  </span>
                                  {parseFloat(tx.discount || 0) > 0 && (
                                    <span className="ledger-discount-pill">
                                      İndirim: ₺{parseFloat(tx.discount).toFixed(2)}
                                    </span>
                                  )}
                                  {parseFloat(tx.tip || 0) > 0 && (
                                    <span className="ledger-tip-pill">
                                      Bahşiş: ₺{parseFloat(tx.tip).toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {tx.notes && (
                                <div className={`ledger-item-notes ${isReset ? 'reset-note' : ''}`}>
                                  <FileText size={11} />
                                  <span>{tx.notes}</span>
                                </div>
                              )}

                              {isDebt && hasItems && (
                                <div className="ledger-items-accordion">
                                  <button
                                    type="button"
                                    className="ledger-toggle-items-btn"
                                    onClick={() => toggleTxExpand(tx.id)}
                                  >
                                    <span>Yazılan Ürünler ({tx.order_items.length} Kalem)</span>
                                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  </button>

                                  {isExpanded && (
                                    <div className="ledger-items-table-wrap">
                                      <table className="ledger-items-table">
                                        <thead>
                                          <tr>
                                            <th>Ürün</th>
                                            <th style={{ textAlign: 'center' }}>Adet</th>
                                            <th style={{ textAlign: 'right' }}>Birim</th>
                                            <th style={{ textAlign: 'right' }}>Toplam</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {tx.order_items.map((item) => (
                                            <tr key={item.id}>
                                              <td className="item-name-cell">
                                                <span>{item.product_name}</span>
                                                {item.note && <small className="item-note">Not: {item.note}</small>}
                                              </td>
                                              <td style={{ textAlign: 'center', fontWeight: '600' }}>
                                                x{item.quantity}
                                              </td>
                                              <td style={{ textAlign: 'right' }}>
                                                ₺{parseFloat(item.unit_price).toFixed(2)}
                                              </td>
                                              <td style={{ textAlign: 'right', fontWeight: '700', color: '#346c80' }}>
                                                ₺{parseFloat(item.total_price).toFixed(2)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* SAĞ KOLON: BORÇ TAHSİLATI */}
              <div className={`cust-col-right ${mobileActiveTab === 'pay' ? 'mobile-show' : 'mobile-hide'}`}>
                <div className="cust-col-header right-actions">
                  {parseFloat(selectedCustomer.current_balance || 0) > 0.05 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="cust-btn-reset-debt"
                        onClick={() => setShowResetDebtDialog(true)}
                        title="İşletme inisiyatifi ile müşterinin açık borcunu sıfırla / sil"
                      >
                        <RotateCcw size={13} />
                        <span>Borcu Sıfırla</span>
                      </button>

                      <button
                        type="button"
                        className="cust-btn-full-pay"
                        onClick={() => {
                          const fullBal = parseFloat(selectedCustomer.current_balance || 0).toFixed(2);
                          setPayAmount(fullBal);
                          if (payMethod === 'mixed') {
                            const d = Math.max(0, parseFloat(discountVal || 0));
                            const net = Math.max(0, parseFloat(fullBal) - d);
                            setMixedCash(net.toFixed(2));
                            setMixedCard('0.00');
                          }
                        }}
                      >
                        Tümünü Kapat (₺{parseFloat(selectedCustomer.current_balance || 0).toFixed(2)})
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: '#1e7e34', fontWeight: '700' }}>
                      Hesap Kapalı
                    </div>
                  )}
                </div>

                {parseFloat(selectedCustomer.current_balance || 0) <= 0.05 ? (
                  <div className="cust-clean-debt-box">
                    <div className="cust-clean-icon">
                      <CheckCircle2 size={40} color="#1e7e34" />
                    </div>
                    <h4>Açık Borç Bulunmamaktadır</h4>
                    <p>Bu müşterinin ödenmemiş herhangi bir borcu yoktur. Hesap tamamen kapalıdır.</p>
                  </div>
                ) : (
                  <form onSubmit={handleProcessPayment} className="cust-pay-form-inline">
                    {/* Kapatılacak Borç Tutarı */}
                    <div className="cust-form-group">
                      <label className="cust-form-label">
                        Kapatılacak Borç Tutarı <span className="req">*</span>
                      </label>
                      <div className="cust-input-wrapper large">
                        <span className="currency-prefix">₺</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={payAmount}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            setPayAmount(e.target.value);
                            if (payMethod === 'mixed') {
                              const s = parseFloat(e.target.value || 0);
                              const d = Math.max(0, parseFloat(discountVal || 0));
                              const net = Math.max(0, s - d);
                              setMixedCash(net.toFixed(2));
                              setMixedCard('0.00');
                            }
                          }}
                          className="cust-input font-bold"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {/* Uygulanacak İndirim (Borcun Altında) */}
                    <div className="cust-form-group">
                      <label className="cust-form-label">
                        Uygulanacak İndirim (₺) <span className="opt">(İsteğe bağlı)</span>
                      </label>
                      <div className="cust-input-wrapper" style={{ height: '36px', border: '1.5px solid #b6ced6', borderRadius: '8px', display: 'flex', alignItems: 'center', background: '#ffffff' }}>
                        <span className="currency-prefix" style={{ paddingLeft: '10px', fontFamily: 'Outfit, sans-serif', fontSize: '1rem', fontWeight: '800', color: '#7c3aed' }}>₺</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={discountVal}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            setDiscountVal(e.target.value);
                            if (payMethod === 'mixed') {
                              const s = parseFloat(payAmount || 0);
                              const d = Math.max(0, parseFloat(e.target.value || 0));
                              const net = Math.max(0, s - d);
                              setMixedCash(net.toFixed(2));
                              setMixedCard('0.00');
                            }
                          }}
                          className="cust-input"
                          style={{ width: '100%', border: 'none', outline: 'none', padding: '6px 10px', fontSize: '0.92rem', fontWeight: '700', color: '#1e292d', background: 'transparent' }}
                        />
                      </div>
                    </div>

                    {/* Ödeme Yöntemi (3'lü Modern Segmentli Seçici) */}
                    <div className="cust-form-group">
                      <label className="cust-form-label">Ödeme Yöntemi</label>
                      <div className="cust-pay-methods-grid">
                        <button
                          type="button"
                          className={`cust-pay-method-btn cash ${payMethod === 'cash' ? 'active' : ''}`}
                          onClick={() => setPayMethod('cash')}
                        >
                          <Banknote size={15} />
                          <span>Nakit</span>
                        </button>

                        <button
                          type="button"
                          className={`cust-pay-method-btn card ${payMethod === 'credit_card' ? 'active' : ''}`}
                          onClick={() => setPayMethod('credit_card')}
                        >
                          <CreditCard size={15} />
                          <span>Kart</span>
                        </button>

                        <button
                          type="button"
                          className={`cust-pay-method-btn mixed ${payMethod === 'mixed' ? 'active' : ''}`}
                          onClick={() => {
                            setPayMethod('mixed');
                            const s = parseFloat(payAmount || 0);
                            const d = Math.max(0, parseFloat(discountVal || 0));
                            const net = Math.max(0, s - d);
                            setMixedCash(net.toFixed(2));
                            setMixedCard('0.00');
                          }}
                        >
                          <Layers size={15} />
                          <span>Parçalı</span>
                        </button>
                      </div>
                    </div>

                    {/* Parçalı Ödeme Girişleri (Nakit & Kart Dağılımı) */}
                    {payMethod === 'mixed' && (
                      <div className="cust-mixed-grid">
                        <div className="cust-mixed-col">
                          <label>Nakit (₺):</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={mixedCash}
                            onChange={(e) => handleMixedCashChange(e.target.value)}
                            className="cust-mixed-input"
                          />
                        </div>
                        <div className="cust-mixed-col">
                          <label>Kredi Kartı (₺):</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={mixedCard}
                            onChange={(e) => handleMixedCardChange(e.target.value)}
                            className="cust-mixed-input"
                          />
                        </div>
                      </div>
                    )}

                    {/* Tahsilat Notu */}
                    <div className="cust-form-group">
                      <label className="cust-form-label">Tahsilat Notu / Açıklama</label>
                      <input
                        type="text"
                        placeholder="Örn: Elden teslim alındı, havale geldi vb."
                        value={payNotes}
                        onChange={(e) => setPayNotes(e.target.value)}
                        className="cust-pay-note-input"
                      />
                    </div>

                    {/* Canlı Bakiye Düşüş ve Tahsilat Önizlemesi */}
                    {(() => {
                      const parsedSettle = parseFloat(payAmount || 0);
                      const parsedDisc = Math.max(0, parseFloat(discountVal || 0));
                      const netPayable = Math.max(0, parsedSettle - parsedDisc);
                      const currentBal = parseFloat(selectedCustomer.current_balance || 0);
                      const remainingDebt = Math.max(0, currentBal - parsedSettle);

                      return (
                        <>
                          <div className="cust-calc-summary-box">
                            <div className="calc-row">
                              <span>Mevcut Açık Borç:</span>
                              <strong>₺{currentBal.toFixed(2)}</strong>
                            </div>
                            <div className="calc-row">
                              <span>Kapatılacak Borç:</span>
                              <strong style={{ color: '#b84a39' }}>-₺{parsedSettle.toFixed(2)}</strong>
                            </div>
                            {parsedDisc > 0 && (
                              <div className="calc-row">
                                <span>İşletme İndirimi:</span>
                                <strong style={{ color: '#7c3aed' }}>-₺{parsedDisc.toFixed(2)}</strong>
                              </div>
                            )}
                            <div className="calc-row" style={{ background: '#f0fdf4', padding: '6px 8px', borderRadius: '7px', margin: '3px 0' }}>
                              <span style={{ fontWeight: '700', color: '#166534' }}>Kasaya Alınacak Net:</span>
                              <strong style={{ color: '#166534', fontSize: '0.98rem', fontWeight: '800' }}>₺{netPayable.toFixed(2)}</strong>
                            </div>
                            <div className="calc-row total">
                              <span>İşlem Sonrası Kalan Borç:</span>
                              <strong style={{ color: remainingDebt <= 0.05 ? '#1e7e34' : '#b84a39' }}>
                                ₺{remainingDebt.toFixed(2)} {remainingDebt <= 0.05 && parsedSettle > 0 && '(Borç Kapanıyor)'}
                              </strong>
                            </div>
                          </div>

                          {/* Tahsilatı Onayla Butonu */}
                          <button
                            type="submit"
                            className="customers-btn-pay-submit"
                            disabled={isSubmittingPay || parsedSettle <= 0}
                            style={{ width: '100%', justifyContent: 'center' }}
                          >
                            {isSubmittingPay ? (
                              <>
                                <div className="cust-spinner" style={{ width: '18px', height: '18px', borderWidth: '2px', borderColor: '#ffffff', borderTopColor: 'transparent' }}></div>
                                <span>Tahsilat İşleniyor...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={18} />
                                <span>
                                  {netPayable > 0 
                                    ? `Tahsilatı Kaydet (₺${netPayable.toFixed(2)} Alınacak)`
                                    : `Borcu Kapat (₺${parsedSettle.toFixed(2)})`}
                                </span>
                              </>
                            )}
                          </button>
                        </>
                      );
                    })()}
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. MÜŞTERİ ARŞİVE ALMA / SİLME ONAY MODALI (CUSTOM MODAL) */}
      {/* ======================================================== */}
      {customerToDelete && (
        <div className="pos-receipt-modal-overlay" onClick={() => !isDeletingCustomer && setCustomerToDelete(null)}>
          <div className="cust-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="cust-confirm-icon-box">
              <AlertTriangle size={30} />
            </div>

            <h3 className="cust-confirm-title">Müşteriyi Arşive Al</h3>

            <p className="cust-confirm-text">
              <strong>"{customerToDelete.name}"</strong> adlı müşteriyi listeden kaldırmak istediğinize emin misiniz?
            </p>

            <div className="cust-confirm-notice">
              <Info size={16} className="notice-icon" />
              <span>
                Geçmiş adisyon ve cari hareketlerinin korunması için müşteri sistemden kalıcı olarak silinmez; güvenle <strong>arşive (pasife)</strong> alınır.
              </span>
            </div>

            <div className="cust-confirm-actions">
              <button
                type="button"
                className="cust-btn-cancel"
                onClick={() => setCustomerToDelete(null)}
                disabled={isDeletingCustomer}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="cust-btn-confirm-delete"
                onClick={handleConfirmDelete}
                disabled={isDeletingCustomer}
              >
                {isDeletingCustomer ? (
                  <>
                    <div className="cust-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderColor: '#ffffff', borderTopColor: 'transparent' }} />
                    <span>Arşive Alınıyor...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Evet, Arşive Al</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. MÜŞTERİ BORCUNU SIFIRLA ONAY MODALI (CUSTOM MODAL)     */}
      {/* ======================================================== */}
      {showResetDebtDialog && selectedCustomer && (
        <div className="pos-receipt-modal-overlay" onClick={() => !isSubmittingResetDebt && setShowResetDebtDialog(false)}>
          <div className="cust-confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="cust-confirm-icon-box reset-debt">
              <RotateCcw size={28} />
            </div>

            <h3 className="cust-confirm-title">Müşteri Borcunu Sıfırla</h3>

            <p className="cust-confirm-text">
              <strong>"{selectedCustomer.name}"</strong> adlı müşterinin{' '}
              <span className="cust-reset-debt-amount-highlight">
                ₺{parseFloat(selectedCustomer.current_balance || 0).toFixed(2)}
              </span>{' '}
              tutarındaki açık borcunu sıfırlamak istediğinize emin misiniz?
            </p>

            {/* Sıfırlama Açıklaması */}
            <div className="cust-form-group" style={{ textAlign: 'left', marginBottom: '14px' }}>
              <label className="cust-form-label" style={{ fontSize: '0.82rem' }}>
                Sıfırlama Nedeni / Açıklama <span className="opt">(İsteğe bağlı)</span>
              </label>
              <div className="cust-input-wrapper">
                <FileText size={15} className="cust-input-icon" style={{ alignSelf: 'flex-start', marginTop: '10px' }} />
                <textarea
                  rows="2"
                  placeholder="Örn: İşletme inisiyatifi, hediye edildi, ikram vb."
                  value={resetDebtNotes}
                  onChange={(e) => setResetDebtNotes(e.target.value)}
                  className="cust-textarea"
                  style={{ minHeight: '65px', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div className="cust-confirm-notice reset-debt">
              <Info size={16} className="notice-icon" />
              <span>
                Bu işlem müşterinin güncel borcunu <strong>₺0.00</strong> yapacaktır. Silme tarihi, tutar ve işlemi yapan kullanıcı (<strong>{user?.name || 'Yetkili'}</strong>) cari hesap hareketlerine kalıcı olarak kaydedilecektir.
              </span>
            </div>

            <div className="cust-confirm-actions">
              <button
                type="button"
                className="cust-btn-cancel"
                onClick={() => {
                  setShowResetDebtDialog(false);
                  setResetDebtNotes('');
                }}
                disabled={isSubmittingResetDebt}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="cust-btn-confirm-reset"
                onClick={handleResetDebt}
                disabled={isSubmittingResetDebt}
              >
                {isSubmittingResetDebt ? (
                  <>
                    <div className="cust-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderColor: '#ffffff', borderTopColor: 'transparent' }} />
                    <span>Sıfırlanıyor...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw size={15} />
                    <span>Borcu Sıfırla (₺{parseFloat(selectedCustomer.current_balance || 0).toFixed(2)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
