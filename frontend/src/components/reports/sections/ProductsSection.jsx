import React, { useMemo, useState } from 'react';
import { Star, Tractor, HelpCircle, ThumbsDown, PackageX } from 'lucide-react';
import { money, num, pct, downloadCsv } from '../reportUtils';
import { Card, SectionHead, SearchBox, ExportButton, Segmented, Delta, Empty, Note, SortTh, sortRows } from '../ui';
import { BarRow } from '../charts';

// Menü mühendisliği sınıfları (Kasavana–Smith): popülerlik × birim kâr
const MENU_CLASSES = {
  star: { label: 'Yıldız', Icon: Star, desc: 'Çok satıyor, kârı yüksek. Öne çıkarın, fiyatı koruyun.' },
  horse: { label: 'Beygir', Icon: Tractor, desc: 'Çok satıyor, kârı düşük. Maliyeti düşürün veya fiyatı hafif artırın.' },
  puzzle: { label: 'Bilmece', Icon: HelpCircle, desc: 'Kârı yüksek, az satıyor. Menüde görünürlüğünü artırın.' },
  dog: { label: 'Zayıf', Icon: ThumbsDown, desc: 'Az satıyor, kârı düşük. Menüden çıkarmayı düşünün.' }
};

const ABC_INFO = {
  A: 'Cironun ilk %80’ini oluşturan ürünler',
  B: 'Sonraki %15',
  C: 'Kalan %5'
};

