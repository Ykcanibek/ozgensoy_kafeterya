import React from 'react';
import {
  X,
  AlertCircle,
  UserPlus,
  User,
  Phone,
  FileText
} from 'lucide-react';
import { toTitleCaseTr, formatLeadingZeroPhone } from '../Customers';

// Veresiye için hızlı yeni müşteri / cari ekleme formu
export default function QuickCustomerModal({
  handleSaveQuickCustomer,
  isSubmittingQuickCust,
  quickCustError,
  quickCustName,
  quickCustNotes,
  quickCustPhone,
  setQuickCustError,
  setQuickCustName,
  setQuickCustNotes,
  setQuickCustPhone,
  setShowQuickAddCustomerModal,
  showQuickAddCustomerModal
}) {
  return (
    <>
    {/* Yeni Müşteri / Cari Ekleme Modalı */}
    {showQuickAddCustomerModal && (
      <div className="pos-receipt-modal-overlay" style={{ zIndex: 1400 }} onClick={() => setShowQuickAddCustomerModal(false)}>
        <div className="cust-modal-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="cust-modal-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="cust-modal-icon">
                <UserPlus size={20} />
              </div>
              <div>
                <h3 className="cust-modal-title">Yeni Müşteri / Cari Ekle</h3>
                <p className="cust-modal-subtitle">
                  Hesabı bu müşteriye yazmak için müşteri kartı oluşturun.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="cust-modal-close-btn"
              onClick={() => setShowQuickAddCustomerModal(false)}
              title="Kapat"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSaveQuickCustomer} className="cust-modal-form">
            {quickCustError && (
              <div className="cust-form-alert danger">
                <AlertCircle size={16} />
                <span>{quickCustError}</span>
              </div>
            )}

            {/* İsim Alanı (Zorunlu + Otomatik Title Case) */}
            <div className="cust-form-group">
              <label className="cust-form-label">
                Müşteri Adı Soyadı <span className="req">* (Zorunlu)</span>
              </label>
              <div className="cust-input-wrapper">
                <User size={16} className="cust-input-icon" />
                <input
                  type="text"
                  required
                  placeholder="Örn: Ahmet Can Yılmaz"
                  value={quickCustName}
                  onChange={(e) => {
                    setQuickCustName(toTitleCaseTr(e.target.value));
                    if (quickCustError) setQuickCustError('');
                  }}
                  autoFocus
                  className="cust-input"
                />
              </div>
            </div>

            {/* Telefon Alanı (Başında silinemez '0') */}
            <div className="cust-form-group">
              <label className="cust-form-label">
                Telefon Numarası <span className="opt">(İsteğe bağlı)</span>
              </label>
              <div className="cust-input-wrapper">
                <Phone size={16} className="cust-input-icon" />
                <input
                  type="tel"
                  placeholder="05XXXXXXXXX"
                  value={quickCustPhone}
                  onChange={(e) => {
                    setQuickCustPhone(formatLeadingZeroPhone(e.target.value));
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Backspace' || e.key === 'Delete') && e.target.selectionStart <= 1 && quickCustPhone.length <= 1) {
                      e.preventDefault();
                    }
                  }}
                  className="cust-input font-mono"
                />
              </div>
              <span className="cust-input-hint">
                Başlangıçtaki "0" sabittir.
              </span>
            </div>

            {/* Açıklama / Not */}
            <div className="cust-form-group">
              <label className="cust-form-label">
                Kısa Açıklama & Not <span className="opt">(İsteğe bağlı)</span>
              </label>
              <div className="cust-input-wrapper">
                <FileText size={16} className="cust-input-icon" style={{ alignSelf: 'flex-start', marginTop: '10px' }} />
                <textarea
                  rows="2"
                  placeholder="Örn: Berber Ali, komşu esnaf, mavi arabalı müşteri vb."
                  value={quickCustNotes}
                  onChange={(e) => setQuickCustNotes(e.target.value)}
                  className="cust-textarea"
                ></textarea>
              </div>
            </div>

            {/* Form Butonları */}
            <div className="cust-modal-foot">
              <button
                type="button"
                className="cust-btn-cancel"
                onClick={() => setShowQuickAddCustomerModal(false)}
                disabled={isSubmittingQuickCust}
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="customers-btn-primary"
                disabled={isSubmittingQuickCust}
              >
                {isSubmittingQuickCust ? 'Kaydediliyor...' : 'Kaydet ve Seç'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}
