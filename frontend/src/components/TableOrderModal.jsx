import React, { useState, useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  Receipt,
  Utensils,
  Coffee,
  CheckCircle2,
  CreditCard,
  Banknote,
  Split,
  ArrowLeftRight,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Sparkles,
  ShoppingBag,
  Percent,
  Check,
  Pencil,
  Gift,
  RotateCcw,
  Ban,
  MoreHorizontal,
  Coins,
  UserCheck,
  Calculator,
  Clock,
  UserPlus,
  User,
  Phone,
  FileText
} from 'lucide-react';
import { toTitleCaseTr, formatLeadingZeroPhone } from './Customers';
import './customers.css';

export default function TableOrderModal({ table, onClose, onTableUpdated }) {
  // Aktif Sekme: 'order' (Menü & Sipariş) | 'payment' (Hesap Ödeme)
  const [activeTab, setActiveTab] = useState('order');

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

  // Modal / Çekmece Kapatma Kontrolü (Sepet açıkken masalara atmasın, sadece çekmeceyi kapatıp menüye dönsün)
  const handleModalClose = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (isMobileCartDrawerOpen) {
      setIsMobileCartDrawerOpen(false);
      setDragOffsetY(0);
      return;
    }
    onClose();
  };

  // Escape tuşu ile önce sepeti, sonra modalı kapatma
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isMobileCartDrawerOpen) {
          setIsMobileCartDrawerOpen(false);
          setDragOffsetY(0);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileCartDrawerOpen, onClose]);

  // Hesap Ödeme Sekmesi İçin Seçili Ürün ID'leri (Checkbox)
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  // Hesap Ödeme Sekmesinde Her Kalemden Kaç Adet Tahsil Edilecek (1/5 gibi)
  const [payingQuantities, setPayingQuantities] = useState({});

  // Durum Değiştirme (İşlem) Menüsü & Çoklu Adet Bölme Modalı
  const [actionDropdownItemId, setActionDropdownItemId] = useState(null);
  const [statusPrompt, setStatusPrompt] = useState(null); // { item, targetStatus }

  // Ödeme ve Tahsilat Değerleri
  const [paymentsList, setPaymentsList] = useState([]); // Masanın önceki tahsilat kayıtları
  const [paymentSplitMode, setPaymentSplitMode] = useState('amount'); // 'amount' (Tutar / Bölüşüm) | 'items' (Kalem Bazlı)
  const [customAmountToPay, setCustomAmountToPay] = useState(''); // Özel girilen veya oranla belirlenen tutar
  const [tipAmount, setTipAmount] = useState(0); // Bahşiş
  const [discountAmount, setDiscountAmount] = useState(0); // İndirim
  const [paymentMethod, setPaymentMethod] = useState(null); // 'cash' | 'credit_card' | 'mixed' | 'veresiye' | null (varsayılan olarak boş gelir)
  const [cashGiven, setCashGiven] = useState(''); // Müşteriden alınan nakit (para üstü hesabı)
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
      const token = localStorage.getItem('kafe_token');
      const res = await fetch('/api/customers', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
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
      const token = localStorage.getItem('kafe_token');
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
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
  const [toast, setToast] = useState(null);

  // Fiş Yazdırma Önizleme Modalı
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  // Toast Bildirimi
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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
          fetch('/api/categories'),
          fetch('/api/products'),
          fetch(`/api/orders/table/${table.id}`)
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
    const socket = io();
    socket.on('order:created', (data) => {
      if (data.tableId === table.id) {
        setExistingOrder(data.order);
        const items = data.items || [];
        setSavedItems(items);
        setPaymentsList(data.payments || []);
        const unpaid = items.filter(i => !i.is_paid);
        setSelectedItemIds([]);
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

    socket.on('order:updated', () => {
      fetch(`/api/orders/table/${table.id}`)
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

  // Masada daha önce tahsil edilmiş toplam ödemeler (payments tablosundan)
  const paidTotal = useMemo(() => {
    const fromPayments = paymentsList.reduce((sum, p) => sum + parseFloat(p.total_amount || 0), 0);
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

      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/orders/table/${table.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
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

  // Masadaki kalemi tamamen silme (garson iptali için)
  const handleDeleteOrderItem = async (item) => {
    const confirmDelete = window.confirm(`"${item.product_name}" ürününü masadan iptal etmek / silmek istediğinize emin misiniz?`);
    if (!confirmDelete) return;

    try {
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/orders/items/${item.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setSavedItems(prev => prev.filter(i => i.id !== item.id));
        setSelectedItemIds(prev => prev.filter(id => id !== item.id));
        setPayingQuantities(prev => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        showToast('Ürün masadan kaldırıldı.');
        onTableUpdated?.();
      }
    } catch (err) {
      console.error('Kalem silme hatası:', err);
      showToast('İşlem gerçekleştirilemedi.', 'danger');
    }
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
      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/orders/items/${item.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
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
        const orderRes = await fetch(`/api/orders/table/${table.id}`);
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

  // Seçilen ödeme moduna göre baz ödenecek tutar (Ürün seçilmediyse ve özel tutar girilmediyse kalan bakiyenin tamamı baz alınır)
  const basePayableAmount = useMemo(() => {
    if (selectedItemIds.length > 0) {
      return selectedItemsTotal;
    }
    // Özel tutar girildiyse onu kullan
    if (customAmountToPay !== '' && !isNaN(parseFloat(customAmountToPay))) {
      return Math.min(remainingTotal, Math.max(0, parseFloat(customAmountToPay)));
    }
    return remainingTotal > 0 ? remainingTotal : 0;
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

  // Parçalı / Karma Ödemede Nakit Değiştiğinde
  const handleMixedCashChange = (val) => {
    setMixedCash(val);
    const cashVal = parseFloat(val) || 0;
    const verVal = parseFloat(mixedVeresiye) || 0;
    const rem = Math.max(0, finalPayableTotal - cashVal - verVal);
    setMixedCard(rem.toFixed(2));
  };

  // Parçalı / Karma Ödemede Kart Değiştiğinde
  const handleMixedCardChange = (val) => {
    setMixedCard(val);
    const cardVal = parseFloat(val) || 0;
    const verVal = parseFloat(mixedVeresiye) || 0;
    const rem = Math.max(0, finalPayableTotal - cardVal - verVal);
    setMixedCash(rem.toFixed(2));
  };

  // Parçalı / Karma Ödemede Veresiye Değiştiğinde
  const handleMixedVeresiyeChange = (val) => {
    setMixedVeresiye(val);
    const verVal = parseFloat(val) || 0;
    const rem = Math.max(0, finalPayableTotal - verVal);
    const currentCard = parseFloat(mixedCard) || 0;
    if (currentCard === 0) {
      setMixedCash(rem.toFixed(2));
      setMixedCard('0.00');
    } else {
      if (currentCard <= rem) {
        setMixedCash((rem - currentCard).toFixed(2));
      } else {
        setMixedCard(rem.toFixed(2));
        setMixedCash('0.00');
      }
    }
  };

  // Parçalı Ödemede 50% Nakit - 50% Kart Dağıt
  const handleSetMixedHalfCashCard = () => {
    const half = (finalPayableTotal / 2).toFixed(2);
    setMixedCash(half);
    setMixedCard((finalPayableTotal - parseFloat(half)).toFixed(2));
    setMixedVeresiye('0.00');
  };

  // Parçalı Ödemede 50% Nakit - 50% Veresiye Dağıt
  const handleSetMixedHalfCashVeresiye = () => {
    const half = (finalPayableTotal / 2).toFixed(2);
    setMixedCash(half);
    setMixedVeresiye((finalPayableTotal - parseFloat(half)).toFixed(2));
    setMixedCard('0.00');
    fetchRegisteredCustomers();
  };

  // Parçalı Ödemede 50% Kart - 50% Veresiye Dağıt
  const handleSetMixedHalfCardVeresiye = () => {
    const half = (finalPayableTotal / 2).toFixed(2);
    setMixedCard(half);
    setMixedVeresiye((finalPayableTotal - parseFloat(half)).toFixed(2));
    setMixedCash('0.00');
    fetchRegisteredCustomers();
  };

  // Ödeme Şekli Seçildiğinde (Seçili olana tekrar basılırsa seçimi kaldırır)
  const handleSelectPaymentMethod = (method) => {
    if (paymentMethod === method) {
      setPaymentMethod(null);
      return;
    }
    setPaymentMethod(method);
    if (method === 'mixed') {
      fetchRegisteredCustomers();
      if (!mixedCash && !mixedCard && !mixedVeresiye) {
        const half = (finalPayableTotal / 2).toFixed(2);
        setMixedCash(half);
        setMixedCard((finalPayableTotal - parseFloat(half)).toFixed(2));
        setMixedVeresiye('0.00');
      }
    }
  };

  // Parçalı ödeme seçiliyken bahşiş/indirim veya seçili ürün değiştiğinde tutarları otomatik dengele
  useEffect(() => {
    if (paymentMethod === 'mixed' && finalPayableTotal > 0) {
      const cCash = parseFloat(mixedCash) || 0;
      const cCard = parseFloat(mixedCard) || 0;
      const cVer = parseFloat(mixedVeresiye) || 0;
      const sum = cCash + cCard + cVer;
      if (Math.abs(sum - finalPayableTotal) > 0.01) {
        if (cVer > 0 && cVer < finalPayableTotal) {
          const rem = finalPayableTotal - cVer;
          if (cCash <= rem) {
            setMixedCard((rem - cCash).toFixed(2));
          } else {
            setMixedCash(rem.toFixed(2));
            setMixedCard('0.00');
          }
        } else {
          const half = (finalPayableTotal / 2).toFixed(2);
          setMixedCash(half);
          setMixedCard(Math.max(0, finalPayableTotal - parseFloat(half)).toFixed(2));
          setMixedVeresiye('0.00');
        }
      }
    }
  }, [finalPayableTotal, paymentMethod]);

  // Para Üstü Hesabı (Nakit için)
  const cashGivenFloat = parseFloat(cashGiven || 0);
  const changeAmount = cashGivenFloat > finalPayableTotal ? (cashGivenFloat - finalPayableTotal).toFixed(2) : '0.00';

  // Masayı Boşaltma / Kapatma (Tüm siparişler ödendiğinde veya manuel kapatmada)
  const handleEmptyTable = async () => {
    const confirmClose = window.confirm('Masa kapatılıp boşaltılacak. Onaylıyor musunuz?');
    if (!confirmClose) return;
    try {
      const res = await fetch(`/api/tables/${table.id}`, {
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
    if (finalPayableTotal <= 0) {
      showToast('Lütfen ödenecek ürün seçin veya geçerli bir tahsilat tutarı belirleyin.', 'danger');
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
      } else if (remainingTotal > 0 && finalPayableTotal >= (remainingTotal - 0.05)) {
        paidItemsPayload = unpaidSavedItems.map(item => ({
          id: item.id,
          quantity: item.quantity
        }));
      }

      const token = localStorage.getItem('kafe_token');
      const res = await fetch(`/api/orders/table/${table.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
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
          const orderRes = await fetch(`/api/orders/table/${table.id}`);
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
            setCashGiven('');
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

  // Veresiye Müşteri Seçim Dropdown Bileşeni
  const renderCustomerDropdown = () => (
    <div className="pos-veresiye-dropdown-wrap" ref={customerDropdownRef}>
      <div
        className={`pos-veresiye-custom-select-trigger ${isCustomerDropdownOpen ? 'is-open' : ''}`}
        onClick={() => setIsCustomerDropdownOpen(prev => !prev)}
      >
        <div className="pos-veresiye-trigger-left">
          <div className="pos-veresiye-trigger-avatar">
            {selectedRegisteredCustomer ? selectedRegisteredCustomer.name.charAt(0).toUpperCase() : <User size={15} />}
          </div>
          {selectedRegisteredCustomer ? (
            <div className="pos-veresiye-trigger-details">
              <span className="pos-veresiye-trigger-name">{selectedRegisteredCustomer.name}</span>
              {selectedRegisteredCustomer.phone && selectedRegisteredCustomer.phone.length > 1 && (
                <span className="pos-veresiye-trigger-phone">({selectedRegisteredCustomer.phone})</span>
              )}
            </div>
          ) : (
            <span className="pos-veresiye-trigger-placeholder">-- Müşteri Seçiniz (Kayıtlı Cariler) --</span>
          )}
        </div>

        <div className="pos-veresiye-trigger-right">
          {selectedRegisteredCustomer && (
            <span className={`pos-veresiye-item-debt-badge ${parseFloat(selectedRegisteredCustomer.current_balance || 0) > 0 ? 'debt' : 'clear'}`}>
              {parseFloat(selectedRegisteredCustomer.current_balance || 0) > 0
                ? `Borç: ₺${parseFloat(selectedRegisteredCustomer.current_balance).toFixed(2)}`
                : 'Borçsuz'}
            </span>
          )}
          {selectedRegisteredCustomer && (
            <button
              type="button"
              className="pos-veresiye-trigger-clear-btn"
              title="Seçimi Kaldır"
              onClick={(e) => {
                e.stopPropagation();
                setVeresiyeCustomerId(null);
                setVeresiyeCustomer('');
              }}
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} className={`pos-veresiye-trigger-chevron ${isCustomerDropdownOpen ? 'rotated' : ''}`} />
        </div>
      </div>

      {/* Açılan Menü */}
      {isCustomerDropdownOpen && (
        <div className="pos-veresiye-custom-menu" onClick={(e) => e.stopPropagation()}>
          <div className="pos-veresiye-menu-search-box">
            <Search size={14} color="#486b78" />
            <input
              type="text"
              placeholder="Müşteri adı veya telefon ile filtrele..."
              value={customerSearchTerm}
              onChange={(e) => setCustomerSearchTerm(e.target.value)}
              autoFocus
              className="pos-veresiye-menu-search-input"
            />
            {customerSearchTerm && (
              <button
                type="button"
                className="pos-veresiye-trigger-clear-btn"
                onClick={() => setCustomerSearchTerm('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="pos-veresiye-menu-list">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map(c => {
                const debt = parseFloat(c.current_balance || 0);
                const isSelected = veresiyeCustomerId === c.id;
                return (
                  <div
                    key={c.id}
                    className={`pos-veresiye-menu-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setVeresiyeCustomerId(c.id);
                      setVeresiyeCustomer(c.name);
                      setIsCustomerDropdownOpen(false);
                      setCustomerSearchTerm('');
                    }}
                  >
                    <div className="pos-veresiye-item-left">
                      <div className="pos-veresiye-item-avatar">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="pos-veresiye-item-details">
                        <div className="pos-veresiye-item-title-row">
                          <span className="pos-veresiye-item-name">{c.name}</span>
                          {isSelected && <Check size={13} color="#2d6a4f" />}
                        </div>
                        {c.phone && c.phone.length > 1 && (
                          <span className="pos-veresiye-item-phone">
                            <Phone size={11} /> {c.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="pos-veresiye-item-right">
                      <span className={`pos-veresiye-item-debt-badge ${debt > 0 ? 'debt' : 'clear'}`}>
                        {debt > 0 ? `Borç: ₺${debt.toFixed(2)}` : 'Borçsuz'}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="pos-veresiye-menu-empty">
                <AlertCircle size={18} color="#b88214" />
                <span>"{customerSearchTerm}" bulunamadı</span>
                <button
                  type="button"
                  className="pos-veresiye-create-prompt-btn"
                  onClick={() => {
                    setQuickCustName(toTitleCaseTr(customerSearchTerm));
                    setQuickCustPhone('0');
                    setQuickCustNotes('');
                    setQuickCustError('');
                    setShowQuickAddCustomerModal(true);
                    setIsCustomerDropdownOpen(false);
                  }}
                >
                  <UserPlus size={14} />
                  <span>"{toTitleCaseTr(customerSearchTerm)}" Olarak Yeni Ekle</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="pos-overlay" onClick={handleModalClose}>
      <div className={`pos-window tab-${activeTab}`} onClick={(e) => e.stopPropagation()}>

        {/* ======================================================== */}
        {/* SOL PANEL (MASA BADGE & NAVİGASYON & DİKEY KATEGORİLER)  */}
        {/* ======================================================== */}
        <aside className="pos-left-panel">

          {/* Masa Bilgi Rozeti */}
          <div className="pos-table-card pos-order-table-card">
            <div className="pos-table-card-avatar">
              <Coffee size={20} color="#346c80" />
            </div>
            <div className="pos-table-card-info">
              <div className="pos-table-card-top-row">
                <h2 className="pos-table-card-title">{table.title}</h2>
                <button
                  type="button"
                  className="pos-table-card-transfer-btn"
                  title="Masa Taşıma"
                  onClick={() => showToast('Masa taşıma özelliği yakında aktif edilecektir.', 'info')}
                >
                  <ArrowLeftRight size={13} />
                </button>
              </div>
              <div className="pos-table-card-sub-row">
                <span
                  className="pos-table-card-code"
                  title={existingOrder?.order_number ? `Sipariş GUID: ${existingOrder.order_number} (Kopyalamak için tıkla)` : 'Masada henüz açık sipariş yok'}
                  onClick={() => {
                    if (existingOrder?.order_number) {
                      navigator.clipboard?.writeText(existingOrder.order_number);
                      showToast('Sipariş GUID kopyalandı', 'info');
                    }
                  }}
                  style={{ cursor: existingOrder?.order_number ? 'pointer' : 'default' }}
                >
                  {orderGuid}
                </span>
                <span className={`pos-table-card-status ${existingOrder?.id ? 'active-order' : 'empty-order'}`}>
                  <span className={`pos-status-dot ${existingOrder?.id ? 'occupied' : 'empty'}`}></span>
                  {existingOrder?.id ? 'Açık' : 'Boş'}
                </span>
              </div>
            </div>
          </div>

          {/* Sekme Butonları */}
          <div className="pos-nav-tabs">
            <button
              type="button"
              className={`pos-nav-tab-btn ${activeTab === 'payment' ? 'active' : ''}`}
              onClick={() => setActiveTab('payment')}
            >
              <Receipt size={17} />
              <span>Hesap Ödeme</span>
              {savedItems.length > 0 && (
                <span className="pos-tab-counter-badge">{savedItems.length}</span>
              )}
            </button>

            <button
              type="button"
              className={`pos-nav-tab-btn ${activeTab === 'order' ? 'active' : ''}`}
              onClick={() => setActiveTab('order')}
            >
              <Utensils size={17} />
              <span>Menü & Sipariş</span>
              {cartItemCount > 0 && (
                <span className="pos-tab-counter-badge new">{cartItemCount}</span>
              )}
            </button>
          </div>

          {/* Menü & Sipariş Sekmesinde: Kategori Listesi (Mobilde Kompakt Dropdown Seçici, Masaüstünde Dikey Liste) */}
          {activeTab === 'order' && (
            <div className="pos-cat-section">
              {/* Masaüstü Başlığı */}
              <div className="pos-cat-section-header">
                <h4 className="pos-cat-section-title">Kategoriler</h4>
                <span className="pos-cat-total-count">({products.length})</span>
              </div>

              {/* Mobilde Özel Kategori Dropdown Seçicisi */}
              <div className="pos-mobile-cat-dropdown-wrap">
                <select
                  className="pos-mobile-cat-select"
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                >
                  <option value="all">Tüm Kategoriler ({products.length} Ürün)</option>
                  {categories.map(cat => {
                    const count = products.filter(p => p.category_id === cat.id).length;
                    return (
                      <option key={cat.id} value={cat.id.toString()}>
                        {cat.name} ({count} Ürün)
                      </option>
                    );
                  })}
                </select>
                <ChevronDown size={16} className="pos-mobile-cat-select-icon" />
              </div>

              {/* Masaüstü Dikey Kategori Listesi */}
              <div className="pos-cat-list-vertical">
                {/* Tüm Ürünler */}
                <button
                  type="button"
                  className={`pos-cat-list-item ${selectedCategoryId === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedCategoryId('all')}
                >
                  <span className="pos-cat-item-name">Tüm Ürünler</span>
                  <span className="pos-cat-item-count">{products.length}</span>
                </button>

                {/* Kategoriler */}
                {categories.map(cat => {
                  const count = products.filter(p => p.category_id === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`pos-cat-list-item ${selectedCategoryId === cat.id.toString() ? 'active' : ''}`}
                      onClick={() => setSelectedCategoryId(cat.id.toString())}
                    >
                      <span className="pos-cat-item-name">{cat.name}</span>
                      <span className="pos-cat-item-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </aside>

        {/* ======================================================== */}
        {/* ORTA PANEL (YÜKSEK YOĞUNLUKLU ÜRÜNLER / ADİSYON TABLOSU)  */}
        {/* ======================================================== */}
        <main className="pos-center-panel">

          {/* -------------------------------------------------------- */}
          {/* DURUM 1: MENÜ & SİPARİŞ SEKMESİ                          */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'order' && (
            <div className="pos-order-center-view">

              {/* Üst Arama Çubuğu */}
              <div className="pos-search-bar">
                <Search size={18} className="pos-search-icon" />
                <input
                  type="text"
                  placeholder="Menüde ürün veya lezzet ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="pos-search-clear-btn"
                    onClick={() => setSearchQuery('')}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Kompakt ve Çoklu Ürün Izgarası (5-6 Kolon) */}
              <div className="pos-product-grid-wrap">
                {loading ? (
                  <div className="pos-grid-empty">
                    <div className="cat-btn-spinner" style={{ width: '28px', height: '28px', borderColor: '#6293a3', borderTopColor: '#346c80' }}></div>
                    <p>Menü yükleniyor...</p>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="pos-grid-empty">
                    <Utensils size={36} color="#c8b6a6" />
                    <p>Bu kategoride ürün bulunamadı.</p>
                  </div>
                ) : (
                  <div className="pos-product-grid">
                    {filteredProducts.map(prod => {
                      const countInCart = getProductCartCount(prod.id);
                      return (
                        <div
                          key={prod.id}
                          className={`pos-product-card ${countInCart > 0 ? 'in-cart' : ''}`}
                          onClick={() => handleAddToCart(prod)}
                        >
                          {/* Sepetteki Adet Rozeti (Sol Üst) */}
                          {countInCart > 0 && (
                            <div className="pos-product-cart-count-badge">
                              {countInCart}x
                            </div>
                          )}

                          {/* Fiyat Rozeti (Sağ Üst) */}
                          <div className="pos-product-price-badge">
                            ₺{parseFloat(prod.price || 0).toFixed(0)}
                          </div>

                          {/* Ürün Görseli */}
                          <div className="pos-product-img-box">
                            {prod.image_url ? (
                              <img
                                src={prod.image_url}
                                alt={prod.name}
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  if (e.currentTarget.nextSibling) {
                                    e.currentTarget.nextSibling.style.display = 'flex';
                                  }
                                }}
                              />
                            ) : null}
                            <div
                              className="pos-product-fallback-img"
                              style={{ display: prod.image_url ? 'none' : 'flex' }}
                            >
                              <Coffee size={24} color="#346c80" />
                            </div>
                          </div>

                          {/* Ürün Başlığı & Hızlı Ekle Butonu */}
                          <div className="pos-product-bottom-row">
                            <span className="pos-product-name" title={prod.name}>
                              {prod.name}
                            </span>
                            <button
                              type="button"
                              className="pos-product-add-btn"
                              title="Sepete Ekle"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddToCart(prod);
                              }}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mobil Ekranlar İçin Sabit Kayan / Alt Önizleme Sepet Çubuğu */}
              {cartItems.length > 0 && (
                <div
                  className="pos-mobile-cart-floating-bar"
                  onClick={() => {
                    setIsMobileCartDrawerOpen(true);
                    setDragOffsetY(0);
                  }}
                  onTouchStart={handleBarTouchStart}
                  onTouchMove={handleBarTouchMove}
                  onTouchEnd={handleBarTouchEnd}
                >
                  <div className="pos-mobile-cart-bar-left">
                    <div className="pos-mobile-cart-badge-icon">
                      <ShoppingBag size={15} />
                      <span className="pos-mobile-cart-badge">{cartItemCount}</span>
                    </div>
                    <div className="pos-mobile-cart-col">
                      <span className="pos-mobile-cart-label">Sepet Önizleme</span>
                      <strong className="pos-mobile-cart-total">₺{cartTotal.toFixed(2)}</strong>
                    </div>
                  </div>
                  <div className="pos-mobile-cart-bar-right">
                    <span>Sepeti Gör & Onayla</span>
                    <ChevronUp size={16} />
                  </div>
                </div>
              )}

            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* DURUM 2: HESAP ÖDEME SEKMESİ (ADİSYON KALEMLERİ)         */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'payment' && (
            <div className="pos-payment-center-view">

              {/* Daha Önce Alınmış Kısmi Tahsilatlar Geçmişi */}
              {paymentsList.length > 0 && (
                <div className="pos-payment-history-banner">
                  <div className="pos-payment-history-title">
                    <Receipt size={14} />
                    <span>Önceki Tahsilatlar ({paymentsList.length}):</span>
                  </div>
                  <div className="pos-payment-history-pills-wrap">
                    {paymentsList.map((pm, idx) => {
                      const isVeresiye = pm.payment_method === 'veresiye' || (pm.payment_method === 'mixed' && parseFloat(pm.veresiye_amount || 0) > 0);
                      let methodLabel = '';
                      if (pm.payment_method === 'cash') {
                        methodLabel = 'Nakit';
                      } else if (pm.payment_method === 'credit_card') {
                        methodLabel = 'Kart';
                      } else if (pm.payment_method === 'veresiye') {
                        methodLabel = `Veresiye (${pm.customer_name || 'Cari'})`;
                      } else if (pm.payment_method === 'mixed') {
                        const parts = [];
                        if (parseFloat(pm.cash_amount || 0) > 0) parts.push(`${parseFloat(pm.cash_amount).toFixed(0)}₺ N`);
                        if (parseFloat(pm.card_amount || 0) > 0) parts.push(`${parseFloat(pm.card_amount).toFixed(0)}₺ K`);
                        if (parseFloat(pm.veresiye_amount || 0) > 0) parts.push(`${parseFloat(pm.veresiye_amount).toFixed(0)}₺ V`);
                        methodLabel = `Karma (${parts.join(' + ')}${pm.customer_name ? ` - ${pm.customer_name}` : ''})`;
                      }
                      const timeStr = pm.created_at ? new Date(pm.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
                      return (
                        <div key={pm.id || idx} className={`pos-payment-history-pill ${isVeresiye ? 'veresiye' : ''}`} title={pm.notes || ''}>
                          <strong>₺{parseFloat(pm.total_amount || 0).toFixed(2)}</strong>
                          <span className="pill-method">({methodLabel})</span>
                          {timeStr && <span className="pill-time">{timeStr}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pos-saved-items-table-container">

                {/* Tablo Başlık Satırı */}
                <div className="pos-table-header-row">
                  <div className="pos-col-check">
                    <input
                      type="checkbox"
                      checked={unpaidSavedItems.length > 0 && selectedItemIds.length === unpaidSavedItems.length}
                      disabled={unpaidSavedItems.length === 0}
                      onChange={(e) => handleSelectAllItems(e.target.checked)}
                      title="Ödeneceklerin Tümünü Seç / Kaldır"
                    />
                  </div>
                  <div
                    className="pos-col-product"
                    onClick={() => {
                      if (unpaidSavedItems.length > 0) {
                        handleSelectAllItems();
                      }
                    }}
                    style={{ cursor: unpaidSavedItems.length > 0 ? 'pointer' : 'default', userSelect: 'none' }}
                    title="Ödeneceklerin Tümünü Seç / Kaldır"
                  >
                    Tümünü Seç
                  </div>
                  <div className="pos-col-qty">Miktar & İşlem</div>
                  <div className="pos-col-price">Tutar</div>
                </div>

                {/* Tablo Kalemleri */}
                <div className="pos-table-body-rows">
                  {displayedSavedItems.length === 0 ? (
                    <div className="pos-saved-items-empty">
                      <Receipt size={42} color="#cbb8a6" />
                      <h4>Açık Sipariş Bulunmuyor</h4>
                      <p>"Menü & Sipariş" sekmesinden ürün seçip masaya anında sipariş ekleyebilirsiniz.</p>
                      <button
                        type="button"
                        className="pos-btn-switch-menu"
                        onClick={() => setActiveTab('order')}
                      >
                        <Utensils size={15} />
                        <span>Menüye Git & Sipariş Ekle</span>
                      </button>
                    </div>
                  ) : (
                    displayedSavedItems.map((item, index) => {
                      const isPaid = !!item.is_paid;
                      const isSpecial = ['cancelled', 'returned', 'complimentary'].includes(item.item_status);
                      const isSelectable = !isPaid && !isSpecial;
                      const isSelected = isSelectable && selectedItemIds.includes(item.id);
                      const currentPayQty = payingQuantities[item.id] ?? 1;
                      const isDropdownOpen = actionDropdownItemId === item.id;
                      const isNearBottom = index >= displayedSavedItems.length - 2 && displayedSavedItems.length >= 3;

                      return (
                        <div
                          key={item.id}
                          className={`pos-table-item-row ${isDropdownOpen ? 'pos-row-has-open-dropdown' : ''} ${isPaid ? 'row-paid' : isSpecial ? `row-special status-${item.item_status}` : isSelected ? 'row-selected' : ''}`}
                          onClick={() => {
                            if (isSelectable) {
                              handleToggleItemSelection(item.id);
                            }
                          }}
                        >
                          {/* Checkbox / Paid Badge / Special Icon */}
                          <div className="pos-col-check">
                            {isPaid ? (
                              <span className="pos-item-paid-check" title="Bu ürünün ödemesi tamamlandı">
                                <Check size={13} color="#2d6a4f" />
                              </span>
                            ) : item.item_status === 'complimentary' ? (
                              <span className="pos-item-special-icon ikram" title="İkram (Ücretsiz)">
                                <Gift size={15} color="#7e22ce" />
                              </span>
                            ) : item.item_status === 'returned' ? (
                              <span className="pos-item-special-icon iade" title="İade Edildi">
                                <RotateCcw size={14} color="#c2410c" />
                              </span>
                            ) : item.item_status === 'cancelled' ? (
                              <span className="pos-item-special-icon iptal" title="İptal Edildi">
                                <Ban size={14} color="#dc2626" />
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleItemSelection(item.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                          </div>

                          {/* Ürün Görseli, Adı ve Durum Rozeti */}
                          <div className="pos-col-product">
                            <div className="pos-row-item-thumb">
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.product_name} />
                              ) : (
                                <Coffee size={18} color="#346c80" />
                              )}
                            </div>
                            <div className="pos-row-item-details">
                              <span className={`pos-row-item-title ${item.item_status === 'cancelled' ? 'title-cancelled' : ''}`}>
                                {item.product_name}
                              </span>
                              <div className="pos-row-item-badges">
                                {isPaid ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="pos-item-status-pill paid">
                                      <Check size={10} style={{ marginRight: '3px' }} />
                                      ÖDENDİ
                                    </span>
                                    <div className="pos-item-mobile-qty-wrap">
                                      <span className="pos-mobile-qty-pill paid">
                                        {item.quantity} Adet
                                      </span>
                                    </div>
                                  </div>
                                ) : isSpecial ? (
                                  <div className="pos-item-actions-wrapper" onClick={(e) => e.stopPropagation()}>
                                    <span className={`pos-item-status-pill ${item.item_status}`}>
                                      {item.item_status === 'complimentary' && <Gift size={10} style={{ marginRight: '3px' }} />}
                                      {item.item_status === 'returned' && <RotateCcw size={10} style={{ marginRight: '3px' }} />}
                                      {item.item_status === 'cancelled' && <Ban size={10} style={{ marginRight: '3px' }} />}
                                      {item.item_status === 'complimentary' ? 'İKRAM' : item.item_status === 'returned' ? 'İADE' : 'İPTAL'}
                                    </span>
                                    {/* Geri Al / Durum Değiştir Butonu */}
                                    <button
                                      type="button"
                                      className="pos-btn-action-menu"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActionDropdownItemId(prev => prev === item.id ? null : item.id);
                                      }}
                                      title="Durumu Değiştir / Geri Al"
                                    >
                                      <MoreHorizontal size={13} />
                                    </button>
                                    {/* Mobilde Adet Bilgisi */}
                                    <div className="pos-item-mobile-qty-wrap">
                                      <span className={`pos-mobile-qty-pill ${item.item_status}`}>
                                        {item.quantity} Adet
                                      </span>
                                    </div>
                                    {actionDropdownItemId === item.id && (
                                      <div className={`pos-item-action-dropdown ${isNearBottom ? 'dropdown-up' : ''}`} onClick={(e) => e.stopPropagation()}>
                                        <button
                                          type="button"
                                          className="pos-item-action-btn deliver"
                                          onClick={() => handleUpdateItemStatus(item, 'delivered')}
                                        >
                                          <Check size={12} />
                                          <span>Teslim Edildi Yap</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="pos-item-action-btn pending"
                                          onClick={() => handleUpdateItemStatus(item, 'pending')}
                                        >
                                          <Utensils size={12} />
                                          <span>Mutfağa Geri Al</span>
                                        </button>
                                        {item.item_status !== 'complimentary' && (
                                          <button
                                            type="button"
                                            className="pos-item-action-btn complimentary"
                                            onClick={() => handleUpdateItemStatus(item, 'complimentary')}
                                          >
                                            <Gift size={12} />
                                            <span>İkram Yap</span>
                                          </button>
                                        )}
                                        {item.item_status !== 'returned' && (
                                          <button
                                            type="button"
                                            className="pos-item-action-btn return"
                                            onClick={() => handleUpdateItemStatus(item, 'returned')}
                                          >
                                            <RotateCcw size={12} />
                                            <span>İade Al</span>
                                          </button>
                                        )}
                                        {item.item_status !== 'cancelled' && (
                                          <button
                                            type="button"
                                            className="pos-item-action-btn cancel"
                                            onClick={() => handleUpdateItemStatus(item, 'cancelled')}
                                          >
                                            <Ban size={12} />
                                            <span>Siparişi İptal Et</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="pos-item-actions-wrapper" onClick={(e) => e.stopPropagation()}>
                                    <span className={`pos-item-status-pill ${item.item_status || 'pending'}`}>
                                      {item.item_status === 'delivered'
                                        ? 'TESLİM EDİLDİ'
                                        : item.item_status === 'ready'
                                          ? 'HAZIR'
                                          : 'MUTFAKTA'}
                                    </span>
                                    {item.item_status !== 'delivered' && (
                                      <button
                                        type="button"
                                        className="pos-btn-deliver-compact"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeliverItem(item.id);
                                        }}
                                        title="Ürünü Teslim Edildi Olarak İşaretle"
                                      >
                                        <Check size={11} />
                                        <span>Teslim Et</span>
                                      </button>
                                    )}

                                    {/* İşlem Menüsü (İkram, İade, İptal) */}
                                    <button
                                      type="button"
                                      className="pos-btn-action-menu"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActionDropdownItemId(prev => prev === item.id ? null : item.id);
                                      }}
                                      title="İkram, İade veya İptal İşlemleri"
                                    >
                                      <MoreHorizontal size={13} />
                                    </button>

                                    {/* Mobilde Teslim Et Butonu Yerine Adet Stepper'ı */}
                                    <div className="pos-item-mobile-qty-wrap">
                                      <div className="pos-qty-stepper compact">
                                        <button
                                          type="button"
                                          className="pos-stepper-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleUpdatePayQty(item.id, -1, item.quantity);
                                          }}
                                          disabled={currentPayQty <= 1 || !isSelected}
                                          title="Ödenecek Adedi Azalt"
                                        >
                                          <Minus size={11} />
                                        </button>
                                        <span
                                          className="pos-stepper-val"
                                          title={`Masada ${item.quantity} adet mevcut, ${currentPayQty} adedi tahsilata dahil`}
                                        >
                                          {currentPayQty}/{item.quantity}
                                        </span>
                                        <button
                                          type="button"
                                          className="pos-stepper-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleUpdatePayQty(item.id, +1, item.quantity);
                                          }}
                                          disabled={currentPayQty >= item.quantity || !isSelected}
                                          title="Ödenecek Adedi Artır"
                                        >
                                          <Plus size={11} />
                                        </button>
                                      </div>
                                    </div>

                                    {actionDropdownItemId === item.id && (
                                      <div className={`pos-item-action-dropdown ${isNearBottom ? 'dropdown-up' : ''}`} onClick={(e) => e.stopPropagation()}>
                                        {item.item_status !== 'delivered' && (
                                          <button
                                            type="button"
                                            className="pos-item-action-btn deliver"
                                            onClick={() => handleUpdateItemStatus(item, 'delivered')}
                                          >
                                            <Check size={12} />
                                            <span>Teslim Edildi</span>
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          className="pos-item-action-btn complimentary"
                                          onClick={() => handleUpdateItemStatus(item, 'complimentary')}
                                        >
                                          <Gift size={12} />
                                          <span>İkram Yap</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="pos-item-action-btn return"
                                          onClick={() => handleUpdateItemStatus(item, 'returned')}
                                        >
                                          <RotateCcw size={12} />
                                          <span>İade Al</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="pos-item-action-btn cancel"
                                          onClick={() => handleUpdateItemStatus(item, 'cancelled')}
                                        >
                                          <Ban size={12} />
                                          <span>Siparişi İptal Et</span>
                                        </button>
                                        {item.item_status !== 'pending' && (
                                          <button
                                            type="button"
                                            className="pos-item-action-btn pending"
                                            onClick={() => handleUpdateItemStatus(item, 'pending')}
                                          >
                                            <Utensils size={12} />
                                            <span>Mutfakta Durumu</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {item.note && (
                                  <span className="pos-row-item-note">"{item.note}"</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Miktar & Kontroller */}
                          <div className="pos-col-qty" onClick={(e) => e.stopPropagation()}>
                            {isPaid || isSpecial ? (
                              <div className="pos-qty-paid-badge-wrap">
                                <span className={`pos-stepper-val ${isPaid ? 'paid' : item.item_status}`}>
                                  {item.quantity} Adet
                                </span>
                              </div>
                            ) : (
                              <div className="pos-qty-stepper">
                                <button
                                  type="button"
                                  className="pos-stepper-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdatePayQty(item.id, -1, item.quantity);
                                  }}
                                  disabled={currentPayQty <= 1 || !isSelected}
                                  title="Ödenecek Adedi Azalt"
                                >
                                  <Minus size={12} />
                                </button>
                                <span
                                  className="pos-stepper-val"
                                  title={`Masada ${item.quantity} adet mevcut, ${currentPayQty} adedi tahsilata dahil`}
                                >
                                  {currentPayQty}/{item.quantity}
                                </span>
                                <button
                                  type="button"
                                  className="pos-stepper-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdatePayQty(item.id, +1, item.quantity);
                                  }}
                                  disabled={currentPayQty >= item.quantity || !isSelected}
                                  title="Ödenecek Adedi Artır"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Tutar */}
                          <div className="pos-col-price">
                            {isPaid ? (
                              <span style={{ fontWeight: 700, color: '#2d6a4f', fontSize: '0.95rem' }}>
                                ₺{parseFloat(item.total_price || 0).toFixed(2)}
                              </span>
                            ) : item.item_status === 'complimentary' ? (
                              <>
                                <span style={{ fontWeight: 700, color: '#6b21a8', fontSize: '0.95rem' }}>
                                  ₺0.00
                                </span>
                                <span style={{ display: 'block', fontSize: '0.72rem', color: '#9333ea', fontWeight: 600 }}>
                                  (İKRAM)
                                </span>
                              </>
                            ) : item.item_status === 'returned' ? (
                              <>
                                <span style={{ fontWeight: 600, color: '#c2410c', fontSize: '0.92rem', textDecoration: 'line-through' }}>
                                  ₺{parseFloat(item.total_price || 0).toFixed(2)}
                                </span>
                                <span style={{ display: 'block', fontSize: '0.72rem', color: '#ea580c', fontWeight: 600 }}>
                                  (İADE)
                                </span>
                              </>
                            ) : item.item_status === 'cancelled' ? (
                              <>
                                <span style={{ fontWeight: 600, color: '#b91c1c', fontSize: '0.92rem', textDecoration: 'line-through' }}>
                                  ₺{parseFloat(item.total_price || 0).toFixed(2)}
                                </span>
                                <span style={{ display: 'block', fontSize: '0.72rem', color: '#dc2626', fontWeight: 600 }}>
                                  (İPTAL)
                                </span>
                              </>
                            ) : (
                              <>
                                <span style={{ fontWeight: isSelected ? 700 : 600, color: isSelected ? '#346c80' : '#4a332d', fontSize: '0.95rem' }}>
                                  ₺{parseFloat(item.total_price || 0).toFixed(2)}
                                </span>
                                <span className="pos-unit-price-sub" style={{ display: 'block', fontSize: '0.72rem', color: '#486b78', fontWeight: 500 }}>
                                  (Adet: ₺{parseFloat(item.unit_price || 0).toFixed(2)})
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Tablo Alt Çubuğu */}
                <div className="pos-payment-center-footer">
                  <div className="pos-footer-metrics-bar">
                    {/* 1. Ödenmiş */}
                    <div className={`pos-metric-card paid ${paidTotal > 0 ? 'has-paid' : ''}`}>
                      <span className="pos-metric-label">Ödenmiş</span>
                      <strong className="pos-metric-val">₺{paidTotal.toFixed(2)}</strong>
                    </div>

                    {/* 2. Kalan Tutar */}
                    <div className={`pos-metric-card remaining ${remainingTotal > 0 ? 'has-rem' : 'all-cleared'}`}>
                      <span className="pos-metric-label">Kalan Tutar</span>
                      <strong className="pos-metric-val">₺{remainingTotal.toFixed(2)}</strong>
                    </div>

                    {/* 3. Genel Toplam (En Sağda & En Odakta) */}
                    <div className="pos-metric-card total focus-total">
                      <span className="pos-metric-label">Genel Toplam</span>
                      <strong className="pos-metric-val">₺{grandTotal.toFixed(2)}</strong>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

        </main>

        {/* ======================================================== */}
        {/* SAĞ PANEL (GENİŞLETİLMİŞ SEPET VEYA TAHSHİLAT PANELİ)     */}
        {/* ======================================================== */}
        <aside className="pos-right-panel">

          {/* -------------------------------------------------------- */}
          {/* SAĞ PANEL DURUM 1: SEPET (FERAH VE GENİŞ TASARIM)        */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'order' && (
            <div className="pos-cart-panel-card" id="pos-cart-panel">

              {/* Sepet Başlığı */}
              <div className="pos-cart-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShoppingBag size={18} color="#346c80" />
                  <h3 className="pos-cart-title">Sipariş Sepeti</h3>
                </div>
                <span className="pos-cart-count-badge">{cartItemCount} Ürün</span>
              </div>

              {/* Masada Daha Önce Eklenmiş Kalemler Bilgisi */}
              {displayedSavedItems.length > 0 && (
                <div
                  className="pos-cart-existing-orders-summary"
                  onClick={() => setActiveTab('payment')}
                  title="Masadaki tüm ürünleri ve adisyonu görüntülemek için tıklayın"
                  style={{ cursor: 'pointer' }}
                >
                  <span>Masada: <strong>{displayedSavedItems.length} Kalem</strong></span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {paidSavedItems.length > 0 && (
                      <span className="pos-summary-badge-paid">{paidSavedItems.length} Ödendi</span>
                    )}
                    <span style={{ fontSize: '0.72rem', color: '#346c80', fontWeight: 600 }}>Adisyona Git &rsaquo;</span>
                  </div>
                </div>
              )}

              {/* Masada Ödenecek Bakiye Yoksa Hızlı Kapatma Butonu (İkram/İade/Tamamı Ödenmiş) */}
              {remainingTotal <= 0.05 && displayedSavedItems.length > 0 && cartItems.length === 0 && (
                <div style={{ padding: '0 12px 10px 12px' }}>
                  <button
                    type="button"
                    onClick={handleEmptyTable}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #2d6a4f 0%, #1b4332 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      fontSize: '0.88rem',
                      fontWeight: '800',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      cursor: 'pointer',
                      boxShadow: '0 3px 10px rgba(45, 106, 79, 0.28)'
                    }}
                  >
                    <Check size={16} />
                    <span>Masayı Kapat & Boşalt (0.00 ₺)</span>
                  </button>
                </div>
              )}

              {/* Sepet Kalemleri */}
              <div className="pos-cart-items-wrap">
                {cartItems.length === 0 ? (
                  <div className="pos-cart-empty-state">
                    <ShoppingBag size={38} color="#d4c9bf" />
                    <p>Sepetiniz şu anda boş.</p>
                    <span>Sol taraftaki menüden ürün seçebilirsiniz</span>
                  </div>
                ) : (
                  cartItems.map(item => {
                    const isNoteOpen = openNoteProductIds.includes(item.product.id) || !!item.note;
                    return (
                      <div key={item.product.id} className="pos-cart-item-block">
                        <div className="pos-cart-row">
                          {/* Küçük Önizleme */}
                          <div className="pos-cart-row-thumb">
                            {item.product.image_url ? (
                              <img src={item.product.image_url} alt={item.product.name} />
                            ) : (
                              <Coffee size={14} color="#346c80" />
                            )}
                          </div>

                          {/* Bilgiler (Ürün Adı ve Kalem Butonu) */}
                          <div className="pos-cart-row-info">
                            <div className="pos-cart-row-name-wrap">
                              <span className="pos-cart-row-name" title={item.product.name}>
                                {item.product.name}
                              </span>
                              <button
                                type="button"
                                className={`pos-cart-note-trigger-btn ${item.note ? 'has-note' : ''}`}
                                onClick={() => toggleNoteInput(item.product.id)}
                                title={item.note ? 'Sipariş Notunu Düzenle' : 'Sipariş Notu Ekle'}
                              >
                                <Pencil size={11} />
                              </button>
                            </div>
                            <span className="pos-cart-row-unit-price">
                              ₺{item.unit_price.toFixed(2)} / ad
                            </span>
                          </div>

                          {/* Adet Kontrolleri */}
                          <div className="pos-cart-stepper">
                            <button
                              type="button"
                              className="pos-cart-step-btn"
                              onClick={() => handleUpdateCartQuantity(item.product.id, -1)}
                            >
                              <Minus size={11} />
                            </button>
                            <span className="pos-cart-step-val">{item.quantity}</span>
                            <button
                              type="button"
                              className="pos-cart-step-btn"
                              onClick={() => handleUpdateCartQuantity(item.product.id, +1)}
                            >
                              <Plus size={11} />
                            </button>
                          </div>

                          {/* Toplam */}
                          <span className="pos-cart-row-total">
                            ₺{(item.quantity * item.unit_price).toFixed(2)}
                          </span>

                          {/* Sil */}
                          <button
                            type="button"
                            className="pos-cart-trash-btn"
                            onClick={() => handleRemoveFromCart(item.product.id)}
                            title="Sepetten Sil"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Açılır / Girilen Not Kutusu */}
                        {isNoteOpen && (
                          <div className="pos-cart-inline-note-box">
                            <input
                              type="text"
                              className="pos-cart-note-input"
                              placeholder="Not ekle... (Örn: Şekerli, orta, az buzlu)"
                              value={item.note || ''}
                              onChange={(e) => handleUpdateCartItemNote(item.product.id, e.target.value)}
                            />
                            {item.note && (
                              <button
                                type="button"
                                className="pos-cart-note-clear-btn"
                                onClick={() => handleUpdateCartItemNote(item.product.id, '')}
                                title="Notu Temizle"
                              >
                                <X size={11} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Sepet Alt Toplam ve Onay Butonu */}
              <div className="pos-cart-footer">
                <div className="pos-cart-total-row">
                  <span className="pos-cart-total-label">Sipariş Tutarı</span>
                  <span className="pos-cart-total-val">₺{cartTotal.toFixed(2)}</span>
                </div>

                <button
                  type="button"
                  className="pos-btn-submit-order"
                  disabled={cartItems.length === 0 || isSubmittingOrder}
                  onClick={handleCompleteOrder}
                >
                  {isSubmittingOrder ? (
                    <>
                      <div className="cat-btn-spinner"></div>
                      <span>Sipariş İletiliyor...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Siparişi Onayla</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* SAĞ PANEL DURUM 2: HESAP ÖDEME & TAHSİLAT PANELİ         */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'payment' && (
            <div className="pos-checkout-panel-card">

              {/* Üst Kısım: Tahsil Edilecek Tutar (Sol) ve Bahşiş/İndirim Altlı Üstlü (Sağ) */}
              <div className="pos-checkout-amount-and-calc-grid">
                {/* Sol: Büyük Tutar Göstergesi */}
                <div className="pos-checkout-amount-display">
                  <div className="pos-checkout-amount-info">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span className="pos-checkout-amount-label">Tahsil Edilecek Tutar</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                      <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, color: finalPayableTotal > 0 ? '#1e7e34' : '#486b78' }}>₺</span>
                      <input
                        type="number"
                        step="any"
                        style={{
                          fontFamily: 'Outfit, sans-serif',
                          fontSize: '1.85rem',
                          fontWeight: 900,
                          color: finalPayableTotal > 0 ? '#1e7e34' : '#486b78',
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          width: '100%',
                          padding: 0
                        }}
                        value={
                          selectedItemIds.length > 0
                            ? finalPayableTotal.toFixed(2)
                            : isCustomAmountFocused
                              ? customAmountToPay
                              : (finalPayableTotal > 0 ? finalPayableTotal.toFixed(2) : (customAmountToPay !== '' ? customAmountToPay : '0.00'))
                        }
                        onChange={(e) => {
                          if (selectedItemIds.length === 0) {
                            setCustomAmountToPay(e.target.value);
                          }
                        }}
                        onFocus={() => {
                          setIsCustomAmountFocused(true);
                          if (selectedItemIds.length === 0 && (customAmountToPay === '' || customAmountToPay === '0.00' || customAmountToPay === '0')) {
                            setCustomAmountToPay('');
                          }
                        }}
                        onBlur={() => setIsCustomAmountFocused(false)}
                        disabled={selectedItemIds.length > 0}
                        title={selectedItemIds.length > 0 ? 'Tablodan ürün seçildiğinde ve bahşiş/indirim girildiğinde tutar otomatik hesaplanır' : 'Ödenecek tutarı girmek için tıklayıp yazabilirsiniz'}
                      />
                    </div>
                  </div>
                </div>

                {/* Sağ: Bahşiş ve İndirim (Altlı Üstlü) */}
                <div className="pos-calc-stacked-col">
                  {/* Bahşiş */}
                  <div className="pos-calc-input-group compact">
                    <div className="pos-calc-label-row">
                      <span className="pos-calc-title">Bahşiş</span>
                    </div>
                    <div className="pos-calc-input-box tip compact">
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={tipAmount || ''}
                        onChange={(e) => setTipAmount(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                      <div className="pos-calc-stepper-vertical">
                        <button type="button" onClick={() => setTipAmount(prev => (prev || 0) + 10)}>
                          <ChevronUp size={10} />
                        </button>
                        <button type="button" onClick={() => setTipAmount(prev => Math.max(0, (prev || 0) - 10))}>
                          <ChevronDown size={10} />
                        </button>
                      </div>
                      <div className="pos-calc-currency-badge tip">₺</div>
                    </div>
                  </div>

                  {/* İndirim */}
                  <div className="pos-calc-input-group compact">
                    <div className="pos-calc-label-row">
                      <span className="pos-calc-title">İndirim</span>
                    </div>
                    <div className="pos-calc-input-box discount compact">
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={discountAmount || ''}
                        onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                      <div className="pos-calc-stepper-vertical">
                        <button type="button" onClick={() => setDiscountAmount(prev => (prev || 0) + 10)}>
                          <ChevronUp size={10} />
                        </button>
                        <button type="button" onClick={() => setDiscountAmount(prev => Math.max(0, (prev || 0) - 10))}>
                          <ChevronDown size={10} />
                        </button>
                      </div>
                      <div className="pos-calc-currency-badge discount">₺</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dörtlü Ödeme Şekli Seçimi: Nakit / Kredi Kartı / Parçalı / Veresiye */}
              <div className="pos-payment-method-row">
                <button
                  type="button"
                  className={`pos-method-btn cash ${paymentMethod === 'cash' ? 'active' : ''}`}
                  onClick={() => handleSelectPaymentMethod('cash')}
                >
                  <Banknote size={15} />
                  <span>Nakit</span>
                </button>

                <button
                  type="button"
                  className={`pos-method-btn card ${paymentMethod === 'credit_card' ? 'active' : ''}`}
                  onClick={() => handleSelectPaymentMethod('credit_card')}
                >
                  <CreditCard size={15} />
                  <span>Kredi Kartı</span>
                </button>

                <button
                  type="button"
                  className={`pos-method-btn mixed ${paymentMethod === 'mixed' ? 'active' : ''}`}
                  onClick={() => handleSelectPaymentMethod('mixed')}
                >
                  <Split size={15} />
                  <span>Parçalı / Karma</span>
                </button>

                <button
                  type="button"
                  className={`pos-method-btn veresiye ${paymentMethod === 'veresiye' ? 'active' : ''}`}
                  onClick={() => handleSelectPaymentMethod('veresiye')}
                >
                  <UserCheck size={15} />
                  <span>Veresiye / Cari</span>
                </button>
              </div>

              {/* Yönteme Göre Dinamik Alanlar */}
              {/* Parçalı / Karma: Nakit & Kart Eş Zamanlı Dengeleme */}
              {paymentMethod === 'mixed' && (
                <div className="pos-mixed-calculator-box">
                  <div className="pos-mixed-inputs-row">
                    <div className="pos-mixed-input-field cash-field">
                      <label><Banknote size={12} /> Nakit (₺)</label>
                      <div className="pos-mixed-input-wrapper cash">
                        <input
                          type="number"
                          step="1"
                          placeholder="0.00"
                          value={mixedCash}
                          onChange={(e) => handleMixedCashChange(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="pos-mixed-input-field card-field">
                      <label><CreditCard size={12} /> Kart (₺)</label>
                      <div className="pos-mixed-input-wrapper card">
                        <input
                          type="number"
                          step="1"
                          placeholder="0.00"
                          value={mixedCard}
                          onChange={(e) => handleMixedCardChange(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="pos-mixed-input-field veresiye-field">
                      <label><UserCheck size={12} /> Veresiye (₺)</label>
                      <div className="pos-mixed-input-wrapper veresiye">
                        <input
                          type="number"
                          step="1"
                          placeholder="0.00"
                          value={mixedVeresiye}
                          onChange={(e) => handleMixedVeresiyeChange(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Hızlı Eşit Bölme Seçenekleri */}
                  <div className="pos-mixed-auto-note">
                    <span>Hızlı Dağıt:</span>
                    <div className="pos-mixed-presets-wrap">
                      <button type="button" className="pos-btn-mixed-half" onClick={handleSetMixedHalfCashCard} title="50% Nakit - 50% Kart">
                        Nakit + Kart
                      </button>
                      <button type="button" className="pos-btn-mixed-half orange" onClick={handleSetMixedHalfCashVeresiye} title="50% Nakit - 50% Veresiye">
                        Nakit + Veresiye
                      </button>
                      <button type="button" className="pos-btn-mixed-half orange" onClick={handleSetMixedHalfCardVeresiye} title="50% Kart - 50% Veresiye">
                        Kart + Veresiye
                      </button>
                    </div>
                  </div>

                  {/* Veresiye Tutarı Girilmişse Müşteri Seçimi Göster */}
                  {parseFloat(mixedVeresiye || 0) > 0 && (
                    <div className="pos-mixed-veresiye-box">
                      <div className="pos-mixed-veresiye-head">
                        <div className="pos-mixed-veresiye-title">
                          <UserCheck size={14} />
                          <span>Veresiye Yazılacak Cari:</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="pos-mixed-veresiye-amt-badge">
                            ₺{parseFloat(mixedVeresiye || 0).toFixed(2)}
                          </span>
                          <button
                            type="button"
                            className="pos-veresiye-top-add-btn"
                            onClick={() => {
                              setQuickCustName('');
                              setQuickCustPhone('0');
                              setQuickCustNotes('');
                              setQuickCustError('');
                              setShowQuickAddCustomerModal(true);
                            }}
                            title="Yeni Müşteri Ekle"
                          >
                            <UserPlus size={12} />
                            <span>+ Yeni</span>
                          </button>
                        </div>
                      </div>

                      {renderCustomerDropdown()}

                      <div className="pos-veresiye-note-field">
                        <label className="pos-veresiye-note-label">
                          <FileText size={12} />
                          <span>Vade / Açıklama Notu</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Örn: Kalan tutar haftaya ödenecek..."
                          value={veresiyeNote}
                          onChange={(e) => setVeresiyeNote(e.target.value)}
                          className="pos-veresiye-note-input"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Veresiye / Açık Hesap Girişi */}
              {paymentMethod === 'veresiye' && (
                <div className="pos-veresiye-card">
                  <div className="pos-veresiye-card-header">
                    <div className="pos-veresiye-title-wrap">
                      <div className="pos-veresiye-icon-pill">
                        <UserCheck size={18} />
                      </div>
                      <div>
                        <h4 className="pos-veresiye-heading">Veresiye</h4>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="pos-veresiye-top-add-btn"
                      onClick={() => {
                        setQuickCustName('');
                        setQuickCustPhone('0');
                        setQuickCustNotes('');
                        setQuickCustError('');
                        setShowQuickAddCustomerModal(true);
                      }}
                      title="Yeni Müşteri / Cari Ekle"
                    >
                      <UserPlus size={14} />
                      <span>+ Yeni Müşteri</span>
                    </button>
                  </div>

                  {renderCustomerDropdown()}

                  {/* Açıklama / Vade Notu */}
                  <div className="pos-veresiye-note-field">
                    <label className="pos-veresiye-note-label">
                      <FileText size={13} />
                      <span>Açıklama / Vade Notu <small>(İsteğe bağlı)</small></span>
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: Yarın ödenecek / Berber dükkanına teslim..."
                      value={veresiyeNote}
                      onChange={(e) => setVeresiyeNote(e.target.value)}
                      className="pos-veresiye-note-input"
                    />
                  </div>
                </div>
              )}

              {/* Hesap Sıfırlandıysa Masayı Boşaltma Bildirimi (Ödendi, İkram veya İade/İptal) */}
              {remainingTotal <= 0.05 && (
                <div className="pos-all-paid-card">
                  <CheckCircle2 size={32} color="#2d6a4f" />
                  <h4>
                    {paidTotal > 0
                      ? 'Masa Hesabı Tamamen Ödendi'
                      : savedItems.some(i => i.item_status === 'complimentary')
                        ? 'Tüm Ürünler İkram Edildi'
                        : 'Ödenecek Tutar Bulunmuyor'}
                  </h4>
                  <p>
                    {paidTotal > 0
                      ? 'Bu masaya ait tüm siparişlerin tahsilatı yapılmıştır.'
                      : savedItems.some(i => i.item_status === 'complimentary')
                        ? 'Masadaki ürünler ikram olarak verilmiştir (Kalan 0.00 ₺).'
                        : 'Masadaki tüm ürünler iade veya iptal edilmiştir.'}
                    {' '}Masayı kapatıp boşaltabilirsiniz.
                  </p>
                  <button
                    type="button"
                    className="pos-btn-empty-table-now"
                    onClick={handleEmptyTable}
                  >
                    <Check size={16} />
                    <span>Masayı Kapat & Boşalt</span>
                  </button>
                </div>
              )}

              {/* Büyük "Tahsilatı Tamamla" Butonu */}
              {remainingTotal > 0.05 && (
                <button
                  type="button"
                  className="pos-btn-confirm-payment"
                  disabled={finalPayableTotal <= 0 || isPaying}
                  onClick={handleConfirmPayment}
                >
                  {isPaying ? (
                    <>
                      <div className="cat-btn-spinner"></div>
                      <span>Tahsil Ediliyor...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Ödemeyi Onayla (₺{finalPayableTotal.toFixed(2)})</span>
                    </>
                  )}
                </button>
              )}

            </div>
          )}

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

      {/* ======================================================== */}
      {/* MASA ADİSYON FİŞİ YAZDIRMA PREVIEW MODALI                 */}
      {/* ======================================================== */}
      {showReceiptPreview && (
        <div className="pos-receipt-modal-overlay" onClick={() => setShowReceiptPreview(false)}>
          <div className="pos-receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-receipt-paper" id="printable-receipt">
              <div className="pos-paper-header">
                <h3 className="cafe-brand-title" style={{ fontSize: '1.25rem', justifyContent: 'center', display: 'flex' }}>
                  <span className="brand-ozgensoy">ÖZGENSOY</span>
                  <span className="brand-kafeterya">KAFETERYA</span>
                </h3>
                <p>MASA ADİSYON HESAP FİŞİ</p>
                <div className="pos-paper-divider"></div>
                <div className="pos-paper-meta">
                  <span>Masa: <strong>{table.title}</strong></span>
                  <span>Sipariş ID: <strong>{existingOrder?.order_number ? `#${existingOrder.order_number.replace(/-/g, '').slice(0, 8).toUpperCase()}` : 'YENİ'}</strong></span>
                  <span>Tarih: {new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="pos-paper-divider"></div>
              </div>

              <div className="pos-paper-items">
                {displayedSavedItems.map(item => {
                  const isComp = item.item_status === 'complimentary';
                  const isRet = item.item_status === 'returned';
                  const isCanc = item.item_status === 'cancelled';
                  const isSpecialItem = isComp || isRet || isCanc;

                  return (
                    <div key={item.id} className="pos-paper-row">
                      <span className="pos-paper-col-name">
                        {item.product_name} x{item.quantity}
                        {item.is_paid ? ' (ÖDENDİ)' : ''}
                        {isComp ? ' (İKRAM)' : ''}
                        {isRet ? ' (İADE)' : ''}
                        {isCanc ? ' (İPTAL)' : ''}
                      </span>
                      <span
                        className="pos-paper-col-total"
                        style={{ textDecoration: (isRet || isCanc) ? 'line-through' : 'none' }}
                      >
                        ₺{isSpecialItem ? '0.00' : parseFloat(item.total_price).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="pos-paper-divider"></div>

              <div className="pos-paper-totals">
                <div className="pos-paper-row">
                  <span>Masa Sipariş Toplamı:</span>
                  <span>₺{grandTotal.toFixed(2)}</span>
                </div>
                {paidTotal > 0 && (
                  <div className="pos-paper-row" style={{ color: '#2d6a4f' }}>
                    <span>Önceden Ödenen:</span>
                    <span>-₺{paidTotal.toFixed(2)}</span>
                  </div>
                )}
                {parseFloat(discountAmount || 0) > 0 && (
                  <div className="pos-paper-row">
                    <span>İndirim:</span>
                    <span>-₺{parseFloat(discountAmount).toFixed(2)}</span>
                  </div>
                )}
                {parseFloat(tipAmount || 0) > 0 && (
                  <div className="pos-paper-row">
                    <span>Bahşiş:</span>
                    <span>+₺{parseFloat(tipAmount).toFixed(2)}</span>
                  </div>
                )}
                <div className="pos-paper-row total">
                  <span>ÖDENECEK KALAN</span>
                  <span>₺{finalPayableTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="pos-paper-footer">
                <p>Bizi tercih ettiğiniz için teşekkür ederiz!</p>
                <small>Afiyet Olsun</small>
              </div>
            </div>

            <div className="pos-receipt-modal-actions">
              <button
                type="button"
                className="pos-btn-print-now"
                onClick={() => window.print()}
              >
                <Printer size={16} />
                <span>Yazdır</span>
              </button>
              <button
                type="button"
                className="pos-btn-close-paper"
                onClick={() => setShowReceiptPreview(false)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Çoklu Adet Durum Bölme Modalı */}
      {statusPrompt && (
        <div className="pos-confirm-modal-overlay" onClick={() => setStatusPrompt(null)}>
          <div className="pos-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-confirm-head">
              <h4>
                {statusPrompt.targetStatus === 'complimentary'
                  ? '🎁 İkram Adedi Belirleyin'
                  : statusPrompt.targetStatus === 'returned'
                    ? '↩️ İade Adedi Belirleyin'
                    : statusPrompt.targetStatus === 'cancelled'
                      ? '🚫 İptal Adedi Belirleyin'
                      : 'Durum Güncelleme Adedi'}
              </h4>
              <button
                type="button"
                className="pos-confirm-close"
                onClick={() => setStatusPrompt(null)}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: '12px 0 6px 0', fontSize: '0.88rem', color: '#5c4333' }}>
              <strong>{statusPrompt.item.product_name}</strong> ürününden masada toplam <strong>{statusPrompt.item.quantity} Adet</strong> bulunuyor.
            </p>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: '#486b78' }}>
              Kaç adeti{' '}
              <strong>
                {statusPrompt.targetStatus === 'complimentary'
                  ? 'İkram'
                  : statusPrompt.targetStatus === 'returned'
                    ? 'İade'
                    : statusPrompt.targetStatus === 'cancelled'
                      ? 'İptal'
                      : 'Teslim'}
              </strong>{' '}
              olarak işaretlensin?
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="pos-btn-split-opt"
                onClick={() => handleUpdateItemStatus(statusPrompt.item, statusPrompt.targetStatus, 1)}
              >
                1 Adet
              </button>
              <button
                type="button"
                className="pos-btn-split-opt primary"
                onClick={() => handleUpdateItemStatus(statusPrompt.item, statusPrompt.targetStatus, statusPrompt.item.quantity)}
              >
                Tümü ({statusPrompt.item.quantity} Adet)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MOBİL SEPET ÇEKMECESİ (SLIDE-UP BOTTOM SHEET DRAWER)     */}
      {/* ======================================================== */}
      {activeTab === 'order' && cartItems.length > 0 && (
        <div
          className={`pos-mobile-cart-drawer ${(isMobileCartDrawerOpen || isDragging) ? 'open' : ''}`}
          aria-hidden={!isMobileCartDrawerOpen && !isDragging}
        >
          {/* Karartma Backdrop */}
          <div
            className="pos-mobile-cart-backdrop"
            style={isDragging ? {
              opacity: Math.max(0, Math.min(1, 1 - (dragOffsetY / (window.innerHeight * 0.75)))),
              transition: 'none'
            } : undefined}
            onClick={() => {
              setIsMobileCartDrawerOpen(false);
              setDragOffsetY(0);
            }}
          />

          {/* Çekmece Gövdesi (Sabit %75 Yükseklik & Anlık Sürükleme Takibi) */}
          <div
            className="pos-mobile-cart-sheet"
            style={isDragging ? {
              transform: `translateY(${dragOffsetY}px)`,
              transition: 'none'
            } : undefined}
          >
            {/* Sürükleme Çubuğu (Drag Handle) */}
            <div
              className="pos-sheet-drag-handle-wrap"
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              onClick={() => {
                setIsMobileCartDrawerOpen(false);
                setDragOffsetY(0);
              }}
              title="Aşağı sürükleyerek kapat"
            >
              <div className="pos-sheet-drag-handle" />
            </div>

            {/* Başlık ve Kapat Butonu */}
            <div
              className="pos-sheet-header"
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
            >
              <div className="pos-sheet-header-left">
                <ShoppingBag size={18} color="#346c80" />
                <h3 className="pos-sheet-title">Sipariş Sepeti</h3>
                <span className="pos-sheet-count-badge">{cartItemCount} Ürün</span>
              </div>
              <button
                type="button"
                className="pos-sheet-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMobileCartDrawerOpen(false);
                  setDragOffsetY(0);
                }}
                title="Sepeti Kapat (Menüye Dön)"
              >
                <X size={17} />
              </button>
            </div>

            {/* Sepet Ürünleri Listesi */}
            <div className="pos-sheet-items-scroll">
              {cartItems.map(item => {
                const isNoteOpen = openNoteProductIds.includes(item.product.id) || !!item.note;
                return (
                  <div key={item.product.id} className="pos-sheet-item-card">
                    {/* 1. Satır: Görsel, Ürün Adı (Tam Genişlik), Birim Fiyat & Silme Butonu */}
                    <div className="pos-sheet-item-top-row">
                      <div className="pos-sheet-item-thumb">
                        {item.product.image_url ? (
                          <img src={item.product.image_url} alt={item.product.name} />
                        ) : (
                          <Coffee size={18} color="#346c80" />
                        )}
                      </div>

                      <div className="pos-sheet-item-info">
                        <strong className="pos-sheet-item-name" title={item.product.name}>
                          {item.product.name}
                        </strong>
                        <div className="pos-sheet-item-subline">
                          <span className="pos-sheet-item-unit-price">
                            ₺{item.unit_price.toFixed(2)} / ad
                          </span>
                          {item.note && !isNoteOpen && (
                            <span className="pos-sheet-note-preview-badge" title={item.note}>
                              <Pencil size={10} />
                              <span>"{item.note}"</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="pos-sheet-trash-btn"
                        onClick={() => handleRemoveFromCart(item.product.id)}
                        title="Ürünü Çıkar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* 2. Satır: Not Ekle Butonu (Sol) & Stepper + Toplam Tutar (Sağ) */}
                    <div className="pos-sheet-item-bottom-row">
                      <button
                        type="button"
                        className={`pos-sheet-note-btn ${item.note ? 'has-note' : ''}`}
                        onClick={() => toggleNoteInput(item.product.id)}
                        title={item.note ? 'Sipariş Notunu Düzenle' : 'Sipariş Notu Ekle'}
                      >
                        <Pencil size={11} />
                        <span>{item.note ? 'Notu Düzenle' : '+ Not Ekle'}</span>
                      </button>

                      <div className="pos-sheet-controls-group">
                        <div className="pos-sheet-stepper">
                          <button
                            type="button"
                            className="pos-sheet-step-btn"
                            onClick={() => handleUpdateCartQuantity(item.product.id, -1)}
                          >
                            <Minus size={13} />
                          </button>
                          <span className="pos-sheet-step-val">{item.quantity}</span>
                          <button
                            type="button"
                            className="pos-sheet-step-btn"
                            onClick={() => handleUpdateCartQuantity(item.product.id, +1)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        <span className="pos-sheet-item-total">
                          ₺{(item.quantity * item.unit_price).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* 3. Satır: Açılır Not Alanı */}
                    {isNoteOpen && (
                      <div className="pos-sheet-note-box">
                        <input
                          type="text"
                          className="pos-sheet-note-input"
                          placeholder="Sipariş notu ekleyin (örn: Az şekerli, soğuk süt...)"
                          value={item.note || ''}
                          onChange={(e) => handleUpdateCartItemNote(item.product.id, e.target.value)}
                        />
                        {item.note && (
                          <button
                            type="button"
                            className="pos-sheet-note-clear-btn"
                            onClick={() => handleUpdateCartItemNote(item.product.id, '')}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Çekmece Alt Kısmı: Toplam ve Onayla Butonu */}
            <div className="pos-sheet-footer">
              <div className="pos-sheet-total-bar">
                <div className="pos-sheet-total-text">
                  <span>Toplam Tutar:</span>
                  <strong>₺{cartTotal.toFixed(2)}</strong>
                </div>
                <span className="pos-sheet-item-count-sub">({cartItemCount} Ürün)</span>
              </div>

              <button
                type="button"
                className="pos-sheet-submit-btn"
                disabled={cartItems.length === 0 || isSubmittingOrder}
                onClick={handleCompleteOrder}
              >
                {isSubmittingOrder ? (
                  <>
                    <div className="cat-btn-spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' }}></div>
                    <span>Sipariş Mutfağa İletiliyor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    <span>Siparişi Onayla</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Müşteri / Cari Ekleme Modalı */}
      {showQuickAddCustomerModal && (
        <div className="pos-receipt-modal-overlay" style={{ zIndex: 1400 }} onClick={() => setShowQuickAddCustomerModal(false)}>
          <div className="cust-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="cust-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="cust-modal-icon">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="cust-modal-title">Yeni Müşteri / Cari Ekle</h3>
                  <p className="cust-modal-subtitle">
                    Hesabı bu müşteriye yazmak için müşteri kartı oluşturun.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="cust-modal-close-btn"
                onClick={() => setShowQuickAddCustomerModal(false)}
                title="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveQuickCustomer} className="cust-modal-form">
              {quickCustError && (
                <div className="cust-form-alert danger">
                  <AlertCircle size={16} />
                  <span>{quickCustError}</span>
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
                    value={quickCustName}
                    onChange={(e) => {
                      setQuickCustName(toTitleCaseTr(e.target.value));
                      if (quickCustError) setQuickCustError('');
                    }}
                    autoFocus
                    className="cust-input"
                  />
                </div>
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
                    value={quickCustPhone}
                    onChange={(e) => {
                      setQuickCustPhone(formatLeadingZeroPhone(e.target.value));
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Backspace' || e.key === 'Delete') && e.target.selectionStart <= 1 && quickCustPhone.length <= 1) {
                        e.preventDefault();
                      }
                    }}
                    className="cust-input font-mono"
                  />
                </div>
                <span className="cust-input-hint">
                  Başlangıçtaki "0" sabittir.
                </span>
              </div>

              {/* Açıklama / Not */}
              <div className="cust-form-group">
                <label className="cust-form-label">
                  Kısa Açıklama & Not <span className="opt">(İsteğe bağlı)</span>
                </label>
                <div className="cust-input-wrapper">
                  <FileText size={16} className="cust-input-icon" style={{ alignSelf: 'flex-start', marginTop: '10px' }} />
                  <textarea
                    rows="2"
                    placeholder="Örn: Berber Ali, komşu esnaf, mavi arabalı müşteri vb."
                    value={quickCustNotes}
                    onChange={(e) => setQuickCustNotes(e.target.value)}
                    className="cust-textarea"
                  ></textarea>
                </div>
              </div>

              {/* Form Butonları */}
              <div className="cust-modal-foot">
                <button
                  type="button"
                  className="cust-btn-cancel"
                  onClick={() => setShowQuickAddCustomerModal(false)}
                  disabled={isSubmittingQuickCust}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="customers-btn-primary"
                  disabled={isSubmittingQuickCust}
                >
                  {isSubmittingQuickCust ? 'Kaydediliyor...' : 'Kaydet ve Seç'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Bildirimi */}
      {toast && (
        <div className={`cat-toast ${toast.type || 'info'}`} style={{ zIndex: 1300 }}>
          <div className="cat-toast-icon">
            {toast.type === 'success' && <CheckCircle2 size={20} color="#4ade80" />}
            {toast.type === 'danger' && <AlertCircle size={20} color="#f87171" />}
            {toast.type === 'info' && <Sparkles size={20} color="#e5a968" />}
          </div>
          <span>{toast.message}</span>
        </div>
      )}

    </div>
  );
}
