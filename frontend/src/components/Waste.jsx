import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useToast } from './ui/ToastProvider';
import { useConfirm } from './ui/ConfirmProvider';
import { createSocket } from '../lib/api';
import '../styles/waste.css';
import {
  Plus, Search, X, Trash2, CalendarX, ThumbsDown, Droplets, Coffee, Store, MoreHorizontal,
  PackageX, Package, Clock, UtensilsCrossed, PencilLine, Check
} from 'lucide-react';

// Neden kartları (sunucudaki WASTE_REASONS ile aynı anahtarlar)
const REASONS = [
  { key: 'expired', label: 'SKT geçti', hint: 'Son kullanma tarihi doldu', Icon: CalendarX },
  { key: 'spoiled', label: 'Bozuldu / Hasarlı', hint: 'Bozulma, küf, ezilme', Icon: ThumbsDown },
  { key: 'dropped', label: 'Döküldü / Kırıldı', hint: 'Servis veya hazırlıkta kaza', Icon: Droplets },
  { key: 'staff_use', label: 'Personel tüketimi', hint: 'Personelin tükettiği ürün', Icon: Coffee },
  { key: 'business_use', label: 'İşletme içi kullanım', hint: 'Deneme, numune, temizlik vb.', Icon: Store },
  { key: 'other', label: 'Diğer', hint: 'Açıklama zorunlu', Icon: MoreHorizontal }
];
const REASON_BY_KEY = Object.fromEntries(REASONS.map(r => [r.key, r]));
const UNITS = ['adet', 'porsiyon', 'kg', 'gr', 'lt', 'ml', 'paket'];

