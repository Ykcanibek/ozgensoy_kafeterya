import React, { useEffect, useState } from 'react';
import { BellRing, ChevronRight, MessageSquareText } from 'lucide-react';

const MAX_ROWS = 4;
const money = (n) => `₺${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const itemsOf = (r) => { try { return typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []); } catch { return []; } };
const summaryOf = (r) => itemsOf(r).map(i => `${i.quantity}× ${i.name}`).join(', ');
const hasNote = (r) => Boolean(r.note) || itemsOf(r).some(i => i.note);

const ago = (date, now) => {
  const min = Math.floor((now - new Date(date).getTime()) / 60000);
  if (min < 1) return 'şimdi';
  if (min < 60) return `${min} dk önce`;
  return `${Math.floor(min / 60)} sa önce`;
};

/**
 * Masalar ekranının üstünde: onay bekleyen QR siparişleri.
 * Her sipariş ayrı satırdır (masa, ürünler, tutar, ne zaman geldiği); satıra basınca o masanın penceresi açılır
 * ve sipariş orada onaylanır/reddedilir.
 */
export default function QrInbox({ requests, onOpenTable, onShowAll }) {
  // "x dk önce" yazıları güncel kalsın
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!requests.length) return null;
  const rows = requests.slice(0, MAX_ROWS);
  const more = requests.length - rows.length;

  return (
    <section className="qr-inbox" aria-live="polite">
      <header>
        <span className="qr-inbox-bell"><BellRing size={18} /><i /></span>
        <div>
          <strong>Yeni QR sipariş</strong>
          <span>{requests.length === 1 ? 'Onayınızı bekliyor' : `${requests.length} sipariş onayınızı bekliyor`}</span>
        </div>
        {requests.length > 1 && <button type="button" className="qr-inbox-all" onClick={onShowAll}>Tümünü gör</button>}
      </header>
      <div className="qr-inbox-list">
        {rows.map(r => (
          <button key={r.id} type="button" className="qr-inbox-item" onClick={() => onOpenTable(r.table_id)}>
            <span className="qr-inbox-table">{r.table_title}</span>
            <span className="qr-inbox-items">
              {hasNote(r) && <MessageSquareText size={13} aria-label="Notlu sipariş" />}
              {summaryOf(r)}
            </span>
            <span className="qr-inbox-meta">
              <b>{money(r.estimated_total)}</b>
              <time>{ago(r.created_at, now)}</time>
            </span>
            <ChevronRight size={18} className="qr-inbox-go" />
          </button>
        ))}
        {more > 0 && (
          <button type="button" className="qr-inbox-more" onClick={onShowAll}>+{more} sipariş daha</button>
        )}
      </div>
    </section>
  );
}
