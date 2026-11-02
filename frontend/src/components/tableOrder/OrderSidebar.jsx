import React from 'react';
import {
  Receipt,
  Utensils,
  Coffee,
  ArrowLeftRight,
  ChevronDown
} from 'lucide-react';

// Sol panel: masa rozeti, sekme butonları ve kategori listesi
export default function OrderSidebar({
  perms,
  onOpenTransfer,
  table,
  activeTab,
  setActiveTab,
  cartItemCount,
  categories,
  existingOrder,
  orderGuid,
  products,
  savedItems,
  selectedCategoryId,
  setSelectedCategoryId,
  showToast
}) {
  return (
    <>
    {/* ======================================================== */}
    {/* SOL PANEL (MASA BADGE & NAVİGASYON & DİKEY KATEGORİLER)  */}
    {/* ======================================================== */}
    <aside className="pos-left-panel">

      {/* Masa Bilgi Rozeti */}
      <div className="pos-table-card pos-order-table-card">
        <div className="pos-table-card-avatar">
          <Coffee size={20} color="#346c80" />
        </div>
        <div className="pos-table-card-info">
          <div className="pos-table-card-top-row">
            <h2 className="pos-table-card-title">{table.title}</h2>
            {perms.transfer && (
            <button
              type="button"
              className="pos-table-card-transfer-btn"
              title="Masa Taşı / Birleştir"
              onClick={() => (existingOrder?.id
                ? onOpenTransfer()
                : showToast('Bu masada taşınacak açık adisyon yok.', 'info'))}
            >
              <ArrowLeftRight size={13} />
            </button>
            )}
          </div>
          <div className="pos-table-card-sub-row">
            <span
              className="pos-table-card-code"
              title={existingOrder?.order_number ? `Sipariş GUID: ${existingOrder.order_number} (Kopyalamak için tıkla)` : 'Masada henüz açık sipariş yok'}
              onClick={() => {
                if (existingOrder?.order_number) {
                  navigator.clipboard?.writeText(existingOrder.order_number);
                  showToast('Sipariş GUID kopyalandı', 'info');
                }
              }}
              style={{ cursor: existingOrder?.order_number ? 'pointer' : 'default' }}
            >
              {orderGuid}
            </span>
            <span className={`pos-table-card-status ${existingOrder?.id ? 'active-order' : 'empty-order'}`}>
              <span className={`pos-status-dot ${existingOrder?.id ? 'occupied' : 'empty'}`}></span>
              {existingOrder?.id ? 'Açık' : 'Boş'}
            </span>
          </div>
        </div>
      </div>

      {/* Sekme Butonları */}
      <div className="pos-nav-tabs">
        {perms.payView && (
        <button
          type="button"
          className={`pos-nav-tab-btn ${activeTab === 'payment' ? 'active' : ''}`}
          onClick={() => setActiveTab('payment')}
        >
          <Receipt size={17} />
          <span>Hesap Ödeme</span>
          {savedItems.length > 0 && (
            <span className="pos-tab-counter-badge">{savedItems.length}</span>
          )}
        </button>
        )}

        {perms.order && (
        <button
          type="button"
          className={`pos-nav-tab-btn ${activeTab === 'order' ? 'active' : ''}`}
          onClick={() => setActiveTab('order')}
        >
          <Utensils size={17} />
          <span>Menü & Sipariş</span>
          {cartItemCount > 0 && (
            <span className="pos-tab-counter-badge new">{cartItemCount}</span>
          )}
        </button>
        )}
      </div>

      {/* Menü & Sipariş Sekmesinde: Kategori Listesi (Mobilde Kompakt Dropdown Seçici, Masaüstünde Dikey Liste) */}
      {activeTab === 'order' && (
        <div className="pos-cat-section">
          {/* Masaüstü Başlığı */}
          <div className="pos-cat-section-header">
            <h4 className="pos-cat-section-title">Kategoriler</h4>
            <span className="pos-cat-total-count">({products.length})</span>
          </div>

          {/* Mobilde Özel Kategori Dropdown Seçicisi */}
          <div className="pos-mobile-cat-dropdown-wrap">
            <select
              className="pos-mobile-cat-select"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
            >
              <option value="all">Tüm Kategoriler ({products.length} Ürün)</option>
              {categories.map(cat => {
                const count = products.filter(p => p.category_id === cat.id).length;
                return (
                  <option key={cat.id} value={cat.id.toString()}>
                    {cat.name} ({count} Ürün)
                  </option>
                );
              })}
            </select>
            <ChevronDown size={16} className="pos-mobile-cat-select-icon" />
          </div>

          {/* Masaüstü Dikey Kategori Listesi */}
          <div className="pos-cat-list-vertical">
            {/* Tüm Ürünler */}
            <button
              type="button"
              className={`pos-cat-list-item ${selectedCategoryId === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategoryId('all')}
            >
              <span className="pos-cat-item-name">Tüm Ürünler</span>
              <span className="pos-cat-item-count">{products.length}</span>
            </button>

            {/* Kategoriler */}
            {categories.map(cat => {
              const count = products.filter(p => p.category_id === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`pos-cat-list-item ${selectedCategoryId === cat.id.toString() ? 'active' : ''}`}
                  onClick={() => setSelectedCategoryId(cat.id.toString())}
                >
                  <span className="pos-cat-item-name">{cat.name}</span>
                  <span className="pos-cat-item-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

    </aside>
    </>
  );
}
