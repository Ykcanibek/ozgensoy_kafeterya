import React, { useState } from 'react';
import axios from 'axios';
import { Check, X, QrCode, Clock, MessageSquareText } from 'lucide-react';
import { useToast } from '../ui/ToastProvider';

const money = (n) => `₺${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const QUICK_REASONS = ['Ürün tükendi', 'Mutfak kapandı', 'Masada müşteri yok', 'Lütfen garsona sipariş verin'];

const minutesAgo = (d) => {
  const m = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
  return m < 1 ? 'az önce' : m < 60 ? `${m} dk önce` : `${Math.floor(m / 60)} sa ${m % 60} dk önce`;
};

/**
 * Onay bekleyen QR siparişleri: onayla (masaya ekle, mutfağa gönder) veya reddet (müşteri nedeni görür).
 * showTable: masa adını göster (tüm masaların listesinde)
 */
export default function QrRequestList({ requests, onChanged, canAct, showTable = true }) {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');

  const approve = async (r) => {
    try {
      setBusyId(r.id);
      const res = await axios.post(`/api/qr-orders/${r.id}/approve`);
      showToast(res.data.message, 'success');
      onChanged?.();
    } catch (err) {
      showToast(err.response?.data?.message || 'QR siparişi onaylanamadı.', 'error');
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (r) => {
    try {
      setBusyId(r.id);
      const res = await axios.post(`/api/qr-orders/${r.id}/reject`, { reason: reason.trim() || undefined });
      showToast(res.data.message, 'deleted');
      setRejectingId(null);
      setReason('');
      onChanged?.();
    } catch (err) {
      showToast(err.response?.data?.message || 'QR siparişi reddedilemedi.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="qr-req-list">
      {requests.map(r => (
        <article key={r.id} className="qr-req">
          <header>
            <span className="qr-req-tag"><QrCode size={13} /> QR sipariş</span>
            {showTable && <strong>{r.table_title}</strong>}
            <time><Clock size={12} /> {minutesAgo(r.created_at)}</time>
          </header>
          <ul>
            {r.items.map((it, i) => (
              <li key={i}>
                <span><b>{it.quantity}×</b> {it.name}{it.note && <em>{it.note}</em>}</span>
                <span>{money(it.quantity * it.unit_price)}</span>
              </li>
            ))}
          </ul>
          {r.note && <p className="qr-req-note"><MessageSquareText size={13} /> {r.note}</p>}
          <footer>
            <strong>{money(r.estimated_total)}</strong>
            {canAct && rejectingId !== r.id && (
              <div className="qr-req-actions">
                <button type="button" className="qr-btn reject" disabled={busyId === r.id} onClick={() => { setRejectingId(r.id); setReason(''); }}>
                  <X size={15} /> Reddet
                </button>
                <button type="button" className="qr-btn approve" disabled={busyId === r.id} onClick={() => approve(r)}>
                  <Check size={15} /> {busyId === r.id ? 'Onaylanıyor…' : 'Onayla'}
                </button>
              </div>
            )}
          </footer>
          {canAct && rejectingId === r.id && (
            <div className="qr-req-reject">
              <span>Müşteriye gösterilecek neden (isteğe bağlı):</span>
              <div className="qr-req-reasons">
                {QUICK_REASONS.map(q => (
                  <button key={q} type="button" className={reason === q ? 'active' : ''} onClick={() => setReason(q)}>{q}</button>
                ))}
              </div>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="veya kendiniz yazın" />
              <div className="qr-req-actions">
                <button type="button" className="qr-btn" onClick={() => setRejectingId(null)}>Vazgeç</button>
                <button type="button" className="qr-btn reject solid" disabled={busyId === r.id} onClick={() => reject(r)}>Siparişi reddet</button>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
