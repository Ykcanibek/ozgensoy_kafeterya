import React, { useMemo, useState } from 'react';
import { Users, NotebookPen, HandCoins, Eraser, AlertTriangle } from 'lucide-react';
import { money, num, formatDateTime, downloadCsv } from '../reportUtils';
import { Card, SectionHead, Kpi, SearchBox, ExportButton, Empty, Note, SortTh, sortRows } from '../ui';
import { StackedShare, COLORS } from '../charts';

// Yaşlandırma sıralı bir ölçektir: aynı tonun açıktan koyuya üç adımı (eski borç = koyu)
const AGING_COLORS = [COLORS.ramp[1], COLORS.ramp[3], COLORS.ramp[5]];

// Cari hesaplar: açık veresiye alacakları, yaşlandırma ve dönem hareketi
export default function ReceivablesSection({ data, fileLabel }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'balance', dir: 'desc' });
  const { outstanding, period, customers = [] } = data;

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return sortRows(customers.filter(c => !q || [c.name, c.phone].some(v => v && v.toLocaleLowerCase('tr-TR').includes(q))), sort);
  }, [customers, search, sort]);

  const exportCsv = () => downloadCsv(`cari-hesaplar-${fileLabel}`, [
    { label: 'Müşteri', value: r => r.name },
    { label: 'Telefon', value: r => r.phone },
    { label: 'Bakiye (TL)', value: r => r.balance },
    { label: 'Toplam borç (TL)', value: r => r.total_debt },
    { label: 'Toplam ödeme (TL)', value: r => r.total_paid },
    { label: 'Son borç', value: r => formatDateTime(r.last_debt_at) },
    { label: 'Son ödeme', value: r => formatDateTime(r.last_payment_at) },
    { label: 'Ödemesiz gün', value: r => r.days_since_payment }
  ], rows);

  return (
    <div className="rh-section">
      <SectionHead title="Cari Hesaplar" description="Veresiye alacaklarınız: kim ne kadar borçlu, ne zamandır ödemiyor?" />

      <div className="rh-kpi-row">
        <Kpi Icon={Users} label="Açık alacak (bugün)" value={money(outstanding.total)} sub={`${num(outstanding.customer_count)} müşteri`} tone={outstanding.aging.d31_plus > 0 ? 'warn' : undefined} />
        <Kpi Icon={NotebookPen} label="Dönemde yazılan veresiye" value={money(period.written)} sub={`${num(period.debtor_count)} müşteri`} />
        <Kpi Icon={HandCoins} label="Dönemde tahsil edilen" value={money(period.collected)} />
        <Kpi Icon={Eraser} label="Silinen borç" value={money(period.written_off)} hint="Dönemde sıfırlanan (tahsil edilmeden silinen) borçlar" tone={period.written_off > 0 ? 'warn' : undefined} />
      </div>

      <Card title="Alacak yaşlandırma" subtitle="Son ödemeden bu yana geçen süreye göre açık bakiye">
        <StackedShare colors={AGING_COLORS} items={[
          { label: '0–7 gün', value: outstanding.aging.d0_7 },
          { label: '8–30 gün', value: outstanding.aging.d8_30 },
          { label: '30 günden eski', value: outstanding.aging.d31_plus }
        ]} />
        {outstanding.aging.d31_plus > 0 && <Note>30 günden uzun süredir ödeme yapmayan müşterilerle iletişime geçmeniz önerilir.</Note>}
      </Card>

      <Card
        title="Borçlu müşteriler"
        subtitle={`${num(rows.length)} müşteri · güncel bakiye (dönemden bağımsız)`}
        actions={<><SearchBox value={search} onChange={setSearch} placeholder="Müşteri veya telefon" /><ExportButton onClick={exportCsv} disabled={!rows.length} /></>}
        flush
      >
        {customers.length === 0 ? <div className="rh-pad"><Empty>Açık veresiye borcu olan müşteri yok.</Empty></div> : (
          <div className="rh-table-wrap">
            <table className="rh-table stack">
              <thead>
                <tr>
                  <SortTh id="name" sort={sort} setSort={setSort}>Müşteri</SortTh>
                  <SortTh id="balance" sort={sort} setSort={setSort} num>Bakiye</SortTh>
                  <SortTh id="total_debt" sort={sort} setSort={setSort} num>Toplam borç</SortTh>
                  <SortTh id="total_paid" sort={sort} setSort={setSort} num>Toplam ödeme</SortTh>
                  <SortTh id="last_debt_at" sort={sort} setSort={setSort}>Son borç</SortTh>
                  <SortTh id="last_payment_at" sort={sort} setSort={setSort}>Son ödeme</SortTh>
                  <SortTh id="days_since_payment" sort={sort} setSort={setSort} num>Ödemesiz</SortTh>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id}>
                    <td data-label="Müşteri"><span className="strong">{c.name}</span>{c.phone && <span className="rh-sub">{c.phone}</span>}</td>
                    <td className="num strong m-hero" data-label="Bakiye">{money(c.balance)}</td>
                    <td className="num" data-label="Toplam borç">{money(c.total_debt)}</td>
                    <td className="num" data-label="Toplam ödeme">{money(c.total_paid)}</td>
                    <td className="muted" data-label="Son borç">{formatDateTime(c.last_debt_at)}</td>
                    <td className="muted" data-label="Son ödeme">{c.last_payment_at ? formatDateTime(c.last_payment_at) : 'Hiç ödeme yok'}</td>
                    <td className="num" data-label="Ödemesiz">
                      <span className={`rh-pill ${c.days_since_payment > 30 ? 'bad' : c.days_since_payment > 7 ? 'warn' : 'ok'}`}>
                        {c.days_since_payment > 30 && <AlertTriangle size={11} />} {num(c.days_since_payment)} gün
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Toplam</td><td className="num">{money(rows.reduce((s, r) => s + r.balance, 0))}</td><td colSpan={5} /></tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
