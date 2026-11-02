import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from './ui/ToastProvider';
import { useConfirm } from './ui/ConfirmProvider';
import useQrRequests from './qr/useQrRequests';
import QrRequestList from './qr/QrRequestList';
import { apiFetch, createSocket } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { X, CheckCircle2, AlertCircle, Sparkles, QrCode } from 'lucide-react';
import CustomerDropdown from './tableOrder/CustomerDropdown';
import OrderSidebar from './tableOrder/OrderSidebar';
import MenuTab from './tableOrder/MenuTab';
import BillTab from './tableOrder/BillTab';
import CartPanel from './tableOrder/CartPanel';
import PaymentPanel from './tableOrder/PaymentPanel';
import ReceiptPreviewModal from './tableOrder/ReceiptPreviewModal';
import StatusSplitModal from './tableOrder/StatusSplitModal';
import TableTransferModal from './tableOrder/TableTransferModal';
import MobileCartDrawer from './tableOrder/MobileCartDrawer';
import QuickCustomerModal from './tableOrder/QuickCustomerModal';
import './customers.css';

export default function TableOrderModal({ table, onClose, onTableUpdated, onTableSwitched }) {
  const { user, can, canAny } = useAuth();

  // Bu pencerede kullanılan yetkiler (sunucu aynı kuralları ayrıca uygular)
  const perms = useMemo(() => ({
    order: can('pos.order'),
    deliver: canAny(['pos.deliver', 'kitchen.update']),
    transfer: can('pos.transfer'),
    cancel: can('pos.cancel'),
    return: can('pos.return'),
    treat: can('pos.treat'),
    closeEmpty: can('pos.close_empty'),
    payView: can('payment.view'),
    cashCard: can('payment.cash_card'),
    split: can('payment.split'),
    veresiye: can('payment.veresiye'),
    discount: can('payment.discount'),
    tip: can('payment.tip'),
    customerCreate: can('customers.create'),
    maxDiscountPercent: user?.role === 'admin' ? null : (user?.max_discount_percent ?? null)
  }), [user, can, canAny]);

  // Aktif Sekme: 'order' (Menü & Sipariş) | 'payment' (Hesap Ödeme) — sipariş yetkisi yoksa hesap sekmesiyle açılır
  const [activeTab, setActiveTab] = useState(() => (can('pos.order') ? 'order' : 'payment'));

  // API Verileri
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtreler
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Masanın Kaydedilmiş Siparişleri (Veritabanı)
  const [existingOrder, setExistingOrder] = useState(null);
  const [savedItems, setSavedItems] = useState([]);

  // Sepet (Yeni Eklenecek Taslak Kalemler)
  // Format: [{ product, quantity, unit_price, note }]
  const [cartItems, setCartItems] = useState([]);

  // Sepetteki ürünlerin not giriş kutusu açık mı?
  const [openNoteProductIds, setOpenNoteProductIds] = useState([]);

  // Mobilde Alttan Açılan Sepet Çekmecesi (Bottom Sheet Drawer)
  const [isMobileCartDrawerOpen, setIsMobileCartDrawerOpen] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0); // px cinsinden parmak takibi
  const [isDragging, setIsDragging] = useState(false);
  const touchStartRef = useRef({ y: 0, origin: 'bar' });

  useEffect(() => {
    if (cartItems.length === 0) {
      setIsMobileCartDrawerOpen(false);
      setDragOffsetY(0);
    }
  }, [cartItems.length]);

  // Floating Bar üzerinden yukarı doğru sürükleyerek anlık açma
  const handleBarTouchStart = (e) => {
    touchStartRef.current = {
      y: e.touches[0].clientY,
      origin: 'bar'
    };
    setIsDragging(true);
  };

  const handleBarTouchMove = (e) => {
    if (!isDragging || touchStartRef.current.origin !== 'bar') return;
    const currentY = e.touches[0].clientY;
    const deltaY = touchStartRef.current.y - currentY; // parmak yukarı gittikçe pozitif
    const drawerHeight = window.innerHeight * 0.75;
    if (deltaY > 0) {
      const offset = Math.max(0, drawerHeight - deltaY);
      setDragOffsetY(offset);
    }
  };

  const handleBarTouchEnd = (e) => {
    if (!isDragging || touchStartRef.current.origin !== 'bar') return;
    setIsDragging(false);
    const endY = e.changedTouches[0]?.clientY ?? touchStartRef.current.y;
    const deltaY = touchStartRef.current.y - endY;
    if (deltaY > 40) {
      setIsMobileCartDrawerOpen(true);
    } else {
      setIsMobileCartDrawerOpen(false);
    }
    setDragOffsetY(0);
  };

  // Çekmece üzerinden aşağı doğru sürükleyerek anlık kapatma
  const handleSheetTouchStart = (e) => {
    touchStartRef.current = {
      y: e.touches[0].clientY,
      origin: 'sheet'
    };
    setIsDragging(true);
  };

  const handleSheetTouchMove = (e) => {
    if (!isDragging || touchStartRef.current.origin !== 'sheet') return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartRef.current.y; // parmak aşağı gittikçe pozitif
    if (deltaY > 0) {
      setDragOffsetY(deltaY);
    } else {
      setDragOffsetY(0);
    }
  };

  const handleSheetTouchEnd = (e) => {
    if (!isDragging || touchStartRef.current.origin !== 'sheet') return;
    setIsDragging(false);
    const endY = e.changedTouches[0]?.clientY ?? touchStartRef.current.y;
    const deltaY = endY - touchStartRef.current.y;
    if (deltaY > 60) {
      setIsMobileCartDrawerOpen(false);
    } else {
      setIsMobileCartDrawerOpen(true);
    }
    setDragOffsetY(0);
  };

  // Pencereyi kapat: sepette mutfağa gönderilmemiş ürün varsa önce onay iste (yanlışlıkla kaybolmasın)
  const requestClose = async () => {
    if (cartItems.length > 0) {
      const count = cartItems.reduce((s, i) => s + i.quantity, 0);
      const ok = await confirm({
        title: 'Sepet gönderilmedi',
        message: `Sepette mutfağa gönderilmemiş ${count} ürün var. Kapatırsanız bu ürünler silinecek.`,
        confirmLabel: 'Sepeti silip kapat',
        cancelLabel: 'Geri dön',
        danger: true
      });
      if (!ok) return;
    }
    onClose();
  };

  // Modal / Çekmece Kapatma Kontrolü (Sepet açıkken masalara atmasın, sadece çekmeceyi kapatıp menüye dönsün)
  const handleModalClose = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (isMobileCartDrawerOpen) {
      setIsMobileCartDrawerOpen(false);
      setDragOffsetY(0);
      return;
    }
    requestClose();
  };

  // Escape: önce en üstteki iç pencere/menü kapanır, sonra sepet çekmecesi, en son masa penceresi
  const escapeRef = useRef(null);
  escapeRef.current = () => {
    if (statusPrompt) return setStatusPrompt(null);
    if (showQuickAddCustomerModal) return setShowQuickAddCustomerModal(false);
    if (showTransferModal) return setShowTransferModal(false);
    if (showReceiptPreview) return setShowReceiptPreview(false);
    if (actionDropdownItemId !== null) return setActionDropdownItemId(null);
    if (isMobileCartDrawerOpen) {
      setIsMobileCartDrawerOpen(false);
      setDragOffsetY(0);
      return undefined;
    }
    return requestClose();
  };
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') escapeRef.current?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Hesap Ödeme Sekmesi İçin Seçili Ürün ID'leri (Checkbox)
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  // Hesap Ödeme Sekmesinde Her Kalemden Kaç Adet Tahsil Edilecek (1/5 gibi)
  const [payingQuantities, setPayingQuantities] = useState({});

  // Durum Değiştirme (İşlem) Menüsü & Çoklu Adet Bölme Modalı
  const [actionDropdownItemId, setActionDropdownItemId] = useState(null);
  const [statusPrompt, setStatusPrompt] = useState(null); // { item, targetStatus }
  const [showTransferModal, setShowTransferModal] = useState(false); // Masa taşıma / birleştirme penceresi

  // Ödeme ve Tahsilat Değerleri
  const [paymentsList, setPaymentsList] = useState([]); // Masanın önceki tahsilat kayıtları
  const [paymentSplitMode, setPaymentSplitMode] = useState('amount'); // 'amount' (Tutar / Bölüşüm) | 'items' (Kalem Bazlı)
  const [customAmountToPay, setCustomAmountToPay] = useState(''); // Özel girilen veya oranla belirlenen tutar
  const [tipAmount, setTipAmount] = useState(0); // Bahşiş
  const [discountAmount, setDiscountAmount] = useState(0); // İndirim
  const [paymentMethod, setPaymentMethod] = useState(null); // 'cash' | 'credit_card' | 'mixed' | 'veresiye' | null (varsayılan olarak boş gelir)
  const [mixedCash, setMixedCash] = useState(''); // Parçalı ödemede nakit kısmı
  const [mixedCard, setMixedCard] = useState(''); // Parçalı ödemede kart kısmı
  const [mixedVeresiye, setMixedVeresiye] = useState(''); // Parçalı ödemede veresiye kısmı
  const [veresiyeCustomer, setVeresiyeCustomer] = useState(''); // Veresiye müşteri adı
  const [veresiyeCustomerId, setVeresiyeCustomerId] = useState(null); // Seçilen müşteri ID
  const [veresiyeNote, setVeresiyeNote] = useState(''); // Veresiye not / vade açıklaması
  const [registeredCustomers, setRegisteredCustomers] = useState([]); // Sistemdeki kayıtlı müşteriler
  const [isCustomAmountFocused, setIsCustomAmountFocused] = useState(false);

  // Veresiye Arama & Dropdown State
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef(null);

  // Hızlı Müşteri Ekle Modal State
  const [showQuickAddCustomerModal, setShowQuickAddCustomerModal] = useState(false);
  const [quickCustName, setQuickCustName] = useState('');
  const [quickCustPhone, setQuickCustPhone] = useState('0');
  const [quickCustNotes, setQuickCustNotes] = useState('');
  const [quickCustError, setQuickCustError] = useState('');
  const [isSubmittingQuickCust, setIsSubmittingQuickCust] = useState(false);

  // Dışarı tıklanınca müşteri arama dropdown'ını kapat
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchRegisteredCustomers = async () => {
    try {
      const res = await apiFetch('/api/customers');
      const data = await res.json();
      if (data.success && Array.isArray(data.customers)) {
        setRegisteredCustomers(data.customers);
      }
    } catch (err) {
      console.error('Kayıtlı müşteriler yüklenemedi:', err);
    }
  };

  // Veresiye veya Parçalı seçildiğinde kayıtlı müşterileri yükle
  useEffect(() => {
    if (paymentMethod === 'veresiye' || paymentMethod === 'mixed') {
      fetchRegisteredCustomers();
    }
  }, [paymentMethod]);

  // Filtrelenmiş Müşteriler
  const filteredCustomers = useMemo(() => {
    if (!customerSearchTerm.trim()) return registeredCustomers;
    const q = customerSearchTerm.toLowerCase();
    return registeredCustomers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q))
    );
  }, [registeredCustomers, customerSearchTerm]);

  // Seçili Müşteri Nesnesi
  const selectedRegisteredCustomer = useMemo(() => {
    if (!veresiyeCustomerId) {
      if (!veresiyeCustomer) return null;
      return registeredCustomers.find(c => c.name.toLowerCase() === veresiyeCustomer.toLowerCase()) || null;
    }
    return registeredCustomers.find(c => c.id === veresiyeCustomerId) || null;
  }, [registeredCustomers, veresiyeCustomerId, veresiyeCustomer]);

  // Hızlı Müşteri Kaydet
  const handleSaveQuickCustomer = async (e) => {
    e.preventDefault();
    if (!quickCustName.trim()) {
      setQuickCustError('Müşteri adı zorunludur.');
      return;
    }

    try {
      setIsSubmittingQuickCust(true);
      setQuickCustError('');
      const res = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quickCustName.trim(),
          phone: quickCustPhone,
          notes: quickCustNotes.trim()
        })
      });

      const data = await res.json();
      if (data.success && data.customer) {
        showToast(`"${data.customer.name}" başarıyla eklendi ve seçildi.`, 'success');
        setRegisteredCustomers(prev => [data.customer, ...prev]);
        setVeresiyeCustomerId(data.customer.id);
        setVeresiyeCustomer(data.customer.name);
        setCustomerSearchTerm('');
        setIsCustomerDropdownOpen(false);
        setShowQuickAddCustomerModal(false);
      } else {
        setQuickCustError(data.message || 'Müşteri eklenemedi.');
      }
    } catch (err) {
      console.error('Hızlı müşteri ekleme hatası:', err);
      setQuickCustError('Müşteri eklenirken sunucu hatası oluştu.');
    } finally {
      setIsSubmittingQuickCust(false);
    }
  };

  // İşlem Durumları
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  // Fiş Yazdırma Önizleme Modalı
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  const { showToast } = useToast(); // Global bildirimler (üst ortada, türe göre)
  const confirm = useConfirm(); // Uygulama tasarımında onay penceresi

  // Bu masadan gelen, onay bekleyen QR menü siparişleri (onaylanınca adisyona eklenir)
  const { requests: tableQrRequests, reload: reloadTableQr } = useQrRequests({ tableId: table.id, enabled: perms.payView || perms.order });

  // Scroll kilidi
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Masanın Benzersiz Sipariş GUID İlişkilendirme Bilgisi
  const orderGuid = useMemo(() => {
    if (existingOrder?.order_number) {
      const clean = existingOrder.order_number.replace(/-/g, '');
      return `#${clean.slice(0, 8).toUpperCase()}`;
    }
    if (existingOrder?.id) {
      return `#ID-${existingOrder.id}`;
    }
    return 'Yeni Sipariş';
  }, [existingOrder]);

  const tableIdentifier = useMemo(() => {
    return table.table_number ? `M-${table.table_number}` : `M-${table.id}`;
  }, [table]);

  // Verileri Yükle
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [catRes, prodRes, orderRes] = await Promise.all([
          apiFetch('/api/categories'),
          apiFetch('/api/products'),
          apiFetch(`/api/orders/table/${table.id}`)
        ]);

        const catData = await catRes.json();
        const prodData = await prodRes.json();
        const orderData = await orderRes.json();

        if (catData.success) {
          setCategories(catData.categories || []);
        }
        if (prodData.success) {
          setProducts((prodData.products || []).filter(p => p.status === 1));
        }
        if (orderData.success) {
          setExistingOrder(orderData.order || null);
          const items = orderData.items || [];
          setSavedItems(items);
          setPaymentsList(orderData.payments || []);
          const unpaid = items.filter(i => !i.is_paid);
          // Kullanıcının isteği: Masaya ilk tıklandığında ürünler seçili gelmesin
          setSelectedItemIds([]);
          const initQtys = {};
          unpaid.forEach(i => { initQtys[i.id] = 1; });
          setPayingQuantities(initQtys);
          if (items.length > 0) {
            setActiveTab('payment');
          }
        }
      } catch (err) {
        console.error('POS verileri yükleme hatası:', err);
        showToast('Veriler yüklenirken hata oluştu.', 'danger');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Socket.io Gerçek Zamanlı Dinleme
    const socket = createSocket();
    socket.on('order:created', (data) => {
      if (Number(data.tableId) === Number(table.id)) {
        setExistingOrder(data.order);
        const items = data.items || [];
        setSavedItems(items);
        // Bu olay tahsilat listesini taşımaz; önceki kısmi ödemeler silinmesin (kalan tutar yanlış görünürdü)
        if (Array.isArray(data.payments)) setPaymentsList(data.payments);
        const unpaid = items.filter(i => !i.is_paid);
        // Başka biri sipariş eklediğinde kasiyerin yaptığı seçim korunur
        setSelectedItemIds(prev => prev.filter(id => unpaid.some(u => u.id === id)));
        setPayingQuantities(prev => {
          const next = { ...prev };
          unpaid.forEach(i => { if (next[i.id] === undefined) next[i.id] = 1; });
          return next;
        });
      }
    });

    socket.on('order:item_status_updated', ({ itemId, status }) => {
      setSavedItems(prev => prev.map(item => item.id === itemId ? { ...item, item_status: status } : item));
    });

    socket.on('order:updated', (payload) => {
      // Yalnızca bu masayı ilgilendiren güncellemelerde yeniden yükle (her masadaki değişiklikte değil)
      if (payload?.tableId != null && Number(payload.tableId) !== Number(table.id)) return;
      apiFetch(`/api/orders/table/${table.id}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setExistingOrder(data.order);
            const items = data.items || [];
            setSavedItems(items);
            setPaymentsList(data.payments || []);
            const unpaid = items.filter(i => !i.is_paid);
            setSelectedItemIds(prev => prev.filter(id => unpaid.some(u => u.id === id)));
            setPayingQuantities(prev => {
              const next = { ...prev };
              unpaid.forEach(i => { if (next[i.id] === undefined) next[i.id] = 1; });
              return next;
            });
          }
        });
    });

    return () => {
      socket.disconnect();
    };
  }, [table.id]);

  // Dropdown dışına tıklandığında menüyü kapat
  useEffect(() => {
    const handleGlobalClick = () => setActionDropdownItemId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // İptal, İade ve İkram Kalemleri (Borca dahil edilmeyen özel durumlar)
  const nonChargeableStatuses = useMemo(() => ['cancelled', 'returned', 'complimentary'], []);

  // Masadaki Ödenmemiş ve Tahsil Edilebilir Kalemler
  const unpaidSavedItems = useMemo(() => {
    return savedItems.filter(i => !i.is_paid && !nonChargeableStatuses.includes(i.item_status));
  }, [savedItems, nonChargeableStatuses]);

  // Özel Durumdaki Kalemler (İptal, İade, İkram)
  const specialSavedItems = useMemo(() => {
    return savedItems.filter(i => !i.is_paid && nonChargeableStatuses.includes(i.item_status));
  }, [savedItems, nonChargeableStatuses]);

  // Kullanıcının kuralı: Masada ödenmiş olan aynı ürünler tek satırda birleştirilsin
  const paidSavedItems = useMemo(() => {
    const rawPaid = savedItems.filter(i => !!i.is_paid);
    const paidMap = new Map();

    for (const item of rawPaid) {
      if (!paidMap.has(item.product_id)) {
        paidMap.set(item.product_id, {
          ...item,
          quantity: parseInt(item.quantity, 10) || 1,
          total_price: parseFloat(item.total_price || 0),
          notes: item.note?.trim() ? [item.note.trim()] : []
        });
      } else {
        const existing = paidMap.get(item.product_id);
        existing.quantity += (parseInt(item.quantity, 10) || 1);
        existing.total_price += parseFloat(item.total_price || 0);
        if (item.note?.trim() && !existing.notes.includes(item.note.trim())) {
          existing.notes.push(item.note.trim());
        }
      }
    }

    return Array.from(paidMap.values()).map(item => ({
      ...item,
      total_price: item.total_price.toFixed(2),
      note: item.notes.length > 0 ? item.notes.join(', ') : item.note
    }));
  }, [savedItems]);

  // Tabloda ve fişte görüntülenecek kalemler (Ödenecekler + Özel Durumlar + Birleştirilmiş Ödenmişler)
  const displayedSavedItems = useMemo(() => {
    return [...unpaidSavedItems, ...specialSavedItems, ...paidSavedItems];
  }, [unpaidSavedItems, specialSavedItems, paidSavedItems]);

  // Masadaki tüm geçerli kalemlerin tutarı (İptal, iade, ikram hariç)
  const orderItemsTotal = useMemo(() => {
    return savedItems
      .filter(i => !nonChargeableStatuses.includes(i.item_status))
      .reduce((sum, item) => sum + parseFloat(item.total_price || 0), 0);
  }, [savedItems, nonChargeableStatuses]);

  // Masanın Genel Toplamı (Siparişteki ürünlerin toplamı)
  const grandTotal = useMemo(() => {
    return orderItemsTotal;
  }, [orderItemsTotal]);

  // Masada daha önce kapatılmış ürün tutarı. Sunucuyla aynı formül: tahsilat − bahşiş + indirim
  // (bahşiş ürün borcunu kapatmaz, indirim ise kapatır; aksi halde kalan tutar yanlış görünürdü)
  const paidTotal = useMemo(() => {
    const fromPayments = paymentsList.reduce(
      (sum, p) => sum + parseFloat(p.total_amount || 0) - parseFloat(p.tip || 0) + parseFloat(p.discount || 0),
      0
    );
    const fromPaidItems = paidSavedItems.reduce((sum, item) => sum + parseFloat(item.total_price || 0), 0);
    return Math.max(fromPayments, fromPaidItems);
  }, [paymentsList, paidSavedItems]);

  // Masada Henüz Ödenmemiş Kalan Hesap
  const remainingTotal = useMemo(() => {
    return Math.max(0, grandTotal - paidTotal);
  }, [grandTotal, paidTotal]);

  // Filtrelenmiş Ürün Listesi
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (selectedCategoryId !== 'all' && p.category_id !== parseInt(selectedCategoryId, 10)) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategoryId, searchQuery]);

  // Sepette bu üründen kaç adet var?
  const getProductCartCount = (productId) => {
    return cartItems.find(item => item.product.id === productId)?.quantity || 0;
  };

  // Sepete ürün ekle
  const handleAddToCart = (product) => {
    setCartItems(prev => {
      const idx = prev.findIndex(item => item.product.id === product.id);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...prev, {
        product,
        quantity: 1,
        unit_price: parseFloat(product.price || 0),
        note: ''
      }];
    });
  };

  // Sepetteki ürün adedini değiştir
  const handleUpdateCartQuantity = (productId, delta) => {
    setCartItems(prev => {
      return prev
        .map(item => {
          if (item.product.id === productId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  // Sepetten ürünü sil
  const handleRemoveFromCart = (productId) => {
    setCartItems(prev => prev.filter(item => item.product.id !== productId));
    setOpenNoteProductIds(prev => prev.filter(id => id !== productId));
  };

  // Sepetteki ürünün not giriş kutusunu aç / kapa
  const toggleNoteInput = (productId) => {
    setOpenNoteProductIds(prev =>
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    );
  };

  // Sepetteki ürünün notunu güncelle
  const handleUpdateCartItemNote = (productId, noteText) => {
    setCartItems(prev => prev.map(item =>
      item.product.id === productId ? { ...item, note: noteText } : item
    ));
  };

  // Sepet Toplam Tutarı & Adedi
  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  }, [cartItems]);

  const cartItemCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  // "Siparişi Tamamla" Butonu -> Mutfağa & Masaya Kaydet
  const handleCompleteOrder = async () => {
    if (cartItems.length === 0) return;

    try {
      setIsSubmittingOrder(true);
      const itemsPayload = cartItems.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        note: item.note || null
      }));

      const res = await apiFetch(`/api/orders/table/${table.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsPayload })
      });

      const data = await res.json();
      if (data.success) {
        setExistingOrder(data.order);
        const items = data.items || [];
        setSavedItems(items);
        const unpaid = items.filter(i => !i.is_paid);
        setSelectedItemIds([]);
        const initQtys = {};
        unpaid.forEach(i => { initQtys[i.id] = 1; });
        setPayingQuantities(initQtys);
        setCartItems([]);
        setIsMobileCartDrawerOpen(false);
        showToast('Sipariş başarıyla kaydedildi ve mutfağa iletildi!', 'success');
        onTableUpdated?.();
        // Kullanıcının kuralı: Masa boşsa da sipariş verince otomatik olarak hesap ödemeye atmasın, sipariş ekranında kalsın
      } else {
        showToast(data.message || 'Sipariş eklenemedi.', 'danger');
      }
    } catch (err) {
      console.error('Sipariş kaydetme hatası:', err);
      showToast('Sipariş kaydedilirken bir hata oluştu.', 'danger');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // ==========================================
  // HESAP ÖDEME SEKMESİ İŞLEMLERİ
  // ==========================================

  // Tahsil edilecek adedi artır / azalt (1 ile masadaki toplam adet arasında seçim yapar)
  const handleUpdatePayQty = (itemId, delta, maxQty) => {
    setPayingQuantities(prev => {
      const cur = prev[itemId] ?? 1;
      const next = Math.max(1, Math.min(maxQty, cur + delta));
      return { ...prev, [itemId]: next };
    });
  };

  // Kalem durumunu güncelleme (delivered, complimentary, returned, cancelled, pending)
  const handleUpdateItemStatus = async (item, targetStatus, quantity = null) => {
    setActionDropdownItemId(null);
    const itemQty = parseInt(item.quantity, 10) || 1;

    // Eğer birden fazla adet varsa ve miktar belirtilmemişse prompt modalını aç
    if (itemQty > 1 && quantity === null) {
      setStatusPrompt({ item, targetStatus });
      return;
    }

    const payloadQty = quantity !== null ? quantity : itemQty;

    try {
      const res = await apiFetch(`/api/orders/items/${item.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus, quantity: payloadQty })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Ürün durumu güncellendi.', 'success');
        if (data.tableEmptied) {
          onTableUpdated?.();
          setTimeout(() => onClose(), 450);
          return;
        }
        // Masadaki siparişleri yeniden çek
        const orderRes = await apiFetch(`/api/orders/table/${table.id}`);
        const orderData = await orderRes.json();
        if (orderData.success) {
          setExistingOrder(orderData.order || null);
          const items = orderData.items || [];
          setSavedItems(items);
          const unpaid = items.filter(i => !i.is_paid && !['cancelled', 'returned', 'complimentary'].includes(i.item_status));
          setSelectedItemIds(prev => prev.filter(id => unpaid.some(u => u.id === id)));
        }
        onTableUpdated?.();
      } else {
        showToast(data.message || 'İşlem gerçekleştirilemedi.', 'danger');
      }
    } catch (err) {
      console.error('Durum güncelleme hatası:', err);
      showToast('İşlem gerçekleştirilemedi.', 'danger');
    } finally {
      setStatusPrompt(null);
    }
  };

  const handleDeliverItem = (itemId) => {
    const itm = savedItems.find(i => i.id === itemId);
    if (itm) {
      handleUpdateItemStatus(itm, 'delivered');
    }
  };

  // Checkbox Seçimleri (Yalnızca Ödenmemiş ve Tahsil Edilebilir Kalemler)
  const handleSelectAllItems = (forceSelect = null) => {
    const isAllSelected = unpaidSavedItems.length > 0 && selectedItemIds.length === unpaidSavedItems.length;
    const shouldSelect = typeof forceSelect === 'boolean' ? forceSelect : !isAllSelected;

    if (shouldSelect) {
      setPaymentSplitMode('items');
      setSelectedItemIds(unpaidSavedItems.map(i => i.id));
      const fullQtys = {};
      unpaidSavedItems.forEach(i => { fullQtys[i.id] = i.quantity; });
      setPayingQuantities(fullQtys);
    } else {
      setPaymentSplitMode('amount');
      setSelectedItemIds([]);
      // Kullanıcının isteği: Tekrar tümünü seçe basınca adetler başlangıç durumuna (1) dönsün
      const defaultQtys = {};
      unpaidSavedItems.forEach(i => { defaultQtys[i.id] = 1; });
      setPayingQuantities(defaultQtys);
    }
  };

  const handleToggleItemSelection = (itemId) => {
    const itm = savedItems.find(i => i.id === itemId);
    if (itm?.is_paid || ['cancelled', 'returned', 'complimentary'].includes(itm?.item_status)) return;
    setPaymentSplitMode('items');
    setSelectedItemIds(prev => {
      const isCurrentlySelected = prev.includes(itemId);
      if (isCurrentlySelected) {
        // Seçim kaldırıldığında adedi başlangıç değeri olan 1'e döndür
        setPayingQuantities(qPrev => ({ ...qPrev, [itemId]: 1 }));
        const next = prev.filter(id => id !== itemId);
        if (next.length === 0) setPaymentSplitMode('amount');
        return next;
      } else {
        return [...prev, itemId];
      }
    });
  };

  // Bu Ödemede Tahsil Edilecek Kalemlerin Toplamı (Kalem Bazlı Modda: Seçili adet x birim fiyat)
  const selectedItemsTotal = useMemo(() => {
    return unpaidSavedItems
      .filter(item => selectedItemIds.includes(item.id))
      .reduce((sum, item) => {
        const payQty = payingQuantities[item.id] ?? 1;
        return sum + (payQty * parseFloat(item.unit_price || 0));
      }, 0);
  }, [unpaidSavedItems, selectedItemIds, payingQuantities]);

  // Bu tahsilatta kapatılacak ürün tutarı: seçili ürünler veya elle girilen tutar.
  // Hiçbir şey seçilmediyse 0'dır; yanlışlıkla tüm hesabın tahsil edilmesi engellenir.
  const basePayableAmount = useMemo(() => {
    if (selectedItemIds.length > 0) {
      // Önceden tutar bazlı ödeme alındıysa seçili ürünler kalan borçtan fazla tutabilir; fazlası tahsil edilmez
      return Math.min(selectedItemsTotal, remainingTotal);
    }
    // Özel tutar girildiyse onu kullan
    if (customAmountToPay !== '' && !isNaN(parseFloat(customAmountToPay))) {
      return Math.min(remainingTotal, Math.max(0, parseFloat(customAmountToPay)));
    }
    return 0;
  }, [selectedItemIds, selectedItemsTotal, customAmountToPay, remainingTotal]);

  // Net Tahsil Edilecek Tutar (Bahşiş ve İndirim Dahil)
  const finalPayableTotal = useMemo(() => {
    const net = basePayableAmount + parseFloat(tipAmount || 0) - parseFloat(discountAmount || 0);
    return net > 0 ? net : 0;
  }, [basePayableAmount, tipAmount, discountAmount]);

  // Hızlı Bölüşüm Butonları (Tamamı, 1/2 Yarısı, 1/3, 1/4)
  const handleQuickSplit = (divisor) => {
    setPaymentSplitMode('amount');
    if (remainingTotal <= 0) return;
    if (divisor === 1) {
      setCustomAmountToPay(remainingTotal.toFixed(2));
    } else {
      const splitVal = (remainingTotal / divisor).toFixed(2);
      setCustomAmountToPay(splitVal);
    }
  };

  // Hızlı Tutar Ekleme (+50₺, +100₺, vb.)
  const handleAddCustomAmount = (delta) => {
    setPaymentSplitMode('amount');
    const current = parseFloat(customAmountToPay) || 0;
    const next = Math.min(remainingTotal, current + delta);
    setCustomAmountToPay(next.toFixed(2));
  };

  // Parçalı ödeme: tutarları personel girer; alanlar birbirini otomatik değiştirmez.
  // Toplamın tahsil edilecek tutarı tutup tutmadığı kutuda gösterilir ve onaylarken kontrol edilir.
  const handleMixedCashChange = (val) => setMixedCash(val);
  const handleMixedCardChange = (val) => setMixedCard(val);
  const handleMixedVeresiyeChange = (val) => {
    setMixedVeresiye(val);
    if ((parseFloat(val) || 0) > 0 && registeredCustomers.length === 0) fetchRegisteredCustomers();
  };

  // Parçalı ödemede henüz dağıtılmamış tutarı seçilen türe ekler ("Kalanı ekle")
  const handleFillMixedRemaining = (field) => {
    const values = { cash: parseFloat(mixedCash) || 0, card: parseFloat(mixedCard) || 0, veresiye: parseFloat(mixedVeresiye) || 0 };
    const assigned = values.cash + values.card + values.veresiye;
    const remaining = Math.max(0, finalPayableTotal - assigned);
    if (remaining <= 0) return;
    const next = (values[field] + remaining).toFixed(2);
    if (field === 'cash') setMixedCash(next);
    else if (field === 'card') setMixedCard(next);
    else {
      setMixedVeresiye(next);
      fetchRegisteredCustomers();
    }
  };

  // Parçalı Ödemede yarı yarıya dağıtım (personelin bilerek bastığı hızlı düğmeler)
  const splitHalf = (first, second) => {
    const half = (finalPayableTotal / 2).toFixed(2);
    const rest = (finalPayableTotal - parseFloat(half)).toFixed(2);
    const values = { cash: '', card: '', veresiye: '' };
    values[first] = half;
    values[second] = rest;
    setMixedCash(values.cash);
    setMixedCard(values.card);
    setMixedVeresiye(values.veresiye);
    if (values.veresiye) fetchRegisteredCustomers();
  };
  const handleSetMixedHalfCashCard = () => splitHalf('cash', 'card');
  const handleSetMixedHalfCashVeresiye = () => splitHalf('cash', 'veresiye');
  const handleSetMixedHalfCardVeresiye = () => splitHalf('card', 'veresiye');

  // Ödeme Şekli Seçildiğinde (Seçili olana tekrar basılırsa seçimi kaldırır)
  const handleSelectPaymentMethod = (method) => {
    if (paymentMethod === method) {
      setPaymentMethod(null);
      return;
    }
    setPaymentMethod(method);
    if (method === 'mixed') {
      fetchRegisteredCustomers();
      // Parçalı ödeme her açılışta boş başlar; tutarları personel girer
      setMixedCash('');
      setMixedCard('');
      setMixedVeresiye('');
    }
  };

  // Masayı Boşaltma / Kapatma (Tüm siparişler ödendiğinde veya manuel kapatmada)
  const handleEmptyTable = async () => {
    const unpaidLeft = remainingTotal > 0.05;
    const confirmClose = await confirm({
      title: unpaidLeft ? 'Masa ödeme alınmadan kapatılsın mı?' : 'Masa kapatılsın mı?',
      message: unpaidLeft
        ? `Masada ₺${remainingTotal.toFixed(2)} ödenmemiş tutar var. Masa tahsilat alınmadan boşaltılacak ve bu işlem kayıt altına alınacak.`
        : 'Masa kapatılıp boşaltılacak.',
      confirmLabel: 'Masayı kapat',
      danger: unpaidLeft
    });
    if (!confirmClose) return;
    try {
      const res = await apiFetch(`/api/tables/${table.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'empty' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Masa başarıyla kapatıldı ve boşaltıldı.', 'success');
        onTableUpdated?.();
        setTimeout(() => onClose(), 400);
      }
    } catch (err) {
      showToast('İşlem gerçekleştirilemedi.', 'danger');
    }
  };

  // "Ödemeyi Onayla" Butonu -> Masayı Kapat veya Çok Yönlü Tahsilat Yap
  const handleConfirmPayment = async () => {
    if (savedItems.length === 0) {
      showToast('Masada ödenecek bir sipariş bulunmuyor.', 'danger');
      return;
    }
    if (remainingTotal <= 0.05) {
      showToast('Masadaki tüm ürünlerin ödemesi zaten alınmıştır.', 'info');
      return;
    }
    // Bahşiş tek başına tahsilat sayılmaz: önce ödenecek ürünler seçilmeli veya tutar girilmeli
    if (basePayableAmount <= 0 || finalPayableTotal <= 0) {
      showToast('Lütfen ödenecek ürünleri seçin veya tahsil edilecek tutarı girin.', 'warning');
      return;
    }
    if (parseFloat(discountAmount || 0) > basePayableAmount + 0.001) {
      showToast('İndirim, tahsil edilecek ürün tutarından fazla olamaz.', 'warning');
      return;
    }

    if (!paymentMethod) {
      showToast('Lütfen bir ödeme yöntemi (Nakit, Kredi Kartı vb.) seçiniz.', 'danger');
      return;
    }

    const mixedVeresiyeFloat = paymentMethod === 'mixed' ? (parseFloat(mixedVeresiye) || 0) : 0;

    if (paymentMethod === 'veresiye' && !veresiyeCustomer.trim() && !veresiyeCustomerId) {
      showToast('Lütfen veresiye yazılacak müşteri veya cari adını giriniz.', 'danger');
      return;
    }

    if (paymentMethod === 'mixed') {
      const parts = [parseFloat(mixedCash) || 0, parseFloat(mixedCard) || 0, mixedVeresiyeFloat];
      if (parts.some(v => v < 0)) {
        showToast('Parçalı ödemede tutarlar eksi olamaz.', 'warning');
        return;
      }
      const diff = finalPayableTotal - parts.reduce((s, v) => s + v, 0);
      if (Math.abs(diff) > 0.01) {
        showToast(diff > 0
          ? `Parçalı ödemede ₺${diff.toFixed(2)} henüz dağıtılmadı. Kalan tutarı bir ödeme türüne ekleyin.`
          : `Parçalı ödemede ₺${(-diff).toFixed(2)} fazla girildi. Tutarlar toplamı ₺${finalPayableTotal.toFixed(2)} olmalıdır.`, 'warning');
        return;
      }
    }

    if (paymentMethod === 'mixed' && mixedVeresiyeFloat > 0 && !veresiyeCustomer.trim() && !veresiyeCustomerId) {
      showToast('Parçalı ödemede veresiye tutarı için lütfen müşteri seçiniz.', 'danger');
      return;
    }

    try {
      setIsPaying(true);

      // Seçili ürünler varsa veya tüm bakiye ödeniyorsa kalemleri payload olarak hazırla
      let paidItemsPayload = [];
      if (selectedItemIds.length > 0) {
        paidItemsPayload = unpaidSavedItems
          .filter(item => selectedItemIds.includes(item.id))
          .map(item => ({
            id: item.id,
            quantity: payingQuantities[item.id] ?? item.quantity ?? 1
          }));
      } else if (remainingTotal > 0 && basePayableAmount >= (remainingTotal - 0.05)) {
        // Elle girilen tutar kalan hesabın tamamını kapatıyorsa tüm kalemler ödendi sayılır
        // (bahşiş bu karşılaştırmaya katılmaz; yalnızca ürün tutarı)
        paidItemsPayload = unpaidSavedItems.map(item => ({
          id: item.id,
          quantity: item.quantity
        }));
      }

      const res = await apiFetch(`/api/orders/table/${table.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_method: paymentMethod,
          amount_paid: finalPayableTotal,
          cash_amount: paymentMethod === 'mixed' ? (parseFloat(mixedCash) || 0) : undefined,
          card_amount: paymentMethod === 'mixed' ? (parseFloat(mixedCard) || 0) : undefined,
          veresiye_amount: paymentMethod === 'mixed' ? mixedVeresiyeFloat : (paymentMethod === 'veresiye' ? finalPayableTotal : undefined),
          customer_id: (paymentMethod === 'veresiye' || (paymentMethod === 'mixed' && mixedVeresiyeFloat > 0)) ? (veresiyeCustomerId || undefined) : undefined,
          customer_name: (paymentMethod === 'veresiye' || (paymentMethod === 'mixed' && mixedVeresiyeFloat > 0)) ? (veresiyeCustomer.trim() || undefined) : undefined,
          notes: (paymentMethod === 'veresiye' || (paymentMethod === 'mixed' && mixedVeresiyeFloat > 0)) ? (veresiyeNote.trim() || undefined) : undefined,
          discount: parseFloat(discountAmount || 0),
          tip: parseFloat(tipAmount || 0),
          paid_items: paidItemsPayload
        })
      });

      const data = await res.json();
      if (data.success) {
        onTableUpdated?.();
        if (data.isPartial) {
          showToast(data.message || `₺${finalPayableTotal.toFixed(2)} tutarında kısmi ödeme alındı.`, 'success');
          // Güncel sipariş ve tahsilatları yeniden çek
          const orderRes = await apiFetch(`/api/orders/table/${table.id}`);
          const orderData = await orderRes.json();
          if (orderData.success) {
            setExistingOrder(orderData.order || null);
            const items = orderData.items || [];
            setSavedItems(items);
            setPaymentsList(orderData.payments || []);
            const unpaid = items.filter(i => !i.is_paid && !nonChargeableStatuses.includes(i.item_status));
            setSelectedItemIds([]);
            const initQtys = {};
            unpaid.forEach(i => { initQtys[i.id] = 1; });
            setPayingQuantities(initQtys);
            // Formu sıfırla
            setCustomAmountToPay('');
            setPaymentMethod(null);
            setDiscountAmount(0);
            setTipAmount(0);
            setMixedCash('');
            setMixedCard('');
            setMixedVeresiye('');
            setVeresiyeCustomerId(null);
            setVeresiyeCustomer('');
            setVeresiyeNote('');
          }
        } else {
          showToast('Hesap başarıyla kapatıldı ve masa boşaltıldı!', 'success');
          setTimeout(() => {
            onClose();
          }, 500);
        }
      } else {
        showToast(data.message || 'Ödeme tamamlanamadı.', 'danger');
      }
    } catch (err) {
      console.error('Ödeme alma hatası:', err);
      showToast('Ödeme alınırken hata oluştu.', 'danger');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="pos-overlay" onClick={handleModalClose}>
      <div className={`pos-window tab-${activeTab}`} onClick={(e) => e.stopPropagation()}>

        <OrderSidebar
          perms={perms}
          onOpenTransfer={() => setShowTransferModal(true)}
          table={table}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          cartItemCount={cartItemCount}
          categories={categories}
          existingOrder={existingOrder}
          orderGuid={orderGuid}
          products={products}
          savedItems={savedItems}
          selectedCategoryId={selectedCategoryId}
          setSelectedCategoryId={setSelectedCategoryId}
          showToast={showToast}
        />

        {/* ======================================================== */}
        {/* ORTA PANEL (YÜKSEK YOĞUNLUKLU ÜRÜNLER / ADİSYON TABLOSU)  */}
        {/* ======================================================== */}
        <main className="pos-center-panel">

          {tableQrRequests.length > 0 && (
            <div className="qr-table-pending">
              <strong><QrCode size={15} /> Bu masadan onay bekleyen QR sipariş</strong>
              <QrRequestList
                requests={tableQrRequests}
                canAct={perms.order}
                showTable={false}
                onChanged={() => { reloadTableQr(); onTableUpdated?.(); }}
              />
            </div>
          )}

          <MenuTab
            perms={perms}
            activeTab={activeTab}
            cartItemCount={cartItemCount}
            cartItems={cartItems}
            cartTotal={cartTotal}
            filteredProducts={filteredProducts}
            getProductCartCount={getProductCartCount}
            handleAddToCart={handleAddToCart}
            handleBarTouchEnd={handleBarTouchEnd}
            handleBarTouchMove={handleBarTouchMove}
            handleBarTouchStart={handleBarTouchStart}
            loading={loading}
            searchQuery={searchQuery}
            setDragOffsetY={setDragOffsetY}
            setIsMobileCartDrawerOpen={setIsMobileCartDrawerOpen}
            setSearchQuery={setSearchQuery}
          />

          <BillTab
            perms={perms}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            actionDropdownItemId={actionDropdownItemId}
            displayedSavedItems={displayedSavedItems}
            grandTotal={grandTotal}
            handleDeliverItem={handleDeliverItem}
            handleSelectAllItems={handleSelectAllItems}
            handleToggleItemSelection={handleToggleItemSelection}
            handleUpdateItemStatus={handleUpdateItemStatus}
            handleUpdatePayQty={handleUpdatePayQty}
            paidTotal={paidTotal}
            payingQuantities={payingQuantities}
            paymentsList={paymentsList}
            remainingTotal={remainingTotal}
            selectedItemIds={selectedItemIds}
            setActionDropdownItemId={setActionDropdownItemId}
            unpaidSavedItems={unpaidSavedItems}
          />

        </main>

        {/* ======================================================== */}
        {/* SAĞ PANEL (GENİŞLETİLMİŞ SEPET VEYA TAHSHİLAT PANELİ)     */}
        {/* ======================================================== */}
        <aside className="pos-right-panel">

          <CartPanel
            perms={perms}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            cartItemCount={cartItemCount}
            cartItems={cartItems}
            cartTotal={cartTotal}
            displayedSavedItems={displayedSavedItems}
            handleCompleteOrder={handleCompleteOrder}
            handleEmptyTable={handleEmptyTable}
            handleRemoveFromCart={handleRemoveFromCart}
            handleUpdateCartItemNote={handleUpdateCartItemNote}
            handleUpdateCartQuantity={handleUpdateCartQuantity}
            isSubmittingOrder={isSubmittingOrder}
            openNoteProductIds={openNoteProductIds}
            paidSavedItems={paidSavedItems}
            remainingTotal={remainingTotal}
            toggleNoteInput={toggleNoteInput}
          />

          <PaymentPanel
            perms={perms}
            activeTab={activeTab}
            basePayableAmount={basePayableAmount}
            handleFillMixedRemaining={handleFillMixedRemaining}
            customAmountToPay={customAmountToPay}
            customerDropdownRef={customerDropdownRef}
            customerSearchTerm={customerSearchTerm}
            discountAmount={discountAmount}
            filteredCustomers={filteredCustomers}
            finalPayableTotal={finalPayableTotal}
            handleConfirmPayment={handleConfirmPayment}
            handleEmptyTable={handleEmptyTable}
            handleMixedCardChange={handleMixedCardChange}
            handleMixedCashChange={handleMixedCashChange}
            handleMixedVeresiyeChange={handleMixedVeresiyeChange}
            handleSelectPaymentMethod={handleSelectPaymentMethod}
            handleSetMixedHalfCardVeresiye={handleSetMixedHalfCardVeresiye}
            handleSetMixedHalfCashCard={handleSetMixedHalfCashCard}
            handleSetMixedHalfCashVeresiye={handleSetMixedHalfCashVeresiye}
            isCustomAmountFocused={isCustomAmountFocused}
            isCustomerDropdownOpen={isCustomerDropdownOpen}
            isPaying={isPaying}
            mixedCard={mixedCard}
            mixedCash={mixedCash}
            mixedVeresiye={mixedVeresiye}
            paidTotal={paidTotal}
            paymentMethod={paymentMethod}
            remainingTotal={remainingTotal}
            savedItems={savedItems}
            selectedItemIds={selectedItemIds}
            selectedRegisteredCustomer={selectedRegisteredCustomer}
            setCustomAmountToPay={setCustomAmountToPay}
            setCustomerSearchTerm={setCustomerSearchTerm}
            setDiscountAmount={setDiscountAmount}
            setIsCustomAmountFocused={setIsCustomAmountFocused}
            setIsCustomerDropdownOpen={setIsCustomerDropdownOpen}
            setQuickCustError={setQuickCustError}
            setQuickCustName={setQuickCustName}
            setQuickCustNotes={setQuickCustNotes}
            setQuickCustPhone={setQuickCustPhone}
            setShowQuickAddCustomerModal={setShowQuickAddCustomerModal}
            setTipAmount={setTipAmount}
            setVeresiyeCustomer={setVeresiyeCustomer}
            setVeresiyeCustomerId={setVeresiyeCustomerId}
            setVeresiyeNote={setVeresiyeNote}
            tipAmount={tipAmount}
            veresiyeCustomerId={veresiyeCustomerId}
            veresiyeNote={veresiyeNote}
          />

        </aside>

        {/* Modal Kapatma Butonu */}
        <button
          type="button"
          className="pos-dialog-close-btn"
          onClick={handleModalClose}
          title="Kapat"
        >
          <X size={20} />
        </button>

      </div>

      <ReceiptPreviewModal
        table={table}
        discountAmount={discountAmount}
        displayedSavedItems={displayedSavedItems}
        existingOrder={existingOrder}
        finalPayableTotal={finalPayableTotal}
        grandTotal={grandTotal}
        paidTotal={paidTotal}
        setShowReceiptPreview={setShowReceiptPreview}
        showReceiptPreview={showReceiptPreview}
        tipAmount={tipAmount}
      />

      {showTransferModal && (
        <TableTransferModal
          table={table}
          hasUnsentCart={cartItems.length > 0}
          showToast={showToast}
          onClose={() => setShowTransferModal(false)}
          onTransferred={(target) => {
            setShowTransferModal(false);
            onTableUpdated?.();
            onTableSwitched?.(target);
          }}
        />
      )}

      <StatusSplitModal handleUpdateItemStatus={handleUpdateItemStatus} setStatusPrompt={setStatusPrompt} statusPrompt={statusPrompt} />

      <MobileCartDrawer
        perms={perms}
        activeTab={activeTab}
        cartItemCount={cartItemCount}
        cartItems={cartItems}
        cartTotal={cartTotal}
        dragOffsetY={dragOffsetY}
        handleCompleteOrder={handleCompleteOrder}
        handleRemoveFromCart={handleRemoveFromCart}
        handleSheetTouchEnd={handleSheetTouchEnd}
        handleSheetTouchMove={handleSheetTouchMove}
        handleSheetTouchStart={handleSheetTouchStart}
        handleUpdateCartItemNote={handleUpdateCartItemNote}
        handleUpdateCartQuantity={handleUpdateCartQuantity}
        isDragging={isDragging}
        isMobileCartDrawerOpen={isMobileCartDrawerOpen}
        isSubmittingOrder={isSubmittingOrder}
        openNoteProductIds={openNoteProductIds}
        setDragOffsetY={setDragOffsetY}
        setIsMobileCartDrawerOpen={setIsMobileCartDrawerOpen}
        toggleNoteInput={toggleNoteInput}
      />

      <QuickCustomerModal
        handleSaveQuickCustomer={handleSaveQuickCustomer}
        isSubmittingQuickCust={isSubmittingQuickCust}
        quickCustError={quickCustError}
        quickCustName={quickCustName}
        quickCustNotes={quickCustNotes}
        quickCustPhone={quickCustPhone}
        setQuickCustError={setQuickCustError}
        setQuickCustName={setQuickCustName}
        setQuickCustNotes={setQuickCustNotes}
        setQuickCustPhone={setQuickCustPhone}
        setShowQuickAddCustomerModal={setShowQuickAddCustomerModal}
        showQuickAddCustomerModal={showQuickAddCustomerModal}
      />


    </div>
  );
}
