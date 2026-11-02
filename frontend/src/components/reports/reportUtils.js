// Rapor ekranlarının ortak yardımcıları: para/tarih biçimlendirme, dönem hesaplama, CSV dışa aktarma

const moneyFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat('tr-TR');

export const money = (n) => moneyFmt.format(Number(n) || 0);
export const num = (n) => numberFmt.format(Number(n) || 0);
export const pct = (n, digits = 1) => `%${(Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits })}`;

export const formatDateTime = (d) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const formatTime = (d) => d ? new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';
export const formatDuration = (minutes) => {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} dk`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
};

const pad = (n) => String(n).padStart(2, '0');
export const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDay = (d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => d.toLocaleDateString('tr-TR', opts);

// Hazır dönemler (bugün dışındakiler reports.history yetkisi ister)
export const PERIOD_PRESETS = [
  { id: 'today', label: 'Bugün' },
  { id: 'yesterday', label: 'Dün' },
  { id: 'this_week', label: 'Bu Hafta' },
  { id: 'last_week', label: 'Geçen Hafta' },
  { id: 'this_month', label: 'Bu Ay' },
  { id: 'last_month', label: 'Geçen Ay' },
  { id: 'custom', label: 'Özel Aralık' }
];

/**
 * Seçilen dönemi ve karşılaştırma dönemini döndürür:
 * { startDate, endDate, label, fileLabel, compareStart, compareEnd, compareLabel }
 * Karşılaştırma "aynı dönemin karşılığı"dır: bugün ↔ dün, bu hafta ↔ geçen haftanın aynı günleri, bu ay ↔ geçen ayın aynı günleri.
 */
export const resolvePeriod = (preset, custom = {}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const short = { day: 'numeric', month: 'short' };
  const build = (s, e, label, cs, ce, compareLabel) => ({
    startDate: toYMD(s), endDate: toYMD(e), label,
    fileLabel: toYMD(s) === toYMD(e) ? toYMD(s) : `${toYMD(s)}_${toYMD(e)}`,
    compareStart: toYMD(cs), compareEnd: toYMD(ce), compareLabel
  });
  // Ayın gün sayısını aşmayacak şekilde bir önceki ayın aynı günü
  const sameDayPrevMonth = (d) => new Date(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), new Date(d.getFullYear(), d.getMonth(), 0).getDate()));

  switch (preset) {
    case 'yesterday': {
      const y = addDays(today, -1);
      return build(y, y, `Dün · ${fmtDay(y)}`, addDays(y, -1), addDays(y, -1), 'Önceki gün');
    }
    case 'this_week':
      return build(monday, today, `Bu Hafta · ${fmtDay(monday, short)} – ${fmtDay(today, short)}`,
        addDays(monday, -7), addDays(today, -7), 'Geçen hafta aynı günler');
    case 'last_week': {
      const s = addDays(monday, -7), e = addDays(monday, -1);
      return build(s, e, `Geçen Hafta · ${fmtDay(s, short)} – ${fmtDay(e, short)}`, addDays(s, -7), addDays(e, -7), 'Önceki hafta');
    }
    case 'this_month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return build(s, today, `Bu Ay · ${fmtDay(today, { month: 'long', year: 'numeric' })}`,
        new Date(today.getFullYear(), today.getMonth() - 1, 1), sameDayPrevMonth(today), 'Geçen ay aynı günler');
    }
    case 'last_month': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return build(s, e, `Geçen Ay · ${fmtDay(s, { month: 'long', year: 'numeric' })}`,
        new Date(s.getFullYear(), s.getMonth() - 1, 1), new Date(s.getFullYear(), s.getMonth(), 0), 'Önceki ay');
    }
    case 'custom': {
      if (!custom.start || !custom.end) return { startDate: '', endDate: '', label: 'Tarih aralığı seçin', incomplete: true };
      const [s, e] = custom.start <= custom.end ? [custom.start, custom.end] : [custom.end, custom.start];
      const sd = new Date(`${s}T00:00:00`), ed = new Date(`${e}T00:00:00`);
      const days = Math.round((ed - sd) / 86400000) + 1;
      const label = s === e ? fmtDay(sd) : `${fmtDay(sd, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDay(ed, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      return build(sd, ed, label, addDays(sd, -days), addDays(sd, -1), 'Önceki dönem');
    }
    default:
      return build(today, today, `Bugün · ${fmtDay(today)}`, addDays(today, -1), addDays(today, -1), 'Dün');
  }
};

export const COMPARE_MODES = [
  { id: 'previous', label: 'Önceki dönem' },
  { id: 'year', label: 'Geçen yıl' },
  { id: 'none', label: 'Kapalı' }
];

// Karşılaştırma türünü uygular: önceki dönem (varsayılan), geçen yılın aynı tarihleri veya kapalı
export const applyCompare = (period, mode) => {
  if (period.incomplete || mode === 'previous') return { ...period, compareMode: 'previous' };
  if (mode === 'none') return { ...period, compareMode: 'none', compareStart: null, compareEnd: null, compareLabel: null };
  const back = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return toYMD(new Date(y - 1, m - 1, Math.min(d, new Date(y - 1, m, 0).getDate())));
  };
  return { ...period, compareMode: 'year', compareStart: back(period.startDate), compareEnd: back(period.endDate), compareLabel: 'Geçen yıl aynı dönem' };
};

export const periodQuery = (period) => new URLSearchParams({
  startDate: period.startDate,
  endDate: period.endDate,
  ...(period.compareStart ? { compareStart: period.compareStart, compareEnd: period.compareEnd } : {}),
  ...(period.compareMode === 'none' ? { compare: 'none' } : {})
}).toString();

// Yüzde değişim etiketi ve yönü (önceki değer 0 ise oran hesaplanamaz)
export const changeInfo = (cur, prev) => {
  if (prev == null) return null;
  if (!prev) return cur ? { label: 'Yeni', dir: 'up' } : null;
  const c = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(c) < 0.05) return { label: '%0', dir: 'flat', value: 0 };
  return { label: `${c > 0 ? '+' : '−'}%${Math.abs(c).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`, dir: c > 0 ? 'up' : 'down', value: c };
};

export const PAYMENT_LABELS = { cash: 'Nakit', credit_card: 'Kredi Kartı', mixed: 'Parçalı', veresiye: 'Veresiye' };

/**
 * CSV olarak indirir (Excel'de Türkçe karakterler doğru açılsın diye UTF-8 BOM ve ";" ayırıcı).
 * columns: [{ label, value: (row) => any }]
 */
export const downloadCsv = (filename, columns, rows) => {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(c => escape(c.label)).join(';'), ...rows.map(r => columns.map(c => escape(c.value(r))).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
