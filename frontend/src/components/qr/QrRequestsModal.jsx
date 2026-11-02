import React, { useEffect } from 'react';
import { X, QrCode } from 'lucide-react';
import QrRequestList from './QrRequestList';

// Tüm masaların onay bekleyen QR siparişleri (masalar ekranındaki uyarıdan açılır)
export default function QrRequestsModal({ requests, onClose, onChanged, canAct }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="qr-modal-backdrop" onMouseDown={onClose}>
      <div className="qr-modal wide" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="QR siparişleri">
        <header>
          <div>
            <h3><QrCode size={18} /> Onay bekleyen QR siparişleri</h3>
            <p>Onaylanan sipariş masanın adisyonuna eklenir ve mutfağa gider. Reddedilirse müşteri nedenini menüde görür.</p>
          </div>
          <button type="button" className="qr-icon-btn" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
        </header>
        <div className="qr-modal-body scroll">
          {requests.length === 0
            ? <p className="qr-empty">Onay bekleyen QR siparişi yok.</p>
            : <QrRequestList requests={requests} onChanged={onChanged} canAct={canAct} />}
        </div>
      </div>
    </div>
  );
}
