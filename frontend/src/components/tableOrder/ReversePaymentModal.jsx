import React, { useState } from 'react';
import { X, Undo2 } from 'lucide-react';

const QUICK_REASONS = ['Yanlış ürünler seçildi', 'Yanlış tutar girildi', 'Yanlış ödeme türü seçildi'];

const methodText = (pm) => {
  if (pm.payment_method === 'cash') return 'Nakit';
  if (pm.payment_method === 'credit_card') return 'Kart';
  if (pm.payment_method === 'veresiye') return `Veresiye (${pm.customer_name || 'Cari'})`;
  return 'Karma';
};

// Yanlış alınan bir tahsilatı nedenini yazarak geri alma penceresi
export default function ReversePaymentModal({ payment, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!payment) return null;

  const paidItems = payment.items || [];
  const veresiye = parseFloat(payment.veresiye_amount || 0);
  const timeStr = payment.created_at ? new Date(payment.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
  const valid = reason.trim().length >= 3;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onConfirm(payment, reason.trim());
    if (!ok) setBusy(false);
  };

  return (
    <div className="pos-confirm-modal-overlay" onClick={onCancel}>
      <div className="pos-confirm-modal pos-reverse-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pos-confirm-head">
          <h4><Undo2 size={16} /> Tahsilatı geri al</h4>
          <button type="button" className="pos-confirm-close" onClick={onCancel}><X size={16} /></button>
        </div>

        <div className="pos-reverse-summary">
          <strong>₺{parseFloat(payment.total_amount || 0).toFixed(2)}</strong>
          <span>{methodText(payment)}{timeStr ? ` · ${timeStr}` : ''}{payment.closed_by_name ? ` · ${payment.closed_by_name}` : ''}</span>
        </div>

        {paidItems.length > 0 ? (
          <div className="pos-reverse-items">
            <span>Bu ürünler tekrar <b>ödenmemiş</b> olacak:</span>
            <ul>
              {paidItems.map(i => (
                <li key={`${i.product_name}-${i.quantity}`}>{i.quantity}× {i.product_name}<em>₺{parseFloat(i.total_price || 0).toFixed(2)}</em></li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="pos-reverse-note">Bu tahsilat tutar olarak alınmıştı; geri alınınca masanın kalan borcu bu tutar kadar artar.</p>
        )}
        {veresiye > 0 && (
          <p className="pos-reverse-note">₺{veresiye.toFixed(2)} veresiye, {payment.customer_name || 'müşterinin'} borcundan düşülecek.</p>
        )}
        <p className="pos-reverse-note">Tahsilat kasadan ve raporlardan çıkar; kim, ne zaman, neden geri aldı işlem geçmişine yazılır.</p>

        <label className="pos-reverse-reason">
          <span>Neden <b>*</b></span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={255}
            rows={2}
            placeholder="Ör. personel yanlış ürünleri seçti"
            autoFocus
          />
        </label>
        <div className="pos-reverse-chips">
          {QUICK_REASONS.map(r => (
            <button key={r} type="button" className={reason === r ? 'active' : ''} onClick={() => setReason(r)}>{r}</button>
          ))}
        </div>

        <div className="pos-reverse-actions">
          <button type="button" className="pos-btn-split-opt" onClick={onCancel} disabled={busy}>Vazgeç</button>
          <button type="button" className="pos-btn-split-opt danger" onClick={submit} disabled={!valid || busy}>
            {busy ? 'Geri alınıyor…' : 'Tahsilatı geri al'}
          </button>
        </div>
      </div>
    </div>
  );
}
