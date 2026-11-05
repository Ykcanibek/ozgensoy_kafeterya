import React from 'react';
import {
  Receipt, ShoppingBasket, Clock, Wallet, Gift, Percent, Layers, TrendingUp,
  Sparkles, AlertTriangle, Flame, Trophy, CalendarDays, ArrowRight, HandCoins
} from 'lucide-react';
import { money, num, pct, formatDuration, changeInfo } from '../reportUtils';
import { Card, Kpi, Delta, Empty, SectionHead } from '../ui';
import { LineCompareChart, Sparkline, StackedShare, BarRow, DAYS_LONG } from '../charts';

// Veriden otomatik "öne çıkanlar" cümleleri üretir
function buildInsights(d, compareLabel) {
  const out = [];
  const { sales, collections, comparison, distribution, top_products: top, categories } = d;
  if (!sales.order_count) return out;

  if (comparison?.revenue) {
    const c = changeInfo(sales.revenue, comparison.revenue.previous);
    if (c?.value !== undefined && c.value !== 0) {
      out.push({ tone: c.value > 0 ? 'good' : 'bad', Icon: TrendingUp, text: <>Net ciro {compareLabel?.toLocaleLowerCase('tr-TR')} göre <strong>{c.label}</strong> ({money(comparison.revenue.previous)} → {money(sales.revenue)}).</> });
    }
  }
  const peakHour = distribution.hours.reduce((b, h) => (h.net > b.net ? h : b), distribution.hours[0]);
  if (peakHour?.net > 0) {
    out.push({ tone: 'info', Icon: Flame, text: <>En yoğun saat <strong>{String(peakHour.hour).padStart(2, '0')}:00–{String(peakHour.hour + 1).padStart(2, '0')}:00</strong>: {money(peakHour.net)} ({num(peakHour.orders)} adisyon).</> });
  }
  if (d.period.days > 1) {
    const peakDay = distribution.weekdays.reduce((b, x) => (x.net > b.net ? x : b), distribution.weekdays[0]);
    if (peakDay?.net > 0) out.push({ tone: 'info', Icon: CalendarDays, text: <>En güçlü gün <strong>{DAYS_LONG[peakDay.day]}</strong>: {money(peakDay.net)}.</> });
  }
  if (top?.[0]) {
    out.push({ tone: 'info', Icon: Trophy, text: <>En çok kazandıran ürün <strong>{top[0].product_name}</strong>: {num(top[0].qty)} adet, {money(top[0].revenue)}.</> });
  }
  if (categories?.[0] && categories.length > 1) {
    out.push({ tone: 'info', Icon: Layers, text: <>Satışların <strong>{pct(categories[0].share, 0)}</strong>'i {categories[0].category_name} kategorisinden.</> });
  }
  if (sales.unpaid_closed > 0) {
    out.push({ tone: 'warn', Icon: AlertTriangle, text: <><strong>{money(sales.unpaid_closed)}</strong> tutarında adisyon ödemesi alınmadan kapatılmış. Adisyonlar bölümünden kontrol edin.</> });
  }
  if (sales.loss_rate >= 5) {
    out.push({ tone: 'warn', Icon: Gift, text: <>İkram, iade ve iptal brüt satışın <strong>{pct(sales.loss_rate)}</strong>'i ({money(sales.loss_amount)}). Bu oran yüksek.</> });
  }
  if (collections.veresiye > 0) {
    out.push({ tone: 'info', Icon: Wallet, text: <>Dönemde <strong>{money(collections.veresiye)}</strong> veresiye yazıldı.</> });
  }
  return out.slice(0, 6);
}

export default function OverviewSection({ data, compareLabel, onNavigate, canSee }) {
  const { sales, collections, comparison: cmp, trend, trend_previous: trendPrev, top_products: top, categories } = data;
  const prev = (key) => (cmp ? cmp[key]?.previous : undefined);
  const insights = buildInsights(data, compareLabel);
  const topMax = top?.[0]?.revenue || 0;
  const granularityLabel = { hour: 'Saatlik', day: 'Günlük', month: 'Aylık' }[trend.granularity];

  return (
    <div className="rh-section">
      <SectionHead title="Genel Bakış" description="Dönemin satış, tahsilat ve öne çıkan göstergeleri tek ekranda." />

      <div className="rh-hero-row">
        <div className="rh-hero">
          <div className="rh-hero-label">Net ciro</div>
          <div className="rh-hero-value">{money(sales.revenue)}</div>
          <div className="rh-hero-meta">
            {cmp?.revenue && <Delta current={sales.revenue} previous={cmp.revenue.previous} />}
            {cmp?.revenue && <span>{compareLabel}: {money(cmp.revenue.previous)}</span>}
          </div>
          <Sparkline values={trend.points.map(p => p.net)} width={220} height={46} />
          <dl className="rh-hero-bridge">
            <div><dt>Brüt satış</dt><dd>{money(sales.gross)}</dd></div>
            <div><dt>İkram</dt><dd>− {money(sales.complimentary)}</dd></div>
            <div><dt>İade</dt><dd>− {money(sales.returned)}</dd></div>
            <div><dt>İndirim</dt><dd>− {money(sales.discount)}</dd></div>
            <div><dt>Bahşiş</dt><dd>+ {money(sales.tip)}</dd></div>
            <div className="total"><dt>Net ciro</dt><dd>{money(sales.revenue)}</dd></div>
          </dl>
        </div>

        <div className="rh-kpi-grid">
          <Kpi Icon={Receipt} label="Adisyon" value={num(sales.order_count)} current={sales.order_count} previous={prev('order_count')} />
          <Kpi Icon={TrendingUp} label="Ortalama adisyon" value={money(sales.average_ticket)} current={sales.average_ticket} previous={prev('average_ticket')} />
          <Kpi Icon={ShoppingBasket} label="Ürün / adisyon" value={sales.items_per_ticket.toLocaleString('tr-TR')} sub={`${num(sales.item_qty)} ürün`} current={sales.items_per_ticket} previous={prev('items_per_ticket')} />
          <Kpi Icon={Clock} label="Ort. masa süresi" value={formatDuration(sales.avg_duration_min)} current={sales.avg_duration_min} previous={prev('avg_duration_min')} inverse hint="Adisyonun açılışından kapanışına geçen ortalama süre" />
          <Kpi Icon={Wallet} label="Kasaya giren" value={money(collections.drawer_total)} sub="Nakit + kart" current={collections.drawer_total} previous={prev('drawer_total')} />
          <Kpi Icon={Gift} label="İkram · iade · iptal" value={money(sales.loss_amount)} sub={`Brütün ${pct(sales.loss_rate)}`} current={sales.loss_amount} previous={prev('loss_amount')} inverse tone={sales.loss_rate >= 5 ? 'warn' : undefined} />
          <Kpi Icon={Percent} label="İndirim" value={money(sales.discount)} sub={`Brütün ${pct(sales.discount_rate)}`} current={sales.discount} previous={prev('discount')} inverse />
          <Kpi Icon={HandCoins} label="Bahşiş" value={money(sales.tip)} sub="Net ciroya dahil" current={sales.tip} previous={prev('tip')} hint="Bahşiş işletmeye kalır. Personele dağıtılırsa kasa defterine Personel Giderleri › Bahşiş Ödemesi olarak girin." />
        </div>
      </div>

      <div className="rh-grid-2-1">
        <Card title="Satış eğrisi" subtitle={`${granularityLabel} net ciro${trendPrev ? ` · ${compareLabel} ile karşılaştırmalı` : ''}`}>
          <LineCompareChart points={trend.points} previous={trendPrev} previousLabel={compareLabel || 'Önceki dönem'} />
        </Card>
        <Card title="Öne çıkanlar" subtitle="Verilerden otomatik çıkarıldı">
          {insights.length === 0 ? <Empty Icon={Sparkles}>Bu dönemde kapanan adisyon yok.</Empty> : (
            <ul className="rh-insights">
              {insights.map((i, idx) => (
                <li key={idx} className={`tone-${i.tone}`}>
                  <span className="rh-insight-icon"><i.Icon size={15} /></span>
                  <span>{i.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="rh-grid-3">
        <Card title="Ödeme dağılımı" subtitle={`${num(collections.payment_count)} tahsilat`}
          actions={canSee.payments && <button type="button" className="rh-link" onClick={() => onNavigate('payments')}>Kasa <ArrowRight size={13} /></button>}>
          <StackedShare items={[
            { label: 'Nakit', value: collections.cash, sub: `${num(collections.counts.cash)} işlem` },
            { label: 'Kredi kartı', value: collections.card, sub: `${num(collections.counts.credit_card)} işlem` },
            { label: 'Veresiye', value: collections.veresiye, sub: `${num(collections.counts.veresiye)} işlem` }
          ]} />
        </Card>
        <Card title="En çok satanlar" subtitle="Satış tutarına göre ilk 5"
          actions={<button type="button" className="rh-link" onClick={() => onNavigate('products')}>Tümü <ArrowRight size={13} /></button>}>
          {top?.length ? top.slice(0, 5).map((p, i) => (
            <BarRow key={p.product_id} label={<><b className="rh-rank">{i + 1}</b>{p.product_name}</>} value={p.revenue} max={topMax} extra={`${num(p.qty)} adet`} />
          )) : <Empty />}
        </Card>
        <Card title="Kategoriler" subtitle="Satış payı"
          actions={canSee.sales && <button type="button" className="rh-link" onClick={() => onNavigate('products')}>Ayrıntı <ArrowRight size={13} /></button>}>
          {categories?.length ? categories.slice(0, 6).map(c => (
            <BarRow key={c.category_name} label={c.category_name} value={c.revenue} max={categories[0].revenue} extra={pct(c.share, 0)} />
          )) : <Empty />}
        </Card>
      </div>
    </div>
  );
}
