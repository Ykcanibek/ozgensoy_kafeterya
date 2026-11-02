import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import './reports.css';
import '../styles/reports-hub.css';
import {
  LayoutDashboard, LineChart, Package, LayoutGrid, Wallet, Users, NotebookPen,
  Receipt, Gift, History, RefreshCw, Printer, CalendarDays, Lock, AlertCircle, GitCompare
} from 'lucide-react';
import { PERIOD_PRESETS, COMPARE_MODES, resolvePeriod, applyCompare, toYMD } from './reports/reportUtils';
import useReportData from './reports/useReportData';
import OverviewSection from './reports/sections/OverviewSection';
import SalesSection from './reports/sections/SalesSection';
import ProductsSection from './reports/sections/ProductsSection';
import TablesSection from './reports/sections/TablesSection';
import PaymentsSection from './reports/sections/PaymentsSection';
import StaffSection from './reports/sections/StaffSection';
import ReceivablesSection from './reports/sections/ReceivablesSection';
import OrdersSection from './reports/sections/OrdersSection';
import LossSection from './reports/sections/LossSection';
import AuditSection from './reports/sections/AuditSection';
import OrderDetailModal from './reports/OrderDetailModal';
import ZReportModal from './reports/ZReportModal';
import CustomerReceiptPrintModal from './reports/CustomerReceiptPrintModal';

const AUDIT_LIMIT = 500;

// Rapor bölümleri; yetkiler sunucuda da ayrıca uygulanır
const SECTIONS = [
  { group: 'Analiz', id: 'overview', label: 'Genel Bakış', Icon: LayoutDashboard, perms: ['reports.view'] },
  { group: 'Analiz', id: 'sales', label: 'Satış Analizi', Icon: LineChart, perms: ['reports.view'] },
  { group: 'Analiz', id: 'products', label: 'Ürünler & Menü', Icon: Package, perms: ['reports.view'], endpoint: 'products' },
  { group: 'Analiz', id: 'tables', label: 'Masalar', Icon: LayoutGrid, perms: ['reports.view'], endpoint: 'tables' },
  { group: 'Finans', id: 'payments', label: 'Ödemeler & Kasa', Icon: Wallet, perms: ['reports.view'] },
  { group: 'Finans', id: 'receivables', label: 'Cari Hesaplar', Icon: NotebookPen, perms: ['reports.view', 'customers.view'], endpoint: 'receivables' },
  { group: 'Ekip', id: 'staff', label: 'Personel', Icon: Users, perms: ['reports.staff'], endpoint: 'staff' },
  { group: 'Denetim', id: 'orders', label: 'Adisyonlar', Icon: Receipt, perms: ['reports.receipts'], endpoint: 'orders' },
  { group: 'Denetim', id: 'loss', label: 'Kayıp & İkram', Icon: Gift, perms: ['reports.treats'], endpoint: 'adjustments' },
  { group: 'Denetim', id: 'audit', label: 'İşlem Günlüğü', Icon: History, perms: ['reports.audit'], endpoint: 'audit-logs', query: `limit=${AUDIT_LIMIT}` }
];
const SUMMARY_SECTIONS = ['overview', 'sales', 'payments', 'loss'];

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* depolama kapalı olabilir */ } }
};

function SectionState({ state, children }) {
  if (state.error) return <div className="rh-state error"><AlertCircle size={18} /> {state.error}</div>;
  if (!state.data) return <div className="rh-state">{state.loading ? <><span className="rh-spinner" /> Rapor hazırlanıyor...</> : 'Veri yok.'}</div>;
  return <div className={state.loading ? 'rh-refreshing' : ''}>{children}</div>;
}

