import React, { useEffect, useRef, useState } from 'react';
import { money, num } from './reportUtils';

/*
 * Rapor grafikleri — bağımlılıksız SVG/HTML.
 * Renkler doğrulanmış palete göre (dataviz validator): seri 1 mavi, seri 2 turuncu, seri 3 yeşil;
 * karşılaştırma serisi nötr gri; yoğunluk haritası tek tonlu mavi ölçek.
 * Her değer ipucu (hover/odak) dışında tablo veya etikette de erişilebilir.
 */
export const COLORS = {
  primary: '#2a78d6',
  previous: '#9aa5b1',
  series: ['#2a78d6', '#eb6834', '#1baf7a'],
  ramp: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  empty: '#eef3f6',
  grid: '#e6edf1'
};

export const compactMoney = (v) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`;
  if (a >= 1000) return `${(v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} B`;
  return num(Math.round(v));
};

const niceMax = (max) => {
  if (max <= 0) return 100;
  // 4 eşit aralık: aralık adımı 1-2-2,5-5 dizisinden seçilir (ör. 1561 → 4 × 500 = 2000)
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].find(s => s * pow >= raw) * pow * 4;
};

function useWidth(min = 260) {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(min, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [min]);
  return [ref, width];
}

function Tooltip({ x, y, width, children }) {
  return (
    <div className="rh-tooltip" style={{ left: Math.min(Math.max(x, 80), width - 80), top: Math.max(y, 6) }} role="status">
      {children}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Karşılaştırmalı çizgi grafiği (bu dönem vs önceki dönem)
// ───────────────────────────────────────────────────────────────
export function LineCompareChart({ points, previous, currentLabel = 'Bu dönem', previousLabel = 'Önceki dönem', height = 260, valueKey = 'net' }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const PAD = { top: 16, right: 16, bottom: 30, left: 56 };
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const all = [...points.map(p => p[valueKey]), ...(previous || []).map(p => p[valueKey])];
  const yMax = niceMax(Math.max(...all, 0));
  const n = Math.max(points.length, 1);
  const x = (i) => PAD.left + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const y = (v) => PAD.top + innerH - (v / yMax) * innerH;
  const path = (arr) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[valueKey])}`).join(' ');
  const area = `${path(points)} L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;
  const labelEvery = Math.ceil(points.length / Math.max(1, Math.floor(innerW / 54)));
  const hasData = all.some(v => v > 0);
  const lastIdx = points.length - 1;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - rect.left - PAD.left;
    const i = Math.round((rel / innerW) * (n - 1));
    if (i >= 0 && i < points.length) setHover(i);
  };

  return (
    <div className="rh-chart" ref={ref}>
      <div className="rh-legend">
        <span><i className="rh-key line" style={{ background: COLORS.primary }} />{currentLabel}</span>
        {previous && <span><i className="rh-key line" style={{ background: COLORS.previous }} />{previousLabel}</span>}
      </div>
      {!hasData ? <div className="rh-empty small">Bu dönemde satış yok.</div> : (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${currentLabel} satış eğrisi`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setHover(h => Math.min((h ?? -1) + 1, lastIdx));
            if (e.key === 'ArrowLeft') setHover(h => Math.max((h ?? 1) - 1, 0));
          }}
          onBlur={() => setHover(null)}
        >
          {[0, 1, 2, 3, 4].map(i => {
            const v = (yMax / 4) * i;
            return (
              <g key={i}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={COLORS.grid} />
                <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="rh-axis">{compactMoney(v)}</text>
              </g>
            );
          })}
          {points.map((p, i) => i % labelEvery === 0 && (
            <text key={p.key} x={x(i)} y={height - 8} textAnchor="middle" className="rh-axis">{p.label}</text>
          ))}
          <path d={area} fill={COLORS.primary} opacity="0.1" />
          {previous && <path d={path(previous)} fill="none" stroke={COLORS.previous} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          <path d={path(points)} fill="none" stroke={COLORS.primary} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {/* Son nokta etiketi */}
          <circle cx={x(lastIdx)} cy={y(points[lastIdx][valueKey])} r="4.5" fill={COLORS.primary} stroke="#fff" strokeWidth="2" />
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#94a3b8" strokeWidth="1" />
              {previous?.[hover] && <circle cx={x(hover)} cy={y(previous[hover][valueKey])} r="4.5" fill={COLORS.previous} stroke="#fff" strokeWidth="2" />}
              <circle cx={x(hover)} cy={y(points[hover][valueKey])} r="5" fill={COLORS.primary} stroke="#fff" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {hover !== null && hasData && (
        <Tooltip x={x(hover)} y={y(Math.max(points[hover][valueKey], previous?.[hover]?.[valueKey] || 0)) - 10} width={width}>
          <span className="rh-tt-title">{points[hover].label}</span>
          <span className="rh-tt-row"><i className="rh-key line" style={{ background: COLORS.primary }} /><strong>{money(points[hover][valueKey])}</strong> {num(points[hover].orders)} adisyon</span>
          {previous?.[hover] && (
            <span className="rh-tt-row"><i className="rh-key line" style={{ background: COLORS.previous }} /><strong>{money(previous[hover][valueKey])}</strong> {previous[hover].label}</span>
          )}
        </Tooltip>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Sütun grafiği (tek seri) — saat / gün dağılımı
// ───────────────────────────────────────────────────────────────
export function ColumnChart({ data, labelKey = 'label', valueKey = 'net', height = 200, highlightMax = true, formatValue = money, subKey = 'orders', subLabel = 'adisyon' }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const PAD = { top: 22, right: 6, bottom: 26, left: 48 };
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const yMax = niceMax(Math.max(...data.map(d => d[valueKey]), 0));
  const slot = innerW / Math.max(data.length, 1);
  const barW = Math.min(24, Math.max(3, slot * 0.64));
  const y = (v) => PAD.top + innerH - (v / yMax) * innerH;
  const maxIdx = data.reduce((best, d, i) => (d[valueKey] > data[best][valueKey] ? i : best), 0);
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 34)));
  const hasData = data.some(d => d[valueKey] > 0);
  const bar = (bx, top, w) => {
    const h = PAD.top + innerH - top, r = Math.min(4, w / 2, h);
    return `M${bx},${top + h} L${bx},${top + r} Q${bx},${top} ${bx + r},${top} L${bx + w - r},${top} Q${bx + w},${top} ${bx + w},${top + r} L${bx + w},${top + h} Z`;
  };

  return (
    <div className="rh-chart" ref={ref}>
      {!hasData ? <div className="rh-empty small">Bu dönemde veri yok.</div> : (
        <svg width={width} height={height} role="img" aria-label="Dağılım grafiği">
          {[0, 2, 4].map(i => {
            const v = (yMax / 4) * i;
            return (
              <g key={i}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={COLORS.grid} />
                <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="rh-axis">{compactMoney(v)}</text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const top = y(d[valueKey]);
            return (
              <g key={i}>
                {d[valueKey] > 0 && <path d={bar(cx - barW / 2, top, barW)} fill={COLORS.primary} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {highlightMax && i === maxIdx && d[valueKey] > 0 && <text x={cx} y={top - 6} textAnchor="middle" className="rh-peak">{compactMoney(d[valueKey])}</text>}
                {i % labelEvery === 0 && <text x={cx} y={height - 8} textAnchor="middle" className="rh-axis">{d[labelKey]}</text>}
                <rect
                  x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" tabIndex={0}
                  aria-label={`${d[labelKey]}: ${formatValue(d[valueKey])}`}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && hasData && (
        <Tooltip x={PAD.left + slot * hover + slot / 2} y={y(data[hover][valueKey]) - 10} width={width}>
          <span className="rh-tt-title">{data[hover][labelKey]}</span>
          <span className="rh-tt-row"><strong>{formatValue(data[hover][valueKey])}</strong>{subKey && ` ${num(data[hover][subKey])} ${subLabel}`}</span>
        </Tooltip>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Yoğunluk haritası: haftanın günü × saat (tek tonlu sıralı ölçek)
// ───────────────────────────────────────────────────────────────
const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAYS_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export function Heatmap({ matrix, hourFrom = 0, hourTo = 23 }) {
  const [hover, setHover] = useState(null);
  const hours = Array.from({ length: hourTo - hourFrom + 1 }, (_, i) => hourFrom + i);
  const max = Math.max(...matrix.flat().map(c => c.net), 0);
  const colorOf = (v) => (v <= 0 || max <= 0 ? COLORS.empty : COLORS.ramp[Math.min(COLORS.ramp.length - 1, Math.floor((v / max) * COLORS.ramp.length * 0.999))]);
  const info = hover && matrix[hover.d][hover.h];

  return (
    <div className="rh-heat">
      <div className="rh-heat-grid" style={{ '--cols': hours.length, gridTemplateColumns: `36px repeat(${hours.length}, minmax(14px, 1fr))` }}>
        <span />
        {hours.map(h => <span key={h} className={`rh-heat-hour ${h % 4 ? 'minor' : ''}`}>{h % 2 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
        {matrix.map((row, d) => (
          <React.Fragment key={d}>
            <span className="rh-heat-day">{DAYS[d]}</span>
            {hours.map(h => (
              <button
                key={h}
                type="button"
                className={`rh-heat-cell ${hover?.d === d && hover?.h === h ? 'active' : ''}`}
                style={{ background: colorOf(row[h].net) }}
                aria-label={`${DAYS_LONG[d]} ${String(h).padStart(2, '0')}:00 — ${money(row[h].net)}, ${row[h].orders} adisyon`}
                onMouseEnter={() => setHover({ d, h })}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover({ d, h })}
                onBlur={() => setHover(null)}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
      <div className="rh-heat-foot">
        <div className="rh-heat-scale">
          <span>Az</span>
          {COLORS.ramp.map(c => <i key={c} style={{ background: c }} />)}
          <span>Çok</span>
        </div>
        <span className="rh-heat-info">
          {info
            ? <><strong>{DAYS_LONG[hover.d]} {String(hover.h).padStart(2, '0')}:00–{String(hover.h + 1).padStart(2, '0')}:00</strong> · {money(info.net)} · {num(info.orders)} adisyon</>
            : 'Hücrelerin üzerine gelerek ayrıntıyı görün'}
        </span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Mini trend çizgisi (gösterge kartları için)
// ───────────────────────────────────────────────────────────────
export function Sparkline({ values, width = 120, height = 36 }) {
  if (!values || values.length < 2 || !values.some(v => v > 0)) return null;
  const max = Math.max(...values), min = 0;
  const x = (i) => (width * i) / (values.length - 1);
  const y = (v) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg width={width} height={height} className="rh-spark" aria-hidden="true">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={COLORS.primary} opacity="0.12" />
      <path d={d} fill="none" stroke={COLORS.primary} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" fill={COLORS.primary} />
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────
// %100 yığılmış oran çubuğu (ör. ödeme karışımı) — lejant + değer etiketleri
// ───────────────────────────────────────────────────────────────
export function StackedShare({ items, colors = COLORS.series }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="rh-stack">
      <div className="rh-stack-bar" role="img" aria-label={items.map(i => `${i.label} ${money(i.value)}`).join(', ')}>
        {total > 0
          ? items.filter(i => i.value > 0).map((i, idx) => (
            <span key={i.label} style={{ width: `${(i.value / total) * 100}%`, background: colors[items.indexOf(i)] }} title={`${i.label}: ${money(i.value)}`} data-idx={idx} />
          ))
          : <span style={{ width: '100%', background: COLORS.empty }} />}
      </div>
      <ul className="rh-stack-legend">
        {items.map((i, idx) => (
          <li key={i.label}>
            <i className="rh-key" style={{ background: colors[idx] }} />
            <span className="rh-stack-label">{i.label}</span>
            <strong>{money(i.value)}</strong>
            <em>{total ? `%${Math.round((i.value / total) * 100)}` : '%0'}</em>
            {i.sub && <span className="rh-stack-sub">{i.sub}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Yatay oran çubuğu (tek ton; değer ve etiket her zaman yazılı)
export function BarRow({ label, sub, value, max, display, extra }) {
  return (
    <div className="rh-barrow">
      <div className="rh-barrow-top">
        <span className="rh-barrow-label">{label}{sub && <em>{sub}</em>}</span>
        <span className="rh-barrow-value">{display ?? money(value)}{extra && <em>{extra}</em>}</span>
      </div>
      <div className="rh-barrow-track"><div style={{ width: max > 0 ? `${Math.max(value > 0 ? 2 : 0, (value / max) * 100)}%` : 0 }} /></div>
    </div>
  );
}

export { DAYS, DAYS_LONG };
