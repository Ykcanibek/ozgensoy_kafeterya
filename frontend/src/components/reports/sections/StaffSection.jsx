import React, { useMemo, useState } from 'react';
import { money, num, downloadCsv } from '../reportUtils';
import { Card, SectionHead, ExportButton, Empty, Note, Segmented } from '../ui';
import { BarRow } from '../charts';

const RANK_BY = [
  { id: 'drawer_total', label: 'Tahsilat' },
  { id: 'items_entered', label: 'Sipariş' },
  { id: 'loss', label: 'İkram·iade·iptal' }
];

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('tr-TR');

// Personel karnesi: tahsilat, sipariş/servis ve kayıp göstergeleri
export default function StaffSection({ data, fileLabel }) {
  const [rankBy, setRankBy] = useState('drawer_total');
  const staff = useMemo(() => (data.staff || []).map(r => ({ ...r, loss: r.comp_amount + r.returned_amount + r.voided_amount })), [data.staff]);
  const active = staff.filter(r => r.payment_count || r.orders_entered || r.items_entered || r.loss || r.delivered_qty);
  const ranked = [...active].sort((a, b) => b[rankBy] - a[rankBy]);
  const max = ranked[0]?.[rankBy] || 0;
  const sum = (key) => staff.reduce((s, r) => s + (r[key] || 0), 0);
  const fmt = rankBy === 'items_entered' ? (v) => `${num(v)} ürün` : money;

  const exportCsv = () => downloadCsv(`personel-karnesi-${fileLabel}`, [
    { label: 'Personel', value: r => r.name },
    { label: 'Rol', value: r => r.role_name },
    { label: 'Kasaya Giren (TL)', value: r => r.drawer_total },
    { label: 'Nakit (TL)', value: r => r.cash },
    { label: 'Kart (TL)', value: r => r.card },
    { label: 'Veresiye (TL)', value: r => r.veresiye },
    { label: 'Tahsilat Sayısı', value: r => r.payment_count },
    { label: 'İndirim (TL)', value: r => r.discount },
    { label: 'Bahşiş (TL)', value: r => r.tip },
    { label: 'Sipariş Girişi', value: r => r.orders_entered },
    { label: 'Girilen Ürün', value: r => r.items_entered },
    { label: 'Teslim Edilen', value: r => r.delivered_qty },
    { label: 'İkram (TL)', value: r => r.comp_amount },
    { label: 'İade (TL)', value: r => r.returned_amount },
    { label: 'İptal (TL)', value: r => r.voided_amount }
  ], staff);

  return (
    <div className="rh-section">
      <SectionHead title="Personel" description="Kim ne kadar tahsilat yaptı, kaç sipariş girdi, ne kadar ikram/iade/iptal işledi?" />

      {active.length === 0 ? <Card><Empty>Bu dönemde personel hareketi yok.</Empty></Card> : (
        <>
          <div className="rh-grid-1-2">
            <Card title="Sıralama" actions={<Segmented options={RANK_BY} value={rankBy} onChange={setRankBy} label="Sıralama ölçütü" />}>
              {ranked.map(r => (
                <BarRow key={r.user_id ?? 'other'} label={r.name} sub={r.role_name || ''} value={r[rankBy]} max={max} display={fmt(r[rankBy])} />
              ))}
            </Card>
            <div className="rh-staff-cards">
              {active.map(r => (
                <div key={r.user_id ?? 'other'} className="rh-staff-card">
                  <div className="rh-staff-head">
                    <span className="rh-avatar" style={{ background: r.role_color || '#64748b' }}>{r.is_other ? '?' : initials(r.name)}</span>
                    <div>
                      <strong>{r.name}</strong>
                      <span>{r.is_other ? 'Silinmiş / sistem hesapları' : `${r.role_name || 'Rol yok'}${r.is_active ? '' : ' · Pasif'}`}</span>
                    </div>
                  </div>
                  <dl>
                    <div><dt>Kasaya giren</dt><dd>{money(r.drawer_total)}</dd></div>
                    <div><dt>Tahsilat</dt><dd>{num(r.payment_count)}</dd></div>
                    <div><dt>Sipariş / ürün</dt><dd>{num(r.orders_entered)} / {num(r.items_entered)}</dd></div>
                    <div><dt>Teslim</dt><dd>{num(r.delivered_qty)}</dd></div>
                    <div className={r.loss ? 'warn' : ''}><dt>İkram·iade·iptal</dt><dd>{r.loss ? money(r.loss) : '—'}</dd></div>
                    <div><dt>İndirim</dt><dd>{r.discount ? money(r.discount) : '—'}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          </div>

          <Card title="Ayrıntılı karne" actions={<ExportButton onClick={exportCsv} />} flush>
            <div className="rh-table-wrap">
              <table className="rh-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>Personel</th>
                    <th colSpan={4} className="group">Tahsilat</th>
                    <th colSpan={3} className="group">Sipariş & servis</th>
                    <th colSpan={4} className="group">İkram · İade · İptal · İndirim</th>
                  </tr>
                  <tr>
                    <th className="num">Kasaya giren</th><th className="num">Nakit</th><th className="num">Kart</th><th className="num">Veresiye</th>
                    <th className="num" title="Masaya sipariş gönderme işlemi sayısı">Sipariş</th>
                    <th className="num" title="Sipariş girişlerindeki toplam ürün adedi">Ürün</th>
                    <th className="num" title="Teslim edildi olarak işaretlenen ürün adedi">Teslim</th>
                    <th className="num">İkram</th><th className="num">İade</th><th className="num">İptal</th><th className="num">İndirim</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map(r => (
                    <tr key={r.user_id ?? 'other'}>
                      <td><span className="strong">{r.name}</span><span className="rh-sub">{r.is_other ? 'Artık listede olmayan hesaplar' : r.role_name || 'Rol yok'}</span></td>
                      <td className="num strong">{money(r.drawer_total)}<span className="rh-sub">{num(r.payment_count)} tahsilat</span></td>
                      <td className="num">{money(r.cash)}</td>
                      <td className="num">{money(r.card)}</td>
                      <td className="num">{money(r.veresiye)}</td>
                      <td className="num">{num(r.orders_entered)}</td>
                      <td className="num">{num(r.items_entered)}</td>
                      <td className="num">{num(r.delivered_qty)}</td>
                      <td className="num">{r.comp_qty ? <>{num(r.comp_qty)}<span className="rh-sub">{money(r.comp_amount)}</span></> : '—'}</td>
                      <td className="num">{r.returned_qty ? <>{num(r.returned_qty)}<span className="rh-sub">{money(r.returned_amount)}</span></> : '—'}</td>
                      <td className="num">{r.voided_qty ? <>{num(r.voided_qty)}<span className="rh-sub">{money(r.voided_amount)}</span></> : '—'}</td>
                      <td className="num">{r.discount ? money(r.discount) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Toplam</td>
                    <td className="num">{money(sum('drawer_total'))}</td><td className="num">{money(sum('cash'))}</td><td className="num">{money(sum('card'))}</td><td className="num">{money(sum('veresiye'))}</td>
                    <td className="num">{num(sum('orders_entered'))}</td><td className="num">{num(sum('items_entered'))}</td><td className="num">{num(sum('delivered_qty'))}</td>
                    <td className="num">{num(sum('comp_qty'))}</td><td className="num">{num(sum('returned_qty'))}</td><td className="num">{num(sum('voided_qty'))}</td><td className="num">{money(sum('discount'))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="rh-pad-x rh-pad-b">
              <Note>Tahsilatlar ödemeyi alan, sipariş ve ikram/iade/iptal işlemleri işlemi yapan personele yazılır.</Note>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
