import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingBag, Plus, Minus, X, Search, Clock, CheckCircle2, ChefHat, BellRing,
  XCircle, Receipt, MessageSquareText, ChevronRight, ChevronLeft, QrCode, Armchair, BookOpen
} from 'lucide-react';
import { io } from 'socket.io-client';
import { thumbSrc, handleThumbError } from '../lib/images';

// Barındırma her alan adını ayrı süreçte çalıştırır: sipariş ve canlı bildirim personelin bağlı olduğu süreçten geçmeli.
// Canlı derlemede VITE_MENU_API_URL panel adresidir; geliştirmede boştur ve istekler aynı adrese gider.
const API_BASE = (import.meta.env.VITE_MENU_API_URL || '').replace(/\/+$/, '');

/*
 * QR MENÜ (müşteri)
 * Masa, QR koddaki anahtardan bilinir; müşteri masa seçmez.
 * Sipariş önce "onay bekliyor" olur, garson onaylayınca mutfağa gider; durum bu ekrandan izlenir.
 */

const money = (n) => `₺${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MAX_QTY = 20;
const POLL_MS = 10000;
const ORDERING_CLOSED_TEXT = 'Menüyü inceleyip siparişinizi garsonunuza verebilirsiniz.';

// Bu telefona özel rastgele kimlik (müşteri yalnızca kendi siparişlerini görür)
const getSession = () => {
  try {
    let s = localStorage.getItem('qr_session');
    if (!s || !/^[A-Za-z0-9_-]{16,64}$/.test(s)) {
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      s = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem('qr_session', s);
    }
    return s;
  } catch {
    return `oturum${Date.now()}${Math.random().toString(36).slice(2)}`.slice(0, 40);
  }
};

// Karşılama ekranı her yeni açılışta bir kez gösterilir (sayfa yenilenince tekrar çıkmaz)
const enteredKey = (token) => `qr_entered_${token}`;
const wasEntered = (token) => { try { return sessionStorage.getItem(enteredKey(token)) === '1'; } catch { return false; } };

const loadCart = (token) => { try { return JSON.parse(localStorage.getItem(`qr_cart_${token}`)) || []; } catch { return []; } };
const saveCart = (token, cart) => { try { localStorage.setItem(`qr_cart_${token}`, JSON.stringify(cart)); } catch { /* depolama kapalı olabilir */ } };

// Siparişin müşteriye gösterilen genel durumu
const orderStage = (o) => {
  if (o.status === 'pending') return { key: 'pending', label: 'Onay bekliyor', Icon: Clock };
  if (o.status === 'rejected') return { key: 'rejected', label: 'Onaylanmadı', Icon: XCircle };
  const live = o.progress.filter(p => !['cancelled', 'returned'].includes(p.status));
  if (!live.length) return { key: 'rejected', label: 'İptal edildi', Icon: XCircle };
  if (live.every(p => ['delivered', 'complimentary'].includes(p.status) || p.is_paid)) return { key: 'delivered', label: 'Teslim edildi', Icon: CheckCircle2 };
  if (live.every(p => ['ready', 'delivered', 'complimentary'].includes(p.status))) return { key: 'ready', label: 'Hazır, geliyor', Icon: BellRing };
  if (live.some(p => p.status === 'preparing')) return { key: 'preparing', label: 'Hazırlanıyor', Icon: ChefHat };
  return { key: 'queued', label: 'Onaylandı, sırada', Icon: ChefHat };
};
const ITEM_STATUS = {
  pending: 'Sırada', preparing: 'Hazırlanıyor', ready: 'Hazır', delivered: 'Teslim edildi',
  cancelled: 'İptal', returned: 'İade', complimentary: 'İkram'
};
const STEPS = ['pending', 'queued', 'preparing', 'ready', 'delivered'];
const STEP_LABELS = ['Alındı', 'Onaylandı', 'Hazırlanıyor', 'Hazır', 'Teslim'];

export default function MenuApp({ token }) {
  const session = useMemo(getSession, []);
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState('menu'); // 'menu' | 'orders'
  const [entered, setEntered] = useState(() => (token ? wasEntered(token) : true)); // Masasız inceleme: karşılama ekranı masaya özeldir
  const [activeCat, setActiveCat] = useState(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState(() => (token ? loadCart(token) : []));
  const [detail, setDetail] = useState(null); // ürün detayı (not ekleme)
  const [cartOpen, setCartOpen] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [orders, setOrders] = useState([]);
  const catBarRef = useRef(null);

  useEffect(() => { if (token) saveCart(token, cart); }, [token, cart]);

  // Menü (ilk açılışta; ayrıca işletme QR siparişi açıp kapatınca sessizce yenilenir)
  const loadMenu = useCallback(async ({ silent = false } = {}) => {
    try {
      const r = await fetch(`${API_BASE}/api/public/menu${token ? `/${token}` : ''}`);
      const data = await r.json();
      if (!r.ok) { if (!silent || r.status === 404) setError(r.status === 404 ? 'invalid' : 'server'); return; }
      setMenu(data);
      // Menüden kalkan ürünleri sepetten çıkar
      const ids = new Set(data.products.map(p => p.id));
      setCart(c => c.filter(l => ids.has(l.product_id)));
    } catch {
      if (!silent) setError('server');
    }
  }, [token]);
  useEffect(() => { loadMenu(); }, [loadMenu]);
  const orderingEnabled = menu?.ordering_enabled !== false;

  // Siparişlerim (onay ve hazırlık durumunu canlı izlemek için düzenli yenilenir)
  const loadOrders = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE}/api/public/menu/${token}/orders?session=${encodeURIComponent(session)}`);
      const data = await r.json();
      if (data.success) setOrders(data.orders);
    } catch { /* bağlantı geçici olarak kopmuş olabilir */ }
  }, [token, session]);
  useEffect(() => {
    if (!token) return undefined;
    loadOrders();

    // Canlı kanal: garson onaylayınca / mutfak durumu değişince sunucu "değişti" sinyali gönderir
    let pending = null;
    const refresh = () => { clearTimeout(pending); pending = setTimeout(loadOrders, 250); };
    const socket = io(`${API_BASE}/menu`, { auth: { token } });
    socket.on('menu:orders-changed', refresh);
    socket.on('connect', refresh); // bağlantı koptuysa arada kaçan değişiklikleri al
    socket.on('menu:settings-changed', () => loadMenu({ silent: true }));

    // Yedek: canlı bağlantı yoksa düzenli yenile; telefona geri dönülünce hemen yenile
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !socket.connected) loadOrders();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(pending);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      socket.disconnect();
    };
  }, [token, loadOrders, loadMenu]);

  const products = menu?.products || [];
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const q = search.trim().toLocaleLowerCase('tr-TR');
  const visibleProducts = q ? products.filter(p => [p.name, p.description].some(v => v?.toLocaleLowerCase('tr-TR').includes(q))) : products;

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = cart.reduce((s, l) => s + l.quantity * (productById.get(l.product_id)?.price || 0), 0);
  const qtyInCart = (id) => cart.filter(l => l.product_id === id).reduce((s, l) => s + l.quantity, 0);
  const activeOrders = orders.filter(o => !['delivered', 'rejected'].includes(orderStage(o).key)).length;

  const addToCart = (productId, quantity = 1, note = '') => {
    setCart(c => {
      const key = `${productId}|${note.trim()}`;
      const idx = c.findIndex(l => `${l.product_id}|${l.note}` === key);
      if (idx >= 0) {
        const copy = [...c];
        copy[idx] = { ...copy[idx], quantity: Math.min(MAX_QTY, copy[idx].quantity + quantity) };
        return copy;
      }
      return [...c, { product_id: productId, quantity: Math.min(MAX_QTY, quantity), note: note.trim() }];
    });
  };
  const changeLine = (index, delta) => setCart(c => c
    .map((l, i) => (i === index ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + delta) } : l))
    .filter(l => l.quantity > 0));
  const quickRemove = (productId) => setCart(c => {
    const idx = c.map(l => l.product_id).lastIndexOf(productId);
    if (idx < 0) return c;
    return c.map((l, i) => (i === idx ? { ...l, quantity: l.quantity - 1 } : l)).filter(l => l.quantity > 0);
  });

  // Kategori sayfaları tarayıcı geçmişine yazılır: telefonun "geri" tuşu kategorilere döndürür
  useEffect(() => {
    const onPop = (e) => { setActiveCat(e.state?.qmCat ?? null); window.scrollTo({ top: 0 }); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const openCategory = (id) => {
    if (window.history.state?.qmCat != null) window.history.replaceState({ qmCat: id }, '');
    else window.history.pushState({ qmCat: id }, '');
    setActiveCat(id);
    setSearch('');
    setView('menu');
    window.scrollTo({ top: 0 });
  };
  const backToCategories = () => {
    if (window.history.state?.qmCat != null) window.history.back();
    else setActiveCat(null);
  };

  // Seçili kategori sekmesini görünür alana kaydır
  useEffect(() => {
    catBarRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeCat]);

  const countOf = (id) => products.filter(p => p.category_id === id).length;
  const currentCat = menu?.categories.find(c => c.id === activeCat) || null;

  const sendOrder = async () => {
    if (!cart.length || sending) return;
    try {
      setSending(true);
      const r = await fetch(`${API_BASE}/api/public/menu/${token}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, items: cart, note: orderNote.trim() || undefined })
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        setNotice({ tone: 'error', text: data.message || 'Sipariş gönderilemedi. Lütfen tekrar deneyin.' });
        if (data.code === 'ORDERING_DISABLED') { setCartOpen(false); loadMenu({ silent: true }); }
        return;
      }
      setCart([]);
      setOrderNote('');
      setCartOpen(false);
      setView('orders');
      setNotice({ tone: 'ok', text: data.message });
      loadOrders();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setNotice({ tone: 'error', text: 'Bağlantı hatası. İnternet bağlantınızı kontrol edip tekrar deneyin.' });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const enter = (nextView) => {
    try { sessionStorage.setItem(enteredKey(token), '1'); } catch { /* depolama kapalı olabilir */ }
    setView(nextView);
    setActiveCat(null);
    setEntered(true);
    window.scrollTo({ top: 0 });
  };

  // ---------- Hata ekranları ----------
  if (error) {
    return (
      <div className="qm-state">
        <span className="qm-state-icon"><QrCode size={30} /></span>
        <h1>{error === 'invalid' ? 'QR kod geçersiz' : 'Menü şu an açılamıyor'}</h1>
        <p>{error === 'invalid'
          ? 'Bu QR kod artık kullanılmıyor olabilir. Lütfen masanızdaki güncel kodu okutun ya da garsonunuza danışın.'
          : 'Lütfen birazdan tekrar deneyin. Siparişinizi garsonunuza da verebilirsiniz.'}</p>
        {error === 'server' && <button type="button" className="qm-btn primary" onClick={() => window.location.reload()}>Tekrar dene</button>}
      </div>
    );
  }
  if (!menu) {
    return <div className="qm-state"><span className="qm-spinner" /><p>Menü hazırlanıyor…</p></div>;
  }
  if (!entered) {
    return <Welcome table={menu.table} activeOrders={activeOrders} onEnter={() => enter('menu')} onOrders={() => enter('orders')} />;
  }

  return (
    <div className="qm-app">
      {/* Başlık */}
      {view === 'menu' && currentCat ? (
        <header className="qm-header compact">
          <div className="qm-topbar">
            <button type="button" className="qm-round-btn" onClick={backToCategories} aria-label="Kategorilere dön"><ChevronLeft size={20} /></button>
            <div className="qm-topbar-title">
              <span>Özgensoy Müze Kütüphane</span>
              <strong>{menu.table?.title || 'Menü'}</strong>
            </div>
            {menu.table ? (
              <button type="button" className="qm-round-btn" onClick={() => { setView('orders'); loadOrders(); }} aria-label="Masanın siparişleri">
                <Receipt size={18} />{activeOrders > 0 && <em>{activeOrders}</em>}
              </button>
            ) : <span className="qm-round-btn" style={{ visibility: 'hidden' }} aria-hidden="true" />}
          </div>
          <nav className="qm-cats" ref={catBarRef}>
            {menu.categories.map(c => (
              <button key={c.id} type="button" className={activeCat === c.id ? 'active' : ''} onClick={() => openCategory(c.id)}>{c.name}</button>
            ))}
          </nav>
        </header>
      ) : (
        <header className="qm-header">
          <div className="qm-topbar">
            <button type="button" className="qm-brand" onClick={() => { if (menu.table) setEntered(false); }} aria-label={menu.table ? 'Karşılama ekranına dön' : 'Özgensoy'}>
              <strong>Özgensoy</strong>
              <span>Müze · Kütüphane · Kafeterya</span>
            </button>
            {menu.table && <span className="qm-table"><Armchair size={14} /> {menu.table.title}</span>}
          </div>
          {menu.table && <div className="qm-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={view === 'menu'} className={view === 'menu' ? 'active' : ''} onClick={() => setView('menu')}>Menü</button>
            <button type="button" role="tab" aria-selected={view === 'orders'} className={view === 'orders' ? 'active' : ''} onClick={() => { setView('orders'); loadOrders(); }}>
              Siparişler{activeOrders > 0 && <em>{activeOrders}</em>}
            </button>
          </div>}
        </header>
      )}

      {!orderingEnabled && view === 'menu' && (
        <div className="qm-closed" role="status">
          <Clock size={18} />
          <span><strong>Şu an QR menüden sipariş alınmıyor.</strong> {ORDERING_CLOSED_TEXT}</span>
        </div>
      )}

      {notice && (
        <div className={`qm-notice ${notice.tone}`} role="status">
          {notice.tone === 'ok' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Kapat"><X size={15} /></button>
        </div>
      )}

      {/* ---------- Menü ---------- */}
      {/* Kategori listesi (menünün giriş sayfası) */}
      {view === 'menu' && !currentCat && (
        <main className="qm-main">
          <div className="qm-home-head">
            <p>{menu.table ? `${menu.table.title} · ` : ''}Hoş geldiniz</p>
            <span className="qm-ornament" aria-hidden="true" />
          </div>
          <label className="qm-search">
            <Search size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ürün ara…" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Temizle"><X size={15} /></button>}
          </label>

          {q ? (
            <section className="qm-section">
              <h2>{visibleProducts.length} sonuç</h2>
              {visibleProducts.map(p => <ProductRow key={p.id} p={p} qty={qtyInCart(p.id)} canOrder={orderingEnabled} onOpen={() => setDetail(p)} onAdd={() => addToCart(p.id)} onRemove={() => quickRemove(p.id)} />)}
              {!visibleProducts.length && <p className="qm-empty">Aradığınız ürün bulunamadı.</p>}
            </section>
          ) : (
            <div className="qm-cat-grid">
              {menu.categories.map((c, i) => (
                <button key={c.id} type="button" className={`qm-cat-card book-${i % 5}`} style={{ animationDelay: `${i * 60}ms` }} onClick={() => openCategory(c.id)}>
                  <span className="qm-cat-info">
                    <strong>{c.name}</strong>
                    <span className="qm-ornament" aria-hidden="true" />
                    <small>{countOf(c.id)} ürün</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          <Colophon canOrder={orderingEnabled} />
        </main>
      )}

      {/* Seçili kategorinin ürünleri */}
      {view === 'menu' && currentCat && (
        <main className="qm-main" key={currentCat.id}>
          <div className="qm-cat-hero">
            <h1>{currentCat.name}</h1>
            <span className="qm-ornament" aria-hidden="true" />
            <small>{countOf(currentCat.id)} ürün</small>
          </div>
          <section className="qm-section">
            {products.filter(p => p.category_id === currentCat.id).map(p => (
              <ProductRow key={p.id} p={p} qty={qtyInCart(p.id)} canOrder={orderingEnabled} onOpen={() => setDetail(p)} onAdd={() => addToCart(p.id)} onRemove={() => quickRemove(p.id)} />
            ))}
          </section>
          <Colophon canOrder={orderingEnabled} />
        </main>
      )}

      {/* ---------- Siparişlerim ---------- */}
      {view === 'orders' && (
        <main className="qm-main">
          {orders.length === 0 ? (
            <div className="qm-empty-orders">
              <Receipt size={30} />
              <strong>Bu masada henüz sipariş yok</strong>
              <span>Masanızdaki herkesin QR ile verdiği siparişler ve durumları burada görünür.</span>
              <button type="button" className="qm-btn primary" onClick={() => setView('menu')}>Menüye dön</button>
            </div>
          ) : orders.map(o => {
            const stage = orderStage(o);
            const stepIndex = STEPS.indexOf(stage.key);
            return (
              <article key={o.id} className={`qm-order s-${stage.key}`}>
                <header>
                  <span className="qm-order-badge"><stage.Icon size={15} /> {stage.label}</span>
                  <span className="qm-order-meta">
                    <em className={o.mine ? 'mine' : ''}>{o.mine ? 'Sizin' : 'Masadan'}</em>
                    <time>{new Date(o.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</time>
                  </span>
                </header>
                {stepIndex >= 0 && (
                  <ol className="qm-steps" aria-label="Sipariş aşamaları">
                    {STEP_LABELS.map((label, i) => (
                      <li key={label} className={i <= stepIndex ? 'done' : ''}><i />{label}</li>
                    ))}
                  </ol>
                )}
                {o.status === 'rejected' && (
                  <p className="qm-order-reject">{o.reject_reason ? `Neden: ${o.reject_reason}` : 'Siparişiniz onaylanmadı. Lütfen garsonunuza danışın.'}</p>
                )}
                <ul className="qm-order-items">
                  {(o.status === 'approved' && o.progress.length ? o.progress : o.items).map((it, i) => (
                    <li key={i}>
                      <span>{it.quantity}× {it.name}{it.note && <em>{it.note}</em>}</span>
                      {o.status === 'approved' && it.status && <b className={`st-${it.status}`}>{ITEM_STATUS[it.status] || it.status}</b>}
                    </li>
                  ))}
                </ul>
                <footer>
                  <span>Tahmini tutar</span>
                  <strong>{money(o.estimated_total)}</strong>
                </footer>
              </article>
            );
          })}
          <p className="qm-foot-note">Siparişinizin durumu bu sayfada anlık olarak güncellenir.</p>
        </main>
      )}

      {/* Sepet çubuğu */}
      {orderingEnabled && cartCount > 0 && !cartOpen && (
        <button type="button" className="qm-cartbar" onClick={() => setCartOpen(true)}>
          <span className="qm-cartbar-count"><ShoppingBag size={18} /><em>{cartCount}</em></span>
          <span>Sepeti gör</span>
          <strong>{money(cartTotal)}</strong>
          <ChevronRight size={18} />
        </button>
      )}

      {/* Ürün detayı */}
      {detail && <ProductSheet p={detail} canOrder={orderingEnabled} onClose={() => setDetail(null)} onAdd={(qty, note) => { addToCart(detail.id, qty, note); setDetail(null); }} />}

      {/* Sepet */}
      {cartOpen && (
        <div className="qm-sheet-backdrop" onClick={() => setCartOpen(false)}>
          <div className="qm-sheet" role="dialog" aria-label="Sepet" onClick={(e) => e.stopPropagation()}>
            <div className="qm-sheet-head">
              <h3>Sepetiniz · {menu.table.title}</h3>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Kapat"><X size={18} /></button>
            </div>
            <div className="qm-sheet-body">
              {cart.length === 0 ? <p className="qm-empty">Sepetiniz boş.</p> : cart.map((l, i) => {
                const p = productById.get(l.product_id);
                if (!p) return null;
                return (
                  <div key={`${l.product_id}-${l.note}`} className="qm-cart-line">
                    <div>
                      <strong>{p.name}</strong>
                      {l.note && <em><MessageSquareText size={12} /> {l.note}</em>}
                      <span>{money(p.price * l.quantity)}</span>
                    </div>
                    <div className="qm-stepper">
                      <button type="button" onClick={() => changeLine(i, -1)} aria-label="Azalt"><Minus size={15} /></button>
                      <b>{l.quantity}</b>
                      <button type="button" onClick={() => changeLine(i, 1)} disabled={l.quantity >= MAX_QTY} aria-label="Artır"><Plus size={15} /></button>
                    </div>
                  </div>
                );
              })}
              <label className="qm-note-field">
                <span>Siparişe not <small>(isteğe bağlı)</small></span>
                <textarea rows={2} maxLength={500} value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder="Ör. Hepsi aynı anda gelsin" />
              </label>
            </div>
            <div className="qm-sheet-foot">
              <div className="qm-total"><span>Toplam</span><strong>{money(cartTotal)}</strong></div>
              <button type="button" className="qm-btn primary block" disabled={!cart.length || sending} onClick={sendOrder}>
                {sending ? 'Gönderiliyor…' : 'Siparişi gönder'}
              </button>
              <p>Siparişiniz garson onayından sonra hazırlanmaya başlar. Ödeme kasada alınır.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductRow({ p, qty, canOrder = true, onOpen, onAdd, onRemove }) {
  return (
    <div className={`qm-product ${qty ? 'in-cart' : ''}`}>
      <button type="button" className="qm-product-main" onClick={onOpen}>
        {/* Kitabın içindekiler sayfası gibi: ad ....... fiyat */}
        <div className="qm-product-text">
          <div className="qm-product-line">
            <strong>{p.name}</strong>
            <i aria-hidden="true" />
            <b>{money(p.price)}</b>
          </div>
          {p.description && <span>{p.description}</span>}
        </div>
        {p.image_url && (
          <div className="qm-product-img">
            <img src={thumbSrc(p.image_url)} alt="" loading="lazy" decoding="async" onError={(e) => handleThumbError(e, p.image_url)} />
            <span className="qm-product-fallback" style={{ display: 'none' }}><BookOpen size={20} /></span>
          </div>
        )}
      </button>
      {!canOrder ? null : qty > 0 ? (
        <div className="qm-stepper floating">
          <button type="button" onClick={onRemove} aria-label={`${p.name} azalt`}><Minus size={15} /></button>
          <b>{qty}</b>
          <button type="button" onClick={onAdd} disabled={qty >= MAX_QTY} aria-label={`${p.name} artır`}><Plus size={15} /></button>
        </div>
      ) : (
        <button type="button" className="qm-add" onClick={onAdd} aria-label={`${p.name} sepete ekle`}><Plus size={18} /></button>
      )}
    </div>
  );
}

function ProductSheet({ p, canOrder = true, onClose, onAdd }) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  return (
    <div className="qm-sheet-backdrop" onClick={onClose}>
      <div className="qm-sheet product" role="dialog" aria-label={p.name} onClick={(e) => e.stopPropagation()}>
        {p.image_url && <img className="qm-sheet-img" src={p.image_url} alt="" />}
        <button type="button" className="qm-sheet-close" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
        <div className="qm-sheet-body">
          <h3>{p.name}</h3>
          {p.description && <p className="qm-desc">{p.description}</p>}
          {p.ingredients && <p className="qm-ingredients"><strong>İçindekiler:</strong> {p.ingredients}</p>}
          {canOrder && (
            <label className="qm-note-field">
              <span>Ürün notu <small>(isteğe bağlı)</small></span>
              <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ör. Şekersiz, az buzlu" />
            </label>
          )}
        </div>
        {canOrder ? (
        <div className="qm-sheet-foot row">
          <div className="qm-stepper big">
            <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Azalt"><Minus size={16} /></button>
            <b>{qty}</b>
            <button type="button" onClick={() => setQty(q => Math.min(MAX_QTY, q + 1))} aria-label="Artır"><Plus size={16} /></button>
          </div>
          <button type="button" className="qm-btn primary block" onClick={() => onAdd(qty, note)}>
            Sepete ekle · {money(p.price * qty)}
          </button>
        </div>
        ) : (
          <div className="qm-sheet-foot"><p>{ORDERING_CLOSED_TEXT}</p></div>
        )}
      </div>
    </div>
  );
}

// Menünün altında işletmenin tabeladaki tam adı
function Colophon({ canOrder }) {
  return (
    <footer className="qm-colophon">
      <span className="qm-colophon-mark" aria-hidden="true"><BookOpen size={16} strokeWidth={1.6} /></span>
      <strong>Özgensoy</strong>
      <span>Müze Kütüphane Kafeterya</span>
      <em>&amp; Kültür Sanat Atölyesi</em>
      {canOrder && <p>Siparişiniz garson onayından sonra hazırlanır. Ödemeyi kasada yapabilirsiniz.</p>}
    </footer>
  );
}

function Welcome({ table, activeOrders, onEnter, onOrders }) {
  return (
    <div className="qm-welcome">
      {/* Masa bilgisi kitap ayracı (kurdele) üzerinde */}
      <div className="qm-ribbon" aria-label={`Masanız: ${table.title}`}>
        <small>Masanız</small>
        <strong>{table.title}</strong>
      </div>

      <div className="qm-welcome-center">
        <span className="qm-emblem" aria-hidden="true"><BookOpen size={30} strokeWidth={1.5} /></span>
        <p className="qm-welcome-kicker">Hoş geldiniz</p>
        <h1>
          <span>Özgensoy</span>
          <small>Müze · Kütüphane · Kafeterya</small>
          <em>&amp; Kültür Sanat Atölyesi</em>
        </h1>
        <i className="qm-welcome-rule" aria-hidden="true" />
        <p className="qm-welcome-tag">Bir fincan kahve, iyi bir kitap ve sanatla dolu bir mola.</p>
        <button type="button" className="qm-welcome-cta" onClick={onEnter}>
          Menüyü Görüntüle <ChevronRight size={18} />
        </button>
        {activeOrders > 0 && (
          <button type="button" className="qm-welcome-link" onClick={onOrders}>
            <Clock size={15} /> Masanın siparişleri · {activeOrders} aktif
          </button>
        )}
      </div>

      <p className="qm-welcome-foot">
        Bu QR kod <b>{table.title}</b> içindir; siparişleriniz doğrudan masanıza gelir.
        Farklı bir masadaysanız lütfen garsonunuza haber verin.
      </p>
    </div>
  );
}
