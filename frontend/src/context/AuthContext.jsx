import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getToken, setToken as saveToken, clearToken, resetSocket } from '../lib/api';

const AuthContext = createContext();
const SESSION_REFRESH_MS = 30 * 60 * 1000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getToken());
  const [loading, setLoading] = useState(true);

  // Oturum durumunu ve güncel yetkileri sunucudan doğrula
  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const response = await axios.get('/api/auth/me');
      if (response.data.success) {
        setUser(response.data.user);
        // Sunucu süresi yenilenmiş token döner; açık kalan ekran vardiya ortasında oturumdan düşmez
        if (response.data.token) {
          saveToken(response.data.token);
          setToken(response.data.token);
        }
      } else {
        logout();
      }
    } catch (error) {
      console.error('Oturum doğrulama hatası:', error);
      if (error.response?.status === 401 || error.response?.status === 403) logout();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    // Pencereye dönüldüğünde rol/yetki değişikliklerini al (yönetici başka cihazdan değiştirmiş olabilir)
    const onFocus = () => getToken() && refreshUser();
    window.addEventListener('focus', onFocus);
    // Sürekli açık duran ekranlar (mutfak, kasa) odak almasa da oturum ve yetkiler düzenli yenilenir
    const timer = setInterval(onFocus, SESSION_REFRESH_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [refreshUser]);

  // Yetki kontrolü: yönetici rolü her zaman tam yetkilidir (sunucudaki kuralla aynı)
  const can = useCallback(
    (key) => Boolean(user) && (user.role === 'admin' || user.permissions?.includes(key)),
    [user]
  );
  const canAny = useCallback((keys) => keys.some(k => can(k)), [can]);

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', { username, password });
      if (response.data.success) {
        const { token, user } = response.data;
        saveToken(token);
        setToken(token);
        setUser(user);
        resetSocket();
        return { success: true, user };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      const message = error.response?.data?.message || 'Giriş yapılırken sunucu hatası oluştu.';
      return { success: false, message };
    }
  };

  const logout = () => {
    clearToken();
    resetSocket();
    setToken(null);
    setUser(null);
    // Geri tuşuna basıldığında bellekte kalan sayfayı engellemek için geçmişi yenile
    window.history.replaceState(null, '', window.location.pathname);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, can, canAny, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
