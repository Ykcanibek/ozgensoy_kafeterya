import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Printer, Receipt, Search, X } from 'lucide-react';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return ymd(d); };
const METHOD_LABELS = { cash: 'Nakit', credit_card: 'Kart', veresiye: 'Veresiye', mixed: 'Parçalı' };
const methodText = (methods) => {
  if (!methods.length) return 'Tahsilatsız';
  if (methods.length > 1) return 'Parçalı';
  return METHOD_LABELS[methods[0]] || methods[0];
};

/**
 * Kapanan hesaplar: personel hesap kapanınca fişi yazdırmayı unuttuysa ya da müşteri sonradan isterse
 * o günün kapanan masalarından birinin fişi buradan yeniden yazdırılır.
 */
export default function ClosedReceiptsModal({ onClose, onPrint }) {
  const [date, setDate] = useState(() => shiftDay(0));
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setList(null);
    setError('');
    axios.get(`/api/orders/closed-receipts?date=${date}`)
      .then(res => !cancelled && setList(res.data.receipts))
      .catch(err => !cancelled && setError(err.response?.data?.message || 'Kapanan hesaplar alınamadı.'));
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return (list || []).filter(r => !q || `${r.table_title} ${r.customer_name || ''}`.toLocaleLowerCase('tr-TR').includes(q));
  }, [list, search]);

  const print = async (r) => {
    setLoadingId(r.order_id);
    try {
      const res = await axios.get(`/api/orders/${r.order_id}/receipt`);
      onPrint(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Fiş hazırlanamadı.');
    } finally {
      setLoadingId(null);
    }
  };

  const today = shiftDay(0);
  const yesterday = shiftDay(-1);

  return (
    <div className="pos-confirm-modal-overlay" onClick={onClose}>
      <div className="pos-confirm-modal pos-closed-receipts" onClick={(e) => e.stopPropagation()}>
        <div className="pos-confirm-head">
          <h4><Receipt size={16} /> Kapanan hesapların fişleri</h4>
          <button type="button" className="pos-confirm-close" onClick={onClose} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="pos-cr-toolbar">
          <div className="pos-cr-days" role="group" aria-label="Gün">
            <button type="button" className={date === today ? 'active' : ''} onClick={() => setDate(today)}>Bugün</button>
            <button type="button" className={date === yesterday ? 'active' : ''} onClick={() => setDate(yesterday)}>Dün</button>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Tarih seç" />
          </div>
          <label className="pos-cr-search">
            <Search size={14} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Masa veya müşteri ara" />
          </label>
        </div>

        {error && <div className="pos-cr-error">{error}</div>}
        <div className="pos-cr-list">
          {list === null && !error && <div className="pos-cr-empty">Yükleniyor…</div>}
          {list && shown.length === 0 && (
            <div className="pos-cr-empty">{list.length ? 'Aramaya uyan hesap yok.' : 'Bu gün kapanan hesap yok.'}</div>
          )}
          {shown.map(r => (
            <div key={r.order_id} className="pos-cr-row">
              <span className="pos-cr-time">{new Date(r.closed_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="pos-cr-table">
                <strong>{r.table_title || 'Masa'}</strong>
                <em>{methodText(r.methods)}{r.payment_count > 1 ? ` · ${r.payment_count} ödeme` : ''}{r.customer_name ? ` · ${r.customer_name}` : ''}</em>
              </span>
              <span className="pos-cr-total">₺{r.total_amount.toFixed(2)}</span>
              <button type="button" className="pos-cr-print" onClick={() => print(r)} disabled={loadingId === r.order_id}>
                <Printer size={14} /> {loadingId === r.order_id ? '…' : 'Fiş'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
