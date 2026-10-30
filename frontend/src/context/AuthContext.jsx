import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('kafe_token') || null);
  const [loading, setLoading] = useState(true);

  // Oturum durumunu sunucudan doğrula
  useEffect(() => {
    const verifyUser = async () => {
      const storedToken = localStorage.getItem('kafe_token');
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get('/api/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
        if (response.data.success) {
          setUser(response.data.user);
        } else {
          logout();
        }
      } catch (error) {
        console.error('Oturum doğrulama hatası:', error);
        logout();
      } finally {
        setLoading(false);
      }
    };

    verifyUser();
  }, []);

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', { username, password });
      if (response.data.success) {
        const { token, user } = response.data;
        localStorage.setItem('kafe_token', token);
        setToken(token);
        setUser(user);
        return { success: true, user };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      const message = error.response?.data?.message || 'Giriş yapılırken sunucu hatası oluştu.';
      return { success: false, message };
    }
  };

  const logout = () => {
    localStorage.removeItem('kafe_token');
    setToken(null);
    setUser(null);
    // Geri tuşuna basıldığında bellekte kalan sayfayı engellemek için geçmişi yenile
    window.history.replaceState(null, '', window.location.pathname);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
