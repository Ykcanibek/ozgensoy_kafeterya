import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TriangleAlert, HelpCircle } from 'lucide-react';
import '../../styles/confirm.css';

const ConfirmContext = createContext(async () => false);

/**
 * Tarayıcının kendi confirm() penceresi yerine uygulama tasarımına uygun onay penceresi.
 * Kullanım: const confirm = useConfirm();
 *           if (!(await confirm({ title, message, confirmLabel, danger: true }))) return;
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const confirmBtnRef = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    setDialog({
      title: 'Emin misiniz?',
      confirmLabel: 'Onayla',
      cancelLabel: 'Vazgeç',
      danger: false,
      ...(typeof options === 'string' ? { message: options } : options),
      resolve
    });
  }), []);

  const close = useCallback((result) => {
    setDialog(current => {
      current?.resolve(result);
      return null;
    });
  }, []);

  // Esc: vazgeç, Enter: onayla; açılınca onay düğmesine odaklan
  useEffect(() => {
    if (!dialog) return undefined;
    confirmBtnRef.current?.focus();
    // Yakalama aşamasında dinlenir ve durdurulur: Esc arkadaki pencereyi (ör. sipariş penceresi) kapatmasın
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog, close]);

  const Icon = dialog?.danger ? TriangleAlert : HelpCircle;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div className="app-confirm-backdrop" onMouseDown={() => close(false)}>
          <div
            className={`app-confirm ${dialog.danger ? 'danger' : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            aria-describedby="app-confirm-message"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="app-confirm-icon"><Icon size={22} /></span>
            <h3 id="app-confirm-title">{dialog.title}</h3>
            {dialog.message && <p id="app-confirm-message">{dialog.message}</p>}
            <div className="app-confirm-actions">
              <button type="button" onClick={() => close(false)}>{dialog.cancelLabel}</button>
              <button type="button" ref={confirmBtnRef} className="primary" onClick={() => close(true)}>{dialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
