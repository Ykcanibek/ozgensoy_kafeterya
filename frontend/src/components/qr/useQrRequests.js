import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { createSocket } from '../../lib/api';

/**
 * Onay bekleyen QR siparişleri (isteğe bağlı olarak tek masa için); yeni sipariş gelince canlı yenilenir.
 * onNew: yeni bir QR siparişi geldiğinde çağrılır (bildirim/ses için)
 */
export default function useQrRequests({ tableId = null, enabled = true, onNew } = {}) {
  const [requests, setRequests] = useState([]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await axios.get(`/api/qr-orders?status=pending${tableId ? `&tableId=${tableId}` : ''}`);
      setRequests(res.data.requests || []);
    } catch { /* yetki yoksa veya bağlantı kopmuşsa sessiz geç */ }
  }, [tableId, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    reload();
    const socket = createSocket();
    socket.on('resync', reload);
    socket.on('qr:request', (payload) => {
      if (tableId && Number(payload?.tableId) !== Number(tableId)) return;
      reload();
      if (payload?.status === 'pending') onNew?.(payload);
    });
    return () => socket.disconnect();
    // onNew bilerek bağımlılık değil: her çizimde yeni bağlantı açılmasın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, tableId, enabled]);

  return { requests, reload };
}
