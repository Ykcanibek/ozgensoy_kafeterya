import React from 'react';
import { X } from 'lucide-react';

// Çoklu adetli kalemde durum değişikliği için adet seçimi
export default function StatusSplitModal({
  handleUpdateItemStatus,
  setStatusPrompt,
  statusPrompt
}) {
  return (
    <>
    {/* Çoklu Adet Durum Bölme Modalı */}
    {statusPrompt && (
      <div className="pos-confirm-modal-overlay" onClick={() => setStatusPrompt(null)}>
        <div className="pos-confirm-modal" onClick={(e) => e.stopPropagation()}>
          <div className="pos-confirm-head">
            <h4>
              {statusPrompt.targetStatus === 'complimentary'
                ? '🎁 İkram Adedi Belirleyin'
                : statusPrompt.targetStatus === 'returned'
                  ? '↩️ İade Adedi Belirleyin'
                  : statusPrompt.targetStatus === 'cancelled'
                    ? '🚫 İptal Adedi Belirleyin'
                    : 'Durum Güncelleme Adedi'}
            </h4>
            <button
              type="button"
              className="pos-confirm-close"
              onClick={() => setStatusPrompt(null)}
            >
              <X size={16} />
            </button>
          </div>
          <p style={{ margin: '12px 0 6px 0', fontSize: '0.88rem', color: '#5c4333' }}>
            <strong>{statusPrompt.item.product_name}</strong> ürününden masada toplam <strong>{statusPrompt.item.quantity} Adet</strong> bulunuyor.
          </p>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: '#486b78' }}>
            Kaç adeti{' '}
            <strong>
              {statusPrompt.targetStatus === 'complimentary'
                ? 'İkram'
                : statusPrompt.targetStatus === 'returned'
                  ? 'İade'
                  : statusPrompt.targetStatus === 'cancelled'
                    ? 'İptal'
                    : 'Teslim'}
            </strong>{' '}
            olarak işaretlensin?
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="pos-btn-split-opt"
              onClick={() => handleUpdateItemStatus(statusPrompt.item, statusPrompt.targetStatus, 1)}
            >
              1 Adet
            </button>
            <button
              type="button"
              className="pos-btn-split-opt primary"
              onClick={() => handleUpdateItemStatus(statusPrompt.item, statusPrompt.targetStatus, statusPrompt.item.quantity)}
            >
              Tümü ({statusPrompt.item.quantity} Adet)
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
