import React from 'react';
import { thumbSrc, handleThumbError } from '../../lib/images';
import {
  X,
  Search,
  Plus,
  Utensils,
  Coffee,
  ChevronUp,
  ShoppingBag
} from 'lucide-react';

// Orta panel / Menü sekmesi: arama, ürün ızgarası ve mobil sepet çubuğu
export default function MenuTab({
  activeTab,
  cartItemCount,
  cartItems,
  cartTotal,
  filteredProducts,
  getProductCartCount,
  handleAddToCart,
  handleBarTouchEnd,
  handleBarTouchMove,
  handleBarTouchStart,
  loading,
  searchQuery,
  setDragOffsetY,
  setIsMobileCartDrawerOpen,
  setSearchQuery
}) {
  return (
    <>
    {/* -------------------------------------------------------- */}
    {/* DURUM 1: MENÜ & SİPARİŞ SEKMESİ                          */}
    {/* -------------------------------------------------------- */}
    {activeTab === 'order' && (
      <div className="pos-order-center-view">

        {/* Üst Arama Çubuğu */}
        <div className="pos-search-bar">
          <Search size={18} className="pos-search-icon" />
          <input
            type="text"
            placeholder="Menüde ürün veya lezzet ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="pos-search-clear-btn"
              onClick={() => setSearchQuery('')}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Kompakt ve Çoklu Ürün Izgarası (5-6 Kolon) */}
        <div className="pos-product-grid-wrap">
          {loading ? (
            <div className="pos-grid-empty">
              <div className="cat-btn-spinner" style={{ width: '28px', height: '28px', borderColor: '#6293a3', borderTopColor: '#346c80' }}></div>
              <p>Menü yükleniyor...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="pos-grid-empty">
              <Utensils size={36} color="#c8b6a6" />
              <p>Bu kategoride ürün bulunamadı.</p>
            </div>
          ) : (
            <div className="pos-product-grid">
              {filteredProducts.map(prod => {
                const countInCart = getProductCartCount(prod.id);
                return (
                  <div
                    key={prod.id}
                    className={`pos-product-card ${countInCart > 0 ? 'in-cart' : ''} ${prod.image_url ? '' : 'no-img'}`}
                    onClick={() => handleAddToCart(prod)}
                  >
                    {/* Sepetteki Adet Rozeti (Sol Üst) */}
                    {countInCart > 0 && (
                      <div className="pos-product-cart-count-badge">
                        {countInCart}x
                      </div>
                    )}

                    {/* Fiyat Rozeti (Sağ Üst) */}
                    <div className="pos-product-price-badge">
                      ₺{parseFloat(prod.price || 0).toFixed(0)}
                    </div>

                    {/* Ürün Görseli */}
                    <div className="pos-product-img-box">
                      {prod.image_url ? (
                        <img
                          src={thumbSrc(prod.image_url)}
                          alt={prod.name}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => handleThumbError(e, prod.image_url)}
                        />
                      ) : null}
                      <div
                        className="pos-product-fallback-img"
                        style={{ display: prod.image_url ? 'none' : 'flex' }}
                      >
                        <Coffee size={24} color="#346c80" />
                      </div>
                    </div>

                    {/* Ürün Başlığı & Hızlı Ekle Butonu */}
                    <div className="pos-product-bottom-row">
                      <span className="pos-product-name" title={prod.name}>
                        {prod.name}
                      </span>
                      <button
                        type="button"
                        className="pos-product-add-btn"
                        title="Sepete Ekle"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToCart(prod);
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mobil Ekranlar İçin Sabit Kayan / Alt Önizleme Sepet Çubuğu */}
        {cartItems.length > 0 && (
          <div
            className="pos-mobile-cart-floating-bar"
            onClick={() => {
              setIsMobileCartDrawerOpen(true);
              setDragOffsetY(0);
            }}
            onTouchStart={handleBarTouchStart}
            onTouchMove={handleBarTouchMove}
            onTouchEnd={handleBarTouchEnd}
          >
            <div className="pos-mobile-cart-bar-left">
              <div className="pos-mobile-cart-badge-icon">
                <ShoppingBag size={15} />
                <span className="pos-mobile-cart-badge">{cartItemCount}</span>
              </div>
              <div className="pos-mobile-cart-col">
                <span className="pos-mobile-cart-label">Sepet Önizleme</span>
                <strong className="pos-mobile-cart-total">₺{cartTotal.toFixed(2)}</strong>
              </div>
            </div>
            <div className="pos-mobile-cart-bar-right">
              <span>Sepeti Gör & Onayla</span>
              <ChevronUp size={16} />
            </div>
          </div>
        )}

      </div>
    )}
    </>
  );
}
