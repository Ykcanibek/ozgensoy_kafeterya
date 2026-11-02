import React from 'react';
import { Printer } from 'lucide-react';

// Masa adisyon fişi yazdırma önizlemesi
export default function ReceiptPreviewModal({
  table,
  discountAmount,
  displayedSavedItems,
  existingOrder,
  finalPayableTotal,
  grandTotal,
  paidTotal,
  setShowReceiptPreview,
  showReceiptPreview,
  tipAmount
}) {
  return (
    <>
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
    </>
  );
}
