import React, { useState } from 'react';
import axios from 'axios';
import { KeyRound, Lock, X, AlertCircle } from 'lucide-react';
import { useToast } from './ui/ToastProvider';
import { setToken, resetSocket } from '../lib/api';

const MIN_PASSWORD_LENGTH = 6;

// Oturumdaki kullanıcının kendi şifresini değiştirdiği pencere (kullanıcı menüsünden açılır)
export default function ChangePasswordModal({ onClose }) {
  const { showToast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!current || !next) return setError('Mevcut ve yeni şifreyi giriniz.');
    if (next.length < MIN_PASSWORD_LENGTH) return setError(`Yeni şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
    if (next !== repeat) return setError('Yeni şifreler birbiriyle eşleşmiyor.');

    setSaving(true);
    setError('');
    try {
      const res = await axios.put('/api/auth/password', { current_password: current, new_password: next });
      // Eski oturum artık geçersiz: bu cihaz yeni oturumla devam eder
      if (res.data.token) {
        setToken(res.data.token);
        resetSocket();
      }
      showToast(res.data.message || 'Şifreniz değiştirildi.', 'success');
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Şifre değiştirilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label, value, setValue, autoFocus = false) => (
    <div className="cafe-input-wrapper" style={{ marginBottom: '14px' }}>
      <label className="cafe-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <Lock size={17} color="#5d818f" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="password"
          className="cafe-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus={autoFocus}
          disabled={saving}
          style={{ paddingLeft: '40px' }}
        />
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(38, 28, 23, 0.55)', backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: '16px'
      }}
    >
      <div style={{
        background: '#ffffff', borderRadius: '22px', width: '100%', maxWidth: '400px', padding: '28px 20px',
        boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(98, 147, 163, 0.4)',
        border: '1px solid #b6ced6', position: 'relative'
      }}>
        <button
          type="button"
          onClick={onClose}
          title="Kapat"
          style={{
            position: 'absolute', top: '20px', right: '20px', background: '#dbe9ee', border: '1px solid #b6ced6',
            borderRadius: '10px', width: '32px', height: '32px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#324f5a', cursor: 'pointer'
          }}
        >
          <X size={16} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <div style={{
            width: '54px', height: '54px', borderRadius: '16px', background: 'linear-gradient(135deg, #cbe0e7 0%, #d5e3e8 100%)',
            border: '1.5px solid #6293a3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px'
          }}>
            <KeyRound size={26} color="#346c80" />
          </div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.3rem', fontWeight: '700', color: '#1e292d', margin: 0 }}>
            Şifremi Değiştir
          </h3>
        </div>

        {error && (
          <div style={{
            background: '#fdf2f0', border: '1px solid #f6cfc7', borderRadius: '12px', padding: '10px 14px', display: 'flex',
            alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#b84a39', fontSize: '0.86rem', fontWeight: '500'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {field('Mevcut Şifre', current, setCurrent, true)}
          {field('Yeni Şifre', next, setNext)}
          {field('Yeni Şifre (Tekrar)', repeat, setRepeat)}

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, background: '#dbe9ee', border: '1px solid #b6ced6', color: '#324f5a', padding: '13px',
                borderRadius: '12px', fontWeight: '600', fontSize: '0.92rem', cursor: 'pointer'
              }}
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1.5, background: 'linear-gradient(135deg, #346c80 0%, #1b414f 100%)', color: '#ffffff', border: 'none',
                padding: '13px', borderRadius: '12px', fontWeight: '600', fontSize: '0.92rem', cursor: 'pointer'
              }}
            >
              {saving ? 'Kaydediliyor...' : 'Şifreyi Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
