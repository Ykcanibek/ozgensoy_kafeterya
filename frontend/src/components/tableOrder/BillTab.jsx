import React from 'react';
import { thumbSrc, handleThumbError } from '../../lib/images';
import {
  Plus,
  Minus,
  Receipt,
  Utensils,
  Coffee,
  Check,
  Gift,
  RotateCcw,
  Ban,
  MoreHorizontal,
  Undo2,
  Printer
} from 'lucide-react';

// Orta panel / Hesap sekmesi: kısmi tahsilat geçmişi ve adisyon kalemleri tablosu
export default function BillTab({
  perms,
  activeTab,
  setActiveTab,
  actionDropdownItemId,
  displayedSavedItems,
  grandTotal,
  handleDeliverItem,
  handleSelectAllItems,
  handleToggleItemSelection,
  handleUpdateItemStatus,
  handleUpdatePayQty,
  onReversePayment,
  onPrintPayment,
  paidTotal,
  payingQuantities,
  paymentsList,
  remainingTotal,
  selectedItemIds,
  setActionDropdownItemId,
  unpaidSavedItems
}) {
  // Tek tek ürün seçmek bölerek ödeme yetkisi ister; tümünü seçmek (hesabın tamamını ödemek) tahsilat yetkisi yeterlidir
  const canSelectAll = perms.split || perms.cashCard || perms.veresiye;
  return (
    <>
    {/* -------------------------------------------------------- */}
    {/* DURUM 2: HESAP ÖDEME SEKMESİ (ADİSYON KALEMLERİ)         */}
    {/* -------------------------------------------------------- */}
    {activeTab === 'payment' && (
      <div className="pos-payment-center-view">

        {/* Daha Önce Alınmış Kısmi Tahsilatlar Geçmişi */}
        {paymentsList.length > 0 && (
          <div className="pos-payment-history-banner">
            <div className="pos-payment-history-title">
              <Receipt size={14} />
              <span>Önceki Tahsilatlar ({paymentsList.length}):</span>
            </div>
            <div className="pos-payment-history-pills-wrap">
              {paymentsList.map((pm, idx) => {
                const isVeresiye = pm.payment_method === 'veresiye' || (pm.payment_method === 'mixed' && parseFloat(pm.veresiye_amount || 0) > 0);
                let methodLabel = '';
                if (pm.payment_method === 'cash') {
                  methodLabel = 'Nakit';
                } else if (pm.payment_method === 'credit_card') {
                  methodLabel = 'Kart';
                } else if (pm.payment_method === 'veresiye') {
                  methodLabel = `Veresiye (${pm.customer_name || 'Cari'})`;
                } else if (pm.payment_method === 'mixed') {
                  const parts = [];
                  if (parseFloat(pm.cash_amount || 0) > 0) parts.push(`${parseFloat(pm.cash_amount).toFixed(0)}₺ N`);
                  if (parseFloat(pm.card_amount || 0) > 0) parts.push(`${parseFloat(pm.card_amount).toFixed(0)}₺ K`);
                  if (parseFloat(pm.veresiye_amount || 0) > 0) parts.push(`${parseFloat(pm.veresiye_amount).toFixed(0)}₺ V`);
                  methodLabel = `Karma (${parts.join(' + ')}${pm.customer_name ? ` - ${pm.customer_name}` : ''})`;
                }
                const timeStr = pm.created_at ? new Date(pm.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
                return (
                  <div key={pm.id || idx} className={`pos-payment-history-pill ${isVeresiye ? 'veresiye' : ''}`} title={pm.notes || ''}>
                    <strong>₺{parseFloat(pm.total_amount || 0).toFixed(2)}</strong>
                    <span className="pill-method">({methodLabel})</span>
                    {timeStr && <span className="pill-time">{timeStr}</span>}
                    {perms.print && (
                      <button type="button" className="pill-action pill-print" title="Bu ödemenin fişini yazdır" aria-label="Ödeme fişini yazdır"
                        onClick={() => onPrintPayment(pm)}>
                        <Printer size={13} />
                      </button>
                    )}
                    {perms.reverse && Number(pm.reversible) === 1 && (
                      <button type="button" className="pill-action pill-reverse" title="Bu tahsilatı geri al" aria-label="Tahsilatı geri al"
                        onClick={() => onReversePayment(pm)}>
                        <Undo2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="pos-saved-items-table-container">

          {/* Tablo Başlık Satırı */}
          <div className="pos-table-header-row">
            <div className="pos-col-check">
              <input
                type="checkbox"
                checked={unpaidSavedItems.length > 0 && selectedItemIds.length === unpaidSavedItems.length}
                disabled={unpaidSavedItems.length === 0 || !canSelectAll}
                onChange={(e) => handleSelectAllItems(e.target.checked)}
                title="Ödeneceklerin Tümünü Seç / Kaldır"
              />
            </div>
            <div
              className="pos-col-product"
              onClick={() => {
                if (unpaidSavedItems.length > 0 && canSelectAll) {
                  handleSelectAllItems();
                }
              }}
              style={{ cursor: unpaidSavedItems.length > 0 ? 'pointer' : 'default', userSelect: 'none' }}
              title="Ödeneceklerin Tümünü Seç / Kaldır"
            >
              Tümünü Seç
            </div>
            <div className="pos-col-qty">Miktar & İşlem</div>
            <div className="pos-col-price">Tutar</div>
          </div>

          {/* Tablo Kalemleri */}
          <div className="pos-table-body-rows">
            {displayedSavedItems.length === 0 ? (
              <div className="pos-saved-items-empty">
                <Receipt size={42} color="#cbb8a6" />
                <h4>Açık Sipariş Bulunmuyor</h4>
                <p>"Menü & Sipariş" sekmesinden ürün seçip masaya anında sipariş ekleyebilirsiniz.</p>
                {perms.order && (
                <button
                  type="button"
                  className="pos-btn-switch-menu"
                  onClick={() => setActiveTab('order')}
                >
                  <Utensils size={15} />
                  <span>Menüye Git & Sipariş Ekle</span>
                </button>
                )}
              </div>
            ) : (
              displayedSavedItems.map((item, index) => {
                const isPaid = !!item.is_paid;
                const isSpecial = ['cancelled', 'returned', 'complimentary'].includes(item.item_status);
                const isSelectable = !isPaid && !isSpecial && perms.split;
                const canStatusActions = perms.deliver || perms.treat || perms.return || perms.cancel;
                const isSelected = isSelectable && selectedItemIds.includes(item.id);
                const currentPayQty = payingQuantities[item.id] ?? 1;
                const isDropdownOpen = actionDropdownItemId === item.id;
                const isNearBottom = index >= displayedSavedItems.length - 2 && displayedSavedItems.length >= 3;

                return (
                  <div
                    key={item.id}
                    className={`pos-table-item-row ${isDropdownOpen ? 'pos-row-has-open-dropdown' : ''} ${isPaid ? 'row-paid' : isSpecial ? `row-special status-${item.item_status}` : isSelected ? 'row-selected' : ''}`}
                    onClick={() => {
                      if (isSelectable) {
                        handleToggleItemSelection(item.id);
                      }
                    }}
                  >
                    {/* Checkbox / Paid Badge / Special Icon */}
                    <div className="pos-col-check">
                      {isPaid ? (
                        <span className="pos-item-paid-check" title="Bu ürünün ödemesi tamamlandı">
                          <Check size={13} color="#2d6a4f" />
                        </span>
                      ) : item.item_status === 'complimentary' ? (
                        <span className="pos-item-special-icon ikram" title="İkram (Ücretsiz)">
                          <Gift size={15} color="#7e22ce" />
                        </span>
                      ) : item.item_status === 'returned' ? (
                        <span className="pos-item-special-icon iade" title="İade Edildi">
                          <RotateCcw size={14} color="#c2410c" />
                        </span>
                      ) : item.item_status === 'cancelled' ? (
                        <span className="pos-item-special-icon iptal" title="İptal Edildi">
                          <Ban size={14} color="#dc2626" />
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          disabled={!isSelectable}
                          checked={isSelected}
                          onChange={() => handleToggleItemSelection(item.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>

                    {/* Ürün Görseli, Adı ve Durum Rozeti */}
                    <div className="pos-col-product">
                      <div className="pos-row-item-thumb">
                        {item.image_url ? (
                          <img src={thumbSrc(item.image_url)} alt={item.product_name} loading="lazy" decoding="async" onError={(e) => handleThumbError(e, item.image_url)} />
                        ) : (
                          <Coffee size={18} color="#346c80" />
                        )}
                      </div>
                      <div className="pos-row-item-details">
                        <span className={`pos-row-item-title ${item.item_status === 'cancelled' ? 'title-cancelled' : ''}`}>
                          {item.product_name}
                        </span>
                        <div className="pos-row-item-badges">
                          {isPaid ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="pos-item-status-pill paid">
                                <Check size={10} style={{ marginRight: '3px' }} />
                                ÖDENDİ
                              </span>
                              <div className="pos-item-mobile-qty-wrap">
                                <span className="pos-mobile-qty-pill paid">
                                  {item.quantity} Adet
                                </span>
                              </div>
                            </div>
                          ) : isSpecial ? (
                            <div className="pos-item-actions-wrapper" onClick={(e) => e.stopPropagation()}>
                              <span className={`pos-item-status-pill ${item.item_status}`}>
                                {item.item_status === 'complimentary' && <Gift size={10} style={{ marginRight: '3px' }} />}
                                {item.item_status === 'returned' && <RotateCcw size={10} style={{ marginRight: '3px' }} />}
                                {item.item_status === 'cancelled' && <Ban size={10} style={{ marginRight: '3px' }} />}
                                {item.item_status === 'complimentary' ? 'İKRAM' : item.item_status === 'returned' ? 'İADE' : 'İPTAL'}
                              </span>
                              {/* Geri Al / Durum Değiştir Butonu */}
                              {canStatusActions && (
                              <button
                                type="button"
                                className="pos-btn-action-menu"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionDropdownItemId(prev => prev === item.id ? null : item.id);
                                }}
                                title="Durumu Değiştir / Geri Al"
                              >
                                <MoreHorizontal size={13} />
                              </button>
                              )}
                              {/* Mobilde Adet Bilgisi */}
                              <div className="pos-item-mobile-qty-wrap">
                                <span className={`pos-mobile-qty-pill ${item.item_status}`}>
                                  {item.quantity} Adet
                                </span>
                              </div>
                              {actionDropdownItemId === item.id && (
                                <div className={`pos-item-action-dropdown ${isNearBottom ? 'dropdown-up' : ''}`} onClick={(e) => e.stopPropagation()}>
                                  {perms.deliver && (
                                  <>
                                  <button
                                    type="button"
                                    className="pos-item-action-btn deliver"
                                    onClick={() => handleUpdateItemStatus(item, 'delivered')}
                                  >
                                    <Check size={12} />
                                    <span>Teslim Edildi Yap</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="pos-item-action-btn pending"
                                    onClick={() => handleUpdateItemStatus(item, 'pending')}
                                  >
                                    <Utensils size={12} />
                                    <span>Mutfağa Geri Al</span>
                                  </button>
                                  </>
                                  )}
                                  {item.item_status !== 'complimentary' && perms.treat && (
                                    <button
                                      type="button"
                                      className="pos-item-action-btn complimentary"
                                      onClick={() => handleUpdateItemStatus(item, 'complimentary')}
                                    >
                                      <Gift size={12} />
                                      <span>İkram Yap</span>
                                    </button>
                                  )}
                                  {item.item_status !== 'returned' && perms.return && (
                                    <button
                                      type="button"
                                      className="pos-item-action-btn return"
                                      onClick={() => handleUpdateItemStatus(item, 'returned')}
                                    >
                                      <RotateCcw size={12} />
                                      <span>İade Al</span>
                                    </button>
                                  )}
                                  {item.item_status !== 'cancelled' && perms.cancel && (
                                    <button
                                      type="button"
                                      className="pos-item-action-btn cancel"
                                      onClick={() => handleUpdateItemStatus(item, 'cancelled')}
                                    >
                                      <Ban size={12} />
                                      <span>Siparişi İptal Et</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="pos-item-actions-wrapper" onClick={(e) => e.stopPropagation()}>
                              <span className={`pos-item-status-pill ${item.item_status || 'pending'}`}>
                                {item.item_status === 'delivered'
                                  ? 'TESLİM EDİLDİ'
                                  : item.item_status === 'ready'
                                    ? 'HAZIR'
                                    : 'MUTFAKTA'}
                              </span>
                              {item.item_status !== 'delivered' && perms.deliver && (
                                <button
                                  type="button"
                                  className="pos-btn-deliver-compact"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeliverItem(item.id);
                                  }}
                                  title="Ürünü Teslim Edildi Olarak İşaretle"
                                >
                                  <Check size={11} />
                                  <span>Teslim Et</span>
                                </button>
                              )}

                              {/* İşlem Menüsü (İkram, İade, İptal) */}
                              {canStatusActions && (
                              <button
                                type="button"
                                className="pos-btn-action-menu"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionDropdownItemId(prev => prev === item.id ? null : item.id);
                                }}
                                title="İkram, İade veya İptal İşlemleri"
                              >
                                <MoreHorizontal size={13} />
                              </button>
                              )}

                              {/* Mobilde Teslim Et Butonu Yerine Adet Stepper'ı */}
                              <div className="pos-item-mobile-qty-wrap">
                                <div className="pos-qty-stepper compact">
                                  <button
                                    type="button"
                                    className="pos-stepper-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdatePayQty(item.id, -1, item.quantity);
                                    }}
                                    disabled={currentPayQty <= 1 || !isSelected}
                                    title="Ödenecek Adedi Azalt"
                                  >
                                    <Minus size={11} />
                                  </button>
                                  <span
                                    className="pos-stepper-val"
                                    title={`Masada ${item.quantity} adet mevcut, ${currentPayQty} adedi tahsilata dahil`}
                                  >
                                    {currentPayQty}/{item.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    className="pos-stepper-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdatePayQty(item.id, +1, item.quantity);
                                    }}
                                    disabled={currentPayQty >= item.quantity || !isSelected}
                                    title="Ödenecek Adedi Artır"
                                  >
                                    <Plus size={11} />
                                  </button>
                                </div>
                              </div>

                              {actionDropdownItemId === item.id && (
                                <div className={`pos-item-action-dropdown ${isNearBottom ? 'dropdown-up' : ''}`} onClick={(e) => e.stopPropagation()}>
                                  {item.item_status !== 'delivered' && perms.deliver && (
                                    <button
                                      type="button"
                                      className="pos-item-action-btn deliver"
                                      onClick={() => handleUpdateItemStatus(item, 'delivered')}
                                    >
                                      <Check size={12} />
                                      <span>Teslim Edildi</span>
                                    </button>
                                  )}
                                  {perms.treat && (
                                  <button
                                    type="button"
                                    className="pos-item-action-btn complimentary"
                                    onClick={() => handleUpdateItemStatus(item, 'complimentary')}
                                  >
                                    <Gift size={12} />
                                    <span>İkram Yap</span>
                                  </button>
                                  )}
                                  {perms.return && (
                                  <button
                                    type="button"
                                    className="pos-item-action-btn return"
                                    onClick={() => handleUpdateItemStatus(item, 'returned')}
                                  >
                                    <RotateCcw size={12} />
                                    <span>İade Al</span>
                                  </button>
                                  )}
                                  {perms.cancel && (
                                  <button
                                    type="button"
                                    className="pos-item-action-btn cancel"
                                    onClick={() => handleUpdateItemStatus(item, 'cancelled')}
                                  >
                                    <Ban size={12} />
                                    <span>Siparişi İptal Et</span>
                                  </button>
                                  )}
                                  {item.item_status !== 'pending' && perms.deliver && (
                                    <button
                                      type="button"
                                      className="pos-item-action-btn pending"
                                      onClick={() => handleUpdateItemStatus(item, 'pending')}
                                    >
                                      <Utensils size={12} />
                                      <span>Mutfakta Durumu</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {item.note && (
                            <span className="pos-row-item-note">"{item.note}"</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Miktar & Kontroller */}
                    <div className="pos-col-qty" onClick={(e) => e.stopPropagation()}>
                      {isPaid || isSpecial ? (
                        <div className="pos-qty-paid-badge-wrap">
                          <span className={`pos-stepper-val ${isPaid ? 'paid' : item.item_status}`}>
                            {item.quantity} Adet
                          </span>
                        </div>
                      ) : (
                        <div className="pos-qty-stepper">
                          <button
                            type="button"
                            className="pos-stepper-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdatePayQty(item.id, -1, item.quantity);
                            }}
                            disabled={currentPayQty <= 1 || !isSelected}
                            title="Ödenecek Adedi Azalt"
                          >
                            <Minus size={12} />
                          </button>
                          <span
                            className="pos-stepper-val"
                            title={`Masada ${item.quantity} adet mevcut, ${currentPayQty} adedi tahsilata dahil`}
                          >
                            {currentPayQty}/{item.quantity}
                          </span>
                          <button
                            type="button"
                            className="pos-stepper-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdatePayQty(item.id, +1, item.quantity);
                            }}
                            disabled={currentPayQty >= item.quantity || !isSelected}
                            title="Ödenecek Adedi Artır"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Tutar */}
                    <div className="pos-col-price">
                      {isPaid ? (
                        <span style={{ fontWeight: 700, color: '#2d6a4f', fontSize: '0.95rem' }}>
                          ₺{parseFloat(item.total_price || 0).toFixed(2)}
                        </span>
                      ) : item.item_status === 'complimentary' ? (
                        <>
                          <span style={{ fontWeight: 700, color: '#6b21a8', fontSize: '0.95rem' }}>
                            ₺0.00
                          </span>
                          <span style={{ display: 'block', fontSize: '0.72rem', color: '#9333ea', fontWeight: 600 }}>
                            (İKRAM)
                          </span>
                        </>
                      ) : item.item_status === 'returned' ? (
                        <>
                          <span style={{ fontWeight: 600, color: '#c2410c', fontSize: '0.92rem', textDecoration: 'line-through' }}>
                            ₺{parseFloat(item.total_price || 0).toFixed(2)}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.72rem', color: '#ea580c', fontWeight: 600 }}>
                            (İADE)
                          </span>
                        </>
                      ) : item.item_status === 'cancelled' ? (
                        <>
                          <span style={{ fontWeight: 600, color: '#b91c1c', fontSize: '0.92rem', textDecoration: 'line-through' }}>
                            ₺{parseFloat(item.total_price || 0).toFixed(2)}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.72rem', color: '#dc2626', fontWeight: 600 }}>
                            (İPTAL)
                          </span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontWeight: isSelected ? 700 : 600, color: isSelected ? '#346c80' : '#4a332d', fontSize: '0.95rem' }}>
                            ₺{parseFloat(item.total_price || 0).toFixed(2)}
                          </span>
                          <span className="pos-unit-price-sub" style={{ display: 'block', fontSize: '0.72rem', color: '#486b78', fontWeight: 500 }}>
                            (Adet: ₺{parseFloat(item.unit_price || 0).toFixed(2)})
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Tablo Alt Çubuğu */}
          <div className="pos-payment-center-footer">
            <div className="pos-footer-metrics-bar">
              {/* 1. Ödenmiş */}
              <div className={`pos-metric-card paid ${paidTotal > 0 ? 'has-paid' : ''}`}>
                <span className="pos-metric-label">Ödenmiş</span>
                <strong className="pos-metric-val">₺{paidTotal.toFixed(2)}</strong>
              </div>

              {/* 2. Kalan Tutar */}
              <div className={`pos-metric-card remaining ${remainingTotal > 0 ? 'has-rem' : 'all-cleared'}`}>
                <span className="pos-metric-label">Kalan Tutar</span>
                <strong className="pos-metric-val">₺{remainingTotal.toFixed(2)}</strong>
              </div>

              {/* 3. Genel Toplam (En Sağda & En Odakta) */}
              <div className="pos-metric-card total focus-total">
                <span className="pos-metric-label">Genel Toplam</span>
                <strong className="pos-metric-val">₺{grandTotal.toFixed(2)}</strong>
              </div>
            </div>
          </div>

        </div>

      </div>
    )}
    </>
  );
}
