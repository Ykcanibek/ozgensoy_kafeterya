import React, { useState } from 'react';
import { money, num, downloadCsv } from '../reportUtils';
import { Card, SectionHead, Segmented, ExportButton, Note, Empty, Delta } from '../ui';
import { Heatmap, ColumnChart, DAYS, DAYS_LONG } from '../charts';

const VIEW = [{ id: 'chart', label: 'Grafik' }, { id: 'table', label: 'Tablo' }];

// Satış analizi: zaman dilimi kırılımı, gün × saat yoğunluğu, haftanın günleri ve saatler
export default function SalesSection({ data, compareLabel, fileLabel }) {
  const [view, setView] = useState('chart');
  const { trend, trend_previous: prevPoints, distribution, sales, period } = data;
  const pad = (h) => String(h).padStart(2, '0');

  // Saat grafiğinde yalnızca işlem olan saat aralığı (en az 08–23) gösterilir
  const active = distribution.hours.filter(h => h.orders > 0).map(h => h.hour);
  const from = Math.min(8, ...active), to = Math.max(23, ...active);
  const hours = distribution.hours.filter(h => h.hour >= from && h.hour <= to).map(h => ({ ...h, label: pad(h.hour) }));
  const weekdays = distribution.weekdays.map(d => ({ ...d, label: DAYS[d.day], long: DAYS_LONG[d.day] }));
  const granularityLabel = { hour: 'Saat', day: 'Gün', month: 'Ay' }[trend.granularity];

  const rows = trend.points.map((p, i) => ({
    ...p,
    avg: p.orders ? p.net / p.orders : 0,
    prev: prevPoints?.[i]
  }));

  const exportCsv = () => downloadCsv(`satis-kirilimi-${fileLabel}`, [
    { label: granularityLabel, value: r => r.label },
    { label: 'Adisyon', value: r => r.orders },
    { label: 'Net ciro (TL)', value: r => r.net },
    { label: 'Ortalama adisyon (TL)', value: r => Math.round(r.avg * 100) / 100 },
    ...(prevPoints ? [{ label: `${compareLabel} (TL)`, value: r => r.prev?.net ?? '' }] : [])
  ], rows);

  return (
    <div className="rh-section">
      <SectionHead title="Satış Analizi" description="Satışların zamana dağılımı: hangi gün ve saatlerde yoğunsunuz?" />

      <Card title="Yoğunluk haritası" subtitle="Haftanın günü × saat — net ciro (kapanış saatine göre)">
        {sales.order_count ? <Heatmap matrix={distribution.heatmap} hourFrom={from} hourTo={to} /> : <Empty />}
        {period.days < 7 && sales.order_count > 0 && <Note>Dönem bir haftadan kısa; harita daha uzun dönemlerde (ör. Bu Ay) daha anlamlı olur.</Note>}
      </Card>

      <div className="rh-grid-2">
        <Card title="Saatlere göre" subtitle="Net ciro">
          <ColumnChart data={hours} />
        </Card>
        <Card title="Haftanın günlerine göre" subtitle="Net ciro">
          <ColumnChart data={weekdays} />
        </Card>
      </div>

      <Card
        title={`${granularityLabel} bazında döküm`}
        subtitle={`${num(rows.length)} satır${prevPoints ? ` · ${compareLabel} ile karşılaştırmalı` : ''}`}
        actions={<><Segmented options={VIEW} value={view} onChange={setView} label="Görünüm" /><ExportButton onClick={exportCsv} disabled={!rows.length} /></>}
        flush
      >
        {view === 'chart' ? (
          <div className="rh-pad"><ColumnChart data={rows} highlightMax height={220} /></div>
        ) : (
          <div className="rh-table-wrap">
            <table className="rh-table">
              <thead>
                <tr>
                  <th>{granularityLabel}</th>
                  <th className="num">Adisyon</th>
                  <th className="num">Net ciro</th>
                  <th className="num">Ort. adisyon</th>
                  {prevPoints && <th className="num">{compareLabel}</th>}
                  {prevPoints && <th className="num">Değişim</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} className={r.orders ? '' : 'dim'}>
                    <td className="strong">{r.label}</td>
                    <td className="num">{num(r.orders)}</td>
                    <td className="num strong">{money(r.net)}</td>
                    <td className="num">{r.orders ? money(r.avg) : '—'}</td>
                    {prevPoints && <td className="num muted">{r.prev ? money(r.prev.net) : '—'}</td>}
                    {prevPoints && <td className="num">{r.prev ? <Delta current={r.net} previous={r.prev.net} /> : '—'}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Toplam</td>
                  <td className="num">{num(sales.order_count)}</td>
                  <td className="num">{money(sales.revenue)}</td>
                  <td className="num">{money(sales.average_ticket)}</td>
                  {prevPoints && <td className="num">{money(prevPoints.reduce((s, p) => s + p.net, 0))}</td>}
                  {prevPoints && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
