import React, { useState, useMemo } from 'react';
import {
  X,
  History,
  User,
  Clock,
  ArrowRight,
  Search,
  TrendingUp,
  TrendingDown,
  Coffee,
  Utensils,
  Tags,
  Layers,
  RefreshCw
} from 'lucide-react';

/**
 * Güvenli Göreceli Zaman Hesaplayıcı (Örn: "5 dakika önce", "2 saat önce", "Dün")
 */
const getRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const past = new Date(dateStr);
    if (isNaN(past.getTime())) return '';
    const now = new Date();
    const diffSec = Math.floor((now - past) / 1000);
    if (diffSec < 45) return 'Az önce';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} dakika önce`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} saat önce`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Dün';
    if (diffDays < 30) return `${diffDays} gün önce`;
    return past.toLocaleDateString('tr-TR');
  } catch (e) {
    return '';
  }
};

/**
 * Güvenli Tarih & Saat Formatlayıcı
 */
const formatExactTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return '';
  }
};

/**
 * JSON parse yardımcısı
 */
const safeParse = (val) => {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return null;
  }
};

export default function HistoryModal({
  isOpen,
  onClose,
  entityType = 'product', // 'product' | 'category'
  entity,
  historyList = [],
  loading = false,
  onRefresh
}) {
  // BÜTÜN REACT HOOK'LARI EN ÜSTTE VE KOŞULSUZ ÇALIŞTIRILMALIDIR!
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Güvenli dizi referansı
  const safeHistoryList = useMemo(() => {
    return Array.isArray(historyList) ? historyList : [];
  }, [historyList]);

  // Her filtrenin kayıt adedi
  const counts = useMemo(() => {
    let priceCount = 0;
    let nameCount = 0;
    let statusCount = 0;

    safeHistoryList.forEach(item => {
      if (!item) return;
      if ((item.action_type && item.action_type.includes('price')) || (item.details && item.details.includes('Fiyat:'))) {
        priceCount++;
      }
      if (item.details && item.details.includes('İsim:')) {
        nameCount++;
      }
      if ((item.action_type && item.action_type.includes('status')) || (item.details && item.details.includes('Durum:'))) {
        statusCount++;
      }
    });

    return {
      all: safeHistoryList.length,
      price: priceCount,
      name: nameCount,
      status: statusCount
    };
  }, [safeHistoryList]);

  // Ürünün İlk Fiyatı, Anlık Fiyatı ve Fiyat Değişim Miktarı/Oranı
  const priceStats = useMemo(() => {
    if (entityType !== 'product' || !entity) return null;
    const currentPrice = parseFloat(entity.price || 0);

    // Geçmişi en eskiden en yeniye doğru tarayalım
    let initialPrice = null;
    const reversedLogs = [...safeHistoryList].reverse();

    for (const log of reversedLogs) {
      const oldVal = safeParse(log.old_value);
      const newVal = safeParse(log.new_value);

      if (oldVal && oldVal.price !== undefined && oldVal.price !== null) {
        const p = parseFloat(oldVal.price);
        if (!isNaN(p)) {
          initialPrice = p;
          break;
        }
      }
      if (newVal && newVal.price !== undefined && newVal.price !== null) {
        const p = parseFloat(newVal.price);
        if (!isNaN(p)) {
          initialPrice = p;
          break;
        }
      }
    }

    if (initialPrice === null) {
      initialPrice = currentPrice;
    }

    const diff = currentPrice - initialPrice;
    const pct = initialPrice > 0 ? ((diff / initialPrice) * 100).toFixed(1) : (diff > 0 ? '100' : '0');
    const isIncrease = diff > 0.001;
    const isDecrease = diff < -0.001;
    const isChanged = isIncrease || isDecrease;

    return {
      initialPrice,
      currentPrice,
      diff,
      pct,
      isIncrease,
      isDecrease,
      isChanged
    };
  }, [safeHistoryList, entity, entityType]);

  // Modal içi filtreleme
  const filteredList = useMemo(() => {
    return safeHistoryList.filter(item => {
      if (!item) return false;

      // Tip filtresi
      if (filterType === 'price') {
        const isPrice = (item.action_type && item.action_type.includes('price')) ||
          (item.details && item.details.includes('Fiyat:'));
        if (!isPrice) return false;
      } else if (filterType === 'status') {
        const isStatus = (item.action_type && item.action_type.includes('status')) ||
          (item.details && item.details.includes('Durum:'));
        if (!isStatus) return false;
      } else if (filterType === 'name') {
        const isName = item.details && item.details.includes('İsim:');
        if (!isName) return false;
      }

      // Arama filtresi
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.details && item.details.toLowerCase().includes(q)) ||
        (item.user_name && item.user_name.toLowerCase().includes(q))
      );
    });
  }, [safeHistoryList, filterType, searchQuery]);

  // ERKEN DÖNÜŞ (EARLY RETURN) TÜM HOOK'LAR TANIMLANDIKTAN SONRA YAPILIR
  if (!isOpen || !entity) return null;

  const isProduct = entityType === 'product';

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div
        className="history-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ======================================================== */}
        {/* 1. MODAL BAŞLIĞI (SABİT ÜST BAR - ÜRÜN / KATEGORİ ADI)   */}
        {/* ======================================================== */}
        <div className="history-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div className="cat-modal-icon-badge-sm" style={{ background: '#346c80', color: '#ffffff', width: '38px', height: '38px', flexShrink: 0 }}>
              <History size={20} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 className="history-header-entity-name" title={entity.name || ''}>
                  {entity.name || (isProduct ? 'Ürün Geçmişi' : 'Kategori Geçmişi')}
                </h3>
                <span className="history-entity-type-badge">
                  {isProduct ? 'Ürün Geçmişi' : 'Kategori Geçmişi'}
                </span>
              </div>
              {isProduct && entity.category_name ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', color: '#346c80', fontWeight: '600' }}>
                  <Tags size={12} />
                  <span>Kategori: {entity.category_name}</span>
                </div>
              ) : !isProduct ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', color: '#346c80', fontWeight: '600' }}>
                  <Layers size={12} />
                  <span>{entity.total_products || 0} Ürün Kayıtlı</span>
                </div>
              ) : (
                <span style={{ fontSize: '0.8rem', color: '#486b78' }}>
                  Değişiklik ve hareket geçmişi kütüğü
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="history-btn-refresh"
                title="Geçmişi Yenile"
              >
                <RefreshCw size={15} className={loading ? 'cat-spin' : ''} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="cat-modal-close-btn-sm"
              title="Kapat"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. VARLIK ÖZET KARTI (ENTITY OVERVIEW CARD)              */}
        {/* ======================================================== */}
        <div className="history-entity-card">
          {/* Sol Taraf: Görsel + Fiyat Değişim Özeti (Maliyet Girilmedi kaldırıldı) */}
          <div className="history-entity-card-left">
            <div className="history-entity-thumb">
              {entity.image_url ? (
                <img src={entity.image_url} alt={entity.name || ''} />
              ) : (
                <div className="history-entity-placeholder">
                  {isProduct ? <Utensils size={22} color="#346c80" /> : <Coffee size={22} color="#346c80" />}
                </div>
              )}
            </div>

            {isProduct && priceStats ? (
              <div className="history-entity-price-tracker">
                <div className="history-tracker-top-row">
                  <span className="history-tracker-header-lbl">Fiyat Değişim Özeti</span>
                  {priceStats.isChanged ? (
                    <span className={`history-tracker-badge ${priceStats.isIncrease ? 'up' : 'down'}`}>
                      {priceStats.isIncrease ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      <span>{priceStats.isIncrease ? '+' : ''}₺{priceStats.diff.toFixed(2)} ({priceStats.isIncrease ? '+' : ''}{priceStats.pct}%)</span>
                    </span>
                  ) : (
                    <span className="history-tracker-badge neutral">Fiyat Değişmedi</span>
                  )}
                </div>

                <div className="history-tracker-bottom-row">
                  <div className="history-tracker-unit">
                    <span className="history-tracker-unit-lbl">İlk:</span>
                    <span className="history-tracker-unit-val initial">₺{priceStats.initialPrice.toFixed(2)}</span>
                  </div>
                  <ArrowRight size={14} className="history-tracker-arrow" />
                  <div className="history-tracker-unit">
                    <span className="history-tracker-unit-lbl">Anlık:</span>
                    <span className="history-tracker-unit-val current">₺{priceStats.currentPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ) : !isProduct ? (
              <div className="history-entity-details">
                <span className="cat-product-count" style={{ fontSize: '0.86rem' }}>
                  <Layers size={13} />
                  <strong>{entity.total_products || 0} Ürün Kayıtlı</strong>
                </span>
              </div>
            ) : null}
          </div>

          {/* Sağ Sütun: Personel & İşlem Kütüğü (Dikey istiflenmiş, asla taşmaz) */}
          <div className="history-entity-card-right">
            <div className="history-stat-row">
              <span className="history-stat-label">Toplam İşlem:</span>
              <strong className="history-stat-badge">{safeHistoryList.length} Hareket</strong>
            </div>
            {entity.created_by_name && (
              <div className="history-stat-row">
                <span className="history-stat-label">Oluşturan:</span>
                <span className="history-stat-person" title={`Oluşturan: ${entity.created_by_name}`}>
                  <User size={11} />
                  <span>{entity.created_by_name}</span>
                </span>
              </div>
            )}
            {entity.updated_by_name && (
              <div className="history-stat-row">
                <span className="history-stat-label">Güncelleyen:</span>
                <span className="history-stat-person" title={`Son Güncelleyen: ${entity.updated_by_name}`}>
                  <Clock size={11} />
                  <span>{entity.updated_by_name}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. MODAL İÇİ FİLTRELEME & ARAMA                          */}
        {/* ======================================================== */}
        <div className="history-filter-bar">
          <div className="history-search-input-box">
            <Search size={15} color="#486b78" />
            <input
              type="text"
              placeholder="Geçmiş hareketlerde ara (personel, işlem)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="history-search-clear">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="history-filter-pills">
            <button
              type="button"
              className={`history-filter-pill ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              Tümü ({counts.all})
            </button>
            {isProduct && (
              <button
                type="button"
                className={`history-filter-pill ${filterType === 'price' ? 'active' : ''}`}
                onClick={() => setFilterType('price')}
              >
                Fiyat & Maliyet ({counts.price})
              </button>
            )}
            <button
              type="button"
              className={`history-filter-pill ${filterType === 'name' ? 'active' : ''}`}
              onClick={() => setFilterType('name')}
            >
              İsim Değişimi ({counts.name})
            </button>
            <button
              type="button"
              className={`history-filter-pill ${filterType === 'status' ? 'active' : ''}`}
              onClick={() => setFilterType('status')}
            >
              Durum ({counts.status})
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 4. KRONOLOJİK HAREKET ÇİZELGESİ (SABİT ALAN, İÇTEN SCROLL)*/}
        {/* ======================================================== */}
        <div className="history-timeline-scroll-area">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#486b78' }}>
              <div className="cat-btn-spinner" style={{ margin: '0 auto 12px auto' }}></div>
              <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: '600' }}>Hareket geçmişi yükleniyor...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="history-empty-state">
              <History size={48} color="#d4c3b3" style={{ margin: '0 auto 16px auto', display: 'block' }} />
              <h4 style={{ margin: 0, color: '#1b414f', fontWeight: '800', fontSize: '1.1rem' }}>
                {searchQuery
                  ? `"${searchQuery}" Aramasına Uygun Kayıt Bulunamadı`
                  : filterType !== 'all'
                    ? 'Seçili Filtrede Kayıt Bulunmuyor'
                    : 'Henüz Kayıtlı Bir Değişiklik Yok'}
              </h4>
              <p style={{ margin: '8px 0 16px 0', fontSize: '0.86rem', color: '#486b78', maxWidth: '420px', lineHeight: 1.5 }}>
                {searchQuery || filterType !== 'all'
                  ? 'Arama kriterini temizleyerek veya filtreyi sıfırlayarak bu kayda ait tüm geçmiş hareketleri görebilirsiniz.'
                  : 'Bu kayıt üzerinde yapılan fiyat, isim ve durum değişiklikleri kronolojik olarak burada listelenecektir.'}
              </p>
              {(searchQuery || filterType !== 'all') && (
                <button
                  type="button"
                  onClick={() => { setFilterType('all'); setSearchQuery(''); }}
                  className="cat-btn-secondary"
                  style={{ padding: '7px 18px', fontSize: '0.84rem' }}
                >
                  Tüm Hareketleri Göster ({counts.all})
                </button>
              )}
            </div>
          ) : (
            <div className="history-rich-timeline">
              {filteredList.map((entry, idx) => {
                const oldVal = safeParse(entry.old_value);
                const newVal = safeParse(entry.new_value);

                // Aksiyon tipi belirleme
                const isCreate = entry.action_type && entry.action_type.includes('created');
                const isDelete = entry.action_type && entry.action_type.includes('deleted');
                const isPriceChange = (entry.details && entry.details.includes('Fiyat:')) ||
                  (entry.action_type && entry.action_type.includes('price'));
                const isStatusChange = (entry.action_type && entry.action_type.includes('status')) ||
                  (entry.details && entry.details.includes('Durum:'));
                const isNameChange = entry.details && entry.details.includes('İsim:');

                let badgeTheme = {
                  label: 'Güncelleme',
                  bg: '#f0f4f8',
                  text: '#1e5a8a',
                  border: '#bcd0e2',
                  dot: '#1e5a8a'
                };

                if (isCreate) {
                  badgeTheme = { label: 'Oluşturuldu', bg: '#eaf6ed', text: '#1e7e34', border: '#b8e2c3', dot: '#1e7e34' };
                } else if (isDelete) {
                  badgeTheme = { label: 'Silindi', bg: '#fdf2f2', text: '#b84a39', border: '#f7c5c0', dot: '#b84a39' };
                } else if (isPriceChange) {
                  badgeTheme = { label: 'Fiyat Değişimi', bg: '#fef3c7', text: '#b45309', border: '#fde68a', dot: '#d97706' };
                } else if (isNameChange) {
                  badgeTheme = { label: 'İsim Değişimi', bg: '#e8f4fd', text: '#0284c7', border: '#bae6fd', dot: '#0284c7' };
                } else if (isStatusChange) {
                  badgeTheme = { label: 'Durum Değişimi', bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe', dot: '#7c3aed' };
                }

                // Fiyat Değişimi Diff Hesaplama
                let priceDiffInfo = null;
                if (oldVal && newVal && oldVal.price !== undefined && newVal.price !== undefined) {
                  const oldP = parseFloat(oldVal.price);
                  const newP = parseFloat(newVal.price);
                  if (!isNaN(oldP) && !isNaN(newP) && oldP !== newP) {
                    const diff = newP - oldP;
                    const pct = oldP > 0 ? ((diff / oldP) * 100).toFixed(1) : '100';
                    priceDiffInfo = {
                      oldPrice: oldP,
                      newPrice: newP,
                      diff,
                      isIncrease: diff > 0,
                      pct
                    };
                  }
                }

                // Detay metninden fiyat tekrarını ayıklama
                let extraDetails = entry.details;
                if (priceDiffInfo && extraDetails) {
                  const parts = extraDetails.split(', ').filter(p => !p.startsWith('Fiyat:'));
                  extraDetails = parts.join(', ');
                }

                return (
                  <div key={entry.id || idx} className="history-compact-item">
                    {/* Çizgi ve Nokta */}
                    <div className="history-compact-track">
                      <div className="history-compact-node" style={{ background: badgeTheme.dot }}></div>
                      <div className="history-compact-stem"></div>
                    </div>

                    {/* Kompakt Kart */}
                    <div className="history-compact-card">
                      <div className="history-compact-main-row">
                        {/* Sol Taraf: İşlem Rozeti + Değişiklik / Diff */}
                        <div className="history-compact-left">
                          <span
                            className="history-compact-badge"
                            style={{
                              background: badgeTheme.bg,
                              color: badgeTheme.text,
                              borderColor: badgeTheme.border
                            }}
                          >
                            {badgeTheme.label}
                          </span>

                          {/* Fiyat Diff'i veya Detay */}
                          {priceDiffInfo ? (
                            <div className="history-compact-price-diff">
                              <span className="history-price-old">₺{priceDiffInfo.oldPrice.toFixed(2)}</span>
                              <ArrowRight size={12} className="history-price-arrow" />
                              <span className="history-price-new">₺{priceDiffInfo.newPrice.toFixed(2)}</span>
                              <span className={`history-price-delta ${priceDiffInfo.isIncrease ? 'up' : 'down'}`}>
                                {priceDiffInfo.isIncrease ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                {priceDiffInfo.isIncrease ? '+' : ''}₺{priceDiffInfo.diff.toFixed(2)} ({priceDiffInfo.isIncrease ? '+' : ''}{priceDiffInfo.pct}%)
                              </span>
                            </div>
                          ) : (
                            <span className="history-compact-text">
                              {entry.details || entry.title || 'Değişiklik yapıldı'}
                            </span>
                          )}
                        </div>

                        {/* Sağ Taraf: Personel & Zaman */}
                        <div className="history-compact-meta">
                          <div className="history-compact-user" title={entry.user_role === 'admin' ? 'Yönetici' : 'Personel'}>
                            <span className="history-compact-avatar">
                              {entry.user_name ? entry.user_name.slice(0, 1).toUpperCase() : 'P'}
                            </span>
                            <span className="history-compact-username">{entry.user_name || 'Personel'}</span>
                          </div>

                          <span className="history-compact-time" title={formatExactTime(entry.created_at)}>
                            <Clock size={11} />
                            {getRelativeTime(entry.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Varsa Ek Değişiklikler (örn. aynı anda hem isim hem fiyat değiştiyse) */}
                      {extraDetails ? (
                        <div className="history-compact-extra">
                          {extraDetails}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 5. MODAL ALTI (FOOTER - SABİT PİNLİ)                     */}
        {/* ======================================================== */}
        <div className="history-modal-footer">
          <span className="history-footer-summary">
            Toplam <strong>{filteredList.length}</strong> hareket listeleniyor
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cat-btn-secondary"
            style={{ padding: '8px 22px', fontSize: '0.88rem' }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
