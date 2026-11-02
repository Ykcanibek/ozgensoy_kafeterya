import React from 'react';
import { Banknote, CreditCard, UserCheck, Split, CheckCircle2, AlertTriangle, ArrowDownToLine } from 'lucide-react';

const fmt = (n) => `₺${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v) => parseFloat(v) || 0;

/**
 * Parçalı ödeme: tahsil edilecek tutar nakit, kart ve (yetki varsa) veresiyeye bölünür.
 * Üstteki çubuk dağılımı, durum satırı ise kalan veya fazla tutarı gösterir.
 */
export default function SplitPaymentBox({
  total,
  cash,
  card,
  veresiye,
  onCashChange,
  onCardChange,
  onVeresiyeChange,
  onFillRemaining,
  onPreset,
  showVeresiye,
  veresiyeSlot
}) {
  const parts = [
    { key: 'cash', label: 'Nakit', Icon: Banknote, value: cash, onChange: onCashChange },
    { key: 'card', label: 'Kart', Icon: CreditCard, value: card, onChange: onCardChange },
    ...(showVeresiye ? [{ key: 'veresiye', label: 'Veresiye', Icon: UserCheck, value: veresiye, onChange: onVeresiyeChange }] : [])
  ];
  const assigned = parts.reduce((s, p) => s + num(p.value), 0);
  const remaining = Math.round((total - assigned) * 100) / 100;
  const scale = Math.max(total, assigned) || 1;

  let status;
  if (total <= 0) status = { tone: 'info', Icon: Split, text: 'Önce ödenecek ürünleri seçin veya tutarı yazın.' };
  else if (remaining > 0.009) status = { tone: 'warn', Icon: AlertTriangle, text: `${fmt(remaining)} henüz dağıtılmadı` };
  else if (remaining < -0.009) status = { tone: 'error', Icon: AlertTriangle, text: `${fmt(-remaining)} fazla girildi` };
  else status = { tone: 'ok', Icon: CheckCircle2, text: 'Tutar tam dağıtıldı' };

  return (
    <div className="pos-split">
      <div className="pos-split-head">
        <span className="pos-split-head-icon"><Split size={16} /></span>
        <div>
          <strong>Parçalı ödeme</strong>
          <span>{fmt(total)} tutarını ödeme türlerine bölün</span>
        </div>
      </div>

      {/* Dağılım çubuğu */}
      <div className="pos-split-bar" aria-hidden="true">
        {parts.map(p => num(p.value) > 0 && (
          <i key={p.key} className={p.key} style={{ width: `${(num(p.value) / scale) * 100}%` }} />
        ))}
      </div>

      {/* Tutar satırları */}
      <div className="pos-split-rows">
        {parts.map(({ key, label, Icon, value, onChange }) => (
          <div key={key} className={`pos-split-row ${key} ${num(value) > 0 ? 'filled' : ''}`}>
            <span className="pos-split-row-icon"><Icon size={16} /></span>
            <span className="pos-split-row-label">{label}</span>
            <div className="pos-split-input">
              <span>₺</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0,00"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={(e) => e.target.select()}
                aria-label={`${label} tutarı`}
              />
            </div>
            <button
              type="button"
              className="pos-split-fill"
              onClick={() => onFillRemaining(key)}
              disabled={remaining <= 0.009}
              title={`Kalan ${fmt(Math.max(0, remaining))} tutarı ${label.toLocaleLowerCase('tr-TR')} olarak ekle`}
              aria-label={`Kalan tutarı ${label.toLocaleLowerCase('tr-TR')} olarak ekle`}
            >
              <ArrowDownToLine size={14} />
              <span className="pos-split-fill-text">Kalan</span>
            </button>
          </div>
        ))}
      </div>

      <div className={`pos-split-status ${status.tone}`}>
        <status.Icon size={15} />
        <span>{status.text}</span>
        {total > 0 && <em>{fmt(assigned)} / {fmt(total)}</em>}
      </div>

      {total > 0 && (
        <div className="pos-split-presets">
          <span>Yarı yarıya:</span>
          <button type="button" onClick={() => onPreset('cash-card')}>Nakit + Kart</button>
          {showVeresiye && <button type="button" onClick={() => onPreset('cash-veresiye')}>Nakit + Veresiye</button>}
          {showVeresiye && <button type="button" onClick={() => onPreset('card-veresiye')}>Kart + Veresiye</button>}
        </div>
      )}
      <p className="pos-split-tip">Her ödeme türüne alınan tutarı yazın; toplam tahsil edilecek tutarı tutmalı. Kalan tutarı bir türe tek dokunuşla eklemek için o satırdaki "Kalan" düğmesine basın.</p>


      {num(veresiye) > 0 && veresiyeSlot}
    </div>
  );
}
