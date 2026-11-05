import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Printer } from 'lucide-react';
import { createSocket } from '../../lib/api';
import { useToast } from '../ui/ToastProvider';

/**
 * Masalar ekranında "Otomatik fiş: Açık / Kapalı" anahtarı.
 * Açıkken hesap kapanınca müşteri fişi yazdırma penceresi kendiliğinden açılır; yazıcı bozukken veya
 * istenmediğinde kapatılır (fiş yine ödeme geçmişindeki yazıcı düğmesinden yazdırılabilir).
 * Durum her değiştiğinde onChange ile üst bileşene bildirilir.
 */
export default function AutoReceiptToggle({ canEdit, onChange }) {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = () => axios.get('/api/orders/receipt-settings').then(res => setEnabled(res.data.auto_receipt)).catch(() => {});
    load();
    // Başka bir cihazdan değiştirilirse anında yansısın
    const socket = createSocket();
    socket.on('resync', load);
    socket.on('receipt:settings', (p) => setEnabled(Boolean(p?.auto_receipt)));
    return () => socket.disconnect();
  }, []);

  useEffect(() => { if (enabled !== null) onChange?.(enabled); }, [enabled, onChange]);

  if (enabled === null) return null;

  const toggle = async () => {
    if (!canEdit || saving) return;
    const next = !enabled;
    setEnabled(next); // Anahtar hemen kayar; kayıt arkada yapılır
    try {
      setSaving(true);
      const res = await axios.put('/api/orders/receipt-settings', { auto_receipt: next });
      setEnabled(res.data.auto_receipt);
      showToast(res.data.message, res.data.auto_receipt ? 'updated' : 'info');
    } catch (err) {
      setEnabled(!next);
      showToast(err.response?.data?.message || 'Fiş ayarı değiştirilemedi.', 'error');
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
        ? (enabled ? 'Hesap kapanınca fiş penceresi açılıyor. Kapatmak için basın.' : 'Hesap kapanınca fiş penceresi açılmıyor. Açmak için basın.')
        : 'Hesap kapanınca fiş penceresinin açılma durumu'}
      aria-pressed={enabled}
      aria-label={`Otomatik fiş: ${enabled ? 'açık' : 'kapalı'}`}
    >
      <Printer size={14} />
      <span>Otomatik fiş</span>
      <i aria-hidden="true" />
    </button>
  );
}
