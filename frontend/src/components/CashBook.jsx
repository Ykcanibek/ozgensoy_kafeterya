import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useToast } from './ui/ToastProvider';
import { apiFetch, createSocket } from '../lib/api';
import {
  Plus, Search, X, FileSpreadsheet, Tags, ArrowDownLeft, ArrowUpRight, Wallet, Scale,
  Landmark, CreditCard, Banknote, CircleDollarSign, Receipt, FileText, Pencil, Trash2,
  Check, ChevronRight, ChevronDown, Info, Zap, Archive, FolderTree, Layers, CornerDownRight, RefreshCw,
  ArrowLeftRight, ArrowDown
} from 'lucide-react';

// ---------------------------------------------------------------------------------------------
// Sabitler ve yardımcılar (sunucudaki cashBookController ile aynı anahtarlar)
// ---------------------------------------------------------------------------------------------
// Hesaplar: POS / Kart Tahsilatı müşteriden kartla alınan paradır (bankaya geçer);
// Şirket Kredi Kartı işletmenin kendi kartıdır (harcamalar borç olarak birikir, bankadan transferle ödenir)
const METHODS = {
  cash: { label: 'Nakit Kasa', short: 'Nakit', Icon: Banknote },
  card: { label: 'POS / Kart Tahsilatı', short: 'POS / Kart', Icon: CreditCard },
  bank: { label: 'Banka', short: 'Banka', Icon: Landmark },
  company_card: { label: 'Şirket Kredi Kartı', short: 'Şirket Kartı', Icon: Wallet },
  other: { label: 'Diğer', short: 'Diğer', Icon: CircleDollarSign }
};
const VAT_RATES = [0, 1, 10, 20];
// Hangi kayıt türü hangi hesabı kullanabilir (sunucudaki METHODS_BY_TYPE ile aynı)
const METHODS_BY_TYPE = {
  income: ['cash', 'card', 'bank', 'other'],
  expense: ['cash', 'company_card', 'bank', 'other'],
  transfer: Object.keys(METHODS)
};
const TYPE_LABEL = { income: 'Gelir', expense: 'Gider', transfer: 'Transfer' };

