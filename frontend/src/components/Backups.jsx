import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { useToast } from './ui/ToastProvider';
import { apiFetch } from '../lib/api';
import '../styles/waste.css';
import { DatabaseBackup, Download, ImageDown, TriangleAlert } from 'lucide-react';

const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;
const sizeText = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);
const dateText = (iso) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const saveBlob = async (res, filename) => {
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function Backups() {
  const { showToast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [data, setData] = useState(null);
  const [running, setRunning] = useState(false);
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/api/backups');
      setData(res.data);
    } catch (err) {
      showToast(err.response?.data?.message || 'Yedekler listelenemedi.', 'error');
    }
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    try {
      setRunning(true);
      const res = await axios.post('/api/backups');
      showToast(res.data.message, 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Yedek alınamadı.', 'error');
    } finally {
      setRunning(false);
    }
  };

  const download = async (key, url, filename) => {
    try {
      setDownloading(key);
      const res = await apiFetch(url);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Dosya indirilemedi.');
      await saveBlob(res, filename);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDownloading(null);
    }
  };

  const backups = data?.backups || [];
  const latest = backups[0];
  const stale = data && (!latest || Date.now() - new Date(latest.created_at).getTime() > STALE_AFTER_MS);

  return (
    <div className="pos-page-container">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        title="Yedekler"
        actions={(
          <button type="button" className="pos-edit-btn waste-new-btn" onClick={runNow} disabled={running}>
            <DatabaseBackup size={16} />
            <span>{running ? 'Alınıyor…' : 'Şimdi Yedek Al'}</span>
          </button>
        )}
      />

      <div className="waste-page backups-page">
        {stale && (
          <div className="backups-warning" role="alert">
            <TriangleAlert size={18} />
            <span>{latest ? 'Son iki gündür otomatik yedek alınmamış.' : 'Henüz yedek yok.'} "Şimdi Yedek Al" düğmesiyle deneyin; hata verirse sunucu kayıtlarına bakın.</span>
          </div>
        )}

        <div className="backups-note">
          <p>Sistem <strong>her gün kendiliğinden</strong> veritabanı yedeği alır ve son {data?.keep ?? 30} yedeği sunucuda tutar.</p>
          <p>Bu yedekler sunucunun kendisinde durur; sunucuda sorun olursa onlara da ulaşılamayabilir. Bu yüzden <strong>haftada bir son yedeği indirip bilgisayarınıza veya bulut hesabınıza kaydedin.</strong></p>
          <button
            type="button"
            className="waste-btn"
            disabled={downloading === 'uploads'}
            onClick={() => download('uploads', '/api/backups/uploads/download', 'gorseller.tar.gz')}
          >
            <ImageDown size={15} /> {downloading === 'uploads' ? 'Hazırlanıyor…' : 'Ürün görsellerini indir'}
          </button>
        </div>

        <div className="backups-list">
          {data && backups.length === 0 && <div className="waste-empty">Henüz yedek alınmadı.</div>}
          {backups.map((b, i) => (
            <div key={b.name} className="backups-row">
              <span className="backups-row-main">
                <strong>{dateText(b.created_at)}</strong>
                <em>{sizeText(b.size)}{i === 0 ? ' · en yeni' : ''}</em>
              </span>
              <button
                type="button"
                className={`waste-btn${i === 0 ? ' primary' : ''}`}
                disabled={downloading === b.name}
                onClick={() => download(b.name, `/api/backups/${b.name}/download`, b.name)}
              >
                <Download size={15} /> {downloading === b.name ? 'İniyor…' : 'İndir'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
