import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Download, Search, X, Info, Inbox } from 'lucide-react';
import { changeInfo } from './reportUtils';

// Rapor merkezinin ortak yapı taşları (kart, gösterge, değişim rozeti, araç çubuğu, boş durum)

export function Card({ title, subtitle, actions, children, className = '', flush = false }) {
  return (
    <section className={`rh-card ${flush ? 'flush' : ''} ${className}`}>
      {(title || actions) && (
        <header className="rh-card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="rh-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Önceki döneme göre değişim rozeti.
 * inverse: artışın kötü olduğu ölçüler (kayıp, indirim, süre) için renk yönü ters çevrilir.
 */
export function Delta({ current, previous, inverse = false, neutral = false, label }) {
  const info = changeInfo(current, previous);
  if (!info) return null;
  const good = info.dir === 'flat' ? 'flat' : ((info.dir === 'up') !== inverse ? 'good' : 'bad');
  const Icon = info.dir === 'up' ? ArrowUpRight : info.dir === 'down' ? ArrowDownRight : Minus;
  return (
    <span className={`rh-delta ${neutral ? 'flat' : good}`} title={label}>
      <Icon size={13} strokeWidth={2.6} />
      {info.label}
    </span>
  );
}

export function Kpi({ label, value, sub, current, previous, inverse, hint, Icon, tone }) {
  return (
    <div className={`rh-kpi ${tone ? `tone-${tone}` : ''}`}>
      <div className="rh-kpi-top">
        {Icon && <span className="rh-kpi-icon"><Icon size={15} /></span>}
        <span className="rh-kpi-label">{label}</span>
        {hint && <span className="rh-hint" title={hint}><Info size={12} /></span>}
      </div>
      <div className="rh-kpi-value">{value}</div>
      <div className="rh-kpi-foot">
        {previous !== undefined && <Delta current={current} previous={previous} inverse={inverse} />}
        {sub && <span className="rh-kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

export function SectionHead({ title, description, actions }) {
  return (
    <div className="rh-section-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="rh-section-actions">{actions}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="rh-search">
      <Search size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && <button type="button" onClick={() => onChange('')} title="Temizle"><X size={14} /></button>}
    </label>
  );
}

export function ExportButton({ onClick, disabled }) {
  return (
    <button type="button" className="rh-btn" onClick={onClick} disabled={disabled} title="Excel'de açılabilen CSV dosyası indir">
      <Download size={15} /> <span>Excel</span>
    </button>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="rh-seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.id} type="button" className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)} aria-pressed={value === o.id}>
          {o.label}{o.count !== undefined && <em>{o.count}</em>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children = 'Bu dönemde veri yok.', Icon = Inbox }) {
  return (
    <div className="rh-empty">
      <Icon size={22} />
      <span>{children}</span>
    </div>
  );
}

export function Note({ children }) {
  return <p className="rh-note"><Info size={14} /> <span>{children}</span></p>;
}

// Sıralanabilir tablo başlığı
export function SortTh({ id, sort, setSort, children, num: isNum, title }) {
  const active = sort.key === id;
  return (
    <th className={`${isNum ? 'num' : ''} sortable ${active ? 'active' : ''}`} title={title}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort(s => ({ key: id, dir: s.key === id && s.dir === 'desc' ? 'asc' : 'desc' }))}>
        {children}<span className="rh-sort-mark">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}

export const sortRows = (rows, sort) => {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (typeof x === 'string' || typeof y === 'string') return String(x ?? '').localeCompare(String(y ?? ''), 'tr') * dir;
    return ((x ?? -Infinity) - (y ?? -Infinity)) * dir;
  });
};
