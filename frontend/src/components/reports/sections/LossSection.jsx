import React, { useMemo, useState } from 'react';
import { Gift, RotateCcw, Ban, Percent, Eraser, PackageX, X } from 'lucide-react';
import { money, num, pct, formatDateTime, formatTime, downloadCsv } from '../reportUtils';
import { Card, SectionHead, SearchBox, ExportButton, Empty, Note } from '../ui';
import { BarRow } from '../charts';

const TYPES = {
  complimentary: { label: 'İkram', Icon: Gift },
  returned: { label: 'İade', Icon: RotateCcw },
  voided: { label: 'İptal', Icon: Ban },
  discount: { label: 'İndirim', Icon: Percent },
  debt_reset: { label: 'Borç silme', Icon: Eraser },
  waste: { label: 'Fire / Zayi', Icon: PackageX }
};

// Kayıp & ikram: ikram, iade, iptal, indirim, borç silme ve fire/zayi kontrolü
// (Fire/zayi tutarı satış değil maliyet üzerindendir; bu yüzden brüt satışa oranlanmaz)
export default function LossSection({ data, sales, fileLabel, multiDay }) {
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const events = data.events || [];
  const summary = data.summary || {};
  const totalAmount = Object.values(summary).reduce((s, x) => s + (x?.amount || 0), 0);

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return events.filter(e =>
      (type === 'all' || e.type === type) &&
      (!q || [e.title, e.details, e.user_name, e.table_title].some(v => v && v.toLocaleLowerCase('tr-TR').includes(q)))
    );
  }, [events, type, search]);

  // Personele göre toplamlar (seçili türe göre)
  const byUser = useMemo(() => {
    const m = new Map();
    for (const e of rows) {
      const k = e.user_name || 'Belirtilmemiş';
      const x = m.get(k) || { name: k, amount: 0, count: 0 };
      x.amount += e.amount; x.count += 1;
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const exportCsv = () => downloadCsv(`kayip-ikram-${fileLabel}`, [
    { label: 'Zaman', value: e => formatDateTime(e.created_at) },
    { label: 'Tür', value: e => TYPES[e.type]?.label },
    { label: 'İşlem', value: e => e.title },
    { label: 'Masa', value: e => e.table_title },
    { label: 'Adet', value: e => e.quantity || '' },
    { label: 'Tutar (TL)', value: e => e.amount },
    { label: 'Personel', value: e => e.user_name },
    { label: 'Ayrıntı', value: e => e.details }
  ], rows);

  const base = sales ? sales.gross + sales.voided : 0;

  return (
    <div className="rh-section">
      <SectionHead title="Kayıp & İkram" description="Satıştan düşen her kuruşun kaydı: kim, ne zaman, hangi masada?" />

      <div className="rh-loss-grid">
        {Object.entries(TYPES).map(([key, { label, Icon }]) => (
          <button key={key} type="button" className={`rh-loss-card t-${key} ${type === key ? 'active' : ''}`}
            onClick={() => setType(prev => (prev === key ? 'all' : key))} aria-pressed={type === key}>
            <span className="rh-loss-icon"><Icon size={16} /></span>
            <span className="rh-loss-label">{label}</span>
            <strong>{key === 'waste' && !data.waste_cost_visible ? '—' : money(summary[key]?.amount)}</strong>
            <em>
              {num(summary[key]?.count)} kayıt{summary[key]?.quantity ? ` · ${num(summary[key].quantity)} adet` : ''}
              {base > 0 && key !== 'debt_reset' && key !== 'waste' && summary[key]?.amount ? ` · %${((summary[key].amount / base) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : ''}
            </em>
          </button>
        ))}
      </div>
      {base > 0 && <Note>Yüzdeler brüt satışa (iptaller dahil) oranlanmıştır. Sektörde ikram + iade + iptal toplamının {pct(3, 0)}’ün altında kalması hedeflenir.</Note>}

      {events.length === 0 ? <Card><Empty>Bu dönemde ikram, iade, iptal, indirim veya borç silme yok.</Empty></Card> : (
        <div className="rh-grid-1-2">
          <Card title="Personele göre" subtitle={type === 'all' ? 'Tüm türler' : TYPES[type].label}>
            {byUser.length ? byUser.map(u => <BarRow key={u.name} label={u.name} sub={`${num(u.count)} kayıt`} value={u.amount} max={byUser[0].amount} />) : <Empty>Kayıt yok.</Empty>}
            <p className="rh-footnote">Toplam {money(totalAmount)}</p>
          </Card>

          <Card
            title="Kayıtlar"
            subtitle={`${num(rows.length)} kayıt`}
            actions={<>
              {type !== 'all' && <button type="button" className="rh-tag" onClick={() => setType('all')}>{TYPES[type].label} <X size={12} /></button>}
              <SearchBox value={search} onChange={setSearch} placeholder="Ürün, masa, personel" />
              <ExportButton onClick={exportCsv} disabled={!rows.length} />
            </>}
            flush
          >
            <div className="rh-table-wrap tall">
              <table className="rh-table stack">
                <thead><tr><th>Zaman</th><th>Tür</th><th>İşlem</th><th>Masa</th><th className="num">Tutar</th><th>Personel</th></tr></thead>
                <tbody>
                  {rows.map(e => {
                    const T = TYPES[e.type];
                    return (
                      <tr key={e.id}>
                        <td className="muted nowrap" data-label="Zaman">{multiDay ? formatDateTime(e.created_at) : formatTime(e.created_at)}</td>
                        <td data-label="Tür"><span className={`rh-type t-${e.type}`}><T.Icon size={11} /> {T.label}</span></td>
                        <td className="m-span" data-label="İşlem"><span className="strong">{e.title}</span>{e.details && <span className="rh-sub">{e.details}</span>}</td>
                        <td className="muted" data-label="Masa">{e.table_title || '—'}</td>
                        <td className="num strong m-hero" data-label="Tutar">{money(e.amount)}</td>
                        <td className="muted" data-label="Personel">{e.user_name || '—'}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={6} className="rh-empty-cell">Filtreye uyan kayıt yok.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
