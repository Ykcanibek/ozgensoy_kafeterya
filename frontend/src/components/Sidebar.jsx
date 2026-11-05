import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pagePermissions } from '../lib/pages';
import { 
  Coffee, 
  X, 
  LayoutGrid, 
  ChefHat, 
  BarChart3, 
  LogOut,
  Tags,
  Package,
  Users,
  ShieldCheck,
  UserCheck,
  PackageX,
  BookOpen,
  DatabaseBackup
} from 'lucide-react';

export default function Sidebar({ isOpen, onClose }) {
  const { logout, canAny } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { path: '/pos', label: 'Masalar & POS', icon: <LayoutGrid size={18} /> },
    { path: '/musteriler', label: 'Müşteriler & Cari', icon: <Users size={18} /> },
    { path: '/kasa-defteri', label: 'Kasa Defteri', icon: <BookOpen size={18} /> },
    { path: '/kategoriler', label: 'Kategori Yönetimi', icon: <Tags size={18} /> },
    { path: '/urunler', label: 'Ürün Yönetimi', icon: <Package size={18} /> },
    { path: '/mutfak', label: 'Mutfak Ekranı', icon: <ChefHat size={18} /> },
    { path: '/fire-zayi', label: 'Fire & Zayi', icon: <PackageX size={18} /> },
    { path: '/raporlar', label: 'Gün Sonu & Raporlar', icon: <BarChart3 size={18} /> },
    { path: '/personel', label: 'Personel Yönetimi', icon: <UserCheck size={18} /> },
    { path: '/yetkiler', label: 'Yetki & Rol Yönetimi', icon: <ShieldCheck size={18} /> },
    { path: '/yedekler', label: 'Yedekler', icon: <DatabaseBackup size={18} /> },
  ].filter(item => canAny(pagePermissions(item.path))); // Yalnızca yetkili olunan sayfalar

  if (!isOpen) return null;

  const handleNavigate = (path) => {
    navigate(path);
    onClose();
  };

  return (
    <>
      {/* Arka plan karartması (Backdrop) */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(30, 41, 45, 0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 1100,
          transition: 'opacity 0.3s ease'
        }}
      />

      {/* Yandan Açılan Menü (Off-Canvas Drawer) */}
      <aside style={{
        position: 'fixed',
        top: 0,
        left: 0,
        // Telefonda adres çubuğu açıkken de alt kısım (Oturumu Kapat) görünür kalsın
        height: '100dvh',
        width: '335px',
        maxWidth: '88vw',
        background: '#ffffff',
        zIndex: 1150,
        boxShadow: '10px 0 40px rgba(30, 41, 45, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '22px 18px',
        animation: 'slideInLeft 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        borderRight: '1px solid #b6ced6'
      }}>
        <style>{`
          @keyframes slideInLeft {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Üst Kısım: Kafe Logosu, Kapat Düğmesi ve (sığmazsa kendi içinde kayan) menü listesi */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            paddingBottom: '14px',
            borderBottom: '1.5px solid #b6ced6',
            marginBottom: '12px',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #cbe0e7 0%, #d5e3e8 100%)',
                border: '1.5px solid #6293a3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#346c80',
                flexShrink: 0
              }}>
                <Coffee size={19} />
              </div>
              <h3 className="cafe-brand-title" style={{ fontSize: '1.08rem', margin: 0, whiteSpace: 'nowrap' }}>
                <span className="brand-ozgensoy">Özgensoy</span>
                <span className="brand-kafeterya">Kafeterya</span>
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              title="Menüyü Kapat"
              style={{
                background: '#ffffff',
                border: '1.5px solid #b6ced6',
                borderRadius: '10px',
                width: '34px',
                height: '34px',
                minWidth: '34px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#346c80',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(27, 65, 79, 0.08)',
                transition: 'all 0.2s ease',
                padding: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#dbe9ee';
                e.currentTarget.style.borderColor = '#346c80';
                e.currentTarget.style.color = '#1b414f';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.borderColor = '#b6ced6';
                e.currentTarget.style.color = '#346c80';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>

          {/* Menü Linkleri (Kompakt ve Açıklamasız) */}
          <nav style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            margin: '0 -6px',
            padding: '0 6px 4px'
          }}>
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path === '/pos' && location.pathname === '/');
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    border: '1px solid',
                    flexShrink: 0,
                    borderColor: isActive ? '#346c80' : 'transparent',
                    background: isActive ? '#f8f3ed' : 'transparent',
                    color: isActive ? '#346c80' : '#334951',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#dbe9ee';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: isActive ? '#346c80' : '#cbe0e7',
                    color: isActive ? '#ffffff' : '#346c80',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {item.icon}
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '0.92rem' }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Alt Kısım: Sadece Oturumu Kapat */}
        <div style={{
          borderTop: '1px solid #f3ebe3',
          paddingTop: '12px',
          marginTop: '8px',
          flexShrink: 0
        }}>
          <button
            onClick={() => {
              onClose();
              logout();
            }}
            style={{
              width: '100%',
              background: '#fdf2f0',
              border: '1px solid #f6cfc7',
              color: '#b84a39',
              padding: '10px',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '0.88rem',
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#fae5e1'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fdf2f0'}
          >
            <LogOut size={16} />
            <span>Oturumu Kapat</span>
          </button>
        </div>

      </aside>
    </>
  );
}
