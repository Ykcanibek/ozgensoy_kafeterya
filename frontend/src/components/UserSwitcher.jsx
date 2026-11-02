import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  ChevronDown, 
  User, 
  ShieldCheck, 
  ChefHat, 
  Receipt, 
  Lock, 
  ArrowRight, 
  AlertCircle,
  Check,
  X,
  Eye,
  EyeOff,
  UserCheck,
  KeyRound
} from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';

export default function UserSwitcher() {
  const { user, login } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState([]);
  
  // Pop-up (Modal) State'leri
  const [targetUser, setTargetUser] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);

  const dropdownRef = useRef(null);

  // Kullanıcı listesi yalnızca menü açıldığında çekilir (her açılışta güncel liste; sayfa açılışında istek gitmez)
  useEffect(() => {
    if (!isOpen) return;
    const fetchUsers = async () => {
      try {
        const res = await axios.get('/api/auth/users');
        if (res.data.success) {
          setUsers(res.data.users);
        }
      } catch (err) {
        console.error('Kullanıcılar yüklenemedi:', err);
      }
    };

    fetchUsers();
  }, [isOpen, user]);

  // Dropdown dışına tıklandığında kapat
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleIcon = (role, size = 16) => {
    switch (role) {
      case 'admin':
        return <ShieldCheck size={size} color="#3d778c" />;
      case 'cashier':
      case 'waiter':
        return <Receipt size={size} color="#70877f" />;
      case 'kitchen':
        return <ChefHat size={size} color="#c67d5a" />;
      default:
        return <User size={size} color="#486b78" />;
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'cashier':
        return 'Kasa';
      case 'waiter':
        return 'Garson';
      case 'kitchen':
        return 'Mutfak';
      default:
        return role;
    }
  };

  // Pop-up üzerinden geçişi tamamla
  const handleSwitchUser = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Lütfen kullanıcının şifresini giriniz.');
      return;
    }

    setLoading(true);
    setError('');

    const res = await login(targetUser.username, password);
    if (res.success) {
      setTargetUser(null);
      setPassword('');
      setShowPassword(false);
      setIsOpen(false);
    } else {
      setError(res.message || 'Girdiğiniz şifre hatalı!');
    }
    setLoading(false);
  };

  const openSwitchModal = (u) => {
    setTargetUser(u);
    setPassword('');
    setError('');
    setShowPassword(false);
    setIsOpen(false); // Dropdown'ı kapatıp modalı aç
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      
      {/* Tıklanabilir Belirgin Kullanıcı Butonu */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: isOpen ? '#f2e8dc' : '#f8fbfc',
          border: '1.5px solid',
          borderColor: isOpen ? '#346c80' : '#b6ced6',
          borderRadius: '10px',
          padding: '4px 10px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          color: '#1e292d',
          fontSize: '0.82rem',
          fontWeight: '600',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          outline: 'none',
          marginTop: '2px',
          maxWidth: '100%',
          boxShadow: '0 2px 6px rgba(27, 65, 79, 0.04)'
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = '#c7b29a';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = '#b6ced6';
        }}
        title="Kullanıcı değiştirmek için tıklayın"
      >
        <div style={{
          width: '18px',
          height: '18px',
          borderRadius: '5px',
          background: '#cbe0e7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {getRoleIcon(user?.role, 12)}
        </div>
        
        <span style={{
          color: '#1e292d',
          fontWeight: '700',
          maxWidth: '120px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {user?.name}
        </span>
        <span style={{
          background: 'rgba(52, 108, 128, 0.08)',
          color: '#346c80',
          padding: '1px 5px',
          borderRadius: '4px',
          fontSize: '0.68rem',
          fontWeight: '700',
          flexShrink: 0
        }}>
          {user?.role_name || getRoleLabel(user?.role)}
        </span>

        <ChevronDown 
          size={13} 
          color="#346c80" 
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
            marginLeft: '1px',
            flexShrink: 0
          }}
        />
      </button>

      {/* Belirgin Glassmorphism Dropdown Menü */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          width: '290px',
          maxWidth: 'calc(100vw - 32px)',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '18px',
          boxShadow: '0 20px 45px -10px rgba(22, 53, 65, 0.22), 0 0 0 1px rgba(98, 147, 163, 0.45)',
          padding: '12px',
          zIndex: 1200,
          animation: 'dropSlide 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <style>{`
            @keyframes dropSlide {
              from { opacity: 0; transform: translateY(-8px) scale(0.98); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>

          <div style={{
            fontSize: '0.74rem',
            fontWeight: '700',
            color: '#486b78',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            padding: '4px 6px 10px 6px',
            borderBottom: '1px solid #f2e9e1',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>Hızlı Kullanıcı Geçişi</span>
            <span style={{ fontSize: '0.7rem', color: '#3d778c', textTransform: 'none', fontWeight: '600' }}>
              Seç & Şifre Gir
            </span>
          </div>

          {/* Kullanıcı Listesi */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {users.map((u) => {
              const isCurrent = u.id === user?.id;
              return (
                <button
                  key={u.id}
                  onClick={() => {
                    if (!isCurrent) {
                      openSwitchModal(u);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: isCurrent ? '#b6ced6' : 'transparent',
                    background: isCurrent ? '#faf6f0' : 'transparent',
                    cursor: isCurrent ? 'default' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) {
                      e.currentTarget.style.background = '#f7f2ea';
                      e.currentTarget.style.borderColor = '#6293a3';
                      e.currentTarget.style.transform = 'translateX(2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'none';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: isCurrent ? '#eadecf' : '#cbe0e7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(98, 147, 163, 0.4)'
                    }}>
                      {getRoleIcon(u.role, 16)}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#1e292d' }}>
                        {u.name}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#486b78' }}>
                        {u.role_name || getRoleLabel(u.role)} • <span style={{ color: '#a38f80' }}>@{u.username}</span>
                      </div>
                    </div>
                  </div>

                  {isCurrent ? (
                    <span style={{
                      fontSize: '0.7rem',
                      background: '#eef5f0',
                      color: '#4d8058',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Check size={12} /> Aktif
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '0.76rem',
                      color: '#346c80',
                      fontWeight: '700',
                      background: '#cce2e9',
                      padding: '4px 8px',
                      borderRadius: '6px'
                    }}>
                      Geçiş Yap
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Kendi şifresini değiştirme */}
          <button
            type="button"
            onClick={() => { setIsOpen(false); setShowChangePassword(true); }}
            style={{
              marginTop: '8px', width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 12px', borderRadius: '12px', border: 'none', borderTop: '1px solid #f2e9e1',
              background: 'transparent', color: '#346c80', fontWeight: '700', fontSize: '0.84rem', cursor: 'pointer'
            }}
          >
            <KeyRound size={15} /> Şifremi Değiştir
          </button>
        </div>
      )}

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

      {/* ======================================================== */}
      {/* ŞIK KULLANICI GEÇİŞ POP-UP (MODAL) EKRANI                 */}
      {/* ======================================================== */}
      {targetUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(38, 28, 23, 0.55)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '16px',
          animation: 'modalFade 0.2s ease-out'
        }}>
          <style>{`
            @keyframes modalFade {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>

          <div style={{
            background: '#ffffff',
            borderRadius: '22px',
            width: '100%',
            maxWidth: '420px',
            padding: '28px 20px',
            boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(98, 147, 163, 0.4)',
            border: '1px solid #b6ced6',
            position: 'relative'
          }}>
            {/* Kapat Butonu */}
            <button
              onClick={() => {
                setTargetUser(null);
                setPassword('');
                setError('');
              }}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: '#dbe9ee',
                border: '1px solid #b6ced6',
                borderRadius: '10px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#324f5a',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <X size={16} />
            </button>

            {/* Modal Başlığı */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #cbe0e7 0%, #d5e3e8 100%)',
                border: '1.5px solid #6293a3',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
                boxShadow: '0 4px 14px rgba(61, 119, 140, 0.25)'
              }}>
                <UserCheck size={26} color="#346c80" />
              </div>
              <h3 style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '1.35rem',
                fontWeight: '700',
                color: '#1e292d',
                margin: 0
              }}>
                Kullanıcı Değiştir
              </h3>
              <p style={{ color: '#486b78', fontSize: '0.86rem', marginTop: '4px' }}>
                Hızlı oturum geçişi için hedef kullanıcının şifresini giriniz.
              </p>
            </div>

            {/* Mevcut Kullanıcı -> Geçilecek Kullanıcı Karşılaştırma Kartı */}
            <div style={{
              background: '#dbe9ee',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid #b6ced6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '22px'
            }}>
              {/* Mevcut Kullanıcı */}
              <div style={{ textAlign: 'left', flex: 1 }}>
                <span style={{ fontSize: '0.72rem', color: '#a38f80', fontWeight: '700', textTransform: 'uppercase' }}>
                  Şu Anki Oturum
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  {getRoleIcon(user?.role, 14)}
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e292d' }}>
                    {user?.name}
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#486b78' }}>
                  ({user?.role_name || getRoleLabel(user?.role)})
                </span>
              </div>

              {/* Geçiş Oku */}
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#ffffff',
                border: '1px solid #b6ced6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#346c80',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                margin: '0 10px'
              }}>
                <ArrowRight size={16} />
              </div>

              {/* Hedef Kullanıcı */}
              <div style={{ textAlign: 'right', flex: 1 }}>
                <span style={{ fontSize: '0.72rem', color: '#346c80', fontWeight: '700', textTransform: 'uppercase' }}>
                  Geçilecek Hesap
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#346c80' }}>
                    {targetUser.name}
                  </span>
                  {getRoleIcon(targetUser.role, 14)}
                </div>
                <span style={{ fontSize: '0.72rem', color: '#486b78' }}>
                  ({targetUser.role_name || getRoleLabel(targetUser.role)})
                </span>
              </div>
            </div>

            {/* Hata Bildirimi */}
            {error && (
              <div style={{
                background: '#fdf2f0',
                border: '1px solid #f6cfc7',
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '18px',
                color: '#b84a39',
                fontSize: '0.86rem',
                fontWeight: '500'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Şifre Formu */}
            <form onSubmit={handleSwitchUser}>
              <div className="cafe-input-wrapper" style={{ marginBottom: '24px' }}>
                <label className="cafe-label">
                  <strong>{targetUser.name}</strong> Şifresi
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock 
                    size={17} 
                    color="#5d818f" 
                    style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} 
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="cafe-input"
                    placeholder="Şifreyi giriniz..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    disabled={loading}
                    style={{ paddingRight: '44px', paddingLeft: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#5d818f',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {/* Aksiyon Butonları */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setTargetUser(null);
                    setPassword('');
                    setError('');
                  }}
                  style={{
                    flex: 1,
                    background: '#dbe9ee',
                    border: '1px solid #b6ced6',
                    color: '#324f5a',
                    padding: '13px',
                    borderRadius: '12px',
                    fontWeight: '600',
                    fontSize: '0.92rem',
                    cursor: 'pointer'
                  }}
                >
                  Vazgeç
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1.5,
                    background: 'linear-gradient(135deg, #346c80 0%, #1b414f 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '13px',
                    borderRadius: '12px',
                    fontWeight: '600',
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(52, 108, 128, 0.25)'
                  }}
                >
                  {loading ? (
                    <span>Geçiş Yapılıyor...</span>
                  ) : (
                    <>
                      <span>Hesaba Geçiş Yap</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
