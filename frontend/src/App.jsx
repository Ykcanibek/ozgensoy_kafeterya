import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/ToastProvider';
import { ConfirmProvider } from './components/ui/ConfirmProvider';
import { pagePermissions, firstAllowedPath } from './lib/pages';
import Login from './components/Login';
import Footer from './components/Footer';

// Sayfa stilleri ana pakette ve önceki sırasıyla kalır: bazı sayfalar başka sayfanın stil dosyasındaki
// sınıfları da kullanıyor; sayfa kodu ayrı yüklense de görünüm değişmesin.
import './components/customers.css';
import './components/kitchen.css';
import './components/reports.css';
import './styles/reports-hub.css';
import './styles/reports-v2.css';
import './components/roles.css';
import './components/staff.css';
import './styles/waste.css';
import './styles/cashbook.css';

// Sayfalar ayrı parçalar halinde, açıldıklarında yüklenir (ilk açılışta tüm panelin kodu inmez;
// ör. mutfak tableti raporlar/ürünler ekranının kodunu hiç indirmez)
const TableList = lazy(() => import('./components/TableList'));
const Kitchen = lazy(() => import('./components/Kitchen'));
const Products = lazy(() => import('./components/Products'));
const Categories = lazy(() => import('./components/Categories'));
const Reports = lazy(() => import('./components/Reports'));
const Customers = lazy(() => import('./components/Customers'));
const Roles = lazy(() => import('./components/Roles'));
const Staff = lazy(() => import('./components/Staff'));
const Waste = lazy(() => import('./components/Waste'));
const CashBook = lazy(() => import('./components/CashBook'));
import ErrorBoundary from './components/ui/ErrorBoundary';
import QrNotifier from './components/qr/QrNotifier';

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '16px',
      color: '#486b78'
    }}>
      <div style={{
        width: '36px',
        height: '36px',
        border: '3px solid #b6ced6',
        borderTopColor: '#346c80',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }}></div>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      <p style={{ fontSize: '0.9rem' }}>Sistem yükleniyor...</p>
    </div>
  );
}

// Hiçbir sayfaya erişim yetkisi olmayan kullanıcı için bilgilendirme ekranı
function NoAccessScreen() {
  const { user, logout } = useAuth();
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{
        background: '#ffffff', borderRadius: '18px', border: '1.5px solid #b6ced6', padding: '28px 24px',
        maxWidth: '420px', textAlign: 'center', boxShadow: '0 20px 40px -20px rgba(27, 65, 79, 0.35)'
      }}>
        <h2 style={{ margin: '0 0 8px', color: '#173845', fontSize: '1.2rem' }}>Erişebileceğiniz bir ekran yok</h2>
        <p style={{ margin: '0 0 18px', color: '#486b78', fontSize: '0.9rem', lineHeight: 1.5 }}>
          {user?.name}, rolünüze ({user?.role_name || 'rol atanmamış'}) henüz hiçbir ekran için yetki verilmemiş.
          Lütfen işletme yöneticisiyle görüşün.
        </p>
        <button
          type="button"
          onClick={logout}
          style={{ background: '#173845', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}
        >
          Çıkış Yap
        </button>
      </div>
    </div>
  );
}

// Giriş + sayfa yetkisi isteyen korumalı rota; yetki yoksa kullanıcının açabildiği ilk sayfaya yönlendirir
function ProtectedRoute({ path, children }) {
  const { user, loading, canAny } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  const required = pagePermissions(path);
  if (required.length === 0 || canAny(required)) {
    return (
      <div className="app-shell">
        <ErrorBoundary resetKey={path}>
          <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
        </ErrorBoundary>
        <Footer />
      </div>
    );
  }

  const fallback = firstAllowedPath(canAny);
  return fallback ? <Navigate to={fallback} replace /> : <NoAccessScreen />;
}

// Giriş sonrası / tanımsız adresler: kullanıcının açabildiği ilk sayfa
function HomeRedirect() {
  const { user, loading, canAny } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  const target = firstAllowedPath(canAny);
  return target ? <Navigate to={target} replace /> : <NoAccessScreen />;
}

// Giriş yapılmışsa tekrar login ekranını göstermeyen rota
function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  return user ? <Navigate to="/" replace /> : children;
}

const PROTECTED_PAGES = [
  ['/pos', <TableList />],
  ['/mutfak', <Kitchen />],
  ['/kategoriler', <Categories />],
  ['/urunler', <Products />],
  ['/fire-zayi', <Waste />],
  ['/musteriler', <Customers />],
  ['/kasa-defteri', <CashBook />],
  ['/raporlar', <Reports />],
  ['/personel', <Staff />],
  ['/yetkiler', <Roles />]
];

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <ConfirmProvider>
      <div className="cafe-ambient-bg"></div>
      <BrowserRouter>
        <QrNotifier />
        <Routes>
          {/* Giriş Sayfası */}
          <Route path="/login" element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } />

          {/* Ana sayfa: kullanıcının yetkili olduğu ilk ekrana yönlendirir */}
          <Route path="/" element={<HomeRedirect />} />

          {PROTECTED_PAGES.map(([path, element]) => (
            <Route key={path} path={path} element={
              <ProtectedRoute path={path}>
                {element}
              </ProtectedRoute>
            } />
          ))}

          {/* Tanımsız tüm linkleri yetkili ilk ekrana yönlendir */}
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
      </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
