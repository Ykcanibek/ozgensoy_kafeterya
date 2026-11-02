import React from 'react';
import { TriangleAlert, RotateCw, Home } from 'lucide-react';

/**
 * Bir sayfada beklenmeyen bir çizim (render) hatası olursa tüm uygulama beyaz ekrana düşmesin:
 * hata yakalanır, kullanıcıya anlaşılır bir mesaj ve yenileme seçenekleri gösterilir.
 * `resetKey` değişince (ör. başka sayfaya geçince) hata durumu sıfırlanır.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Arayüz hatası]', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app-error-screen" role="alert">
        <div className="app-error-card">
          <span className="app-error-icon"><TriangleAlert size={26} /></span>
          <h2>Bu ekranda beklenmeyen bir hata oluştu</h2>
          <p>Yaptığınız kayıtlı işlemler etkilenmedi. Sayfayı yenileyerek devam edebilirsiniz; sorun sürerse yöneticinize bildirin.</p>
          <code>{String(this.state.error?.message || this.state.error)}</code>
          <div className="app-error-actions">
            <button type="button" className="primary" onClick={() => window.location.reload()}>
              <RotateCw size={15} /> Sayfayı yenile
            </button>
            <button type="button" onClick={() => { window.location.href = '/'; }}>
              <Home size={15} /> Ana ekrana dön
            </button>
          </div>
        </div>
      </div>
    );
  }
}
