import React from 'react';
import { useAuth } from '../context/AuthContext';
import UserSwitcher from './UserSwitcher';
import { Menu, LogOut } from 'lucide-react';

export default function Navbar({ 
  onOpenSidebar, 
  title = 'Özgensoy Kafeterya', 
  stats, 
  actions,
  style = {} 
}) {
  const { logout } = useAuth();

  return (
    <header className="pos-header" style={style}>
      {/* ÜST SATIR (Mobilde Row 1, Masaüstünde Sol Taraf) */}
      <div className="pos-header-top-row">
        <div className="pos-header-brand">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="pos-menu-btn"
            title="Menüyü Aç"
          >
            <Menu size={18} color="#ffffff" />
            <span>Menü</span>
          </button>

          <h1 className="pos-header-title">
            {typeof title === 'string' && title.toLowerCase().includes('özgensoy') ? (
              <span className="cafe-brand-title">
                <span className="brand-ozgensoy">Özgensoy</span>
                <span className="brand-kafeterya">Kafeterya</span>
              </span>
            ) : (
              title
            )}
          </h1>

          {/* Masaüstünde başlığın yanında yatay olarak görünür */}
          <div className="pos-user-desktop">
            <UserSwitcher />
          </div>
        </div>

        {/* Mobilde Row 1'in sağında Aksiyonlar ve Çıkış */}
        <div className="pos-actions-mobile">
          {actions}
          <button
            type="button"
            onClick={logout}
            className="pos-logout-btn"
            title="Çıkış Yap"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* ALT SATIR (Mobilde Row 2, Masaüstünde Sağ Taraf) */}
      <div className="pos-header-bottom-row">
        {/* Mobilde Kullanıcı Seçici burada durur */}
        <div className="pos-user-mobile">
          <UserSwitcher />
        </div>

        {/* Sayaçlar / İstatistik Rozetleri */}
        {stats && (
          <div className="pos-stats-group">
            {stats}
          </div>
        )}

        {/* Masaüstünde sağ tarafta Aksiyonlar & Çıkış butonu */}
        <div className="pos-actions-desktop">
          {actions}
          <button
            type="button"
            onClick={logout}
            className="pos-logout-btn"
            title="Çıkış Yap"
          >
            <LogOut size={15} />
            <span>Çıkış</span>
          </button>
        </div>
      </div>
    </header>
  );
}
