import React from 'react';
import { Coffee } from 'lucide-react';

// Giriş sonrası tüm sayfaların altındaki sade alt bilgi
export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <span className="app-footer-brand">
          <Coffee size={15} />
          <span className="brand-ozgensoy">Özgensoy</span>
          <span className="brand-kafeterya">Kafeterya</span>
        </span>
        <span className="app-footer-copy">© {new Date().getFullYear()} · Tüm hakları saklıdır.</span>
      </div>
    </footer>
  );
}
