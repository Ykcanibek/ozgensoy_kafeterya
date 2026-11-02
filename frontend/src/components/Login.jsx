import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Coffee, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  AlertCircle,
  Sparkles
} from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sayfa açıldığında daha önce hatırlanan kullanıcı adını getir.
  // Şifre güvenlik nedeniyle saklanmaz; eski sürümlerin kaydettiği şifre burada silinir.
  useEffect(() => {
    try {
      const savedData = localStorage.getItem('kafe_remember_user');
      if (!savedData) return;
      const parsed = JSON.parse(savedData);
      if (parsed.password !== undefined) {
        localStorage.setItem('kafe_remember_user', JSON.stringify({ username: parsed.username }));
      }
      if (parsed.username) {
        setUsername(parsed.username);
        setRememberMe(true);
      }
    } catch {
      localStorage.removeItem('kafe_remember_user');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Kullanıcı adı ve şifre gereklidir.');
      return;
    }

    setError('');
    setLoading(true);

    const res = await login(username, password);
    if (res.success) {
      // Beni Hatırla seçiliyse yalnızca kullanıcı adını kaydet, seçili değilse temizle
      if (rememberMe) {
        localStorage.setItem('kafe_remember_user', JSON.stringify({ username }));
      } else {
        localStorage.removeItem('kafe_remember_user');
      }
      navigate('/');
    } else {
      setError(res.message);
    }
    setLoading(false);
  };

  return (
    <div className="login-page-container">
      {/* Kompakt, Tablet & Mobil Uyumlu POS Giriş Kartı */}
      <div className="login-card">
        
        {/* Üst Logo ve Başlık */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div className="login-logo-box" style={{
            width: '60px',
            height: '60px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, #cbe0e7 0%, #d5e3e8 100%)',
            border: '1px solid #6293a3',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px',
            boxShadow: '0 4px 14px rgba(61, 119, 140, 0.2)'
          }}>
            <Coffee size={28} color="#346c80" strokeWidth={2.2} />
          </div>

          <h2 className="login-title cafe-brand-title" style={{
            fontSize: '1.85rem',
            marginBottom: '6px',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <span className="brand-ozgensoy">Özgensoy</span>
            <span className="brand-kafeterya">Kafeterya</span>
          </h2>
          <p className="login-subtitle" style={{ color: '#486b78', fontSize: '0.88rem' }}>
            POS & Otomasyon Sistemi
          </p>
        </div>

        {/* Hata Bildirimi */}
        {error && (
          <div style={{
            background: '#fdf2f0',
            border: '1px solid #f6cfc7',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
            color: '#b84a39',
            fontSize: '0.86rem',
            fontWeight: '500'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Giriş Formu */}
        <form onSubmit={handleSubmit}>
          {/* Kullanıcı Adı */}
          <div className="cafe-input-wrapper">
            <label className="cafe-label">Kullanıcı Adı</label>
            <div style={{ position: 'relative' }}>
              <User 
                size={18} 
                color="#5d818f" 
                style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} 
              />
              <input
                type="text"
                className="cafe-input"
                placeholder="Kullanıcı adınızı girin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                disabled={loading}
              />
            </div>
          </div>

          {/* Şifre */}
          <div className="cafe-input-wrapper" style={{ marginBottom: '4px' }}>
            <label className="cafe-label">Şifre</label>
            <div style={{ position: 'relative' }}>
              <Lock 
                size={18} 
                color="#5d818f" 
                style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} 
              />
              <input
                type={showPassword ? 'text' : 'password'}
                className="cafe-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                style={{ paddingRight: '44px' }}
              />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#5d818f',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

          {/* Beni Hatırla Seçeneği */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '22px',
            padding: '0 2px'
          }}>
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              userSelect: 'none',
              fontSize: '0.86rem',
              color: '#3d525a',
              fontWeight: '600'
            }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  accentColor: '#346c80',
                  cursor: 'pointer',
                  borderRadius: '5px'
                }}
              />
              <span>Beni Hatırla</span>
            </label>
          </div>

          {/* Giriş Butonu */}
          <button 
            type="submit" 
            className="btn-cafe-primary" 
            disabled={loading}
            style={{ marginBottom: '24px' }}
          >
            {loading ? (
              <span>Giriş Yapılıyor...</span>
            ) : (
              <>
                <span>Sisteme Giriş</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
