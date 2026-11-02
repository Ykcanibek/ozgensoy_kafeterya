import React from 'react';
import { thumbSrc, handleThumbError } from '../../lib/images';
import {
  X,
  Plus,
  Minus,
  Trash2,
  Coffee,
  CheckCircle2,
  ShoppingBag,
  Check,
  Pencil
} from 'lucide-react';

// Sağ panel / Menü sekmesi: sepet kalemleri, notlar ve siparişi onaylama
export default function CartPanel({
  perms,
  activeTab,
  setActiveTab,
  cartItemCount,
  cartItems,
  cartTotal,
  displayedSavedItems,
  handleCompleteOrder,
  handleEmptyTable,
  handleRemoveFromCart,
  handleUpdateCartItemNote,
  handleUpdateCartQuantity,
  isSubmittingOrder,
  openNoteProductIds,
  paidSavedItems,
  remainingTotal,
  toggleNoteInput
}) {
  return (
    <>
    {/* -------------------------------------------------------- */}
    {/* SAĞ PANEL DURUM 1: SEPET (FERAH VE GENİŞ TASARIM)        */}
    {/* -------------------------------------------------------- */}
    {activeTab === 'order' && (
      <div className="pos-cart-panel-card" id="pos-cart-panel">

        {/* Sepet Başlığı */}
        <div className="pos-cart-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingBag size={18} color="#346c80" />
            <h3 className="pos-cart-title">Sipariş Sepeti</h3>
          </div>
          <span className="pos-cart-count-badge">{cartItemCount} Ürün</span>
        </div>

        {/* Masada Daha Önce Eklenmiş Kalemler Bilgisi */}
        {displayedSavedItems.length > 0 && perms.payView && (
          <div
            className="pos-cart-existing-orders-summary"
            onClick={() => setActiveTab('payment')}
            title="Masadaki tüm ürünleri ve adisyonu görüntülemek için tıklayın"
            style={{ cursor: 'pointer' }}
          >
            <span>Masada: <strong>{displayedSavedItems.length} Kalem</strong></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {paidSavedItems.length > 0 && (
                <span className="pos-summary-badge-paid">{paidSavedItems.length} Ödendi</span>
              )}
              <span style={{ fontSize: '0.72rem', color: '#346c80', fontWeight: 600 }}>Adisyona Git &rsaquo;</span>
            </div>
          </div>
        )}

        {/* Masada Ödenecek Bakiye Yoksa Hızlı Kapatma Butonu (İkram/İade/Tamamı Ödenmiş) */}
        {remainingTotal <= 0.05 && displayedSavedItems.length > 0 && cartItems.length === 0 && perms.closeEmpty && (
          <div style={{ padding: '0 12px 10px 12px' }}>
            <button
              type="button"
              onClick={handleEmptyTable}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #2d6a4f 0%, #1b4332 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '0.88rem',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                cursor: 'pointer',
                boxShadow: '0 3px 10px rgba(45, 106, 79, 0.28)'
              }}
            >
              <Check size={16} />
              <span>Masayı Kapat & Boşalt (0.00 ₺)</span>
            </button>
          </div>
        )}

        {/* Sepet Kalemleri */}
        <div className="pos-cart-items-wrap">
          {cartItems.length === 0 ? (
            <div className="pos-cart-empty-state">
              <ShoppingBag size={38} color="#d4c9bf" />
              <p>Sepetiniz şu anda boş.</p>
              <span>Sol taraftaki menüden ürün seçebilirsiniz</span>
            </div>
          ) : (
            cartItems.map(item => {
              const isNoteOpen = openNoteProductIds.includes(item.product.id) || !!item.note;
              return (
                <div key={item.product.id} className="pos-cart-item-block">
                  <div className="pos-cart-row">
                    {/* Küçük Önizleme */}
                    <div className="pos-cart-row-thumb">
                      {item.product.image_url ? (
                        <img src={thumbSrc(item.product.image_url)} alt={item.product.name} loading="lazy" decoding="async" onError={(e) => handleThumbError(e, item.product.image_url)} />
                      ) : (
                        <Coffee size={14} color="#346c80" />
                      )}
                    </div>

                    {/* Bilgiler (Ürün Adı ve Kalem Butonu) */}
                    <div className="pos-cart-row-info">
                      <div className="pos-cart-row-name-wrap">
                        <span className="pos-cart-row-name" title={item.product.name}>
                          {item.product.name}
                        </span>
                        <button
                          type="button"
                          className={`pos-cart-note-trigger-btn ${item.note ? 'has-note' : ''}`}
                          onClick={() => toggleNoteInput(item.product.id)}
                          title={item.note ? 'Sipariş Notunu Düzenle' : 'Sipariş Notu Ekle'}
                        >
                          <Pencil size={11} />
                        </button>
                      </div>
                      <span className="pos-cart-row-unit-price">
                        ₺{item.unit_price.toFixed(2)} / ad
                      </span>
                    </div>

                    {/* Adet Kontrolleri */}
                    <div className="pos-cart-stepper">
                      <button
                        type="button"
                        className="pos-cart-step-btn"
                        onClick={() => handleUpdateCartQuantity(item.product.id, -1)}
                      >
                        <Minus size={11} />
                      </button>
                      <span className="pos-cart-step-val">{item.quantity}</span>
                      <button
                        type="button"
                        className="pos-cart-step-btn"
                        onClick={() => handleUpdateCartQuantity(item.product.id, +1)}
                      >
                        <Plus size={11} />
                      </button>
                    </div>

                    {/* Toplam */}
                    <span className="pos-cart-row-total">
                      ₺{(item.quantity * item.unit_price).toFixed(2)}
                    </span>

                    {/* Sil */}
                    <button
                      type="button"
                      className="pos-cart-trash-btn"
                      onClick={() => handleRemoveFromCart(item.product.id)}
                      title="Sepetten Sil"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Açılır / Girilen Not Kutusu */}
                  {isNoteOpen && (
                    <div className="pos-cart-inline-note-box">
                      <input
                        type="text"
                        className="pos-cart-note-input"
                        placeholder="Not ekle... (Örn: Şekerli, orta, az buzlu)"
                        value={item.note || ''}
                        onChange={(e) => handleUpdateCartItemNote(item.product.id, e.target.value)}
                      />
                      {item.note && (
                        <button
                          type="button"
                          className="pos-cart-note-clear-btn"
                          onClick={() => handleUpdateCartItemNote(item.product.id, '')}
                          title="Notu Temizle"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Sepet Alt Toplam ve Onay Butonu */}
        <div className="pos-cart-footer">
          <div className="pos-cart-total-row">
            <span className="pos-cart-total-label">Sipariş Tutarı</span>
            <span className="pos-cart-total-val">₺{cartTotal.toFixed(2)}</span>
          </div>

          <button
            type="button"
            className="pos-btn-submit-order"
            disabled={cartItems.length === 0 || isSubmittingOrder}
            onClick={handleCompleteOrder}
          >
            {isSubmittingOrder ? (
              <>
                <div className="cat-btn-spinner"></div>
                <span>Sipariş İletiliyor...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span>Siparişi Onayla</span>
              </>
            )}
          </button>
        </div>

      </div>
    )}
    </>
  );
}
