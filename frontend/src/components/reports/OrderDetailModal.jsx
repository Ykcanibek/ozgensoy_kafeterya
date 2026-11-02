import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { X, Printer, AlertTriangle } from 'lucide-react';
import '../../styles/reports-v2.css';
import { money, num, formatDateTime, formatTime, PAYMENT_LABELS } from './reportUtils';

const ITEM_STATUS = {
  complimentary: { label: 'İkram', cls: 'comp' },
  returned: { label: 'İade', cls: 'returned' },
  cancelled: { label: 'İptal', cls: 'voided' }
};

// Adisyon detayı: kalemler (durumlarıyla), ödemeler, brütten nete toplamlar ve müşteri fişi
export default function OrderDetailModal({ orderId, onClose, canPrint, onPrint }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    axios.get(`/api/reports/orders/${orderId}`)
      .then(res => !cancelled && setState({ loading: false, data: res.data, error: null }))
      .catch(err => !cancelled && setState({ loading: false, data: null, error: err.response?.data?.message || 'Adisyon alınamadı.' }));
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data } = state;
  const order = data?.order;
  const totals = data?.totals;

  // Müşteri fişi yazdırma bileşeninin beklediği biçime dönüştür
  const handlePrint = () => {
    const pays = data.payments;
    const sum = (k) => pays.reduce((s, p) => s + Number(p[k] || 0), 0);
    const types = new Set(pays.map(p => p.payment_method));
    onPrint({
      receipt: {
        id: order.id,
        table_title: order.table_title,
        created_at: order.closed_at || order.created_at,
        closed_by_user_name: pays[pays.length - 1]?.closed_by || order.opened_by,
        customer_name: pays.find(p => p.customer_name)?.customer_name || null,
        payment_method: types.size === 1 ? [...types][0] : 'mixed',
        cash_amount: sum('cash_amount'),
        card_amount: sum('card_amount'),
        veresiye_amount: sum('veresiye_amount'),
        discount: totals.discount,
        tip: totals.tip,
        total_amount: totals.collected + totals.tip
      },
      items: data.items
        .filter(i => i.item_status !== 'cancelled')
        .map(i => (ITEM_STATUS[i.item_status]
          ? { ...i, product_name: `${i.product_name} (${ITEM_STATUS[i.item_status].label})`, total_price: 0 }
          : i))
    });
  };

  return (
    <div className="rp-modal-backdrop" onClick={onClose}>
      <div className="rp-modal" role="dialog" aria-modal="true" aria-label="Adisyon detayı" onClick={(e) => e.stopPropagation()}>
        <header className="rp-modal-head">
          <div>
            <h3>{order ? `${order.table_title || 'Adisyon'} · #${order.id}` : 'Adisyon detayı'}</h3>
            {order && (
              <p>
                Açılış {formatDateTime(order.created_at)}
                {order.closed_at ? ` · Kapanış ${formatTime(order.closed_at)}` : ''}
                {order.opened_by ? ` · Açan: ${order.opened_by}` : ''}
              </p>
            )}
          </div>
          <div className="rp-modal-actions">
            {canPrint && data && (
              <button type="button" className="rp-btn" onClick={handlePrint}><Printer size={15} /> Müşteri fişi</button>
            )}
            <button type="button" className="rp-icon-btn" onClick={onClose} title="Kapat"><X size={18} /></button>
          </div>
        </header>

        <div className="rp-modal-body">
          {state.loading && <div className="rp-empty small">Yükleniyor...</div>}
          {state.error && <div className="rp-empty small error">{state.error}</div>}
          {data && (
            <>
              {order.note && <p className="rp-note">Not: {order.note}</p>}

              <h4 className="rp-section-title">Kalemler</h4>
              <div className="rp-table-wrap compact">
                <table className="rp-table">
                  <thead>
                    <tr><th>Ürün</th><th className="num">Adet</th><th className="num">Birim</th><th className="num">Tutar</th><th>Ekleyen</th></tr>
                  </thead>
                  <tbody>
                    {data.items.map(i => {
                      const st = ITEM_STATUS[i.item_status];
                      return (
                        <tr key={i.id} className={st ? `row-${st.cls}` : ''}>
                          <td className="strong">
                            {i.product_name}
                            {st && <span className={`rp-status ${st.cls}`}>{st.label}</span>}
                            {i.note && <span className="rp-sub">“{i.note}”</span>}
                          </td>
                          <td className="num">{num(i.quantity)}</td>
                          <td className="num muted">{money(i.unit_price)}</td>
                          <td className="num">{money(i.total_price)}</td>
                          <td className="muted">{i.added_by || '—'}<span className="rp-sub">{formatTime(i.created_at)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rp-two-col tight">
                <div>
                  <h4 className="rp-section-title">Ödemeler</h4>
                  {data.payments.length === 0 ? (
                    <p className="rp-note">Bu adisyona ödeme alınmadı.</p>
                  ) : (
                    <ul className="rp-pay-timeline">
                      {data.payments.map(p => (
                        <li key={p.id}>
                          <div className="rp-pay-top">
                            <span className="strong">{formatTime(p.created_at)} · {PAYMENT_LABELS[p.payment_method] || p.payment_method}</span>
                            <span className="strong">{money(p.total_amount)}</span>
                          </div>
                          <span className="rp-sub">
                            {[
                              p.cash_amount > 0 && `Nakit ${money(p.cash_amount)}`,
                              p.card_amount > 0 && `Kart ${money(p.card_amount)}`,
                              p.veresiye_amount > 0 && `Veresiye ${money(p.veresiye_amount)}${p.customer_name ? ` (${p.customer_name})` : ''}`,
                              p.discount > 0 && `İndirim ${money(p.discount)}`,
                              p.tip > 0 && `Bahşiş ${money(p.tip)}`
                            ].filter(Boolean).join(' · ')}
                            {p.closed_by ? ` · ${p.closed_by}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="rp-section-title">Toplamlar</h4>
                  <div className="rp-break">
                    <div className="rp-break-row"><span>Brüt</span><span>{money(totals.gross)}</span></div>
                    {totals.complimentary > 0 && <div className="rp-break-row muted"><span>İkram</span><span>− {money(totals.complimentary)}</span></div>}
                    {totals.returned > 0 && <div className="rp-break-row muted"><span>İade</span><span>− {money(totals.returned)}</span></div>}
                    {totals.discount > 0 && <div className="rp-break-row muted"><span>İndirim</span><span>− {money(totals.discount)}</span></div>}
                    <div className="rp-break-row strong"><span>Net</span><span>{money(totals.net)}</span></div>
                    <div className="rp-break-row"><span>Tahsil edilen</span><span>{money(totals.collected)}</span></div>
                    {totals.tip > 0 && <div className="rp-break-row muted"><span>Bahşiş</span><span>{money(totals.tip)}</span></div>}
                    {totals.voided > 0 && <div className="rp-break-row muted"><span>İptal edilen</span><span>{money(totals.voided)}</span></div>}
                    {totals.unpaid_closed > 0 && (
                      <div className="rp-break-row warn"><span><AlertTriangle size={14} /> Tahsil edilmeden kapatılan</span><span>{money(totals.unpaid_closed)}</span></div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
