import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createSocket, subscribeConnection } from '../../lib/api';

// Kısa kopmalarda ekran yanıp sönmesin: uyarı ancak bağlantı bu süre boyunca gelmezse görünür
const SHOW_AFTER_MS = 4000;

/** Canlı bağlantı koptuğunda personeli uyarır; bağlantı gelince ekranlar kendini yeniler ve uyarı kalkar. */
export default function ConnectionBanner() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user?.id) return undefined;
    const socket = createSocket(); // Canlı olayı olmayan sayfalarda da bağlantı izlensin
    let timer = null;
    const unsubscribe = subscribeConnection((lost) => {
      clearTimeout(timer);
      if (lost) timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
      else setVisible(false);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
      socket.disconnect();
      setVisible(false);
    };
  }, [user?.id]);

  if (!visible) return null;
  return (
    <div className="conn-banner" role="alert">
      <WifiOff size={16} />
      <span><strong>Bağlantı koptu, yeniden bağlanılıyor…</strong> Bu sırada yeni siparişler ekrana düşmez.</span>
    </div>
  );
}
