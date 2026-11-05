import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { QrCode } from 'lucide-react';
import { createSocket } from '../../lib/api';
import { useToast } from '../ui/ToastProvider';
import { useConfirm } from '../ui/ConfirmProvider';

/**
 * Masalar ekranında "QR sipariş: Açık / Kapalı" anahtarı.
 * Kapalıyken müşteriler QR menüyü görür ama sipariş veremez (kafe kapalıyken, çok yoğunken vb.).
 * canEdit yoksa yalnızca durumu gösterir.
 */
export default function QrOrderingToggle({ canEdit }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [enabled, setEnabled] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = () => axios.get('/api/qr-orders/settings').then(res => setEnabled(res.data.ordering_enabled)).catch(() => {});
    load();
    // Başka bir cihazdan değiştirilirse anında yansısın
    const socket = createSocket();
    socket.on('resync', load);
    socket.on('qr:settings', (p) => setEnabled(Boolean(p?.ordering_enabled)));
    return () => socket.disconnect();
  }, []);

  if (enabled === null) return null;

  const toggle = async () => {
    if (!canEdit || saving) return;
    const next = !enabled;
    if (!next && !(await confirm({
      title: 'QR sipariş kapatılsın mı?',
      message: 'Müşteriler QR menüyü görmeye devam eder ama sipariş veremez; siparişlerini garsona vermeleri istenir. Onay bekleyen siparişler etkilenmez.',
      confirmLabel: 'Kapat',
      danger: true
    }))) return;
    setEnabled(next); // Anahtar hemen kayar; kayıt arkada yapılır
    try {
      setSaving(true);
      const res = await axios.put('/api/qr-orders/settings', { ordering_enabled: next });
      setEnabled(res.data.ordering_enabled);
      showToast(res.data.message, next ? 'updated' : 'info');
    } catch (err) {
      setEnabled(!next);
      showToast(err.response?.data?.message || 'QR ayarı değiştirilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      className={`qr-ordering-toggle ${enabled ? 'on' : 'off'}${canEdit ? '' : ' readonly'}`}
      onClick={toggle}
      disabled={!canEdit}
      aria-busy={saving}
      title={canEdit
        ? (enabled ? 'QR menüden sipariş alınıyor. Kapatmak için basın.' : 'QR menüden sipariş alınmıyor. Açmak için basın.')
        : 'QR menüden sipariş alma durumu'}
      aria-pressed={enabled}
      aria-label={`QR sipariş: ${enabled ? 'açık' : 'kapalı'}`}
    >
      <QrCode size={14} />
      <span>QR sipariş</span>
      <i aria-hidden="true" />
    </button>
  );
}
