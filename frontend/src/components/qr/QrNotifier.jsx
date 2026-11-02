import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BellRing, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/ToastProvider';
import useQrRequests from './useQrRequests';

// Yeni QR siparişinde kısa bildirim sesi (tarayıcı sesi engellerse sessizce geçer)
const playNotifySound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.16);
      osc.stop(ctx.currentTime + i * 0.16 + 0.16);
    });
    setTimeout(() => ctx.close(), 600);
  } catch { /* ses desteklenmiyor */ }
};

/**
 * Personel hangi sayfada olursa olsun yeni QR siparişini duyurur (ses + mesaj).
 * Masalar ekranı dışındayken onay bekleyen sipariş varsa köşede "Masalara git" düğmesi gösterir.
 * Yalnızca masaları görebilen (pos.view) kullanıcılarda çalışır.
 */
export default function QrNotifier() {
  const { user, can } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const enabled = Boolean(user) && can('pos.view');

  const { requests } = useQrRequests({
    enabled,
    onNew: (p) => {
      showToast(`Yeni QR sipariş · ${p.tableTitle || 'Masa'}`, 'info');
      playNotifySound();
    }
  });

  if (!enabled || requests.length === 0 || location.pathname === '/pos') return null;
  const tables = [...new Set(requests.map(r => r.table_title))];

  return (
    <button type="button" className="qr-float" onClick={() => navigate('/pos')}>
      <span className="qr-inbox-bell"><BellRing size={17} /><i /></span>
      <span className="qr-float-text">
        <strong>{requests.length === 1 ? 'Yeni QR sipariş' : `${requests.length} QR sipariş`}</strong>
        <small>{tables.slice(0, 3).join(', ')}{tables.length > 3 ? '…' : ''} · onay bekliyor</small>
      </span>
      <ChevronRight size={18} />
    </button>
  );
}
