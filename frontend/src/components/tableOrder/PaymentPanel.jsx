import React from 'react';
import {
  CheckCircle2,
  CreditCard,
  Banknote,
  Split,
  ChevronUp,
  ChevronDown,
  Check,
  UserCheck,
  UserPlus,
  FileText
} from 'lucide-react';
import CustomerDropdown from './CustomerDropdown';
import SplitPaymentBox from './SplitPaymentBox';

// Sağ panel / Hesap sekmesi: tutar, bahşiş/indirim, ödeme yöntemi ve tahsilat
export default function PaymentPanel({
  perms,
  activeTab,
  basePayableAmount,
  handleFillMixedRemaining,
  customAmountToPay,
  customerDropdownRef,
  customerSearchTerm,
  discountAmount,
  filteredCustomers,
  finalPayableTotal,
  handleConfirmPayment,
  handleEmptyTable,
  handleMixedCardChange,
  handleMixedCashChange,
  handleMixedVeresiyeChange,
  handleSelectPaymentMethod,
  handleSetMixedHalfCardVeresiye,
  handleSetMixedHalfCashCard,
  handleSetMixedHalfCashVeresiye,
  isCustomAmountFocused,
  isCustomerDropdownOpen,
  isPaying,
  mixedCard,
  mixedCash,
  mixedVeresiye,
  paidTotal,
  paymentMethod,
  remainingTotal,
  savedItems,
  selectedItemIds,
  selectedRegisteredCustomer,
  setCustomAmountToPay,
  setCustomerSearchTerm,
  setDiscountAmount,
  setIsCustomAmountFocused,
  setIsCustomerDropdownOpen,
  setQuickCustError,
  setQuickCustName,
  setQuickCustNotes,
  setQuickCustPhone,
  setShowQuickAddCustomerModal,
  setTipAmount,
  setVeresiyeCustomer,
  setVeresiyeCustomerId,
  setVeresiyeNote,
  tipAmount,
  veresiyeCustomerId,
  veresiyeNote
}) {
  return (
    <>
    {/* -------------------------------------------------------- */}
    {/* SAĞ PANEL DURUM 2: HESAP ÖDEME & TAHSİLAT PANELİ         */}
    {/* -------------------------------------------------------- */}
    {activeTab === 'payment' && (
      <div className="pos-checkout-panel-card">

        {/* Başlık (sepet paneliyle aynı düzen; sağdaki boşluk kapatma butonu için) */}
        <div className="pos-cart-head" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Banknote size={18} color="#346c80" />
            <h3 className="pos-cart-title">Tahsilat</h3>
          </div>
        </div>

        {/* Üst Kısım: Tahsil Edilecek Tutar (Sol) ve Bahşiş/İndirim Altlı Üstlü (Sağ) */}
        <div className="pos-checkout-amount-and-calc-grid">
          {/* Sol: Büyük Tutar Göstergesi */}
          <div className="pos-checkout-amount-display">
            <div className="pos-checkout-amount-info">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span className="pos-checkout-amount-label">Tahsil Edilecek Tutar</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, color: finalPayableTotal > 0 ? '#1e7e34' : '#486b78' }}>₺</span>
                <input
                  type="number"
                  step="any"
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '1.85rem',
                    fontWeight: 900,
                    color: finalPayableTotal > 0 ? '#1e7e34' : '#486b78',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    padding: 0
                  }}
                  value={
                    selectedItemIds.length > 0
                      ? finalPayableTotal.toFixed(2)
                      : isCustomAmountFocused
                        ? customAmountToPay
                        : (finalPayableTotal > 0 ? finalPayableTotal.toFixed(2) : (customAmountToPay !== '' ? customAmountToPay : '0.00'))
                  }
                  onChange={(e) => {
                    if (selectedItemIds.length === 0) {
                      setCustomAmountToPay(e.target.value);
                    }
                  }}
                  onFocus={() => {
                    setIsCustomAmountFocused(true);
                    if (selectedItemIds.length === 0 && (customAmountToPay === '' || customAmountToPay === '0.00' || customAmountToPay === '0')) {
                      setCustomAmountToPay('');
                    }
                  }}
                  onBlur={() => setIsCustomAmountFocused(false)}
                  disabled={selectedItemIds.length > 0 || !perms.split}
                  title={selectedItemIds.length > 0 ? 'Tablodan ürün seçildiğinde ve bahşiş/indirim girildiğinde tutar otomatik hesaplanır' : 'Ödenecek tutarı girmek için tıklayıp yazabilirsiniz'}
                />
              </div>
              {selectedItemIds.length === 0 && finalPayableTotal <= 0 && remainingTotal > 0.05 && (
                <span className="pos-checkout-amount-hint">
                  {perms.split ? 'Ödenecek ürünleri seçin veya tutarı yazın' : 'Hesabı almak için "Tümünü Seç"i işaretleyin'}
                </span>
              )}
              {basePayableAmount > 0 && parseFloat(discountAmount || 0) > basePayableAmount ? (
                <span className="pos-checkout-amount-hint warn">
                  İndirim (₺{parseFloat(discountAmount).toFixed(2)}) tahsil edilecek ürün tutarından (₺{basePayableAmount.toFixed(2)}) fazla olamaz
                </span>
              ) : selectedItemIds.length > 0 && (
                <span className="pos-checkout-amount-hint selected">
                  {selectedItemIds.length} ürün seçili · Masada kalan ₺{remainingTotal.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Sağ: Bahşiş ve İndirim (Altlı Üstlü) */}
          <div className="pos-calc-stacked-col">
            {/* Bahşiş */}
            {perms.tip && (
            <div className="pos-calc-input-group compact">
              <div className="pos-calc-label-row">
                <span className="pos-calc-title">Bahşiş</span>
              </div>
              <div className="pos-calc-input-box tip compact">
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={tipAmount || ''}
                  onChange={(e) => setTipAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0"
                />
                <div className="pos-calc-stepper-vertical">
                  <button type="button" onClick={() => setTipAmount(prev => (prev || 0) + 10)}>
                    <ChevronUp size={10} />
                  </button>
                  <button type="button" onClick={() => setTipAmount(prev => Math.max(0, (prev || 0) - 10))}>
                    <ChevronDown size={10} />
                  </button>
                </div>
                <div className="pos-calc-currency-badge tip">₺</div>
              </div>
            </div>
            )}

            {/* İndirim (rolün indirim üst sınırı varsa gösterilir) */}
            {perms.discount && (
            <div className="pos-calc-input-group compact">
              <div className="pos-calc-label-row">
                <span className="pos-calc-title">İndirim</span>
                {perms.maxDiscountPercent !== null && (
                  <span className="pos-calc-limit-hint" title={`Rolünüz en fazla %${perms.maxDiscountPercent} indirim yapabilir`}>≤ %{perms.maxDiscountPercent}</span>
                )}
              </div>
              <div className="pos-calc-input-box discount compact">
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={discountAmount || ''}
                  onChange={(e) => setDiscountAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0"
                />
                <div className="pos-calc-stepper-vertical">
                  <button type="button" onClick={() => setDiscountAmount(prev => (prev || 0) + 10)}>
                    <ChevronUp size={10} />
                  </button>
                  <button type="button" onClick={() => setDiscountAmount(prev => Math.max(0, (prev || 0) - 10))}>
                    <ChevronDown size={10} />
                  </button>
                </div>
                <div className="pos-calc-currency-badge discount">₺</div>
              </div>
            </div>
            )}
          </div>
        </div>

        {/* Dörtlü Ödeme Şekli Seçimi: Nakit / Kredi Kartı / Parçalı / Veresiye */}
        <div className="pos-payment-method-row">
          {perms.cashCard && (
          <>
          <button
            type="button"
            className={`pos-method-btn cash ${paymentMethod === 'cash' ? 'active' : ''}`}
            onClick={() => handleSelectPaymentMethod('cash')}
          >
            <Banknote size={15} />
            <span>Nakit</span>
          </button>

          <button
            type="button"
            className={`pos-method-btn card ${paymentMethod === 'credit_card' ? 'active' : ''}`}
            onClick={() => handleSelectPaymentMethod('credit_card')}
          >
            <CreditCard size={15} />
            <span>Kredi Kartı</span>
          </button>
          </>
          )}

          {perms.split && perms.cashCard && (
          <button
            type="button"
            className={`pos-method-btn mixed ${paymentMethod === 'mixed' ? 'active' : ''}`}
            onClick={() => handleSelectPaymentMethod('mixed')}
          >
            <Split size={15} />
            <span>Parçalı / Karma</span>
          </button>
          )}

          {perms.veresiye && (
          <button
            type="button"
            className={`pos-method-btn veresiye ${paymentMethod === 'veresiye' ? 'active' : ''}`}
            onClick={() => handleSelectPaymentMethod('veresiye')}
          >
            <UserCheck size={15} />
            <span>Veresiye / Cari</span>
          </button>
          )}
          {!perms.cashCard && !perms.veresiye && (
            <div className="pos-no-payment-permission">Tahsilat yetkiniz yok; hesabı yalnızca görüntüleyebilirsiniz.</div>
          )}
        </div>

        {/* Yönteme Göre Dinamik Alanlar */}
        {/* Parçalı / Karma: tutar nakit, kart ve veresiyeye bölünür */}
        {paymentMethod === 'mixed' && (
          <SplitPaymentBox
            total={finalPayableTotal}
            cash={mixedCash}
            card={mixedCard}
            veresiye={mixedVeresiye}
            onCashChange={handleMixedCashChange}
            onCardChange={handleMixedCardChange}
            onVeresiyeChange={handleMixedVeresiyeChange}
            onFillRemaining={handleFillMixedRemaining}
            onPreset={(kind) => ({
              'cash-card': handleSetMixedHalfCashCard,
              'cash-veresiye': handleSetMixedHalfCashVeresiye,
              'card-veresiye': handleSetMixedHalfCardVeresiye
            })[kind]?.()}
            showVeresiye={perms.veresiye}
            veresiyeSlot={(
              <div className="pos-mixed-veresiye-box">
                <div className="pos-mixed-veresiye-head">
                  <div className="pos-mixed-veresiye-title">
                    <UserCheck size={14} />
                    <span>Veresiye Yazılacak Cari:</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="pos-mixed-veresiye-amt-badge">
                      ₺{parseFloat(mixedVeresiye || 0).toFixed(2)}
                    </span>
                    {perms.customerCreate && (
                    <button
                      type="button"
                      className="pos-veresiye-top-add-btn"
                      onClick={() => {
                        setQuickCustName('');
                        setQuickCustPhone('0');
                        setQuickCustNotes('');
                        setQuickCustError('');
                        setShowQuickAddCustomerModal(true);
                      }}
                      title="Yeni Müşteri Ekle"
                    >
                      <UserPlus size={12} />
                      <span>+ Yeni</span>
                    </button>
                    )}
                  </div>
                </div>

                <CustomerDropdown canCreateCustomer={perms.customerCreate} customerDropdownRef={customerDropdownRef} customerSearchTerm={customerSearchTerm} filteredCustomers={filteredCustomers} isCustomerDropdownOpen={isCustomerDropdownOpen} selectedRegisteredCustomer={selectedRegisteredCustomer} setCustomerSearchTerm={setCustomerSearchTerm} setIsCustomerDropdownOpen={setIsCustomerDropdownOpen} setQuickCustError={setQuickCustError} setQuickCustName={setQuickCustName} setQuickCustNotes={setQuickCustNotes} setQuickCustPhone={setQuickCustPhone} setShowQuickAddCustomerModal={setShowQuickAddCustomerModal} setVeresiyeCustomer={setVeresiyeCustomer} setVeresiyeCustomerId={setVeresiyeCustomerId} veresiyeCustomerId={veresiyeCustomerId} />

                <div className="pos-veresiye-note-field">
                  <label className="pos-veresiye-note-label">
                    <FileText size={12} />
                    <span>Vade / Açıklama Notu</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: Kalan tutar haftaya ödenecek..."
                    value={veresiyeNote}
                    onChange={(e) => setVeresiyeNote(e.target.value)}
                    className="pos-veresiye-note-input"
                  />
                </div>
              </div>
            )}
          />
        )}

        {/* Veresiye / Açık Hesap Girişi */}
        {paymentMethod === 'veresiye' && (
          <div className="pos-veresiye-card">
            <div className="pos-veresiye-card-header">
              <div className="pos-veresiye-title-wrap">
                <div className="pos-veresiye-icon-pill">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h4 className="pos-veresiye-heading">Veresiye</h4>
                </div>
              </div>
              {perms.customerCreate && (
              <button
                type="button"
                className="pos-veresiye-top-add-btn"
                onClick={() => {
                  setQuickCustName('');
                  setQuickCustPhone('0');
                  setQuickCustNotes('');
                  setQuickCustError('');
                  setShowQuickAddCustomerModal(true);
                }}
                title="Yeni Müşteri / Cari Ekle"
              >
                <UserPlus size={14} />
                <span>+ Yeni Müşteri</span>
              </button>
              )}
            </div>

            <CustomerDropdown canCreateCustomer={perms.customerCreate} customerDropdownRef={customerDropdownRef} customerSearchTerm={customerSearchTerm} filteredCustomers={filteredCustomers} isCustomerDropdownOpen={isCustomerDropdownOpen} selectedRegisteredCustomer={selectedRegisteredCustomer} setCustomerSearchTerm={setCustomerSearchTerm} setIsCustomerDropdownOpen={setIsCustomerDropdownOpen} setQuickCustError={setQuickCustError} setQuickCustName={setQuickCustName} setQuickCustNotes={setQuickCustNotes} setQuickCustPhone={setQuickCustPhone} setShowQuickAddCustomerModal={setShowQuickAddCustomerModal} setVeresiyeCustomer={setVeresiyeCustomer} setVeresiyeCustomerId={setVeresiyeCustomerId} veresiyeCustomerId={veresiyeCustomerId} />

            {/* Açıklama / Vade Notu */}
            <div className="pos-veresiye-note-field">
              <label className="pos-veresiye-note-label">
                <FileText size={13} />
                <span>Açıklama / Vade Notu <small>(İsteğe bağlı)</small></span>
              </label>
              <input
                type="text"
                placeholder="Örn: Yarın ödenecek / Berber dükkanına teslim..."
                value={veresiyeNote}
                onChange={(e) => setVeresiyeNote(e.target.value)}
                className="pos-veresiye-note-input"
              />
            </div>
          </div>
        )}

        {/* Hesap Sıfırlandıysa Masayı Boşaltma Bildirimi (Ödendi, İkram veya İade/İptal) */}
        {remainingTotal <= 0.05 && (
          <div className="pos-all-paid-card">
            <CheckCircle2 size={32} color="#2d6a4f" />
            <h4>
              {paidTotal > 0
                ? 'Masa Hesabı Tamamen Ödendi'
                : savedItems.some(i => i.item_status === 'complimentary')
                  ? 'Tüm Ürünler İkram Edildi'
                  : 'Ödenecek Tutar Bulunmuyor'}
            </h4>
            <p>
              {paidTotal > 0
                ? 'Bu masaya ait tüm siparişlerin tahsilatı yapılmıştır.'
                : savedItems.some(i => i.item_status === 'complimentary')
                  ? 'Masadaki ürünler ikram olarak verilmiştir (Kalan 0.00 ₺).'
                  : 'Masadaki tüm ürünler iade veya iptal edilmiştir.'}
              {' '}Masayı kapatıp boşaltabilirsiniz.
            </p>
            {perms.closeEmpty && (
            <button
              type="button"
              className="pos-btn-empty-table-now"
              onClick={handleEmptyTable}
            >
              <Check size={16} />
              <span>Masayı Kapat & Boşalt</span>
            </button>
            )}
          </div>
        )}

        {/* Büyük "Tahsilatı Tamamla" Butonu */}
        {remainingTotal > 0.05 && (perms.cashCard || perms.veresiye) && (
          <button
            type="button"
            className="pos-btn-confirm-payment"
            disabled={finalPayableTotal <= 0 || isPaying}
            onClick={handleConfirmPayment}
          >
            {isPaying ? (
              <>
                <div className="cat-btn-spinner"></div>
                <span>Tahsil Ediliyor...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span>Ödemeyi Onayla (₺{finalPayableTotal.toFixed(2)})</span>
              </>
            )}
          </button>
        )}

      </div>
    )}
    </>
  );
}
