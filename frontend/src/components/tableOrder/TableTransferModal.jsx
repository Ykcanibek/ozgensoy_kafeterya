import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, ArrowLeftRight, Merge, AlertCircle } from 'lucide-react';

// Masa taşıma / birleştirme: hedef masa boşsa adisyon taşınır, doluysa iki adisyon birleştirilir
export default function TableTransferModal({ table, hasUnsentCart, onClose, onTransferred, showToast }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetId, setTargetId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    axios.get('/api/tables')
      .then(res => setTables((res.data.tables || []).filter(t => t.id !== table.id)))
      .catch(() => showToast('Masa listesi alınamadı.', 'danger'))
      .finally(() => setLoading(false));
  }, [table.id]);

  const target = tables.find(t => t.id === targetId);
  const isMerge = target && target.status !== 'empty';

  const handleConfirm = async () => {
    if (!target) return;
    try {
      setIsSubmitting(true);
      const res = await axios.post(`/api/orders/table/${table.id}/transfer`, { target_table_id: target.id });
      showToast(res.data.message, 'success');
      onTransferred({ ...target, status: 'occupied' });
    } catch (error) {
      showToast(error.response?.data?.message || 'Masa taşınamadı.', 'danger');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pos-confirm-modal-overlay" onClick={() => !isSubmitting && onClose()}>
      <div className="pos-confirm-modal pos-transfer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pos-confirm-head">
          <h4>
            <ArrowLeftRight size={16} />
            <span>{table.title} — Masa Taşı / Birleştir</span>
          </h4>
          <button type="button" className="pos-confirm-close" onClick={onClose} disabled={isSubmitting}>
            <X size={16} />
          </button>
        </div>

        <p className="pos-transfer-hint">
          Boş bir masa seçerseniz adisyon o masaya <strong>taşınır</strong>. Dolu bir masa seçerseniz iki adisyon <strong>birleştirilir</strong>.
        </p>

        {hasUnsentCart && (
          <div className="pos-transfer-warning">
            <AlertCircle size={15} />
            <span>Sepette mutfağa gönderilmemiş ürünler var. Taşımadan önce siparişi onaylayın; aksi halde sepet boşaltılır.</span>
          </div>
        )}

        <div className="pos-transfer-grid">
          {loading && <div className="pos-transfer-empty">Masalar yükleniyor...</div>}
          {!loading && tables.length === 0 && <div className="pos-transfer-empty">Taşınabilecek başka masa yok.</div>}
          {tables.map(t => {
            const occupied = t.status !== 'empty';
            return (
              <button
                key={t.id}
                type="button"
                className={`pos-transfer-table ${occupied ? 'occupied' : 'empty'} ${targetId === t.id ? 'selected' : ''}`}
                onClick={() => setTargetId(t.id)}
                disabled={isSubmitting}
              >
                <span className="pos-transfer-table-title">{t.title}</span>
                <span className="pos-transfer-table-status">
                  {occupied ? `Dolu · ₺${parseFloat(t.active_total || 0).toFixed(2)}` : 'Boş'}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
          <button type="button" className="pos-btn-split-opt" onClick={onClose} disabled={isSubmitting}>
            Vazgeç
          </button>
          <button
            type="button"
            className={`pos-btn-split-opt primary ${isMerge ? 'merge' : ''}`}
            onClick={handleConfirm}
            disabled={!target || isSubmitting}
          >
            {isSubmitting
              ? 'İşleniyor...'
              : !target
                ? 'Hedef masa seçin'
                : isMerge
                  ? <><Merge size={14} /> Birleştir → {target.title}</>
                  : <><ArrowLeftRight size={14} /> Taşı → {target.title}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
