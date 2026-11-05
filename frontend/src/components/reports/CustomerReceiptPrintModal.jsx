import React from 'react';
import { Printer, X } from 'lucide-react';

// Müşteri adisyon fişi termal yazdırma önizlemesi
export default function CustomerReceiptPrintModal({
  printingReceipt,
  setPrintingReceipt
}) {
  return (
    <>
    {/* ======================================================== */}
    {/* MÜŞTERİ ADİSYON / FİŞİ TERMAL YAZDIRMA MODALI            */}
    {/* ======================================================== */}
    {printingReceipt && (
      <div className="zreport-modal-backdrop" onClick={() => setPrintingReceipt(null)}>
        <div className="zreport-modal-content customer-receipt-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="zreport-modal-header customer-receipt-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Printer size={18} />
              <span style={{ fontWeight: 800 }}>Müşteri Fişi Önizleme & Yazdır</span>
            </div>
            <button 
              type="button" 
              className="rep-modal-close-btn"
              onClick={() => setPrintingReceipt(null)}
              title="Kapat"
            >
              <X size={16} />
            </button>
          </div>

          <div className="zreport-modal-body" style={{ background: '#f8fafc', padding: '18px', overscrollBehavior: 'contain', display: 'flex', justifyContent: 'center' }}>
            <div className="customer-receipt-ticket">
              {/* İşletme Başlığı */}
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '1px', color: '#000000' }}>
                  ÖZGENSOY
                </div>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, letterSpacing: '0.5px', color: '#000000', marginTop: '2px' }}>
                  MÜZE • KÜTÜPHANE
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 800, letterSpacing: '0.5px', color: '#000000', marginTop: '2px' }}>
                  KAFETERYA
                </div>
              </div>

              {printingReceipt.receipt.title && (
                <div style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 900, letterSpacing: '0.5px', color: '#000000', marginTop: '4px' }}>
                  {printingReceipt.receipt.title}
                </div>
              )}

              <div className="pos-paper-divider" style={{ borderTop: '1.5px dashed #000000', margin: '8px 0' }}></div>

              {/* Sadeleştirilmiş Üst Bilgiler (2-3 Kompakt Satır) */}
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#000000', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tarih: {new Date(printingReceipt.receipt.created_at).toLocaleDateString('tr-TR')} {new Date(printingReceipt.receipt.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>Fiş: <strong>#{printingReceipt.receipt.id}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Masa: {printingReceipt.receipt.table_title || 'Masa'}</span>
                </div>
                {printingReceipt.receipt.customer_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Müşteri:</span>
                    <strong>{printingReceipt.receipt.customer_name}</strong>
                  </div>
                )}
              </div>

              <div className="pos-paper-divider" style={{ borderTop: '1.5px dashed #000000', margin: '8px 0' }}></div>

              {/* Sadeleştirilmiş 2 Sütunlu Ürün Listesi */}
              <div style={{ margin: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.80rem', fontWeight: 900, color: '#000000', borderBottom: '1.5px solid #000000', paddingBottom: '3px', marginBottom: '6px' }}>
                  <span>ÜRÜN</span>
                  <span>TUTAR</span>
                </div>

                {printingReceipt.items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '8px 0', color: '#000000', fontWeight: 700, fontSize: '0.82rem' }}>
                    {printingReceipt.empty_label || 'Kasa Tahsilatı'}
                  </div>
                ) : (
                  printingReceipt.items.map((it, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.86rem', fontWeight: 700, color: '#000000', padding: '3px 0' }}>
                      <span style={{ flex: 1, paddingRight: '8px' }}>
                        {it.product_name} <span style={{ fontWeight: 900 }}>x{it.quantity}</span>
                      </span>
                      <span style={{ fontWeight: 800 }}>
                        ₺{parseFloat(it.total_price).toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="pos-paper-divider" style={{ borderTop: '1.5px dashed #000000', margin: '8px 0' }}></div>

              {/* Sadeleştirilmiş Finansal Özet */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.84rem', fontWeight: 700, color: '#000000' }}>
                {/* Ara toplam sadece indirim veya bahşiş varsa gösterilir */}
                {(parseFloat(printingReceipt.receipt.discount || 0) > 0 || parseFloat(printingReceipt.receipt.tip || 0) > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Ara Toplam:</span>
                    <span>₺{printingReceipt.items.reduce((s, i) => s + parseFloat(i.total_price || 0), 0).toFixed(2)}</span>
                  </div>
                )}

                {parseFloat(printingReceipt.receipt.discount || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>İndirim:</span>
                    <span>-₺{parseFloat(printingReceipt.receipt.discount).toFixed(2)}</span>
                  </div>
                )}

                {parseFloat(printingReceipt.receipt.tip || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Bahşiş:</span>
                    <span>+₺{parseFloat(printingReceipt.receipt.tip).toFixed(2)}</span>
                  </div>
                )}

                <div className="pos-paper-divider" style={{ borderTop: '1.5px solid #000000', margin: '4px 0' }}></div>

                {/* Genel Toplam */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.12rem', fontWeight: 900 }}>
                  <span>TOPLAM:</span>
                  <span>₺{parseFloat(printingReceipt.receipt.total_amount).toFixed(2)}</span>
                </div>

                {/* Ödeme Türü (Sadece tutarı > 0 olanlar) */}
                <div style={{ marginTop: '4px', fontSize: '0.80rem' }}>
                  {printingReceipt.receipt.payment_method === 'cash' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Ödeme:</span>
                      <span style={{ fontWeight: 800 }}>Nakit</span>
                    </div>
                  )}
                  {printingReceipt.receipt.payment_method === 'credit_card' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Ödeme:</span>
                      <span style={{ fontWeight: 800 }}>Kredi Kartı</span>
                    </div>
                  )}
                  {printingReceipt.receipt.payment_method === 'veresiye' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Ödeme:</span>
                      <span style={{ fontWeight: 800 }}>Veresiye (Cari)</span>
                    </div>
                  )}
                  {printingReceipt.receipt.payment_method === 'mixed' && (
                    <div>
                      <div style={{ fontWeight: 800 }}>Ödeme: Parçalı</div>
                      <div style={{ paddingLeft: '6px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {parseFloat(printingReceipt.receipt.cash_amount || 0) > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>• Nakit:</span>
                            <span>₺{parseFloat(printingReceipt.receipt.cash_amount).toFixed(2)}</span>
                          </div>
                        )}
                        {parseFloat(printingReceipt.receipt.card_amount || 0) > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>• Kredi Kartı:</span>
                            <span>₺{parseFloat(printingReceipt.receipt.card_amount).toFixed(2)}</span>
                          </div>
                        )}
                        {parseFloat(printingReceipt.receipt.veresiye_amount || 0) > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>• Veresiye:</span>
                            <span>₺{parseFloat(printingReceipt.receipt.veresiye_amount).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pos-paper-divider" style={{ borderTop: '1.5px dashed #000000', margin: '8px 0' }}></div>

              {/* Sade Alt Mesaj */}
              <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '0.74rem', fontWeight: 700, color: '#000000' }}>
                <div style={{ fontWeight: 800 }}>Afiyet Olsun, Yine Bekleriz!</div>
                <div style={{ fontSize: '0.66rem', marginTop: '3px', letterSpacing: '0.5px' }}>
                  *** MALİ DEĞERİ YOKTUR ***
                </div>
              </div>
            </div>
          </div>

          <div className="zreport-modal-footer">
            <button 
              type="button"
              className="rep-receipt-print-btn"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              <span>Yazdır (Ctrl+P)</span>
            </button>
            <button 
              type="button"
              className="rep-receipt-close-btn"
              onClick={() => setPrintingReceipt(null)}
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
