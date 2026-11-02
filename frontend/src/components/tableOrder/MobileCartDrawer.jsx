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
  Pencil
} from 'lucide-react';

// Mobil: alttan açılan sürüklenebilir sepet çekmecesi
export default function MobileCartDrawer({
  activeTab,
  cartItemCount,
  cartItems,
  cartTotal,
  dragOffsetY,
  handleCompleteOrder,
  handleRemoveFromCart,
  handleSheetTouchEnd,
  handleSheetTouchMove,
  handleSheetTouchStart,
  handleUpdateCartItemNote,
  handleUpdateCartQuantity,
  isDragging,
  isMobileCartDrawerOpen,
  isSubmittingOrder,
  openNoteProductIds,
  setDragOffsetY,
  setIsMobileCartDrawerOpen,
  toggleNoteInput
}) {
  return (
    <>
    {/* ======================================================== */}
    {/* MOBİL SEPET ÇEKMECESİ (SLIDE-UP BOTTOM SHEET DRAWER)     */}
    {/* ======================================================== */}
    {activeTab === 'order' && cartItems.length > 0 && (
      <div
        className={`pos-mobile-cart-drawer ${(isMobileCartDrawerOpen || isDragging) ? 'open' : ''}`}
        aria-hidden={!isMobileCartDrawerOpen && !isDragging}
      >
        {/* Karartma Backdrop */}
        <div
          className="pos-mobile-cart-backdrop"
          style={isDragging ? {
            opacity: Math.max(0, Math.min(1, 1 - (dragOffsetY / (window.innerHeight * 0.75)))),
            transition: 'none'
          } : undefined}
          onClick={() => {
            setIsMobileCartDrawerOpen(false);
            setDragOffsetY(0);
          }}
        />

        {/* Çekmece Gövdesi (Sabit %75 Yükseklik & Anlık Sürükleme Takibi) */}
        <div
          className="pos-mobile-cart-sheet"
          style={isDragging ? {
            transform: `translateY(${dragOffsetY}px)`,
            transition: 'none'
          } : undefined}
        >
          {/* Sürükleme Çubuğu (Drag Handle) */}
          <div
            className="pos-sheet-drag-handle-wrap"
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
            onClick={() => {
              setIsMobileCartDrawerOpen(false);
              setDragOffsetY(0);
            }}
            title="Aşağı sürükleyerek kapat"
          >
            <div className="pos-sheet-drag-handle" />
          </div>

          {/* Başlık ve Kapat Butonu */}
          <div
            className="pos-sheet-header"
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
          >
            <div className="pos-sheet-header-left">
              <ShoppingBag size={18} color="#346c80" />
              <h3 className="pos-sheet-title">Sipariş Sepeti</h3>
              <span className="pos-sheet-count-badge">{cartItemCount} Ürün</span>
            </div>
            <button
              type="button"
              className="pos-sheet-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsMobileCartDrawerOpen(false);
                setDragOffsetY(0);
              }}
              title="Sepeti Kapat (Menüye Dön)"
            >
              <X size={17} />
            </button>
          </div>

          {/* Sepet Ürünleri Listesi */}
          <div className="pos-sheet-items-scroll">
            {cartItems.map(item => {
              const isNoteOpen = openNoteProductIds.includes(item.product.id) || !!item.note;
              return (
                <div key={item.product.id} className="pos-sheet-item-card">
                  {/* 1. Satır: Görsel, Ürün Adı (Tam Genişlik), Birim Fiyat & Silme Butonu */}
                  <div className="pos-sheet-item-top-row">
                    <div className="pos-sheet-item-thumb">
                      {item.product.image_url ? (
                        <img src={thumbSrc(item.product.image_url)} alt={item.product.name} loading="lazy" decoding="async" onError={(e) => handleThumbError(e, item.product.image_url)} />
                      ) : (
                        <Coffee size={18} color="#346c80" />
                      )}
                    </div>

                    <div className="pos-sheet-item-info">
                      <strong className="pos-sheet-item-name" title={item.product.name}>
                        {item.product.name}
                      </strong>
                      <div className="pos-sheet-item-subline">
                        <span className="pos-sheet-item-unit-price">
                          ₺{item.unit_price.toFixed(2)} / ad
                        </span>
                        {item.note && !isNoteOpen && (
                          <span className="pos-sheet-note-preview-badge" title={item.note}>
                            <Pencil size={10} />
                            <span>"{item.note}"</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="pos-sheet-trash-btn"
                      onClick={() => handleRemoveFromCart(item.product.id)}
                      title="Ürünü Çıkar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* 2. Satır: Not Ekle Butonu (Sol) & Stepper + Toplam Tutar (Sağ) */}
                  <div className="pos-sheet-item-bottom-row">
                    <button
                      type="button"
                      className={`pos-sheet-note-btn ${item.note ? 'has-note' : ''}`}
                      onClick={() => toggleNoteInput(item.product.id)}
                      title={item.note ? 'Sipariş Notunu Düzenle' : 'Sipariş Notu Ekle'}
                    >
                      <Pencil size={11} />
                      <span>{item.note ? 'Notu Düzenle' : '+ Not Ekle'}</span>
                    </button>

                    <div className="pos-sheet-controls-group">
                      <div className="pos-sheet-stepper">
                        <button
                          type="button"
                          className="pos-sheet-step-btn"
                          onClick={() => handleUpdateCartQuantity(item.product.id, -1)}
                        >
                          <Minus size={13} />
                        </button>
                        <span className="pos-sheet-step-val">{item.quantity}</span>
                        <button
                          type="button"
                          className="pos-sheet-step-btn"
                          onClick={() => handleUpdateCartQuantity(item.product.id, +1)}
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <span className="pos-sheet-item-total">
                        ₺{(item.quantity * item.unit_price).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* 3. Satır: Açılır Not Alanı */}
                  {isNoteOpen && (
                    <div className="pos-sheet-note-box">
                      <input
                        type="text"
                        className="pos-sheet-note-input"
                        placeholder="Sipariş notu ekleyin (örn: Az şekerli, soğuk süt...)"
                        value={item.note || ''}
                        onChange={(e) => handleUpdateCartItemNote(item.product.id, e.target.value)}
                      />
                      {item.note && (
                        <button
                          type="button"
                          className="pos-sheet-note-clear-btn"
                          onClick={() => handleUpdateCartItemNote(item.product.id, '')}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Çekmece Alt Kısmı: Toplam ve Onayla Butonu */}
          <div className="pos-sheet-footer">
            <div className="pos-sheet-total-bar">
              <div className="pos-sheet-total-text">
                <span>Toplam Tutar:</span>
                <strong>₺{cartTotal.toFixed(2)}</strong>
              </div>
              <span className="pos-sheet-item-count-sub">({cartItemCount} Ürün)</span>
            </div>

            <button
              type="button"
              className="pos-sheet-submit-btn"
              disabled={cartItems.length === 0 || isSubmittingOrder}
              onClick={handleCompleteOrder}
            >
              {isSubmittingOrder ? (
                <>
                  <div className="cat-btn-spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' }}></div>
                  <span>Sipariş Mutfağa İletiliyor...</span>
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
      </div>
    )}
    </>
  );
}