const PERIODS = [
  { id: 'today', label: 'Bugün' },
  { id: 'week', label: 'Son 7 gün' },
  { id: 'month', label: 'Bu ay' },
  { id: 'last_month', label: 'Geçen ay' },
  { id: 'all', label: 'Tümü' }
];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDateTimeValue = (d = new Date()) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const money = (n) => `₺${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyText = (q) => Number(q).toLocaleString('tr-TR', { maximumFractionDigits: 3 });

const periodRange = (id) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (id === 'today') return { startDate: ymd(today), endDate: ymd(today) };
  if (id === 'week') { const s = new Date(today); s.setDate(s.getDate() - 6); return { startDate: ymd(s), endDate: ymd(today) }; }
  if (id === 'month') return { startDate: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: ymd(today) };
  if (id === 'last_month') {
    return { startDate: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), endDate: ymd(new Date(today.getFullYear(), today.getMonth(), 0)) };
  }
  return {};
};

const EMPTY_FORM = {
  source: 'menu',
  productId: null,
  itemName: '',
  quantity: '1',
  unit: 'adet',
  reason: '',
  occurredAt: '',
  note: '',
  unitCost: ''
};

// Kayıt formu (pencere)
function WasteFormModal({ onClose, onSaved, canSeeCost }) {
  const { showToast } = useToast();
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, occurredAt: localDateTimeValue() }));
  const [productQuery, setProductQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    axios.get('/api/waste/options')
      .then(res => setOptions(res.data))
      .catch(() => setError('Ürün listesi yüklenemedi. Yine de "Diğer malzeme" ile kayıt girebilirsiniz.'));
  }, []);

  // Esc ile kapat
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (patch) => { setError(''); setForm(f => ({ ...f, ...patch })); };
  const products = options?.products || [];
  const selectedProduct = products.find(p => p.id === form.productId) || null;
  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLocaleLowerCase('tr-TR');
    return (q ? products.filter(p => [p.name, p.category_name].some(v => v?.toLocaleLowerCase('tr-TR').includes(q))) : products).slice(0, 60);
  }, [products, productQuery]);

  const qty = Number(String(form.quantity).replace(',', '.'));
  const estimatedCost = canSeeCost && qty > 0
    ? (form.source === 'menu' ? (selectedProduct?.cost_price ?? null) : (form.unitCost !== '' ? Number(String(form.unitCost).replace(',', '.')) : null))
    : null;

  const submit = async (e) => {
    e.preventDefault();
    if (form.source === 'menu' && !form.productId) return setError('Lütfen menüden bir ürün seçin.');
    if (form.source === 'other' && !form.itemName.trim()) return setError('Lütfen malzeme adını yazın.');
    if (!(qty > 0)) return setError('Miktar 0’dan büyük olmalıdır.');
    if (!form.reason) return setError('Lütfen bir neden seçin.');
    if (form.reason === 'other' && !form.note.trim()) return setError('"Diğer" nedeni için kısa bir açıklama yazın.');

    try {
      setSaving(true);
      const res = await axios.post('/api/waste', {
        ...(form.source === 'menu' ? { product_id: form.productId } : { item_name: form.itemName.trim(), unit_cost: form.unitCost === '' ? undefined : Number(String(form.unitCost).replace(',', '.')) }),
        quantity: qty,
        unit: form.unit,
        reason: form.reason,
        note: form.note.trim() || undefined,
        occurred_at: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined
      });
      showToast(res.data.message || 'Fire/zayi kaydı eklendi.', 'created');
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Kayıt eklenemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="waste-modal-backdrop" onMouseDown={onClose}>
      <form className="waste-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="waste-modal-head">
          <div>
            <h3>Fire / Zayi Kaydı</h3>
            <p>Kullanılamayan veya satılmadan tüketilen ürünü kaydedin.</p>
          </div>
          <button type="button" className="waste-icon-btn" onClick={onClose} title="Kapat"><X size={18} /></button>
        </header>

        <div className="waste-modal-body">
          {/* 1. Ne? */}
          <section className="waste-step">
            <span className="waste-step-title"><b>1</b> Ürün veya malzeme</span>
            <div className="waste-seg" role="group" aria-label="Kaynak">
              <button type="button" className={form.source === 'menu' ? 'active' : ''} onClick={() => set({ source: 'menu', itemName: '', unitCost: '' })}>
                <UtensilsCrossed size={15} /> Menüden ürün
              </button>
              <button type="button" className={form.source === 'other' ? 'active' : ''} onClick={() => set({ source: 'other', productId: null })}>
                <Package size={15} /> Diğer malzeme
              </button>
            </div>

            {form.source === 'menu' ? (
              selectedProduct ? (
                <div className="waste-selected">
                  <Check size={16} />
                  <div>
                    <strong>{selectedProduct.name}</strong>
                    <span>{selectedProduct.category_name || 'Kategorisiz'}</span>
                  </div>
                  <button type="button" onClick={() => { set({ productId: null }); setTimeout(() => searchRef.current?.focus(), 0); }}>Değiştir</button>
                </div>
              ) : (
                <div className="waste-picker">
                  <label className="waste-search">
                    <Search size={15} />
                    <input ref={searchRef} value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Ürün ara (ör. süt, cheesecake)" autoFocus />
                  </label>
                  <div className="waste-picker-list">
                    {!options && !error && <div className="waste-picker-empty">Yükleniyor…</div>}
                    {options && filteredProducts.length === 0 && <div className="waste-picker-empty">Ürün bulunamadı. Menüde yoksa "Diğer malzeme"yi seçin.</div>}
                    {filteredProducts.map(p => (
                      <button key={p.id} type="button" onClick={() => set({ productId: p.id })}>
                        <span>{p.name}</span>
                        <em>{p.category_name}</em>
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <div className="waste-row-2">
                <label className="waste-field grow">
                  <span>Malzeme adı</span>
                  <input value={form.itemName} onChange={(e) => set({ itemName: e.target.value })} placeholder="Ör. Süt, kahve çekirdeği, krema" maxLength={150} />
                </label>
                {canSeeCost && (
                  <label className="waste-field">
                    <span>Birim maliyet <small>(isteğe bağlı)</small></span>
                    <div className="waste-money"><b>₺</b><input inputMode="decimal" value={form.unitCost} onChange={(e) => set({ unitCost: e.target.value })} placeholder="0,00" /></div>
                  </label>
                )}
              </div>
            )}
          </section>

          {/* 2. Ne kadar? */}
          <section className="waste-step">
            <span className="waste-step-title"><b>2</b> Miktar</span>
            <div className="waste-qty">
              <button type="button" onClick={() => set({ quantity: String(Math.max(0, (qty || 0) - 1) || 1) })} aria-label="Azalt">−</button>
              <input inputMode="decimal" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} aria-label="Miktar" />
              <button type="button" onClick={() => set({ quantity: String((qty || 0) + 1) })} aria-label="Artır">+</button>
              <select value={form.unit} onChange={(e) => set({ unit: e.target.value })} aria-label="Birim">
                {(options?.units || UNITS).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            {estimatedCost !== null && Number.isFinite(estimatedCost) && (
              <p className="waste-estimate">Tahmini maliyet: <strong>{money(estimatedCost * qty)}</strong></p>
            )}
            {canSeeCost && form.source === 'menu' && selectedProduct && selectedProduct.cost_price === null && (
              <p className="waste-estimate muted">Bu ürünün maliyet fiyatı girilmemiş; kayıt maliyetsiz tutulur.</p>
            )}
          </section>

          {/* 3. Neden? */}
          <section className="waste-step">
            <span className="waste-step-title"><b>3</b> Neden</span>
            <div className="waste-reasons">
              {REASONS.map(({ key, label, hint, Icon }) => (
                <button key={key} type="button" className={`waste-reason r-${key} ${form.reason === key ? 'active' : ''}`} onClick={() => set({ reason: key })} aria-pressed={form.reason === key}>
                  <Icon size={18} />
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 4. Ayrıntılar */}
          <section className="waste-step">
            <span className="waste-step-title"><b>4</b> Ayrıntılar</span>
            <div className="waste-row-2">
              <label className="waste-field">
                <span>Tarih ve saat</span>
                <input type="datetime-local" value={form.occurredAt} max={localDateTimeValue()} onChange={(e) => set({ occurredAt: e.target.value })} />
              </label>
              <label className="waste-field grow">
                <span>Not {form.reason === 'other' ? <small className="req">(zorunlu)</small> : <small>(isteğe bağlı)</small>}</span>
                <input value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="Ör. Buzdolabı arızası, müşteri masasına düştü…" maxLength={500} />
              </label>
            </div>
          </section>

          {error && <div className="waste-error">{error}</div>}
        </div>

        <footer className="waste-modal-foot">
          <button type="button" className="waste-btn" onClick={onClose}>Vazgeç</button>
          <button type="submit" className="waste-btn primary" disabled={saving}>
            {saving ? 'Kaydediliyor…' : <><PencilLine size={15} /> Kaydet</>}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function Waste() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [period, setPeriod] = useState('month');
  const [reason, setReason] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const canCreate = can('waste.create');
  const canDelete = can('waste.delete');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams(periodRange(period));
      const res = await axios.get(`/api/waste?${params}`);
      setData(res.data);
    } catch (err) {
      showToast(err.response?.data?.message || 'Fire & zayi kayıtları yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  }, [period, showToast]);

  useEffect(() => { load(); }, [load]);

  // Başka bir cihazda kayıt eklenince/silinince listeyi yenile
  useEffect(() => {
    const socket = createSocket();
    socket.on('resync', () => load());
    socket.on('waste:changed', () => load());
    return () => socket.disconnect();
  }, [load]);

  const records = data?.records || [];
  const showCost = Boolean(data?.show_cost);
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return records.filter(r =>
      (reason === 'all' || r.reason === reason) &&
      (!q || [r.item_name, r.note, r.created_by_name, r.category_name].some(v => v?.toLocaleLowerCase('tr-TR').includes(q)))
    );
  }, [records, reason, search]);
  const visibleCost = visible.reduce((s, r) => s + (r.total_cost || 0), 0);
  const byReason = data?.summary?.by_reason || [];
  const topReason = [...byReason].sort((a, b) => b.count - a.count)[0];

  const handleDelete = async (r) => {
    const ok = await confirm({
      title: 'Kayıt silinsin mi?',
      message: `"${r.item_name}" (${qtyText(r.quantity)} ${r.unit}) fire/zayi kaydı kaldırılacak. Silme işlemi işlem günlüğüne yazılır.`,
      confirmLabel: 'Kaydı sil',
      danger: true
    });
    if (!ok) return;
    try {
      const res = await axios.delete(`/api/waste/${r.id}`);
      showToast(res.data.message || 'Kayıt silindi.', 'deleted');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Kayıt silinemedi.', 'error');
    }
  };

  return (
    <div className="pos-page-container">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        title="Fire & Zayi"
        actions={canCreate && (
          <button type="button" className="pos-edit-btn waste-new-btn" onClick={() => setShowForm(true)}>
            <Plus size={16} />
            <span>Yeni Kayıt</span>
          </button>
        )}
      />

      <div className="waste-page">
        {/* Dönem ve özet */}
        <div className="waste-toolbar">
          <div className="waste-periods" role="group" aria-label="Dönem">
            {PERIODS.map(p => (
              <button key={p.id} type="button" className={period === p.id ? 'active' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
            ))}
          </div>
          <label className="waste-search">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ürün, not veya personel ara" />
            {search && <button type="button" onClick={() => setSearch('')} title="Temizle"><X size={14} /></button>}
          </label>
        </div>

        <div className="waste-kpis">
          <div className="waste-kpi">
            <span className="waste-kpi-icon"><PackageX size={18} /></span>
            <div>
              <span>Kayıt</span>
              <strong>{data?.summary?.count ?? '—'}</strong>
            </div>
          </div>
          {showCost && (
            <div className="waste-kpi cost">
              <span className="waste-kpi-icon">₺</span>
              <div>
                <span>Toplam maliyet</span>
                <strong>{money(data?.summary?.total_cost)}</strong>
                {data?.summary?.without_cost > 0 && <em>{data.summary.without_cost} kayıt maliyetsiz</em>}
              </div>
            </div>
          )}
          <div className="waste-kpi">
            <span className="waste-kpi-icon"><Clock size={18} /></span>
            <div>
              <span>En sık neden</span>
              <strong className="small">{topReason?.count ? REASON_BY_KEY[topReason.reason]?.label : '—'}</strong>
            </div>
          </div>
        </div>

        {/* Neden filtreleri */}
        <div className="waste-reason-filter" role="group" aria-label="Neden">
          <button type="button" className={reason === 'all' ? 'active' : ''} onClick={() => setReason('all')}>
            Tümü <em>{data?.summary?.count ?? 0}</em>
          </button>
          {byReason.map(r => {
            const meta = REASON_BY_KEY[r.reason];
            if (!meta) return null;
            return (
              <button key={r.reason} type="button" className={`r-${r.reason} ${reason === r.reason ? 'active' : ''}`} onClick={() => setReason(prev => (prev === r.reason ? 'all' : r.reason))}>
                <meta.Icon size={14} /> {meta.label} <em>{r.count}</em>
              </button>
            );
          })}
        </div>

        {/* Kayıt listesi */}
        <div className="waste-list-card">
          {loading && !data ? (
            <div className="waste-empty">Yükleniyor…</div>
          ) : visible.length === 0 ? (
            <div className="waste-empty">
              <PackageX size={28} />
              <strong>{records.length ? 'Filtreye uyan kayıt yok' : 'Bu dönemde fire/zayi kaydı yok'}</strong>
              {canCreate && !records.length && (
                <button type="button" className="waste-btn primary" onClick={() => setShowForm(true)}><Plus size={15} /> İlk kaydı ekle</button>
              )}
            </div>
          ) : (
            <>
              <div className="waste-list">
                {visible.map(r => {
                  const meta = REASON_BY_KEY[r.reason] || REASON_BY_KEY.other;
                  return (
                    <div key={r.id} className="waste-item">
                      <span className={`waste-item-icon r-${r.reason}`}><meta.Icon size={18} /></span>
                      <div className="waste-item-main">
                        <div className="waste-item-title">
                          <strong>{r.item_name}</strong>
                          <span className={`waste-pill r-${r.reason}`}>{meta.label}</span>
                        </div>
                        <div className="waste-item-meta">
                          <span>{new Date(r.occurred_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          {r.category_name && <span>{r.category_name}</span>}
                          {!r.product_id && <span>Menü dışı malzeme</span>}
                          <span>{r.created_by_name || 'Bilinmiyor'}</span>
                        </div>
                        {r.note && <p className="waste-item-note">{r.note}</p>}
                      </div>
                      <div className="waste-item-side">
                        <strong>{qtyText(r.quantity)} <small>{r.unit}</small></strong>
                        {showCost && <span className={r.total_cost === null ? 'no-cost' : ''}>{r.total_cost === null ? 'Maliyet girilmemiş' : money(r.total_cost)}</span>}
                      </div>
                      {canDelete && (
                        <button type="button" className="waste-icon-btn danger" onClick={() => handleDelete(r)} title="Kaydı sil" aria-label={`${r.item_name} kaydını sil`}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="waste-list-foot">
                <span>{visible.length} kayıt</span>
                {showCost && <strong>{money(visibleCost)}</strong>}
              </div>
            </>
          )}
        </div>
      </div>

      {showForm && (
        <WasteFormModal
          canSeeCost={can('products.view_cost')}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
