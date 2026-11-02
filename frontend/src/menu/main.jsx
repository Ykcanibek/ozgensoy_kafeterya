import React from 'react';
import ReactDOM from 'react-dom/client';
import MenuApp from './MenuApp';
import './menu.css';

// Adres: /m/<masa-anahtarı>  (masaya özel QR kodu bu adresi açar)
const match = window.location.pathname.match(/^\/m\/([A-Za-z0-9_-]+)\/?$/);

ReactDOM.createRoot(document.getElementById('menu-root')).render(
  <React.StrictMode>
    <MenuApp token={match ? match[1] : null} />
  </React.StrictMode>
);
