import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { X, Printer, Copy, RefreshCw, ExternalLink, Download } from 'lucide-react';
import { useToast } from '../ui/ToastProvider';
import { useConfirm } from '../ui/ConfirmProvider';
import { tableMenuUrl, qrDataUrl, printQrCards, downloadTableQr, MENU_URL_CONFIGURED, MENU_URL_WARNING } from '../../lib/qrMenu';

// Tek masanın QR kodu: görüntüle, indir, yazdır, bağlantıyı kopyala, yenile
export default function TableQrModal({ table, canRegenerate, onClose, onRegenerated }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [token, setToken] = useState(table.qr_code_token);
  const [img, setImg] = useState(null);
  const url = tableMenuUrl(token);

  useEffect(() => { qrDataUrl(url, 480).then(setImg).catch(() => setImg(null)); }, [url]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); showToast('Menü bağlantısı kopyalandı.', 'info'); }
    catch { showToast('Bağlantı kopyalanamadı.', 'error'); }
  };

  const regenerate = async () => {
    const ok = await confirm({
      title: 'QR kod yenilensin mi?',
      message: `${table.title} için yeni bir QR kod oluşturulacak. Masadaki eski QR kod artık çalışmaz; yenisini yazdırıp değiştirmeniz gerekir.`,
      confirmLabel: 'Yeni kod oluştur',
      danger: true
    });
    if (!ok) return;
    try {
      const res = await axios.post(`/api/qr-orders/tables/${table.id}/regenerate`);
      setToken(res.data.qr_code_token);
      showToast(res.data.message, 'updated');
      onRegenerated?.();
    } catch (err) {
      showToast(err.response?.data?.message || 'QR kod yenilenemedi.', 'error');
    }
  };

  const print = () => printQrCards([{ title: table.title, qr_code_token: token }]).catch(err => showToast(err.message, 'error'));
  const download = (format) => downloadTableQr(table, token, format)
    .catch(() => showToast('QR kod indirilemedi.', 'error'));

  return (
    <div className="qr-modal-backdrop" onMouseDown={onClose}>
      <div className="qr-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={`${table.title} QR kodu`}>
        <header>
          <div>
            <h3>{table.title} · QR Menü</h3>
            <p>Müşteri okuttuğunda bu masanın menüsü açılır; siparişler doğrudan bu masaya düşer.</p>
          </div>
          <button type="button" className="qr-icon-btn" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
        </header>
        <div className="qr-modal-body">
          {!MENU_URL_CONFIGURED && <p className="qr-warning">{MENU_URL_WARNING}</p>}
          <div className="qr-code-box">{img ? <img src={img} alt={`${table.title} QR kodu`} /> : <span>QR hazırlanıyor…</span>}</div>
          <div className="qr-url">
            <code>{url}</code>
            <button type="button" className="qr-icon-btn" onClick={copy} title="Bağlantıyı kopyala"><Copy size={16} /></button>
            <a className="qr-icon-btn" href={url} target="_blank" rel="noreferrer" title="Menüyü aç"><ExternalLink size={16} /></a>
          </div>
        </div>
        <footer>
          {canRegenerate && (
            <button type="button" className="qr-btn" onClick={regenerate}><RefreshCw size={15} /> Kodu yenile</button>
          )}
          <button type="button" className="qr-btn" onClick={() => download('png')} title="Yüksek çözünürlüklü görsel (2000×2000)"><Download size={15} /> PNG</button>
          <button type="button" className="qr-btn" onClick={() => download('svg')} title="Vektör dosya: istenen boyuta kalite kaybı olmadan büyütülür, tasarım programlarında düzenlenebilir"><Download size={15} /> SVG</button>
          <button type="button" className="qr-btn approve" onClick={print}><Printer size={15} /> Yazdır</button>
        </footer>
      </div>
    </div>
  );
}
