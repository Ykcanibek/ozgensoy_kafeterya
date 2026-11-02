import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Receipt, TrendingUp, Clock, ShoppingBasket } from 'lucide-react';
import { money, num, formatTime, formatDateTime, formatDuration, downloadCsv, PAYMENT_LABELS } from '../reportUtils';
import { Card, SectionHead, Kpi, SearchBox, ExportButton, Segmented, SortTh, sortRows } from '../ui';

// Kapanan adisyonlar: arama, ödeme türüne göre filtre, detaya tıklama
export default function OrdersSection({ data, fileLabel, multiDay, onOpenOrder }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'closed_at', dir: 'desc' });
  const orders = useMemo(() => (data.orders || []).map(o => ({ ...o, deductions: o.complimentary + o.returned + o.discount })), [data.orders]);
  const t = data.totals;

  const count = (fn) => orders.filter(fn).length;
  const FILTERS = [
    { id: 'all', label: 'Tümü', count: orders.length },
    { id: 'cash', label: 'Nakit', count: count(o => o.payment_types.includes('cash')) },
    { id: 'credit_card', label: 'Kart', count: count(o => o.payment_types.includes('credit_card')) },
    { id: 'veresiye', label: 'Veresiye', count: count(o => o.payment_types.includes('veresiye')) },
    { id: 'multi', label: 'Bölünmüş', count: count(o => o.payment_count > 1) },
    { id: 'deduction', label: 'İndirim/ikramlı', count: count(o => o.deductions > 0) },
    { id: 'unpaid', label: 'Tahsilsiz', count: count(o => o.unpaid_closed > 0) }
  ].filter(f => f.id === 'all' || f.count > 0);

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return sortRows(orders.filter(o => {
      if (filter === 'multi' && o.payment_count < 2) return false;
      if (filter === 'unpaid' && !(o.unpaid_closed > 0)) return false;
      if (filter === 'deduction' && !(o.deductions > 0)) return false;
      if (['cash', 'credit_card', 'veresiye'].includes(filter) && !o.payment_types.includes(filter)) return false;
      if (!q) return true;
      return [o.table_title, o.customers, o.closed_by, o.opened_by, String(o.id)].some(v => v && String(v).toLocaleLowerCase('tr-TR').includes(q));
    }), sort);
  }, [orders, search, filter, sort]);

  const total = (key) => rows.reduce((s, o) => s + (o[key] || 0), 0);

  const exportCsv = () => downloadCsv(`adisyonlar-${fileLabel}`, [
    { label: 'Adisyon No', value: o => o.id },
    { label: 'Masa', value: o => o.table_title },
    { label: 'Açılış', value: o => formatDateTime(o.opened_at) },
    { label: 'Kapanış', value: o => formatDateTime(o.closed_at) },
    { label: 'Süre (dk)', value: o => o.duration_minutes },
    { label: 'Ürün Adedi', value: o => o.item_qty },
    { label: 'Brüt (TL)', value: o => o.gross },
    { label: 'İkram (TL)', value: o => o.complimentary },
    { label: 'İade (TL)', value: o => o.returned },
    { label: 'İndirim (TL)', value: o => o.discount },
    { label: 'Net (TL)', value: o => o.net },
    { label: 'Nakit (TL)', value: o => o.cash },
    { label: 'Kart (TL)', value: o => o.card },
    { label: 'Veresiye (TL)', value: o => o.veresiye },
    { label: 'Bahşiş (TL)', value: o => o.tip },
    { label: 'Tahsilsiz Kapatılan (TL)', value: o => o.unpaid_closed },
    { label: 'Müşteri', value: o => o.customers },
    { label: 'Açan', value: o => o.opened_by },
    { label: 'Kapatan', value: o => o.closed_by }
  ], rows);

  return (
    <div className="rh-section">
      <SectionHead title="Adisyonlar" description="Dönemde kapanan tüm adisyonlar. Ayrıntı için satıra tıklayın." />

      <div className="rh-kpi-row">
        <Kpi Icon={Receipt} label="Kapanan adisyon" value={num(t.order_count)} />
        <Kpi Icon={TrendingUp} label="Ortalama adisyon" value={money(t.average_ticket)} />
        <Kpi Icon={ShoppingBasket} label="Ürün / adisyon" value={t.items_per_ticket.toLocaleString('tr-TR')} />
        <Kpi Icon={Clock} label="Ort. süre" value={formatDuration(t.avg_duration_min)} />
      </div>

      <Card
        title="Adisyon listesi"
        subtitle={`${num(rows.length)} adisyon · ${money(total('net'))}`}
        actions={<><SearchBox value={search} onChange={setSearch} placeholder="Masa, müşteri, personel, no" /><ExportButton onClick={exportCsv} disabled={!rows.length} /></>}
        flush
      >
        <div className="rh-pad-x"><Segmented options={FILTERS} value={filter} onChange={setFilter} label="Filtre" /></div>
        <div className="rh-table-wrap">
          <table className="rh-table clickable stack cols-3">
            <thead>
              <tr>
                <SortTh id="closed_at" sort={sort} setSort={setSort}>Kapanış</SortTh>
                <SortTh id="table_title" sort={sort} setSort={setSort}>Masa</SortTh>
                <SortTh id="item_qty" sort={sort} setSort={setSort} num>Ürün</SortTh>
                <SortTh id="gross" sort={sort} setSort={setSort} num>Brüt</SortTh>
                <SortTh id="deductions" sort={sort} setSort={setSort} num title="İkram + iade + indirim">Düşüm</SortTh>
                <SortTh id="net" sort={sort} setSort={setSort} num>Net</SortTh>
                <th>Ödeme</th>
                <SortTh id="closed_by" sort={sort} setSort={setSort}>Kapatan</SortTh>
                <SortTh id="duration_minutes" sort={sort} setSort={setSort} num>Süre</SortTh>
                <th aria-label="Detay" />
              </tr>
            </thead>
            <tbody>
              {rows.map(o => (
                <tr key={o.id} onClick={() => onOpenOrder(o.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpenOrder(o.id)}>
                  <td className="m-first" data-label="Kapanış"><span className="strong">{multiDay ? formatDateTime(o.closed_at) : formatTime(o.closed_at)}</span><span className="rh-sub">#{o.id}</span></td>
                  <td className="m-first" data-label="Masa"><span className="strong">{o.table_title || '—'}</span>{o.customers && <span className="rh-sub">{o.customers}</span>}</td>
                  <td className="num" data-label="Ürün">{num(o.item_qty)}</td>
                  <td className="num muted" data-label="Brüt">{money(o.gross)}</td>
                  <td className="num muted" data-label="Düşüm">{o.deductions ? `− ${money(o.deductions)}` : '—'}</td>
                  <td className="num strong m-hero" data-label="Net">{money(o.net)}</td>
                  <td className="m-span" data-label="Ödeme">
                    <div className="rh-badges">
                      {o.payment_types.map(pt => <span key={pt} className={`rh-pay ${pt}`}>{PAYMENT_LABELS[pt]}</span>)}
                      {o.payment_count > 1 && <span className="rh-pay multi">{o.payment_count} ödeme</span>}
                      {o.unpaid_closed > 0 && <span className="rh-pay unpaid" title="Ödemesi alınmadan kapatıldı"><AlertTriangle size={11} /> {money(o.unpaid_closed)} tahsilsiz</span>}
                    </div>
                  </td>
                  <td className="muted" data-label="Kapatan">{o.closed_by || o.opened_by || '—'}</td>
                  <td className="num muted" data-label="Süre">{formatDuration(o.duration_minutes)}</td>
                  <td className="rh-chevron"><ChevronRight size={16} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="rh-empty-cell">{orders.length ? 'Filtreye uyan adisyon yok.' : 'Bu dönemde kapanan adisyon yok.'}</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2}>Toplam ({num(rows.length)})</td>
                  <td className="num">{num(total('item_qty'))}</td>
                  <td className="num">{money(total('gross'))}</td>
                  <td className="num">− {money(total('deductions'))}</td>
                  <td className="num">{money(total('net'))}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}
