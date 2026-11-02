import React, { useMemo, useState } from 'react';
import { money, num, formatDateTime, downloadCsv } from '../reportUtils';
import { Card, SectionHead, SearchBox, ExportButton, Segmented, Empty } from '../ui';

const ENTITY_LABELS = {
  order: 'Sipariş',
  order_item: 'Sipariş kalemi',
  payment: 'Ödeme',
  table: 'Masa',
  product: 'Ürün',
  category: 'Kategori',
  customer: 'Müşteri',
  user: 'Personel',
  staff: 'Personel',
  role: 'Rol & yetki',
  settings: 'Ayarlar',
  waste: 'Fire & zayi',
  qr_order: 'QR sipariş',
  cash_book: 'Kasa defteri',
  cash_book_category: 'Kasa defteri kategorisi'
};
const entityLabel = (t) => ENTITY_LABELS[t] || t || 'Diğer';

// İşlem günlüğü: sistemdeki tüm kayıtlı hareketler (denetim izi)
export default function AuditSection({ data, fileLabel, limit }) {
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('all');
  const [user, setUser] = useState('all');
  const logs = data.logs || [];

  const entityOptions = useMemo(() => {
    const counts = new Map();
    logs.forEach(l => counts.set(l.entity_type, (counts.get(l.entity_type) || 0) + 1));
    return [{ id: 'all', label: 'Tümü', count: logs.length }, ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: entityLabel(id), count }))];
  }, [logs]);
  const users = useMemo(() => [...new Set(logs.map(l => l.user_name || 'Sistem'))].sort((a, b) => a.localeCompare(b, 'tr')), [logs]);

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return logs.filter(l =>
      (entity === 'all' || l.entity_type === entity) &&
      (user === 'all' || (l.user_name || 'Sistem') === user) &&
      (!q || [l.title, l.details, l.user_name, l.table_title].some(v => v && v.toLocaleLowerCase('tr-TR').includes(q)))
    );
  }, [logs, search, entity, user]);

  const exportCsv = () => downloadCsv(`islem-gunlugu-${fileLabel}`, [
    { label: 'Zaman', value: l => formatDateTime(l.created_at) },
    { label: 'Personel', value: l => l.user_name || 'Sistem' },
    { label: 'Alan', value: l => entityLabel(l.entity_type) },
    { label: 'Masa', value: l => l.table_title },
    { label: 'İşlem', value: l => l.title },
    { label: 'Ayrıntı', value: l => l.details },
    { label: 'Tutar (TL)', value: l => (Number(l.amount) > 0 ? Number(l.amount) : '') }
  ], rows);

  return (
    <div className="rh-section">
      <SectionHead title="İşlem Günlüğü" description="Sistemde yapılan her işlemin kaydı: kim, ne zaman, neyi değiştirdi?" />
      <Card
        title="Hareketler"
        subtitle={`${num(rows.length)} kayıt${logs.length >= limit ? ` · en yeni ${num(limit)} kayıt gösteriliyor` : ''}`}
        actions={<>
          <select className="rh-select" value={user} onChange={(e) => setUser(e.target.value)} aria-label="Personel">
            <option value="all">Tüm personel</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <SearchBox value={search} onChange={setSearch} placeholder="İşlem, masa, ürün ara" />
          <ExportButton onClick={exportCsv} disabled={!rows.length} />
        </>}
        flush
      >
        {logs.length === 0 ? <div className="rh-pad"><Empty>Bu dönemde kayıtlı işlem yok.</Empty></div> : (
          <>
            <div className="rh-pad-x"><Segmented options={entityOptions} value={entity} onChange={setEntity} label="Alan" /></div>
            <div className="rh-table-wrap tall">
              <table className="rh-table stack">
                <thead><tr><th>Zaman</th><th>Personel</th><th>Alan</th><th>İşlem</th><th className="num">Tutar</th></tr></thead>
                <tbody>
                  {rows.map(l => (
                    <tr key={l.id}>
                      <td className="muted nowrap" data-label="Zaman">{formatDateTime(l.created_at)}</td>
                      <td className="strong nowrap" data-label="Personel">{l.user_name || 'Sistem'}</td>
                      <td data-label="Alan"><span className="rh-type">{entityLabel(l.entity_type)}</span>{l.table_title && <span className="rh-sub">{l.table_title}</span>}</td>
                      <td className="wide m-span" data-label="İşlem"><span className="strong">{l.title}</span>{l.details && <span className="rh-sub">{l.details}</span>}</td>
                      <td className="num" data-label="Tutar">{Number(l.amount) > 0 ? money(l.amount) : '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={5} className="rh-empty-cell">Filtreye uyan kayıt yok.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
