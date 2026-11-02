import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleCheck, PlusCircle, PencilLine, Trash2, XCircle, TriangleAlert, Info, X } from 'lucide-react';
import '../../styles/toast.css';

// Bildirim türleri: başlık, ikon ve renk (CSS sınıfı) — tüm ekranlarda aynı görünüm
const VARIANTS = {
  success: { title: 'Başarılı', Icon: CircleCheck },
  created: { title: 'Eklendi', Icon: PlusCircle },
  updated: { title: 'Güncellendi', Icon: PencilLine },
  deleted: { title: 'Silindi', Icon: Trash2 },
  error: { title: 'Hata', Icon: XCircle },
  warning: { title: 'Uyarı', Icon: TriangleAlert },
  info: { title: 'Bilgi', Icon: Info }
};

const DEFAULT_DURATION = { error: 5000, warning: 4500 };
const MAX_VISIBLE = 4;

/**
 * Bildirim türünü belirler. Açık tür verilirse ('created', 'updated', 'deleted', 'error', 'warning', 'info')
 * o kullanılır; 'success' (varsayılan) çağrılarda tür mesajın içeriğinden çıkarılır.
 */
const ERROR_RE = /hata|başarısız|alınamadı|yüklenemedi|kaydedilemedi|silinemedi|iletilemedi|gerçekleştirilemedi|indirilemedi|kopyalanamadı|bulunamadı|yetkiniz yok/;
// Kullanıcının düzeltebileceği form/doğrulama ve iş kuralı mesajları hata değil uyarıdır
const VALIDATION_RE = /lütfen|zorunlu|olamaz|olmalıdır|eşleşmiyor|en az |en fazla|açılamaz|silinemez|bulunmuyor|zaten |geçerli bir|yok\.?$/;

export const resolveVariant = (message, type = 'success') => {
  const text = String(message || '').toLocaleLowerCase('tr-TR');
  if (type === 'danger' || type === 'error') {
    return !ERROR_RE.test(text) && VALIDATION_RE.test(text) ? 'warning' : 'error';
  }
  if (VARIANTS[type] && type !== 'success') return type;

  if (ERROR_RE.test(text)) return 'error';
  if (VALIDATION_RE.test(text)) return 'warning';
  if (/silindi|kaldırıldı|arşive alındı|sıfırlandı/.test(text)) return 'deleted';
  if (/eklendi|oluşturuldu|iletildi|yeni sipariş/.test(text)) return 'created';
  if (/güncellendi|değiştirildi|kaydedildi|taşındı|birleştirildi|aktif edildi|aktifleştirildi|pasife alındı|duruma alındı|qr menüde|teslim edildi/.test(text)) return 'updated';
  return 'success';
};

const ToastContext = createContext({ showToast: () => {} });

function ToastItem({ toast, onClose }) {
  const { title, Icon } = VARIANTS[toast.variant];
  const timerRef = useRef(null);
  const [paused, setPaused] = useState(false);

  // Fare üzerindeyken kapanmaz; ayrılınca süre baştan başlar
  useEffect(() => {
    if (paused) return undefined;
    timerRef.current = setTimeout(() => onClose(toast.id), toast.duration);
    return () => clearTimeout(timerRef.current);
  }, [paused, toast.id, toast.duration, onClose]);

  return (
    <div
      className={`app-toast ${toast.variant}`}
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="app-toast-icon"><Icon size={18} /></div>
      <div className="app-toast-body">
        <span className="app-toast-title">{title}</span>
        <span className="app-toast-message">{toast.message}</span>
      </div>
      <button type="button" className="app-toast-close" onClick={() => onClose(toast.id)} title="Kapat">
        <X size={14} />
      </button>
      <span
        key={paused ? 'paused' : 'running'}
        className={`app-toast-progress ${paused ? 'paused' : ''}`}
        style={{ animationDuration: `${toast.duration}ms` }}
      />
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const closeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // showToast(mesaj, tür?, süre?) — tür: success | created | updated | deleted | error (danger) | warning | info
  const showToast = useCallback((message, type = 'success', duration) => {
    const variant = resolveVariant(message, type);
    const toast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message,
      variant,
      duration: duration ?? DEFAULT_DURATION[variant] ?? 3500
    };
    // Aynı mesaj art arda gelirse çoğaltma; en yeni üstte, en fazla MAX_VISIBLE bildirim
    setToasts(prev => [toast, ...prev.filter(t => t.message !== message)].slice(0, MAX_VISIBLE));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="app-toast-viewport" aria-live="polite">
        {toasts.map(t => <ToastItem key={t.id} toast={t} onClose={closeToast} />)}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