export default function ProductsSection({ data, compareLabel, fileLabel }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState({ key: 'revenue', dir: 'desc' });
  const { products = [], show_cost: showCost, has_comparison: hasCmp, dropped_products: dropped = [], totals } = data;

  // ABC sınıfı ve ciro payı
  const enriched = useMemo(() => {
    const total = products.reduce((s, p) => s + p.revenue, 0);
    let cum = 0;
    const byRevenue = [...products].sort((a, b) => b.revenue - a.revenue);
    const abc = new Map(byRevenue.map(p => {
      const startShare = total ? (cum / total) * 100 : 0;
      cum += p.revenue;
      return [p.product_id, startShare < 80 ? 'A' : startShare < 95 ? 'B' : 'C'];
    }));
    return products.map(p => ({
      ...p,
      share: total ? (p.revenue / total) * 100 : 0,
      abc: abc.get(p.product_id),
      change: hasCmp && p.prev_revenue ? ((p.revenue - p.prev_revenue) / p.prev_revenue) * 100 : null
    }));
  }, [products, hasCmp]);

  // Kategori özetleri
  const categories = useMemo(() => {
    const m = new Map();
    for (const p of enriched) {
      const c = m.get(p.category_name) || { name: p.category_name, revenue: 0, qty: 0, prev: 0, count: 0 };
      c.revenue += p.revenue; c.qty += p.qty; c.prev += p.prev_revenue || 0; c.count += 1;
      m.set(p.category_name, c);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [enriched]);

  // Menü mühendisliği (yalnızca maliyeti girilmiş ürünler)
  const menu = useMemo(() => {
    if (!showCost) return null;
    const costed = enriched.filter(p => p.cost !== null && p.cost !== undefined && p.qty > 0);
    if (costed.length < 2) return { costed, groups: null };
    const totalQty = costed.reduce((s, p) => s + p.qty, 0);
    const totalProfit = costed.reduce((s, p) => s + p.profit, 0);
    const popThreshold = (1 / costed.length) * 0.7 * totalQty;
    const cmThreshold = totalProfit / totalQty;
    const groups = { star: [], horse: [], puzzle: [], dog: [] };
    for (const p of costed) {
      const popular = p.qty >= popThreshold;
      const profitable = p.profit / p.qty >= cmThreshold;
      groups[popular ? (profitable ? 'star' : 'horse') : (profitable ? 'puzzle' : 'dog')].push(p);
    }
    Object.values(groups).forEach(g => g.sort((a, b) => b.profit - a.profit));
    return { costed, groups, cmThreshold };
  }, [enriched, showCost]);

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return sortRows(enriched.filter(p =>
      (category === 'all' || p.category_name === category) &&
      (!q || p.product_name.toLocaleLowerCase('tr-TR').includes(q))
    ), sort);
  }, [enriched, search, category, sort]);

  const sum = (key) => rows.reduce((s, p) => s + (p[key] || 0), 0);
  const catOptions = [{ id: 'all', label: 'Tümü', count: products.length }, ...categories.map(c => ({ id: c.name, label: c.name, count: c.count }))];

  const exportCsv = () => downloadCsv(`urun-satislari-${fileLabel}`, [
    { label: 'Ürün', value: r => r.product_name },
    { label: 'Kategori', value: r => r.category_name },
    { label: 'ABC', value: r => r.abc },
    { label: 'Satılan Adet', value: r => r.qty },
    { label: 'Satış Tutarı (TL)', value: r => r.revenue },
    { label: 'Ciro Payı (%)', value: r => Math.round(r.share * 10) / 10 },
    ...(hasCmp ? [{ label: `${compareLabel} (TL)`, value: r => r.prev_revenue }] : []),
    { label: 'Ortalama Fiyat (TL)', value: r => r.average_price },
    { label: 'İkram Adet', value: r => r.comp_qty },
    { label: 'İade Adet', value: r => r.returned_qty },
    { label: 'İptal Adet', value: r => r.voided_qty },
    ...(showCost ? [
      { label: 'Maliyet (TL)', value: r => r.cost },
      { label: 'Brüt Kâr (TL)', value: r => r.profit },
      { label: 'Marj (%)', value: r => r.margin }
    ] : [])
  ], rows);

  if (!products.length && !dropped.length) {
    return (
      <div className="rh-section">
        <SectionHead title="Ürünler & Menü" />
        <Card><Empty>Bu dönemde ürün satışı yok.</Empty></Card>
      </div>
    );
  }

  const catMax = categories[0]?.revenue || 0;
  const abcCount = (k) => enriched.filter(p => p.abc === k).length;
  const abcRevenue = (k) => enriched.filter(p => p.abc === k).reduce((s, p) => s + p.revenue, 0);

  return (
    <div className="rh-section">
      <SectionHead title="Ürünler & Menü" description="Hangi ürün ve kategoriler kazandırıyor, hangileri geride kalıyor?" />

      <div className="rh-grid-2">
        <Card title="Kategori performansı" subtitle={`${num(categories.length)} kategori · ${money(totals.revenue)}`}>
          {categories.map(c => (
            <BarRow key={c.name} label={c.name} sub={`${num(c.qty)} adet`} value={c.revenue} max={catMax}
              extra={hasCmp ? <Delta current={c.revenue} previous={c.prev} /> : pct(totals.revenue ? (c.revenue / totals.revenue) * 100 : 0, 0)} />
          ))}
        </Card>

        <Card title="ABC analizi" subtitle="Ürünlerin ciroya katkısı">
          <div className="rh-abc">
            {['A', 'B', 'C'].map(k => (
              <div key={k} className={`rh-abc-item abc-${k}`}>
                <span className={`rh-abc-badge abc-${k}`}>{k}</span>
                <div>
                  <strong>{num(abcCount(k))} ürün · {money(abcRevenue(k))}</strong>
                  <span>{ABC_INFO[k]}</span>
                </div>
              </div>
            ))}
          </div>
          <Note>A sınıfı ürünlerde stok ve kalite asla aksamamalı; C sınıfı ürünler menüyü sadeleştirmek için adaydır.</Note>
        </Card>
      </div>

      {showCost && (
        <Card title="Menü mühendisliği" subtitle={menu?.groups ? `Popülerlik × birim kâr · ortalama birim kâr ${money(menu.cmThreshold)}` : 'Popülerlik × birim kâr'}>
          {menu?.groups ? (
            <div className="rh-menu-grid">
              {Object.entries(MENU_CLASSES).map(([key, { label, Icon, desc }]) => (
                <div key={key} className={`rh-menu-cell m-${key}`}>
                  <div className="rh-menu-head"><Icon size={16} /><strong>{label}</strong><em>{num(menu.groups[key].length)}</em></div>
                  <p>{desc}</p>
                  <ul>
                    {menu.groups[key].slice(0, 6).map(p => (
                      <li key={p.product_id}><span>{p.product_name}</span><span>{num(p.qty)} ad · {money(p.profit / p.qty)}/ad</span></li>
                    ))}
                    {menu.groups[key].length > 6 && <li className="more">+{menu.groups[key].length - 6} ürün daha</li>}
                    {menu.groups[key].length === 0 && <li className="more">Ürün yok</li>}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Menü mühendisliği için en az iki satılan üründe maliyet girilmiş olmalı. Ürünler sayfasından maliyet fiyatı ekleyin{totals.products_without_cost ? ` (${num(totals.products_without_cost)} üründe eksik)` : ''}.</Empty>
          )}
        </Card>
      )}

      <Card
        title="Ürün satışları"
        subtitle={`${num(rows.length)} ürün`}
        actions={<><SearchBox value={search} onChange={setSearch} placeholder="Ürün ara" /><ExportButton onClick={exportCsv} disabled={!rows.length} /></>}
        flush
      >
        {categories.length > 1 && <div className="rh-pad-x"><Segmented options={catOptions} value={category} onChange={setCategory} label="Kategori" /></div>}
        <div className="rh-table-wrap">
          <table className="rh-table">
            <thead>
              <tr>
                <SortTh id="product_name" sort={sort} setSort={setSort}>Ürün</SortTh>
                <SortTh id="abc" sort={sort} setSort={setSort} title="ABC sınıfı">ABC</SortTh>
                <SortTh id="qty" sort={sort} setSort={setSort} num>Adet</SortTh>
                <SortTh id="revenue" sort={sort} setSort={setSort} num>Satış</SortTh>
                <SortTh id="share" sort={sort} setSort={setSort} num>Pay</SortTh>
                {hasCmp && <SortTh id="change" sort={sort} setSort={setSort} num title={compareLabel}>Değişim</SortTh>}
                <SortTh id="average_price" sort={sort} setSort={setSort} num>Ort. fiyat</SortTh>
                <SortTh id="comp_qty" sort={sort} setSort={setSort} num>İkram</SortTh>
                <SortTh id="returned_qty" sort={sort} setSort={setSort} num>İade</SortTh>
                <SortTh id="voided_qty" sort={sort} setSort={setSort} num>İptal</SortTh>
                {showCost && <SortTh id="profit" sort={sort} setSort={setSort} num>Brüt kâr</SortTh>}
                {showCost && <SortTh id="margin" sort={sort} setSort={setSort} num>Marj</SortTh>}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.product_id}>
                  <td><span className="strong">{p.product_name}</span><span className="rh-sub">{p.category_name}</span></td>
                  <td><span className={`rh-abc-badge sm abc-${p.abc}`}>{p.abc}</span></td>
                  <td className="num">{num(p.qty)}</td>
                  <td className="num strong">{money(p.revenue)}</td>
                  <td className="num">
                    <span className="rh-share"><i style={{ width: `${Math.min(100, p.share)}%` }} /></span>
                    {pct(p.share)}
                  </td>
                  {hasCmp && <td className="num"><Delta current={p.revenue} previous={p.prev_revenue} /><span className="rh-sub">{money(p.prev_revenue)}</span></td>}
                  <td className="num">{money(p.average_price)}</td>
                  <td className="num">{p.comp_qty ? num(p.comp_qty) : '—'}</td>
                  <td className="num">{p.returned_qty ? num(p.returned_qty) : '—'}</td>
                  <td className="num">{p.voided_qty ? num(p.voided_qty) : '—'}</td>
                  {showCost && <td className="num">{p.profit === null ? <span className="muted" title="Maliyet girilmemiş">—</span> : money(p.profit)}</td>}
                  {showCost && <td className="num">{p.margin === null ? '—' : pct(p.margin, 0)}</td>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={12} className="rh-empty-cell">Aramaya uyan ürün yok.</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2}>Toplam</td>
                  <td className="num">{num(sum('qty'))}</td>
                  <td className="num">{money(sum('revenue'))}</td>
                  <td />
                  {hasCmp && <td className="num"><Delta current={sum('revenue')} previous={sum('prev_revenue')} /></td>}
                  <td />
                  <td className="num">{num(sum('comp_qty'))}</td>
                  <td className="num">{num(sum('returned_qty'))}</td>
                  <td className="num">{num(sum('voided_qty'))}</td>
                  {showCost && <td className="num">{rows.some(r => r.profit !== null) ? money(sum('profit')) : '—'}</td>}
                  {showCost && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="rh-pad-x rh-pad-b">
          <Note>Satış tutarı adisyon indirimi öncesidir; ikram, iade ve iptal edilen ürünler satışa dahil değildir.{showCost && totals.products_without_cost > 0 ? ` ${num(totals.products_without_cost)} ürünün maliyeti girilmediği için kârı hesaplanamadı.` : ''}</Note>
        </div>
      </Card>

      {hasCmp && dropped.length > 0 && (
        <Card title="Bu dönem hiç satılmayanlar" subtitle={`${compareLabel} satılmış, bu dönem satılmamış ${num(dropped.length)} ürün`}>
          <ul className="rh-chiplist">
            {dropped.map(p => (
              <li key={p.product_id}><PackageX size={13} /> {p.product_name} <em>{compareLabel}: {num(p.prev_qty)} ad · {money(p.prev_revenue)}</em></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