export default function Reports() {
  const { user, can } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const canHistory = can('reports.history');
  const sections = SECTIONS.filter(s => s.perms.every(p => can(p)));
  const canSee = Object.fromEntries(sections.map(s => [s.id, true]));

  const [active, setActive] = useState(() => {
    const saved = store.get('reports.section', 'overview');
    return sections.some(s => s.id === saved) ? saved : (sections[0]?.id || 'overview');
  });
  // Kasa defterinden "Z-Raporu" ile gelindiğinde (?gun=YYYY-MM-DD&z=1) o gün seçili açılır
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedDay = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('gun') || '') ? searchParams.get('gun') : null;
  const [preset, setPreset] = useState(linkedDay ? 'custom' : 'today');
  const [custom, setCustom] = useState(linkedDay ? { start: linkedDay, end: linkedDay } : { start: '', end: '' });
  const navigate = useNavigate();
  const [compareMode, setCompareMode] = useState(() => store.get('reports.compare', 'previous'));
  const [refreshKey, setRefreshKey] = useState(0);
  const period = useMemo(
    () => applyCompare(resolvePeriod(preset, custom), canHistory ? compareMode : 'none'),
    [preset, custom.start, custom.end, compareMode, canHistory]
  );
  const multiDay = period.startDate !== period.endDate;

  useEffect(() => { store.set('reports.section', active); }, [active]);

  // Mobilde yatay kayan bölüm menüsünde seçili bölümü ortala
  const navRef = useRef(null);
  useEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector('.rh-nav-item.active');
    if (nav && item && nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: item.offsetLeft - (nav.clientWidth - item.offsetWidth) / 2, behavior: 'smooth' });
    }
  }, [active]);
  useEffect(() => { store.set('reports.compare', compareMode); }, [compareMode]);

  const [openOrderId, setOpenOrderId] = useState(null);
  const [printingReceipt, setPrintingReceipt] = useState(null);
  const [isZReportOpen, setIsZReportOpen] = useState(() => Boolean(linkedDay) && searchParams.get('z') === '1');
  // Bağlantı parametreleri bir kez kullanılır; sonra adres temizlenir (yenileyince normal açılış)
  useEffect(() => { if (linkedDay) setSearchParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Özet; Genel Bakış, Satış, Ödemeler, Kayıp bölümleri ve Z-raporu tarafından paylaşılır
  const summary = useReportData('sales-summary', period, refreshKey, can('reports.view') && (SUMMARY_SECTIONS.includes(active) || isZReportOpen));
  const current = sections.find(s => s.id === active);
  const detail = useReportData(current?.endpoint || 'none', period, refreshKey, Boolean(current?.endpoint), current?.query || '');
  const state = SUMMARY_SECTIONS.includes(active) && active !== 'loss' ? summary : detail;

  const compareLabel = summary.data?.comparison ? period.compareLabel : null;
  const groups = [...new Set(sections.map(s => s.group))];
  const sectionProps = { compareLabel: period.compareLabel, fileLabel: period.fileLabel };

  const renderSection = () => {
    if (!state.data) return null;
    switch (active) {
      case 'overview': return <OverviewSection data={summary.data} compareLabel={compareLabel} onNavigate={setActive} canSee={canSee} />;
      case 'sales': return <SalesSection data={summary.data} {...sectionProps} compareLabel={compareLabel} />;
      case 'products': return <ProductsSection data={detail.data} {...sectionProps} />;
      case 'tables': return <TablesSection data={detail.data} {...sectionProps} />;
      case 'payments': return <PaymentsSection data={summary.data} compareLabel={compareLabel} onZReport={can('reports.z_report') ? () => setIsZReportOpen(true) : null} />;
      case 'receivables': return <ReceivablesSection data={detail.data} {...sectionProps} />;
      case 'staff': return <StaffSection data={detail.data} {...sectionProps} />;
      case 'orders': return <OrdersSection data={detail.data} {...sectionProps} multiDay={multiDay} onOpenOrder={setOpenOrderId} />;
      case 'loss': return <LossSection data={detail.data} sales={summary.data?.sales} {...sectionProps} multiDay={multiDay} />;
      case 'audit': return <AuditSection data={detail.data} {...sectionProps} limit={AUDIT_LIMIT} />;
      default: return null;
    }
  };

  return (
    <div className="pos-page-container">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        title="Raporlar"
        actions={
          <div className="rep-nav-actions-wrap">
            {can('reports.z_report') && can('reports.view') && (
              <button type="button" onClick={() => setIsZReportOpen(true)} className="pos-edit-btn rep-nav-action-btn print" disabled={period.incomplete} title="Seçili dönemin Z-raporunu yazdır">
                <Printer size={15} />
                <span className="rep-nav-btn-text">Z-Raporu</span>
              </button>
            )}
            <button type="button" onClick={() => setRefreshKey(k => k + 1)} className="pos-edit-btn rep-nav-action-btn refresh" title="Verileri yenile">
              <RefreshCw size={15} className={state.loading ? 'cat-spin' : ''} />
              <span className="rep-nav-btn-text">Yenile</span>
            </button>
          </div>
        }
      />

      {sections.length === 0 ? (
        <div className="rh-page"><div className="rh-state"><Lock size={18} /> Rapor görme yetkiniz yok.</div></div>
      ) : (
        <div className="rh-page">
          <nav className="rh-nav" aria-label="Rapor bölümleri" ref={navRef}>
            {groups.map(g => (
              <div key={g} className="rh-nav-group">
                <span className="rh-nav-title">{g}</span>
                {sections.filter(s => s.group === g).map(({ id, label, Icon }) => (
                  <button key={id} type="button" className={`rh-nav-item ${active === id ? 'active' : ''}`} onClick={() => setActive(id)} aria-current={active === id ? 'page' : undefined}>
                    <Icon size={17} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <main className="rh-main">
            <div className="rh-periodbar">
              <div className="rh-presets" role="group" aria-label="Rapor dönemi">
                {PERIOD_PRESETS.map(p => {
                  const locked = p.id !== 'today' && !canHistory;
                  return (
                    <button key={p.id} type="button" className={preset === p.id ? 'active' : ''} onClick={() => !locked && setPreset(p.id)} disabled={locked}
                      title={locked ? 'Geçmiş dönem raporlarını görme yetkiniz yok' : undefined}>
                      {locked && <Lock size={11} />}{p.label}
                    </button>
                  );
                })}
              </div>
              {preset === 'custom' && (
                <div className="rh-dates">
                  <input type="date" value={custom.start} max={toYMD(new Date())} onChange={(e) => setCustom(c => ({ ...c, start: e.target.value }))} aria-label="Başlangıç tarihi" />
                  <span>–</span>
                  <input type="date" value={custom.end} max={toYMD(new Date())} onChange={(e) => setCustom(c => ({ ...c, end: e.target.value }))} aria-label="Bitiş tarihi" />
                </div>
              )}
              <div className="rh-period-info">
                <span className="rh-period-label"><CalendarDays size={15} /> {period.label}</span>
                {canHistory && (
                  <label className="rh-compare">
                    <GitCompare size={14} />
                    <span>Karşılaştır:</span>
                    <select value={compareMode} onChange={(e) => setCompareMode(e.target.value)}>
                      {COMPARE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </div>

            {period.incomplete ? (
              <div className="rh-state"><CalendarDays size={18} /> Raporu görmek için başlangıç ve bitiş tarihini seçin.</div>
            ) : (
              <SectionState state={state}>{renderSection()}</SectionState>
            )}
          </main>
        </div>
      )}

      {openOrderId && (
        <OrderDetailModal orderId={openOrderId} onClose={() => setOpenOrderId(null)} canPrint={can('payment.print')} onPrint={setPrintingReceipt} />
      )}

      {isZReportOpen && summary.data && (
        <ZReportModal
          data={summary.data}
          periodLabel={period.label}
          user={user}
          onClose={() => setIsZReportOpen(false)}
          onOpenCashBook={can('cashbook.view') && !multiDay ? () => navigate(`/kasa-defteri?gun=${period.startDate}`) : null}
        />
      )}

      <CustomerReceiptPrintModal printingReceipt={printingReceipt} setPrintingReceipt={setPrintingReceipt} />
    </div>
  );
}
