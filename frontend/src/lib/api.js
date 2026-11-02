import axios from 'axios';
import { io } from 'socket.io-client';

// Oturum token'ının localStorage anahtarı (tek yerden yönetilir)
export const TOKEN_KEY = 'kafe_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Oturum açıksa Authorization başlığını ekler
export const authHeaders = (headers = {}) => {
  const token = getToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
};

// Oturum geçersizleştiğinde (süresi doldu, hesap pasife alındı) giriş ekranına dön
const handleUnauthorized = () => {
  if (!getToken()) return;
  clearToken();
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
};

// Tüm axios isteklerine oturum token'ını otomatik ekle
axios.interceptors.request.use((config) => {
  const token = getToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/api/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) handleUnauthorized();
    return Promise.reject(error);
  }
);

// fetch sarmalayıcısı: oturum token'ını her isteğe otomatik ekler
export const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: authHeaders(options.headers) });
  if (response.status === 401) handleUnauthorized();
  return response;
};

// Canlı güncellemeler için oturumlu, uygulama genelinde TEK Socket.io bağlantısı.
// Token her (yeniden) bağlanmada güncel değerden okunur; sunucu bağlantıyı kestiğinde
// (oturum süresi doldu / hesap pasife alındı) yenilenmiş token ile tekrar bağlanılır.
let sharedSocket = null;
let sharedUsers = 0;

const getSharedSocket = () => {
  if (!sharedSocket) {
    sharedSocket = io({ auth: (cb) => cb({ token: getToken() }) });
    sharedSocket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' && getToken()) setTimeout(() => sharedSocket?.connect(), 2000);
    });
  }
  return sharedSocket;
};

/**
 * Bileşene ortak bağlantı üzerinde kendi dinleyici grubunu verir.
 * disconnect() yalnızca bu bileşenin dinleyicilerini kaldırır; son kullanıcı ayrılınca bağlantı kapanır.
 */
export const createSocket = () => {
  const socket = getSharedSocket();
  sharedUsers += 1;
  const handlers = [];
  let closed = false;
  return {
    on(event, handler) {
      socket.on(event, handler);
      handlers.push([event, handler]);
      return this;
    },
    disconnect() {
      if (closed) return;
      closed = true;
      handlers.forEach(([event, handler]) => socket.off(event, handler));
      sharedUsers -= 1;
      if (sharedUsers === 0 && sharedSocket === socket) {
        socket.disconnect();
        sharedSocket = null;
      }
    }
  };
};

// Giriş / kullanıcı değişimi / çıkışta ortak bağlantı yeni oturumla (veya oturumsuz) yeniden kurulur;
// böylece sunucu olayları doğru kullanıcının yetkilerine göre gönderir.
export const resetSocket = () => {
  if (!sharedSocket) return;
  sharedSocket.disconnect();
  if (getToken()) sharedSocket.connect();
};
