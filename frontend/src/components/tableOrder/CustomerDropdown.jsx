import React from 'react';
import {
  X,
  Search,
  ChevronDown,
  AlertCircle,
  Check,
  UserPlus,
  User,
  Phone
} from 'lucide-react';
import { toTitleCaseTr } from '../Customers';

// Veresiye müşteri seçim açılır menüsü (arama + hızlı müşteri ekleme)
export default function CustomerDropdown({
  canCreateCustomer,
  customerDropdownRef,
  customerSearchTerm,
  filteredCustomers,
  isCustomerDropdownOpen,
  selectedRegisteredCustomer,
  setCustomerSearchTerm,
  setIsCustomerDropdownOpen,
  setQuickCustError,
  setQuickCustName,
  setQuickCustNotes,
  setQuickCustPhone,
  setShowQuickAddCustomerModal,
  setVeresiyeCustomer,
  setVeresiyeCustomerId,
  veresiyeCustomerId
}) {
  return (
    <>
    <div className="pos-veresiye-dropdown-wrap" ref={customerDropdownRef}>
      <div
        className={`pos-veresiye-custom-select-trigger ${isCustomerDropdownOpen ? 'is-open' : ''}`}
        onClick={() => setIsCustomerDropdownOpen(prev => !prev)}
      >
        <div className="pos-veresiye-trigger-left">
          <div className="pos-veresiye-trigger-avatar">
            {selectedRegisteredCustomer ? selectedRegisteredCustomer.name.charAt(0).toUpperCase() : <User size={15} />}
          </div>
          {selectedRegisteredCustomer ? (
            <div className="pos-veresiye-trigger-details">
              <span className="pos-veresiye-trigger-name">{selectedRegisteredCustomer.name}</span>
              {selectedRegisteredCustomer.phone && selectedRegisteredCustomer.phone.length > 1 && (
                <span className="pos-veresiye-trigger-phone">({selectedRegisteredCustomer.phone})</span>
              )}
            </div>
          ) : (
            <span className="pos-veresiye-trigger-placeholder">-- Müşteri Seçiniz (Kayıtlı Cariler) --</span>
          )}
        </div>

        <div className="pos-veresiye-trigger-right">
          {selectedRegisteredCustomer && (
            <span className={`pos-veresiye-item-debt-badge ${parseFloat(selectedRegisteredCustomer.current_balance || 0) > 0 ? 'debt' : 'clear'}`}>
              {parseFloat(selectedRegisteredCustomer.current_balance || 0) > 0
                ? `Borç: ₺${parseFloat(selectedRegisteredCustomer.current_balance).toFixed(2)}`
                : 'Borçsuz'}
            </span>
          )}
          {selectedRegisteredCustomer && (
            <button
              type="button"
              className="pos-veresiye-trigger-clear-btn"
              title="Seçimi Kaldır"
              onClick={(e) => {
                e.stopPropagation();
                setVeresiyeCustomerId(null);
                setVeresiyeCustomer('');
              }}
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} className={`pos-veresiye-trigger-chevron ${isCustomerDropdownOpen ? 'rotated' : ''}`} />
        </div>
      </div>

      {/* Açılan Menü */}
      {isCustomerDropdownOpen && (
        <div className="pos-veresiye-custom-menu" onClick={(e) => e.stopPropagation()}>
          <div className="pos-veresiye-menu-search-box">
            <Search size={14} color="#486b78" />
            <input
              type="text"
              placeholder="Müşteri adı veya telefon ile filtrele..."
              value={customerSearchTerm}
              onChange={(e) => setCustomerSearchTerm(e.target.value)}
              autoFocus
              className="pos-veresiye-menu-search-input"
            />
            {customerSearchTerm && (
              <button
                type="button"
                className="pos-veresiye-trigger-clear-btn"
                onClick={() => setCustomerSearchTerm('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="pos-veresiye-menu-list">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map(c => {
                const debt = parseFloat(c.current_balance || 0);
                const isSelected = veresiyeCustomerId === c.id;
                return (
                  <div
                    key={c.id}
                    className={`pos-veresiye-menu-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setVeresiyeCustomerId(c.id);
                      setVeresiyeCustomer(c.name);
                      setIsCustomerDropdownOpen(false);
                      setCustomerSearchTerm('');
                    }}
                  >
                    <div className="pos-veresiye-item-left">
                      <div className="pos-veresiye-item-avatar">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="pos-veresiye-item-details">
                        <div className="pos-veresiye-item-title-row">
                          <span className="pos-veresiye-item-name">{c.name}</span>
                          {isSelected && <Check size={13} color="#2d6a4f" />}
                        </div>
                        {c.phone && c.phone.length > 1 && (
                          <span className="pos-veresiye-item-phone">
                            <Phone size={11} /> {c.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="pos-veresiye-item-right">
                      <span className={`pos-veresiye-item-debt-badge ${debt > 0 ? 'debt' : 'clear'}`}>
                        {debt > 0 ? `Borç: ₺${debt.toFixed(2)}` : 'Borçsuz'}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="pos-veresiye-menu-empty">
                <AlertCircle size={18} color="#b88214" />
                <span>"{customerSearchTerm}" bulunamadı</span>
                {canCreateCustomer && (
                <button
                  type="button"
                  className="pos-veresiye-create-prompt-btn"
                  onClick={() => {
                    setQuickCustName(toTitleCaseTr(customerSearchTerm));
                    setQuickCustPhone('0');
                    setQuickCustNotes('');
                    setQuickCustError('');
                    setShowQuickAddCustomerModal(true);
                    setIsCustomerDropdownOpen(false);
                  }}
                >
                  <UserPlus size={14} />
                  <span>"{toTitleCaseTr(customerSearchTerm)}" Olarak Yeni Ekle</span>
                </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
