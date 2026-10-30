import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import TableList from './components/TableList';
import Kitchen from './components/Kitchen';
import Products from './components/Products';
import Categories from './components/Categories';
import Reports from './components/Reports';
import Customers from './components/Customers';
import Roles from './components/Roles';

// Giriş yapılmamışsa login'e atan korumalı rota
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
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

  return user ? children : <Navigate to="/login" replace />;
}

// Giriş yapılmışsa tekrar login ekranını göstermeyen rota
function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  return user ? <Navigate to="/pos" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <div className="cafe-ambient-bg"></div>
      <BrowserRouter>
        <Routes>
          {/* Giriş Sayfası */}
          <Route path="/login" element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } />

          {/* Ana Sayfa (Doğrudan POS Masalar Ekranına Yönlendirir) */}
          <Route path="/" element={<Navigate to="/pos" replace />} />
          
          {/* Masalar & POS */}
          <Route path="/pos" element={
            <ProtectedRoute>
              <TableList />
            </ProtectedRoute>
          } />

          {/* Mutfak Ekranı (KDS) */}
          <Route path="/mutfak" element={
            <ProtectedRoute>
              <Kitchen />
            </ProtectedRoute>
          } />

          {/* Kategori Yönetimi */}
          <Route path="/kategoriler" element={
            <ProtectedRoute>
              <Categories />
            </ProtectedRoute>
          } />

          {/* Ürün Yönetimi */}
          <Route path="/urunler" element={
            <ProtectedRoute>
              <Products />
            </ProtectedRoute>
          } />

          {/* Müşteriler & Cari Hesaplar */}
          <Route path="/musteriler" element={
            <ProtectedRoute>
              <Customers />
            </ProtectedRoute>
          } />

          {/* Gün Sonu & Raporlar */}
          <Route path="/raporlar" element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          } />

          {/* Yetki & Rol Yönetimi */}
          <Route path="/yetkiler" element={
            <ProtectedRoute>
              <Roles />
            </ProtectedRoute>
          } />

          {/* Tanımsız tüm linkleri POS ekranına yönlendir */}
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
