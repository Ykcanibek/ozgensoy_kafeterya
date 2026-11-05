import React, { useMemo, useState } from 'react';
import { LayoutGrid, Trophy, Clock, Receipt } from 'lucide-react';
import { money, num, pct, formatDuration, downloadCsv } from '../reportUtils';
import { Card, SectionHead, Kpi, ExportButton, Empty, Note, SortTh, sortRows } from '../ui';
import { BarRow } from '../charts';

// Masa performansı: hangi masa ne kadar kazandırıyor, ne kadar dolu, ne kadar süre kalınıyor
export default function TablesSection({ data, fileLabel }) {
  const [sort, setSort] = useState({ key: 'net', dir: 'desc' });
  const { tables = [], totals } = data;
  const used = tables.filter(t => t.orders > 0);
  const unused = tables.filter(t => t.orders === 0 && t.is_active);
  const rows = useMemo(() => sortRows(used, sort), [used, sort]);
  const best = used[0];
  const withDuration = used.filter(t => t.avg_duration_min > 0);
  const avgDuration = withDuration.length ? Math.round(withDuration.reduce((s, t) => s + t.avg_duration_min * t.orders, 0) / withDuration.reduce((s, t) => s + t.orders, 0)) : 0;
  const max = used[0]?.net || 0;

  const exportCsv = () => downloadCsv(`masa-performansi-${fileLabel}`, [
    { label: 'Masa', value: r => r.title },
    { label: 'Adisyon', value: r => r.orders },
    { label: 'Net ciro (TL)', value: r => r.net },
    { label: 'Pay (%)', value: r => r.share },
    { label: 'Ortalama adisyon (TL)', value: r => r.average_ticket },
    { label: 'Ürün / adisyon', value: r => r.items_per_ticket },
    { label: 'Ortalama süre (dk)', value: r => r.avg_duration_min },
    { label: 'İkram+iade+iptal (TL)', value: r => r.loss }
  ], rows);

  return (
    <div className="rh-section">
      <SectionHead title="Masalar" description="Masaların doluluk, ciro ve oturma süresi performansı." />

      <div className="rh-kpi-row">
        <Kpi Icon={LayoutGrid} label="Kullanılan masa" value={`${num(totals.used_tables)} / ${num(totals.total_tables)}`} sub={totals.total_tables ? `Masaların ${pct((totals.used_tables / totals.total_tables) * 100, 0)}'i` : ''} />
        <Kpi Icon={Receipt} label="Masa başına adisyon" value={totals.used_tables ? (totals.orders / totals.used_tables).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '0'} sub={`${num(totals.orders)} adisyon`} hint="Dönem içinde bir masanın ortalama kaç kez kullanıldığı (devir hızı)" />
        <Kpi Icon={Trophy} label="En çok kazandıran" value={best ? best.title : '—'} sub={best ? `${money(best.net)} · ${pct(best.share, 0)}` : ''} />
        <Kpi Icon={Clock} label="Ort. oturma süresi" value={formatDuration(avgDuration)} />
      </div>

      {used.length === 0 ? <Card><Empty>Bu dönemde masada kapanan adisyon yok.</Empty></Card> : (
        <div className="rh-grid-1-2">
          <Card title="Ciro sıralaması" subtitle="Net ciro">
            <div className="rh-scroll">
              {used.map((t, i) => <BarRow key={t.table_id} label={<><b className="rh-rank">{i + 1}</b>{t.title}</>} value={t.net} max={max} extra={`${num(t.orders)} ad.`} />)}
            </div>
          </Card>
          <Card title="Masa ayrıntıları" actions={<ExportButton onClick={exportCsv} />} flush>
            <div className="rh-table-wrap">
              <table className="rh-table">
                <thead>
                  <tr>
                    <SortTh id="title" sort={sort} setSort={setSort}>Masa</SortTh>
                    <SortTh id="orders" sort={sort} setSort={setSort} num>Adisyon</SortTh>
                    <SortTh id="net" sort={sort} setSort={setSort} num>Net ciro</SortTh>
                    <SortTh id="average_ticket" sort={sort} setSort={setSort} num>Ort. adisyon</SortTh>
                    <SortTh id="items_per_ticket" sort={sort} setSort={setSort} num>Ürün/adisyon</SortTh>
                    <SortTh id="avg_duration_min" sort={sort} setSort={setSort} num>Ort. süre</SortTh>
                    <SortTh id="loss" sort={sort} setSort={setSort} num title="İkram + iade + iptal">Kayıp</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.table_id}>
                      <td><span className="strong">{t.title}</span>{!t.is_active && <span className="rh-sub">Pasif masa</span>}</td>
                      <td className="num">{num(t.orders)}</td>
                      <td className="num strong">{money(t.net)}<span className="rh-sub">{pct(t.share)}</span></td>
                      <td className="num">{money(t.average_ticket)}</td>
                      <td className="num">{t.items_per_ticket.toLocaleString('tr-TR')}</td>
                      <td className="num">{formatDuration(t.avg_duration_min)}</td>
                      <td className="num">{t.loss ? money(t.loss) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {unused.length > 0 && used.length > 0 && (
        <Card title="Bu dönem kullanılmayan masalar" subtitle={`${num(unused.length)} masa`}>
          <ul className="rh-chiplist">{unused.map(t => <li key={t.table_id}>{t.title}</li>)}</ul>
          <Note>Sürekli boş kalan masalar yerleşim düzeninin gözden geçirilmesi gerektiğini gösterebilir.</Note>
        </Card>
      )}
    </div>
  );
}