const PERIODS = [
  { id: 'today', label: 'Bugün' },
  { id: 'week', label: 'Bu hafta' },
  { id: 'month', label: 'Bu ay' },
  { id: 'last_month', label: 'Geçen ay' },
  { id: 'year', label: 'Bu yıl' },
  { id: 'custom', label: 'Özel' }
];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const trDate = (s) => (s ? s.split('-').reverse().join('.') : '');
const money = (n) => {
  const v = Number(n || 0);
  return `${v < 0 ? '−' : ''}₺${Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
// "1.250,50" (Türkçe) ve "1250.50" yazımlarının ikisi de kabul edilir: virgül varsa noktalar binlik ayırıcıdır
const parseAmount = (v) => {
  const s = String(v ?? '').trim().replace(/\s|₺/g, '');
  if (!s) return NaN;
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const amountText = (n) => String(n).replace('.', ',');
const pathOf = (e) => (e.subcategory_name ? `${e.category_name} › ${e.subcategory_name}` : e.category_name);

const periodRange = (id) => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  if (id === 'today') return { startDate: ymd(t), endDate: ymd(t) };
  if (id === 'week') {
    const s = new Date(t);
    s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Pazartesi
    return { startDate: ymd(s), endDate: ymd(t) };
  }
  if (id === 'month') return { startDate: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), endDate: ymd(t) };
  if (id === 'last_month') return { startDate: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), endDate: ymd(new Date(t.getFullYear(), t.getMonth(), 0)) };
  if (id === 'year') return { startDate: ymd(new Date(t.getFullYear(), 0, 1)), endDate: ymd(t) };
  return null;
};

const sameDay = (iso) => new Date(iso).toDateString() === new Date().toDateString();

/** Düz kategori listesinden ağaç: [{ ...ana, children: [alt...] }] */
const buildTree = (categories, type) => {
  const list = (categories || []).filter(c => c.entry_type === type);
  return list.filter(c => !c.parent_id).map(m => ({ ...m, children: list.filter(c => c.parent_id === m.id) }));
};

let lineSeq = 0;
const newLine = (subId = '') => ({ key: ++lineSeq, subcategory_id: subId, amount: '', description: '' });

// ---------------------------------------------------------------------------------------------
// Kayıt formu: Ana kategori → (alt kategorilere böl | doğrudan ana kategoriye) → tarih/ödeme → belge/KDV
// ---------------------------------------------------------------------------------------------
function EntryModal({ options, initial, onClose, onSaved }) {
  const { showToast } = useToast();
  const isEdit = Boolean(initial?.id);
  const [type, setType] = useState(initial?.entry_type || 'expense');
  const [mainId, setMainId] = useState(isEdit ? initial.category_id : null);
  const [mode, setMode] = useState(isEdit ? 'direct' : 'split'); // split: alt kategorilere böl · direct: tek tutar
  const [lines, setLines] = useState([]);
  const [single, setSingle] = useState({
    subcategory_id: isEdit ? (initial.subcategory_id || '') : '',
    amount: isEdit ? amountText(initial.amount) : ''
  });
  const [common, setCommon] = useState(() => ({
    entry_date: isEdit ? initial.entry_date : ymd(new Date()),
    payment_method: isEdit ? initial.payment_method : 'cash',
    transfer_to: isEdit && initial.transfer_to ? initial.transfer_to : 'company_card',
    transfer_from: isEdit && initial.entry_type === 'transfer' ? initial.payment_method : 'bank',
    description: isEdit ? (initial.description || '') : '',
    document_type: isEdit ? initial.document_type : 'none',
    document_no: isEdit ? (initial.document_no || '') : '',
    counterparty: isEdit ? (initial.counterparty || '') : '',
    tax_number: isEdit ? (initial.tax_number || '') : '',
    vat_rate: isEdit ? initial.vat_rate : 0
  }));
  const [showDoc, setShowDoc] = useState(() => isEdit && (initial.document_type !== 'none' || initial.document_no || initial.counterparty || initial.vat_rate > 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const amountRefs = useRef(new Map());
  const focusLine = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Yeni eklenen satırın tutar kutusuna odaklan
  useEffect(() => {
    if (focusLine.current) {
      amountRefs.current.get(focusLine.current)?.focus();
      focusLine.current = null;
    }
  }, [lines]);

  const isIncome = type === 'income';
  const isTransfer = type === 'transfer';
  const tree = useMemo(() => buildTree(options?.categories, type), [options, type]);
  // Gün sonu cirosu (sistem) kategorisi elle kayıtta seçilemez
  const visibleMains = tree.filter(m => !m.system_key && (m.is_active || m.id === initial?.category_id));
  const main = tree.find(m => m.id === mainId) || null;
  const subs = (main?.children || []).filter(s => s.is_active || s.id === initial?.subcategory_id);
  const canSplit = !isEdit && subs.length > 0;
  const effectiveMode = canSplit ? mode : 'direct';

  const setC = (patch) => { setError(''); setCommon(c => ({ ...c, ...patch })); };
  const pickMain = (id) => {
    setError('');
    setMainId(id);
    setLines([]);
    setSingle(s => ({ ...s, subcategory_id: '' }));
    const m = tree.find(x => x.id === id);
    setMode(m && m.children.some(c => c.is_active) ? 'split' : 'direct');
  };
  const switchType = (t) => {
    setType(t); setMainId(null); setLines([]); setSingle({ subcategory_id: '', amount: '' }); setError('');
    // Seçili hesap yeni türde kullanılamıyorsa (ör. gider → POS kartı) nakde dön
    setCommon(c => (METHODS_BY_TYPE[t].includes(c.payment_method) ? c : { ...c, payment_method: 'cash' }));
  };

  const addLine = (subId = '') => {
    const l = newLine(subId);
    focusLine.current = l.key;
    setError('');
    setLines(ls => [...ls, l]);
  };
  const updateLine = (key, patch) => { setError(''); setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))); };
  const removeLine = (key) => setLines(ls => ls.filter(l => l.key !== key));
  const usedSubs = new Set(lines.map(l => Number(l.subcategory_id)).filter(Boolean));

  const total = effectiveMode === 'split' && !isTransfer
    ? round2(lines.reduce((s, l) => s + (parseAmount(l.amount) || 0), 0))
    : (parseAmount(single.amount) || 0);
  const vatRate = Number(common.vat_rate) || 0;
  const vatAmount = total > 0 ? round2(total * vatRate / (100 + vatRate)) : 0;

  const reset = () => {
    setLines([]);
    setSingle(s => ({ ...s, amount: '', subcategory_id: '' }));
    setCommon(c => ({ ...c, description: '', document_no: '' }));
  };

  const submit = async (e, keepOpen = false) => {
    e?.preventDefault();
    let payload;
    if (isTransfer) {
      if (common.transfer_from === common.transfer_to) return setError('Çıkış ve giriş hesabı farklı olmalıdır.');
      if (!(parseAmount(single.amount) > 0)) return setError('Tutarı girin.');
      payload = {
        entry_type: 'transfer',
        entry_date: common.entry_date,
        payment_method: common.transfer_from,
        transfer_to: common.transfer_to,
        amount: parseAmount(single.amount),
        description: common.description.trim() || undefined
      };
    } else if (!mainId) {
      return setError('Önce bir ana kategori seçin.');
    } else if (effectiveMode === 'split') {
      if (lines.length === 0) return setError('En az bir alt kategori satırı ekleyin ya da "Doğrudan ana kategoriye" seçin.');
      for (const [i, l] of lines.entries()) {
        if (!l.subcategory_id) return setError(`${i + 1}. satırda alt kategori seçin.`);
        if (!(parseAmount(l.amount) > 0)) return setError(`${i + 1}. satırın tutarını girin.`);
      }
      payload = { lines: lines.map(l => ({ subcategory_id: Number(l.subcategory_id), amount: parseAmount(l.amount), description: l.description.trim() || undefined })) };
    } else {
      if (!(parseAmount(single.amount) > 0)) return setError('Tutarı girin.');
      payload = { amount: parseAmount(single.amount), subcategory_id: single.subcategory_id ? Number(single.subcategory_id) : null };
    }
    if (!isTransfer) Object.assign(payload, {
      entry_type: type,
      category_id: mainId,
      entry_date: common.entry_date,
      payment_method: common.payment_method,
      description: common.description.trim() || undefined,
      document_type: showDoc ? common.document_type : 'none',
      document_no: showDoc ? common.document_no.trim() || undefined : undefined,
      counterparty: showDoc ? common.counterparty.trim() || undefined : undefined,
      tax_number: showDoc ? common.tax_number.trim() || undefined : undefined,
      vat_rate: showDoc ? vatRate : 0
    });
    try {
      setSaving(true);
      const res = isEdit
        ? await axios.put(`/api/cashbook/${initial.id}`, payload)
        : await axios.post('/api/cashbook', payload);
      showToast(res.data.message, isEdit ? 'updated' : 'created');
      onSaved(keepOpen);
      if (keepOpen) reset();
    } catch (err) {
      setError(err.response?.data?.message || 'Kayıt kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cb-modal-backdrop" onMouseDown={onClose}>
      <form className={`cb-modal t-${type}`} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="cb-modal-head">
          <div>
            <h3>{isEdit ? 'Kaydı Düzenle' : isTransfer ? 'Hesaplar Arası Transfer' : isIncome ? 'Yeni Gelir Kaydı' : 'Yeni Gider Kaydı'}</h3>
            <p>{isTransfer
              ? 'Para bir hesaptan diğerine geçer; gelir ya da gider sayılmaz (ör. kredi kartı borcunu bankadan ödeme, POS tutarının bankaya geçmesi).'
              : isEdit ? 'Kayıttaki kategoriyi, tutarı veya diğer bilgileri düzeltin.' : 'Ana kategoriyi seçin; isterseniz alt kategorilere tek tek tutar girin.'}</p>
          </div>
          <button type="button" className="cb-icon-btn" onClick={onClose} title="Kapat"><X size={18} /></button>
        </header>

        <div className="cb-modal-body">
          {!isEdit && (
            <div className="cb-type-switch three" role="group" aria-label="Kayıt türü">
              <button type="button" className={`income ${isIncome ? 'active' : ''}`} onClick={() => switchType('income')}><ArrowDownLeft size={16} /> Gelir</button>
              <button type="button" className={`expense ${type === 'expense' ? 'active' : ''}`} onClick={() => switchType('expense')}><ArrowUpRight size={16} /> Gider</button>
              <button type="button" className={`transfer ${isTransfer ? 'active' : ''}`} onClick={() => switchType('transfer')}><ArrowLeftRight size={16} /> Transfer</button>
            </div>
          )}

          {isTransfer ? (
            <section className="cb-step">
              <div className="cb-transfer">
                <div className="cb-field">
                  <span>Paranın çıktığı hesap</span>
                  <div className="cb-method-chips">
                    {Object.entries(METHODS).map(([key, m]) => (
                      <button key={key} type="button" className={common.transfer_from === key ? 'active' : ''} onClick={() => setC({ transfer_from: key })}>
                        <m.Icon size={15} /> {m.short}
                      </button>
                    ))}
                  </div>
                </div>
                <ArrowDown size={18} className="cb-transfer-arrow" />
                <div className="cb-field">
                  <span>Paranın girdiği hesap</span>
                  <div className="cb-method-chips">
                    {Object.entries(METHODS).map(([key, m]) => (
                      <button key={key} type="button" disabled={key === common.transfer_from}
                        className={common.transfer_to === key ? 'active' : ''} onClick={() => setC({ transfer_to: key })}>
                        <m.Icon size={15} /> {m.short}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="cb-row">
                <label className="cb-field cb-amount-field">
                  <span>Tutar</span>
                  <div className="cb-money"><b>₺</b><input inputMode="decimal" value={single.amount} onChange={(e) => { setError(''); setSingle(s => ({ ...s, amount: e.target.value })); }} placeholder="0,00" autoFocus /></div>
                </label>
                <label className="cb-field cb-date-field">
                  <span>İşlem tarihi</span>
                  <input type="date" value={common.entry_date} max={ymd(new Date())} onChange={(e) => setC({ entry_date: e.target.value })} />
                </label>
              </div>
              <label className="cb-field">
                <span>Açıklama <small>(isteğe bağlı)</small></span>
                <input value={common.description} onChange={(e) => setC({ description: e.target.value })} maxLength={500} placeholder="Ör. Ekim kredi kartı ekstresi ödendi" />
              </label>
            </section>
          ) : (<>
          {/* 1. Ana kategori */}
          <section className="cb-step">
            <span className="cb-step-title"><b>1</b> Ana kategori</span>
            <div className="cb-main-grid">
              {visibleMains.map(m => {
                const activeSubs = m.children.filter(c => c.is_active).length;
                return (
                  <button key={m.id} type="button" className={`cb-main-btn ${mainId === m.id ? 'active' : ''}`} onClick={() => pickMain(m.id)} aria-pressed={mainId === m.id}>
                    <strong>{m.name}</strong>
                    <em>{activeSubs ? `${activeSubs} alt kategori` : 'Alt kategorisiz'}</em>
                    {mainId === m.id && <Check size={14} className="cb-main-check" />}
                  </button>
                );
              })}
              {visibleMains.length === 0 && <p className="cb-muted">Bu türde kategori yok. Kategoriler ekranından ekleyin.</p>}
            </div>
          </section>

          {/* 2. Alt kategoriler ve tutarlar */}
          {main && (
            <section className="cb-step">
              <span className="cb-step-title"><b>2</b> {effectiveMode === 'split' ? `${main.name} — alt kategoriler ve tutarlar` : 'Tutar'}</span>

              {canSplit && (
                <div className="cb-mode-switch" role="group">
                  <button type="button" className={effectiveMode === 'split' ? 'active' : ''} onClick={() => { setMode('split'); setError(''); }}>
                    <Layers size={15} /> Alt kategorilere böl
                  </button>
                  <button type="button" className={effectiveMode === 'direct' ? 'active' : ''} onClick={() => { setMode('direct'); setError(''); }}>
                    <FolderTree size={15} /> Doğrudan “{main.name}”
                  </button>
                </div>
              )}

              {effectiveMode === 'split' ? (
                <>
                  <div className="cb-sub-chips">
                    {subs.filter(s => !usedSubs.has(s.id)).map(s => (
                      <button key={s.id} type="button" onClick={() => addLine(s.id)}><Plus size={13} /> {s.name}</button>
                    ))}
                    {subs.every(s => usedSubs.has(s.id)) && <span className="cb-muted">Tüm alt kategoriler eklendi.</span>}
                  </div>
                  {lines.length === 0 ? (
                    <p className="cb-lines-empty">Yukarıdan alt kategoriye dokunun; her biri için ayrı tutar satırı açılır.</p>
                  ) : (
                    <div className="cb-lines">
                      {lines.map((l) => (
                        <div key={l.key} className="cb-line">
                          <CornerDownRight size={15} className="cb-line-icon" />
                          <select value={l.subcategory_id} onChange={(e) => updateLine(l.key, { subcategory_id: e.target.value })} aria-label="Alt kategori">
                            <option value="">Alt kategori…</option>
                            {subs.map(s => (
                              <option key={s.id} value={s.id} disabled={usedSubs.has(s.id) && Number(l.subcategory_id) !== s.id}>{s.name}</option>
                            ))}
                          </select>
                          <div className="cb-money sm">
                            <b>₺</b>
                            <input ref={(el) => { if (el) amountRefs.current.set(l.key, el); else amountRefs.current.delete(l.key); }}
                              inputMode="decimal" value={l.amount} onChange={(e) => updateLine(l.key, { amount: e.target.value })} placeholder="0,00" aria-label="Tutar" />
                          </div>
                          <input className="cb-line-note" value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} placeholder="Not (isteğe bağlı)" maxLength={500} />
                          <button type="button" className="cb-icon-btn" onClick={() => removeLine(l.key)} title="Satırı kaldır"><X size={15} /></button>
                        </div>
                      ))}
                      <div className="cb-lines-total"><span>{lines.length} kalem</span><strong>{money(total)}</strong></div>
                    </div>
                  )}
                </>
              ) : (
                <div className="cb-row">
                  <label className="cb-field cb-amount-field">
                    <span>Tutar</span>
                    <div className="cb-money"><b>₺</b><input inputMode="decimal" value={single.amount} onChange={(e) => { setError(''); setSingle(s => ({ ...s, amount: e.target.value })); }} placeholder="0,00" autoFocus /></div>
                  </label>
                  {subs.length > 0 && isEdit && (
                    <label className="cb-field">
                      <span>Alt kategori</span>
                      <select value={single.subcategory_id} onChange={(e) => setSingle(s => ({ ...s, subcategory_id: e.target.value }))}>
                        <option value="">— Yok (doğrudan {main.name}) —</option>
                        {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 3. Tarih ve ödeme */}
          <section className="cb-step">
            <span className="cb-step-title"><b>{main ? 3 : 2}</b> Tarih ve {isIncome ? 'tahsilat' : 'ödeme'} yöntemi</span>
            <div className="cb-row">
              <label className="cb-field cb-date-field">
                <span>İşlem tarihi</span>
                <input type="date" value={common.entry_date} max={ymd(new Date())} onChange={(e) => setC({ entry_date: e.target.value })} />
              </label>
              <div className="cb-field grow">
                <span>{isIncome ? 'Tahsilat' : 'Ödeme'} yöntemi</span>
                <div className="cb-method-chips">
                  {METHODS_BY_TYPE[type].map(key => {
                    const m = METHODS[key];
                    return (
                      <button key={key} type="button" className={common.payment_method === key ? 'active' : ''} onClick={() => setC({ payment_method: key })}>
                        <m.Icon size={15} /> {m.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <label className="cb-field">
              <span>Açıklama <small>(isteğe bağlı)</small></span>
              <input value={common.description} onChange={(e) => setC({ description: e.target.value })} maxLength={500}
                placeholder={isIncome ? 'Ör. Cumartesi resim atölyesi' : 'Ör. Ekim ayı faturaları'} />
            </label>
          </section>

          {/* 4. Belge ve KDV (isteğe bağlı) */}
          <section className="cb-step">
            <button type="button" className={`cb-doc-toggle ${showDoc ? 'open' : ''}`} onClick={() => setShowDoc(v => !v)}>
              <FileText size={15} /> Belge ve KDV bilgisi <small>(isteğe bağlı)</small>
              <ChevronDown size={16} className="cb-doc-chev" />
            </button>
            {showDoc && (
              <div className="cb-doc-box">
                <div className="cb-row">
                  <label className="cb-field">
                    <span>Belge türü</span>
                    <select value={common.document_type} onChange={(e) => setC({ document_type: e.target.value })}>
                      {(options?.document_types || []).map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </select>
                  </label>
                  <label className="cb-field">
                    <span>Belge / evrak no</span>
                    <input value={common.document_no} onChange={(e) => setC({ document_no: e.target.value })} placeholder="Ör. ABC2026000000123" maxLength={60} />
                  </label>
                </div>
                <div className="cb-row">
                  <label className="cb-field grow">
                    <span>Cari / firma</span>
                    <input value={common.counterparty} onChange={(e) => setC({ counterparty: e.target.value })} placeholder={isIncome ? 'Ör. müşteri / kurum' : 'Ör. tedarikçi firma'} maxLength={150} />
                  </label>
                  <label className="cb-field">
                    <span>VKN / TCKN</span>
                    <input inputMode="numeric" value={common.tax_number} onChange={(e) => setC({ tax_number: e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="10 / 11 hane" />
                  </label>
                </div>
                <div className="cb-field">
                  <span>KDV oranı</span>
                  <div className="cb-vat">
                    <div className="cb-vat-chips">
                      {VAT_RATES.map(r => (
                        <button key={r} type="button" className={vatRate === r ? 'active' : ''} onClick={() => setC({ vat_rate: r })}>%{r}</button>
                      ))}
                    </div>
                    {vatRate > 0 && (
                      <div className="cb-vat-breakdown">
                        <span>Matrah <strong>{money(total - vatAmount)}</strong></span>
                        <span>KDV <strong>{money(vatAmount)}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
          </>)}

          {error && <div className="cb-error">{error}</div>}
        </div>

        <footer className="cb-modal-foot">
          <span className="cb-foot-total">
            {total > 0 ? <>{isTransfer ? 'Aktarılan' : isIncome ? 'Giren' : 'Çıkan'}: <strong>{money(total)}</strong></> : null}
          </span>
          <button type="button" className="cb-btn" onClick={onClose}>Vazgeç</button>
          {!isEdit && <button type="button" className="cb-btn" disabled={saving} onClick={(e) => submit(e, true)}>Kaydet ve yeni</button>}
          <button type="submit" className={`cb-btn primary ${type}`} disabled={saving}>
            {saving ? 'Kaydediliyor…' : <><Check size={15} /> {isEdit ? 'Güncelle' : 'Kaydet'}</>}
          </button>
        </footer>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Kayıt detayı (satıra tıklayınca)
// ---------------------------------------------------------------------------------------------
function EntryDetail({ entry, siblings, options, canModify, onEdit, onDelete, onClose }) {
  const docLabel = options?.document_types?.find(d => d.key === entry.document_type)?.label;
  const isPos = entry.source !== 'manual';
  const rows = [
    ['Tarih', trDate(entry.entry_date)],
    ['Tür', TYPE_LABEL[entry.entry_type]],
    ...(entry.entry_type === 'transfer'
      ? [['Hesaplar', `${METHODS[entry.payment_method]?.label} → ${METHODS[entry.transfer_to]?.label}`]]
      : [['Ana kategori', entry.category_name]]),
    ['Alt kategori', entry.subcategory_name || '—'],
    ...(entry.entry_type === 'transfer' ? [] : [['Ödeme yöntemi', METHODS[entry.payment_method]?.label]]),
    ...(isPos ? [] : [
      ['Belge', entry.document_type !== 'none' || entry.document_no ? [entry.document_type !== 'none' ? docLabel : null, entry.document_no].filter(Boolean).join(' · ') : '—'],
      ['Cari / firma', entry.counterparty || '—'],
      ['VKN / TCKN', entry.tax_number || '—'],
      ...(entry.vat_rate > 0 ? [['KDV', `%${entry.vat_rate} · ${money(entry.vat_amount)}`], ['Matrah (KDV hariç)', money(entry.net_amount)]] : [])
    ]),
    ['Kaydeden', `${entry.created_by_name || '—'}${entry.created_at ? ` · ${new Date(entry.created_at).toLocaleString('tr-TR')}` : ''}`],
    ...(entry.updated_by_name ? [['Son düzenleyen', `${entry.updated_by_name} · ${new Date(entry.updated_at).toLocaleString('tr-TR')}`]] : [])
  ];
  return (
    <div className="cb-modal-backdrop" onMouseDown={onClose}>
      <div className="cb-modal cb-detail" onMouseDown={(e) => e.stopPropagation()}>
        <header className="cb-modal-head">
          <div>
            <h3 className={entry.entry_type === 'income' ? 'income' : 'expense'}>
              {entry.entry_type === 'income' ? '+' : entry.entry_type === 'expense' ? '−' : '↔ '}{money(entry.amount)}
            </h3>
            <p>{pathOf(entry)}{entry.description ? ` — ${entry.description}` : ''}</p>
          </div>
          <button type="button" className="cb-icon-btn" onClick={onClose} title="Kapat"><X size={18} /></button>
        </header>
        <div className="cb-modal-body">
          <dl className="cb-detail-list">
            {rows.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
          </dl>
          {siblings.length > 1 && (
            <div className="cb-siblings">
              <strong><Layers size={14} /> Aynı kayıtta girilen kalemler</strong>
              {siblings.map(s => (
                <p key={s.id} className={s.id === entry.id ? 'current' : ''}>
                  <span>{s.subcategory_name || s.category_name}</span><b>{money(s.amount)}</b>
                </p>
              ))}
              <p className="sum"><span>Toplam</span><b>{money(siblings.reduce((t, s) => t + s.amount, 0))}</b></p>
            </div>
          )}
          {isPos && (
            <p className="cb-note"><Info size={15} /> Bu satır bugünün POS tahsilatlarından canlı hesaplanır. Gün bitince (gece 00:00’dan sonra) günün cirosu ayrıntılı raporuyla birlikte kalıcı olarak kaydedilir.</p>
          )}
        </div>
        {!isPos && (canModify.edit || canModify.delete) && (
          <footer className="cb-modal-foot">
            {canModify.delete && <button type="button" className="cb-btn danger" onClick={onDelete}><Trash2 size={15} /> Sil</button>}
            {canModify.edit && <button type="button" className="cb-btn primary" onClick={onEdit}><Pencil size={15} /> Düzenle</button>}
          </footer>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Gün sonu ciro raporu (gece kaydedilen günün ayrıntısı)
// ---------------------------------------------------------------------------------------------
const WEEKDAY = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'long' });

function DailyReportModal({ date, canRecalc, onClose, onChanged, onOpenZReport }) {
  const { showToast } = useToast();
  const [closing, setClosing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);

  const load = useCallback(() => {
    axios.get(`/api/cashbook/closings/${date}`)
      .then(res => setClosing(res.data.closing))
      .catch(err => setError(err.response?.data?.message || 'Gün sonu raporu alınamadı.'));
  }, [date]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const recalc = async () => {
    try {
      setBusy(true);
      const res = await axios.post(`/api/cashbook/closings/${date}/recalculate`);
      showToast(res.data.message, 'updated');
      load();
      onChanged();
    } catch (err) {
      showToast(err.response?.data?.message || 'Yeniden hesaplanamadı.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const d = closing?.details;
  const s = d?.sales;
  const c = d?.collections;
  const hours = (d?.hourly || []).filter(h => h.orders > 0);
  const hourRange = hours.length ? (d.hourly || []).filter(h => h.hour >= hours[0].hour && h.hour <= hours.at(-1).hour) : [];
  const maxHour = Math.max(1, ...hourRange.map(h => h.net));
  // Eski gün sonu kayıtlarında ciro alanı yok: ürün satışı + bahşişten hesaplanır
  const closingTip = s?.tip ?? d?.tips?.total ?? 0;
  const netCiro = s?.revenue ?? ((s?.net ?? 0) + closingTip);
  const catTotal = (d?.categories || []).reduce((t, x) => t + x.revenue, 0);
  const products = d?.products || [];
  const shownProducts = showAllProducts ? products : products.slice(0, 10);

  return (
    <div className="cb-modal-backdrop" onMouseDown={onClose}>
      <div className="cb-modal cb-report" onMouseDown={(e) => e.stopPropagation()}>
        <header className="cb-modal-head">
          <div>
            <h3>Gün Sonu Ciro Raporu</h3>
            <p>
              {trDate(date)} {WEEKDAY(date)}
              {closing && (closing.trigger_type === 'auto'
                ? ` · Otomatik kaydedildi (${new Date(closing.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`
                : ` · ${closing.updated_by_name ? `${closing.updated_by_name} tarafından` : 'Elle'} ${closing.updated_at ? 'yeniden hesaplandı' : 'kaydedildi'}`)}
            </p>
          </div>
          <button type="button" className="cb-icon-btn" onClick={onClose} title="Kapat"><X size={18} /></button>
        </header>

        <div className="cb-modal-body">
          {error && <div className="cb-error">{error}</div>}
          {!closing && !error && <div className="cb-empty">Yükleniyor…</div>}
          {closing && (
            <>
              <div className="cb-rep-kpis">
                <div><span>Net ciro</span><strong>{money(netCiro)}</strong></div>
                <div className="hl"><span>Deftere işlenen ciro</span><strong>{money(closing.cash_amount + closing.card_amount)}</strong></div>
                <div><span>Adisyon</span><strong>{s.order_count}</strong></div>
                <div><span>Ortalama adisyon</span><strong>{money(s.average_ticket)}</strong></div>
              </div>

              <div className="cb-rep-grid">
                <section className="cb-rep-card">
                  <h4>Tahsilatlar</h4>
                  <dl className="cb-rep-list">
                    <dt><Banknote size={14} /> Nakit</dt><dd>{money(c.cash)}</dd>
                    <dt><CreditCard size={14} /> Kart</dt><dd>{money(c.card)}</dd>
                    <dt className="total">Kasaya giren toplam</dt><dd className="total">{money(c.drawer_total)}</dd>
                    {c.account_collections > 0 && <><dt className="sub">↳ içindeki cari tahsilat</dt><dd className="sub">{money(c.account_collections)}</dd></>}
                    {(d.tips?.total ?? c.tip) > 0 && <><dt className="sub">↳ içindeki bahşiş</dt><dd className="sub">{money(d.tips?.total ?? c.tip)}</dd></>}
                    <dt className="total">Deftere işlenen ciro</dt><dd className="total">{money(closing.cash_amount + closing.card_amount)}</dd>
                    <dt className="muted">Veresiye (kasaya girmedi)</dt><dd className="muted">{money(c.veresiye)}</dd>
                  </dl>
                  <p className="cb-rep-note">
                    {c.payment_count} ödeme: {c.counts.cash} nakit · {c.counts.credit_card} kart · {c.counts.mixed} parçalı · {c.counts.veresiye} veresiye
                  </p>
                </section>

                <section className="cb-rep-card">
                  <h4>Satış kırılımı</h4>
                  <dl className="cb-rep-list">
                    <dt>Brüt satış</dt><dd>{money(s.gross)}</dd>
                    <dt className="neg">− İndirim</dt><dd className="neg">{money(s.discount)}</dd>
                    <dt className="neg">− İkram</dt><dd className="neg">{money(s.complimentary)}</dd>
                    <dt className="neg">− İade</dt><dd className="neg">{money(s.returned)}</dd>
                    {closingTip > 0 && <><dt>+ Bahşiş</dt><dd>{money(closingTip)}</dd></>}
                    <dt className="total">Net ciro</dt><dd className="total">{money(netCiro)}</dd>
                    <dt className="muted">İptal (satışa dahil değil)</dt><dd className="muted">{money(s.voided)}</dd>
                    {s.unpaid_closed > 0 && <><dt className="muted">Tahsil edilmeden kapatılan</dt><dd className="muted">{money(s.unpaid_closed)}</dd></>}
                  </dl>
                  <p className="cb-rep-note">{s.item_qty} ürün · adisyon başına {s.items_per_ticket} ürün · ortalama masa süresi {s.avg_duration_min} dk</p>
                </section>
              </div>

              {hourRange.length > 0 && (
                <section className="cb-rep-card">
                  <h4>Saatlik satış</h4>
                  <div className="cb-rep-hours">
                    {hourRange.map(h => (
                      <div key={h.hour} className="cb-rep-hour" title={`${pad(h.hour)}:00 — ${money(h.net)} · ${h.orders} adisyon`}>
                        <span className="bar"><i style={{ height: `${Math.max((h.net / maxHour) * 100, h.net ? 4 : 0)}%` }} /></span>
                        <em>{pad(h.hour)}</em>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {(d.categories || []).length > 0 && (
                <section className="cb-rep-card">
                  <h4>Kategori satışları</h4>
                  <ul className="cb-bars">
                    {d.categories.map(cat => {
                      const pct = catTotal ? Math.round((cat.revenue / catTotal) * 100) : 0;
                      return (
                        <li key={cat.category_name}>
                          <div className="cb-bar-top"><span>{cat.category_name}</span><strong>{money(cat.revenue)}</strong></div>
                          <div className="cb-bar income"><i style={{ width: `${Math.max(pct, 2)}%` }} /></div>
                          <em>%{pct} · {cat.qty} adet</em>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {products.length > 0 && (
                <section className="cb-rep-card">
                  <h4>Ürün satışları <small>{products.length} ürün</small></h4>
                  <table className="cb-rep-table">
                    <thead><tr><th>Ürün</th><th className="num">Adet</th><th className="num">Tutar</th></tr></thead>
                    <tbody>
                      {shownProducts.map(p => (
                        <tr key={`${p.product_name}-${p.category_name}`}>
                          <td>
                            <strong>{p.product_name}</strong>
                            <span>
                              {p.category_name}
                              {p.comp_qty > 0 && <em className="tag">{p.comp_qty} ikram</em>}
                              {p.returned_qty > 0 && <em className="tag">{p.returned_qty} iade</em>}
                              {p.voided_qty > 0 && <em className="tag">{p.voided_qty} iptal</em>}
                            </span>
                          </td>
                          <td className="num">{p.qty}</td>
                          <td className="num">{money(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {products.length > 10 && (
                    <button type="button" className="cb-link" onClick={() => setShowAllProducts(v => !v)}>
                      {showAllProducts ? 'Daha az göster' : `Tüm ürünleri göster (+${products.length - 10})`}
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        <footer className="cb-modal-foot">
          {onOpenZReport && (
            <button type="button" className="cb-btn" onClick={onOpenZReport} title="Aynı günün Z-raporunu Gün Sonu & Raporlar ekranında aç">
              <Receipt size={15} /> Z-Raporu
            </button>
          )}
          {canRecalc && closing && (
            <button type="button" className="cb-btn" onClick={recalc} disabled={busy} title="Bu günün tahsilat ve satışlarını güncel verilerle yeniden hesaplar">
              <RefreshCw size={15} /> {busy ? 'Hesaplanıyor…' : 'Yeniden hesapla'}
            </button>
          )}
          <button type="button" className="cb-btn primary" onClick={onClose}>Kapat</button>
        </footer>
      </div>
    </div>
  );
}

// Silme: gerekçe zorunlu (kayıt arşivlenir, işlem günlüğüne yazılır)
function DeleteDialog({ entry, onClose, onDeleted }) {
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError('Silme gerekçesini yazın.');
    try {
      setBusy(true);
      const res = await axios.delete(`/api/cashbook/${entry.id}`, { data: { reason: reason.trim() } });
      showToast(res.data.message, 'deleted');
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.message || 'Kayıt silinemedi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cb-modal-backdrop" onMouseDown={onClose}>
      <form className="cb-modal cb-small" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="cb-modal-head">
          <div>
            <h3>Kayıt silinsin mi?</h3>
            <p>{trDate(entry.entry_date)} · {pathOf(entry)} · {money(entry.amount)}</p>
          </div>
          <button type="button" className="cb-icon-btn" onClick={onClose} title="Kapat"><X size={18} /></button>
        </header>
        <div className="cb-modal-body">
          <p className="cb-note warn"><Archive size={15} /> Kayıt defterden düşer ama silinmez; gerekçesiyle arşivlenir ve işlem günlüğüne yazılır.</p>
          <label className="cb-field">
            <span>Silme gerekçesi <small className="req">*</small></span>
            <input value={reason} onChange={(e) => { setError(''); setReason(e.target.value); }} placeholder="Ör. Tutar yanlış girildi, yeniden girilecek" maxLength={255} autoFocus />
          </label>
          {error && <div className="cb-error">{error}</div>}
        </div>
        <footer className="cb-modal-foot">
          <button type="button" className="cb-btn" onClick={onClose}>Vazgeç</button>
          <button type="submit" className="cb-btn danger solid" disabled={busy}><Trash2 size={15} /> Kaydı sil</button>
        </footer>
      </form>
    </div>
  );
}

// Kategori yönetimi: ana kategoriler ve altlarındaki alt kategoriler
function CategoriesModal({ options, onClose, onChanged }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState('expense');
  const [newMain, setNewMain] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const [newSub, setNewSub] = useState({}); // ana kategori id -> yazılan ad
  const [editing, setEditing] = useState(null); // { id, name }
  const tree = buildTree(options?.categories, tab);

  const run = async (fn) => {
    try {
      const res = await fn();
      showToast(res.data.message, 'updated');
      onChanged(res.data);
      return res.data;
    } catch (err) {
      showToast(err.response?.data?.message || 'İşlem yapılamadı.', 'error');
      return null;
    }
  };
  const toggleOpen = (id) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addMain = async (e) => {
    e.preventDefault();
    if (newMain.trim().length < 2) return;
    const data = await run(() => axios.post('/api/cashbook/categories', { entry_type: tab, name: newMain.trim() }));
    if (data) { setNewMain(''); setOpen(s => new Set(s).add(data.id)); }
  };
  const addSub = async (parentId) => {
    const name = (newSub[parentId] || '').trim();
    if (name.length < 2) return;
    if (await run(() => axios.post('/api/cashbook/categories', { parent_id: parentId, name }))) setNewSub(s => ({ ...s, [parentId]: '' }));
  };
  const rename = async () => {
    if (!editing || editing.name.trim().length < 2) return;
    if (await run(() => axios.put(`/api/cashbook/categories/${editing.id}`, { name: editing.name.trim() }))) setEditing(null);
  };

  // Satır bir bileşen değil, çizim fonksiyonu: her çizimde yeniden bağlanıp yeniden adlandırma kutusunun odağını kaybetmesin
  const renderRow = (c, isSub = false) => (
    <div className={`cb-cat-item ${isSub ? 'sub' : 'main'} ${c.is_active ? '' : 'inactive'}`}>
      {isSub ? <CornerDownRight size={14} className="cb-cat-sub-icon" /> : (
        <button type="button" className="cb-cat-expand" onClick={() => toggleOpen(c.id)} aria-label="Alt kategorileri aç/kapat">
          {open.has(c.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      )}
      {editing?.id === c.id ? (
        <input value={editing.name} autoFocus maxLength={100}
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rename(); } if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} />
      ) : (
        <span className="cb-cat-name" onClick={() => !isSub && toggleOpen(c.id)}>
          {c.name}
          {!isSub && <em className="count">{c.children.length} alt</em>}
          {c.system_key && <em className="system">otomatik</em>}
          {!c.is_active && <em>pasif</em>}
        </span>
      )}
      <span className="cb-cat-usage">{c.usage_count} kayıt</span>
      {editing?.id === c.id ? (
        <>
          <button type="button" className="cb-icon-btn" onClick={rename} title="Kaydet"><Check size={15} /></button>
          <button type="button" className="cb-icon-btn" onClick={() => setEditing(null)} title="Vazgeç"><X size={15} /></button>
        </>
      ) : (
        <>
          <button type="button" className="cb-icon-btn" onClick={() => setEditing({ id: c.id, name: c.name })} title="Yeniden adlandır"><Pencil size={14} /></button>
          {!c.system_key && <button type="button" className={`cb-toggle ${c.is_active ? 'on' : ''}`} title={c.is_active ? 'Pasife al' : 'Aktif et'}
            onClick={() => run(() => axios.put(`/api/cashbook/categories/${c.id}`, { is_active: !c.is_active }))}>
            <span />
          </button>}
        </>
      )}
    </div>
  );

  return (
    <div className="cb-modal-backdrop" onMouseDown={onClose}>
      <div className="cb-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="cb-modal-head">
          <div>
            <h3>Gelir & Gider Kategorileri</h3>
            <p>Ana kategorilerin altına alt kategoriler ekleyin. Kullanılmış kategori silinmez; pasife alınınca yeni kayıtlarda görünmez.</p>
          </div>
          <button type="button" className="cb-icon-btn" onClick={onClose} title="Kapat"><X size={18} /></button>
        </header>
        <div className="cb-modal-body">
          <div className="cb-type-switch" role="group">
            <button type="button" className={`income ${tab === 'income' ? 'active' : ''}`} onClick={() => setTab('income')}><ArrowDownLeft size={16} /> Gelir kategorileri</button>
            <button type="button" className={`expense ${tab === 'expense' ? 'active' : ''}`} onClick={() => setTab('expense')}><ArrowUpRight size={16} /> Gider kategorileri</button>
          </div>
          <form className="cb-cat-add" onSubmit={addMain}>
            <input value={newMain} onChange={(e) => setNewMain(e.target.value)} placeholder="Yeni ana kategori adı (ör. Etkinlik Giderleri)" maxLength={100} />
            <button type="submit" className="cb-btn primary" disabled={newMain.trim().length < 2}><Plus size={15} /> Ana kategori</button>
          </form>
          <div className="cb-cat-list">
            {tree.map(m => (
              <div key={m.id} className="cb-cat-group">
                {renderRow(m)}
                {open.has(m.id) && (
                  <div className="cb-cat-children">
                    {m.children.map(s => <React.Fragment key={s.id}>{renderRow(s, true)}</React.Fragment>)}
                    {!m.system_key && <form className="cb-cat-add sub" onSubmit={(e) => { e.preventDefault(); addSub(m.id); }}>
                      <CornerDownRight size={14} />
                      <input value={newSub[m.id] || ''} onChange={(e) => setNewSub(s => ({ ...s, [m.id]: e.target.value }))} placeholder={`"${m.name}" altına alt kategori`} maxLength={100} />
                      <button type="submit" className="cb-btn" disabled={(newSub[m.id] || '').trim().length < 2}><Plus size={14} /> Ekle</button>
                    </form>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Ana kategori → alt kategori kırılımlı dağılım
function Breakdown({ title, items, total, tone, empty }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="cb-side-card">
      <h4>{title}</h4>
      {items.length === 0 ? <p className="cb-side-empty">{empty}</p> : (
        <ul className="cb-bars">
          {items.map(it => {
            const pct = total > 0 ? Math.round((it.total / total) * 100) : 0;
            const hasKids = it.children.length > 0;
            const isOpen = openId === it.name;
            return (
              <li key={it.name}>
                <button type="button" className={`cb-bar-top ${hasKids ? 'has-kids' : ''}`} onClick={() => hasKids && setOpenId(isOpen ? null : it.name)}>
                  <span>{hasKids && (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}{it.name}</span>
                  <strong>{money(it.total)}</strong>
                </button>
                <div className={`cb-bar ${tone}`}><i style={{ width: `${Math.max(pct, 2)}%` }} /></div>
                <em>%{pct} · {it.count} kayıt{hasKids ? ` · ${it.children.length} alt kategori` : ''}</em>
                {isOpen && (
                  <ul className="cb-bars-sub">
                    {it.children.map(c => (
                      <li key={c.name}>
                        <span>{c.name}</span>
                        <i className={tone} style={{ width: `${it.total > 0 ? Math.max(Math.round((c.total / it.total) * 100), 3) : 0}%` }} />
                        <strong>{money(c.total)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Sayfa
// ---------------------------------------------------------------------------------------------
export default function CashBook() {
  const { user, can } = useAuth();
  const { showToast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Z-raporundan gelindiğinde (?gun=YYYY-MM-DD) o gün seçili açılır ve gün sonu raporu gösterilir
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedDay = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('gun') || '') ? searchParams.get('gun') : null;
  const [period, setPeriod] = useState(linkedDay ? 'custom' : 'month');
  const [custom, setCustom] = useState(() => (linkedDay ? { startDate: linkedDay, endDate: linkedDay } : periodRange('month')));
  const [filters, setFilters] = useState({ entry_type: '', category_id: '', subcategory_id: '', payment_method: '', include_pos: true });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(() => (linkedDay && linkedDay < ymd(new Date()) ? { kind: 'closing', date: linkedDay } : null)); // { kind: 'entry'|'detail'|'delete'|'categories'|'closing', entry?, date? }
  useEffect(() => { if (linkedDay) setSearchParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [exporting, setExporting] = useState(false);

  const canCreate = can('cashbook.create');
  const canExport = can('cashbook.export');
  const canManageCats = can('cashbook.edit');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const range = period === 'custom' ? custom : periodRange(period);
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (range?.startDate) p.set('startDate', range.startDate);
    if (range?.endDate) p.set('endDate', range.endDate);
    Object.entries(filters).forEach(([k, v]) => {
      if (k === 'include_pos') { if (!v) p.set('include_pos', '0'); } else if (k !== 'subcategory_id' && v) p.set(k, v);
    });
    // Alt kategori seçiliyse yalnızca o alt kategori, değilse ana kategorinin tamamı filtrelenir
    if (filters.subcategory_id) p.set('category_id', filters.subcategory_id);
    if (debouncedSearch) p.set('search', debouncedSearch);
    return p.toString();
  }, [range?.startDate, range?.endDate, filters, debouncedSearch]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/cashbook?${query}`);
      setData(res.data);
    } catch (err) {
      showToast(err.response?.data?.message || 'Kasa defteri yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  }, [query, showToast]);

  const loadOptions = useCallback(() => axios.get('/api/cashbook/options').then(res => setOptions(res.data)).catch(() => {}), []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadOptions(); }, [loadOptions]);

  // Başka cihazda kayıt girilince / POS'ta tahsilat alınınca defteri yenile
  useEffect(() => {
    const socket = createSocket();
    socket.on('resync', () => { load(); loadOptions(); });
    socket.on('cashbook:changed', () => { load(); loadOptions(); });
    socket.on('payment:completed', () => load());
    return () => socket.disconnect();
  }, [load, loadOptions]);

  const setFilter = (patch) => setFilters(f => ({ ...f, ...patch }));
  const clearFilters = () => { setFilters(f => ({ ...f, entry_type: '', category_id: '', subcategory_id: '', payment_method: '' })); setSearch(''); };
  const activeFilterCount = ['entry_type', 'category_id', 'payment_method'].filter(k => filters[k]).length + (debouncedSearch ? 1 : 0);

  const s = data?.summary;
  const entries = data?.entries || [];
  // Bakiye sunucuda eskiden yeniye hesaplanır; tabloda en yeni hareket en üstte gösterilir (devreden bakiye en altta)
  const rows = useMemo(() => [...entries].reverse(), [entries]);
  const byMethod = Object.fromEntries((s?.by_method || []).map(m => [m.method, m]));

  const modifyRights = (entry) => {
    const own = entry.created_by_user_id === user?.id && sameDay(entry.created_at) && canCreate;
    return { edit: can('cashbook.edit') || own, delete: can('cashbook.delete') || own };
  };
  const siblingsOf = (entry) => (entry.batch_id ? entries.filter(e => e.batch_id === entry.batch_id) : [entry]);

  // Filtre: ana kategori (altları dahil) ya da tek bir alt kategori
  const filterGroups = ['income', 'expense']
    .filter(t => !filters.entry_type || filters.entry_type === t)
    .map(t => ({ type: t, tree: buildTree(options?.categories, t) }));
  const filterSubs = filterGroups.flatMap(g => g.tree).find(m => String(m.id) === String(filters.category_id))?.children || [];

  const exportExcel = async () => {
    try {
      setExporting(true);
      const res = await apiFetch(`/api/cashbook/export?${query}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Excel dosyası oluşturulamadı.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Kasa_Defteri_${range?.startDate || 'tum'}_${range?.endDate || ymd(new Date())}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const periodLabel = range?.startDate
    ? (range.startDate === range.endDate ? trDate(range.startDate) : `${trDate(range.startDate)} – ${trDate(range.endDate)}`)
    : 'Tüm kayıtlar';

  return (
    <div className="pos-page-container">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        title="Kasa Defteri"
        actions={canCreate && (
          // Tek düğme: kayıtların çoğu gider olduğu için form gider olarak açılır, içinden gelire geçilebilir
          <button type="button" className="pos-edit-btn cb-new-btn" onClick={() => setModal({ kind: 'entry', entry: { entry_type: 'expense' } })}>
            <Plus size={16} /><span>Yeni Kayıt</span>
          </button>
        )}
      />

      <div className="cb-page">
        {/* Dönem ve araçlar */}
        <div className="cb-toolbar">
          <div className="cb-periods" role="group" aria-label="Dönem">
            {PERIODS.map(p => (
              <button key={p.id} type="button" className={period === p.id ? 'active' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="cb-custom-range">
              <input type="date" value={custom.startDate} max={custom.endDate} onChange={(e) => setCustom(c => ({ ...c, startDate: e.target.value }))} aria-label="Başlangıç" />
              <span>–</span>
              <input type="date" value={custom.endDate} min={custom.startDate} max={ymd(new Date())} onChange={(e) => setCustom(c => ({ ...c, endDate: e.target.value }))} aria-label="Bitiş" />
            </div>
          )}
          <div className="cb-toolbar-right">
            {canManageCats && (
              <button type="button" className="cb-btn" onClick={() => setModal({ kind: 'categories' })}><Tags size={15} /> Kategoriler</button>
            )}
            {canExport && (
              <button type="button" className="cb-btn excel" onClick={exportExcel} disabled={exporting || !data}>
                <FileSpreadsheet size={15} /> {exporting ? 'Hazırlanıyor…' : 'Excel'}
              </button>
            )}
          </div>
        </div>

        {/* Özet kartları */}
        <div className="cb-kpis">
          <div className="cb-kpi">
            <span className="cb-kpi-icon neutral"><Archive size={18} /></span>
            <div><span>Devreden bakiye</span><strong>{money(s?.opening)}</strong><em>{range?.startDate ? `${trDate(range.startDate)} öncesi` : 'Dönem başı'}</em></div>
          </div>
          <div className="cb-kpi">
            <span className="cb-kpi-icon income"><ArrowDownLeft size={18} /></span>
            <div><span>Toplam gelir</span><strong className="income">{money(s?.total_income)}</strong><em>{s?.income_count ?? 0} kayıt{s?.pos_income ? ` · POS ${money(s.pos_income)}` : ''}</em></div>
          </div>
          <div className="cb-kpi">
            <span className="cb-kpi-icon expense"><ArrowUpRight size={18} /></span>
            <div><span>Toplam gider</span><strong className="expense">{money(s?.total_expense)}</strong><em>{s?.expense_count ?? 0} kayıt</em></div>
          </div>
          <div className="cb-kpi">
            <span className={`cb-kpi-icon ${(s?.net ?? 0) >= 0 ? 'income' : 'expense'}`}><Scale size={18} /></span>
            <div><span>Dönem net sonucu</span><strong className={(s?.net ?? 0) >= 0 ? 'income' : 'expense'}>{money(s?.net)}</strong><em>Gelir − Gider</em></div>
          </div>
          <div className="cb-kpi highlight">
            <span className="cb-kpi-icon brand"><Wallet size={18} /></span>
            <div><span>Dönem sonu bakiye</span><strong>{money(s?.closing)}</strong><em>Nakit kasa: {money(byMethod.cash?.closing)}</em></div>
          </div>
        </div>

        <div className="cb-main">
          {/* Defter */}
          <section className="cb-ledger-card">
            <div className="cb-filters">
              <div className="cb-type-filter" role="group" aria-label="Tür">
                {[['', 'Tümü'], ['income', 'Gelir'], ['expense', 'Gider'], ['transfer', 'Transfer']].map(([k, l]) => (
                  <button key={k || 'all'} type="button" className={`${filters.entry_type === k ? 'active' : ''} ${k}`} onClick={() => setFilter({ entry_type: k, category_id: '', subcategory_id: '' })}>{l}</button>
                ))}
              </div>
              <select value={filters.category_id} onChange={(e) => setFilter({ category_id: e.target.value, subcategory_id: '' })} aria-label="Kategori">
                <option value="">Tüm kategoriler</option>
                {filterGroups.map(g => (
                  <optgroup key={g.type} label={g.type === 'income' ? 'Gelir' : 'Gider'}>
                    {g.tree.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </optgroup>
                ))}
              </select>
              <select value={filters.subcategory_id} onChange={(e) => setFilter({ subcategory_id: e.target.value })}
                disabled={!filterSubs.length} aria-label="Alt kategori"
                title={!filters.category_id ? 'Önce kategori seçin' : (!filterSubs.length ? 'Bu kategorinin alt kategorisi yok' : undefined)}>
                <option value="">{!filters.category_id ? 'Alt kategori' : (filterSubs.length ? 'Tüm alt kategoriler' : 'Alt kategorisi yok')}</option>
                {filterSubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={filters.payment_method} onChange={(e) => setFilter({ payment_method: e.target.value })} aria-label="Ödeme yöntemi">
                <option value="">Tüm ödeme yöntemleri</option>
                {Object.entries(METHODS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
              <label className="cb-search">
                <Search size={15} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kategori, açıklama, cari, belge no" />
                {search && <button type="button" onClick={() => setSearch('')} title="Temizle"><X size={14} /></button>}
              </label>
              <label className="cb-pos-toggle" title="POS'ta alınan nakit ve kartlı tahsilatlar günlük olarak gelire eklenir">
                <input type="checkbox" checked={filters.include_pos} onChange={(e) => setFilter({ include_pos: e.target.checked })} />
                <Zap size={14} /> POS tahsilatları
              </label>
              {activeFilterCount > 0 && (
                <button type="button" className="cb-clear" onClick={clearFilters}><X size={13} /> Filtreleri temizle ({activeFilterCount})</button>
              )}
            </div>

            <div className="cb-period-line">
              <span><strong>{periodLabel}</strong> · {entries.length} hareket</span>
              {data?.truncated && <span className="warn">İlk 5000 kayıt gösteriliyor; dönemi daraltın.</span>}
              {data && !data.include_pos && filters.include_pos && <span className="muted">Seçili filtrelerde POS tahsilatları gösterilmez.</span>}
            </div>

            {loading && !data ? (
              <div className="cb-empty">Yükleniyor…</div>
            ) : (
              <div className="cb-table-wrap">
                <table className="cb-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Kategori</th>
                      <th>Evrak</th>
                      <th>Ödeme</th>
                      <th className="num">Gelir</th>
                      <th className="num">Gider</th>
                      <th className="num">Bakiye</th>
                      <th aria-label="Detay" />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 && (
                      <tr className="cb-empty-tr"><td colSpan={8} className="cb-empty-row">
                        <Receipt size={26} />
                        <strong>{activeFilterCount ? 'Filtreye uyan hareket yok' : 'Bu dönemde kayıt yok'}</strong>
                        {canCreate && !activeFilterCount && <span>Sağ üstteki <b>Yeni Kayıt</b> düğmesiyle ilk kaydı ekleyin.</span>}
                      </td></tr>
                    )}
                    {rows.map((e, i) => {
                      const MethodIcon = METHODS[e.payment_method]?.Icon || CircleDollarSign;
                      const docLabel = options?.document_types?.find(d => d.key === e.document_type)?.label;
                      const inBatch = e.batch_id && (rows[i - 1]?.batch_id === e.batch_id);
                      return (
                        <tr key={e.id} className={`cb-row-${e.entry_type} ${e.source !== 'manual' ? 'is-pos' : ''} ${inBatch ? 'in-batch' : ''}`}
                          onClick={() => setModal(e.source === 'pos_daily' ? { kind: 'closing', date: e.entry_date } : { kind: 'detail', entry: e })}>
                          <td className="cb-date">{trDate(e.entry_date)}</td>
                          {e.source !== 'manual' ? (
                          <td className="cb-cat cb-ciro">
                            <strong>
                              {trDate(e.entry_date)} Günlük Ciro
                              <span className="cb-ciro-badge">{e.source === 'pos_live' ? 'Canlı · henüz kaydedilmedi' : 'Otomatik kayıt'}</span>
                            </strong>
                            <span>
                              <b>{e.subcategory_name}</b>
                              {e.description && <> · {e.description.split(' — ').slice(1).join(' — ') || e.description}</>}
                            </span>
                          </td>
                          ) : (
                          <td className="cb-cat">
                            <strong>
                              {e.entry_type === 'transfer' && <ArrowLeftRight size={13} className="cb-transfer-icon" />}
                              {e.category_name}
                              {e.subcategory_name && <><span className="cb-sep">›</span><span className="cb-subname">{e.subcategory_name}</span></>}
                              {e.batch_id && !inBatch && <span className="cb-batch-tag" title="Aynı kayıtta birden çok kalem girildi"><Layers size={11} /> toplu</span>}
                            </strong>
                            {(e.description || e.counterparty) && <span>{[e.description, e.counterparty].filter(Boolean).join(' · ')}</span>}
                          </td>
                          )}
                          <td className="cb-doc">
                            {e.source === 'pos_daily' ? <span className="cb-auto">Gün sonu<em>Raporu aç</em></span> : e.source === 'pos_live' ? <span className="cb-auto">Canlı</span> : (e.document_type !== 'none' || e.document_no) ? (
                              <>
                                <span>{e.document_type !== 'none' ? docLabel : 'Evrak'}</span>
                                {e.document_no && <em>{e.document_no}</em>}
                              </>
                            ) : <span className="cb-muted">—</span>}
                          </td>
                          {e.entry_type === 'transfer' ? (
                            <>
                              <td className="cb-method">{METHODS[e.payment_method]?.short} → {METHODS[e.transfer_to]?.short}</td>
                              <td className="num transfer" colSpan={2}><ArrowLeftRight size={13} /> {money(e.amount)}</td>
                            </>
                          ) : (
                            <>
                              <td className="cb-method"><MethodIcon size={14} /> {METHODS[e.payment_method]?.short}</td>
                              <td className="num income">{e.entry_type === 'income' ? money(e.amount) : ''}</td>
                              <td className="num expense">{e.entry_type === 'expense' ? money(e.amount) : ''}</td>
                            </>
                          )}
                          <td className={`num bal ${e.balance < 0 ? 'neg' : ''}`}>{money(e.balance)}</td>
                          <td className="cb-chev"><ChevronRight size={16} /></td>
                        </tr>
                      );
                    })}
                    <tr className="cb-devir">
                      <td className="cb-date">{range?.startDate ? trDate(range.startDate) : ''}</td>
                      <td className="cb-cat" colSpan={5}>Devreden bakiye</td>
                      <td className="num bal">{money(s?.opening)}</td>
                      <td />
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Dönem toplamı</td>
                      <td className="num income">{money(s?.total_income)}</td>
                      <td className="num expense">{money(s?.total_expense)}</td>
                      <td className="num bal">{money(s?.closing)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* Yan panel: hesaplar, dağılımlar, KDV */}
          <aside className="cb-side">
            <div className="cb-side-card">
              <h4>Hesap bakiyeleri</h4>
              <ul className="cb-accounts">
                {Object.entries(METHODS).map(([k, m]) => {
                  const row = byMethod[k];
                  const tNet = (row?.transfer_in || 0) - (row?.transfer_out || 0);
                  const isCompanyCard = k === 'company_card';
                  return (
                    <li key={k}>
                      <span className="cb-acc-icon"><m.Icon size={16} /></span>
                      <div>
                        <strong>{m.label}</strong>
                        <em>
                          {isCompanyCard ? `Harcama ${money(row?.expense)}` : `+${money(row?.income)} · −${money(row?.expense)}`}
                          {tNet !== 0 && ` · transfer ${tNet > 0 ? '+' : ''}${money(tNet)}`}
                        </em>
                      </div>
                      <b className={(row?.closing ?? 0) < 0 ? 'neg' : ''}>
                        {isCompanyCard && (row?.closing ?? 0) < 0 ? <><small>Borç</small> {money(-row.closing)}</> : money(row?.closing)}
                      </b>
                    </li>
                  );
                })}
              </ul>
              <p className="cb-side-note">
                POS / Kart Tahsilatı müşteriden kartla alınan paradır. Şirket kartıyla yapılan harcamalar borç olarak birikir;
                ekstreyi bankadan ödediğinizde <b>Transfer</b> girin (Banka → Şirket Kredi Kartı), gider olarak tekrar girmeyin.
              </p>
            </div>

            <Breakdown title="Gider dağılımı" items={s?.expense_categories || []} total={s?.total_expense || 0} tone="expense" empty="Bu dönemde gider yok." />
            <Breakdown title="Gelir dağılımı" items={s?.income_categories || []} total={s?.total_income || 0} tone="income" empty="Bu dönemde gelir yok." />

            {((s?.vat?.output_vat || 0) > 0 || (s?.vat?.input_vat || 0) > 0) && (
              <div className="cb-side-card">
                <h4>KDV özeti</h4>
                <dl className="cb-vat-sum">
                  <dt>Hesaplanan KDV (satış)</dt><dd>{money(s?.vat?.output_vat)}</dd>
                  <dt>İndirilecek KDV (alış/gider)</dt><dd>{money(s?.vat?.input_vat)}</dd>
                  <dt className="total">{(s?.vat?.payable ?? 0) >= 0 ? 'Ödenecek KDV (tahmini)' : 'Devreden KDV (tahmini)'}</dt>
                  <dd className="total">{money(Math.abs(s?.vat?.payable || 0))}</dd>
                </dl>
                <p className="cb-side-note">Yalnızca KDV oranı girilen kayıtlardan hesaplanır; POS satışlarının KDV’si Z raporlarından ayrıca hesaplanır.</p>
              </div>
            )}
          </aside>
        </div>
      </div>

      {modal?.kind === 'entry' && (
        <EntryModal
          options={options}
          initial={modal.entry}
          onClose={() => setModal(null)}
          onSaved={(keepOpen) => { if (!keepOpen) setModal(null); load(); loadOptions(); }}
        />
      )}
      {modal?.kind === 'closing' && (
        <DailyReportModal
          date={modal.date}
          canRecalc={can('cashbook.edit')}
          onClose={() => setModal(null)}
          onChanged={load}
          onOpenZReport={can('reports.z_report') && can('reports.history') ? () => navigate(`/raporlar?gun=${modal.date}&z=1`) : null}
        />
      )}
      {modal?.kind === 'detail' && (
        <EntryDetail
          entry={modal.entry}
          siblings={siblingsOf(modal.entry)}
          options={options}
          canModify={modifyRights(modal.entry)}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ kind: 'entry', entry: modal.entry })}
          onDelete={() => setModal({ kind: 'delete', entry: modal.entry })}
        />
      )}
      {modal?.kind === 'delete' && (
        <DeleteDialog entry={modal.entry} onClose={() => setModal(null)} onDeleted={() => { setModal(null); load(); loadOptions(); }} />
      )}
      {modal?.kind === 'categories' && (
        <CategoriesModal options={options} onClose={() => setModal(null)} onChanged={(payload) => { setOptions(o => ({ ...o, ...payload })); }} />
      )}
    </div>
  );
}
