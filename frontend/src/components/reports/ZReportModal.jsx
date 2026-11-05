import React from 'react';
import { X, Printer, BookOpen } from 'lucide-react';
import { money, num } from './reportUtils';

// Gün sonu Z-raporu (termal yazıcı için 80mm fiş). Yazdırma stilleri reports.css'teki zreport-* sınıflarındadır.
function Row({ label, value, strong }) {
  return (
    <div className="zreport-row" style={strong ? { fontWeight: 800 } : undefined}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function ZReportModal({ data, periodLabel, user, onClose, onOpenCashBook }) {
  if (!data) return null;
  const { sales, collections, categories } = data;

  return (
    <div className="zreport-modal-backdrop" onClick={onClose}>
      <div className="zreport-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="zreport-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
            <Printer size={18} />
            <span>Z-Raporu Önizleme</span>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer' }} title="Kapat">
            <X size={20} />
          </button>
        </div>

        <div className="zreport-modal-body">
          <div className="zreport-ticket">
            <div className="zreport-title-center">
              <h3 style={{ margin: '0 0 2px 0', fontSize: '1.2rem', fontWeight: 800 }}>ÖZGENSOY KAFETERYA</h3>
              <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>*** GÜN SONU Z-RAPORU ***</div>
              <div style={{ fontSize: '0.74rem' }}>Dönem: {periodLabel}</div>
              <div style={{ fontSize: '0.72rem' }}>Basım: {new Date().toLocaleString('tr-TR')}</div>
              <div style={{ fontSize: '0.72rem' }}>Hazırlayan: {user?.name || '—'}</div>
            </div>

            <div className="zreport-divider" />
            <div style={{ fontWeight: 800, margin: '4px 0', textAlign: 'center' }}>SATIŞ</div>
            <Row label="Kapanan adisyon" value={num(sales.order_count)} />
            <Row label="Satılan ürün" value={num(sales.item_qty)} />
            <Row label="Brüt satış" value={money(sales.gross)} />
            <Row label="İkram" value={`- ${money(sales.complimentary)}`} />
            <Row label="İade" value={`- ${money(sales.returned)}`} />
            <Row label="İndirim" value={`- ${money(sales.discount)}`} />
            <Row label="Bahşiş" value={`+ ${money(sales.tip || 0)}`} />
            <Row label="NET CİRO" value={money(sales.revenue ?? sales.net)} strong />
            <Row label="Ortalama adisyon" value={money(sales.average_ticket)} />
            <Row label="İptal edilen" value={money(sales.voided)} />
            {sales.unpaid_closed > 0 && <Row label="Tahsilsiz kapatılan" value={money(sales.unpaid_closed)} strong />}

            <div className="zreport-double-divider" />
            <div style={{ fontWeight: 800, margin: '4px 0', textAlign: 'center' }}>TAHSİLAT</div>
            <Row label={`Nakit (${num(collections.counts.cash)})`} value={money(collections.cash)} />
            <Row label={`Kredi kartı (${num(collections.counts.credit_card)})`} value={money(collections.card)} />
            <Row label="KASAYA GİREN" value={money(collections.drawer_total)} strong />
            <Row label="  içinde bahşiş" value={money(collections.tip)} />
            <Row label="  içinde cari tahsilat" value={money(collections.account_collections)} />
            {/* Bahşiş işletmeye kalır: kasaya girenin tamamı kasa defterine işlenir; iki rapor bu satırla birbirine bağlanır */}
            <Row label="KASA DEFTERİNE İŞLENEN" value={money(collections.drawer_total)} strong />
            <Row label={`Veresiye (${num(collections.counts.veresiye)})`} value={money(collections.veresiye)} />
            {collections.counts.mixed > 0 && <Row label="Parçalı ödeme sayısı" value={num(collections.counts.mixed)} />}

            {categories.length > 0 && (
              <>
                <div className="zreport-divider" />
                <div style={{ fontWeight: 800, margin: '4px 0', textAlign: 'center' }}>KATEGORİLER</div>
                {categories.map(c => (
                  <div key={c.category_name} className="zreport-row" style={{ fontSize: '0.78rem' }}>
                    <span>{c.category_name} ({num(c.qty)})</span>
                    <span>{money(c.revenue)}</span>
                  </div>
                ))}
              </>
            )}

            <div className="zreport-double-divider" />
            <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '0.74rem' }}>
              <div>MALİ DEĞERİ YOKTUR · GÜN SONU KASA DÖKÜMÜ</div>
              <div style={{ marginTop: '8px' }}>Kasiyer İmza: ........................</div>
            </div>
          </div>
        </div>

        <div className="zreport-modal-footer">
          {onOpenCashBook && (
            <button type="button" className="rep-receipt-close-btn" onClick={onOpenCashBook} title="Bu günün kasa defteri kaydını ve gün sonu ciro raporunu aç">
              <BookOpen size={16} /> <span>Kasa defteri</span>
            </button>
          )}
          <button type="button" className="rep-receipt-print-btn" onClick={() => window.print()}>
            <Printer size={16} />
            <span>Yazdır</span>
          </button>
          <button type="button" className="rep-receipt-close-btn" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  );
}
