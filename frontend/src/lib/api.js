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
let connectionLost = false;
const resyncHandlers = new Set();
const connectionListeners = new Set();
const RESYNC_AFTER_HIDDEN_MS = 30 * 1000;

const setConnectionLost = (lost) => {
  if (connectionLost === lost) return; // Her yeniden deneme bildirilirse uyarının bekleme süresi hep başa döner
  connectionLost = lost;
  connectionListeners.forEach(listener => listener(lost));
};
const runResync = () => resyncHandlers.forEach(handler => handler());

/** Bağlantı durumunu izler (true: koptu); hemen mevcut durumla çağrılır, aboneliği kaldıran işlev döner */
export const subscribeConnection = (listener) => {
  connectionListeners.add(listener);
  listener(connectionLost);
  return () => connectionListeners.delete(listener);
};

// Tablet uykudan dönünce: kopan bağlantı hemen denensin; uzun süre gizli kaldıysa ekranlar yenilensin
let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    return;
  }
  if (sharedSocket && !sharedSocket.connected && !sharedSocket.active && getToken()) sharedSocket.connect();
  if (sharedSocket && hiddenAt && Date.now() - hiddenAt > RESYNC_AFTER_HIDDEN_MS) runResync();
  hiddenAt = null;
});

const getSharedSocket = () => {
  if (!sharedSocket) {
    sharedSocket = io({ auth: (cb) => cb({ token: getToken() }) });
    sharedSocket.on('connect', () => {
      // Bağlantı yokken gelen olaylar kaçırıldı: açık ekranlar güncel hali sunucudan alır
      if (connectionLost) {
        setConnectionLost(false);
        runResync();
      }
    });
    sharedSocket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return;
      setConnectionLost(true);
      if (reason === 'io server disconnect' && getToken()) setTimeout(() => sharedSocket?.connect(), 2000);
    });
    sharedSocket.on('connect_error', (error) => {
      if (!getToken()) return;
      setConnectionLost(true);
      // Oturum geçersizse (şifre değişti, süresi doldu) istek 401 alır ve giriş ekranına dönülür
      if (error?.message === 'UNAUTHENTICATED') axios.get('/api/auth/me').catch(() => {});
      // Sunucu bağlantıyı reddettiyse (ör. yeniden başlarken veritabanı hazır değildi) istemci kendiliğinden denemez
      if (!sharedSocket?.active) setTimeout(() => sharedSocket?.connect(), 5000);
    });
  }
  return sharedSocket;
};

/**
 * Bileşene ortak bağlantı üzerinde kendi dinleyici grubunu verir.
 * disconnect() yalnızca bu bileşenin dinleyicilerini kaldırır; son kullanıcı ayrılınca bağlantı kapanır.
 * 'resync' olayı sunucudan gelmez: bağlantı geri geldiğinde veya ekran uykudan döndüğünde çağrılır, veriyi yeniden çekmek içindir.
 */
export const createSocket = () => {
  const socket = getSharedSocket();
  sharedUsers += 1;
  const handlers = [];
  let closed = false;
  return {
    on(event, handler) {
      if (event === 'resync') resyncHandlers.add(handler);
      else socket.on(event, handler);
      handlers.push([event, handler]);
      return this;
    },
    disconnect() {
      if (closed) return;
      closed = true;
      handlers.forEach(([event, handler]) => {
        if (event === 'resync') resyncHandlers.delete(handler);
        else socket.off(event, handler);
      });
      sharedUsers -= 1;
      if (sharedUsers === 0 && sharedSocket === socket) {
        socket.disconnect();
        sharedSocket = null;
        setConnectionLost(false);
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
