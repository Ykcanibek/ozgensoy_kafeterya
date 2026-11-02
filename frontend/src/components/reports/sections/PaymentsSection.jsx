import React from 'react';
import { Banknote, CreditCard, NotebookPen, HandCoins, Wallet, UserCheck, Printer } from 'lucide-react';
import { money, num } from '../reportUtils';
import { Card, SectionHead, Kpi, Note } from '../ui';
import { StackedShare } from '../charts';

// Ödemeler & kasa: tahsilat kırılımı ve satış ↔ tahsilat mutabakatı
export default function PaymentsSection({ data, compareLabel, onZReport }) {
  const { sales, collections: c, comparison: cmp } = data;
  const prev = (key) => (cmp ? cmp[key]?.previous : undefined);

  // Mutabakat: satış (kapanışa göre) ile tahsilat (ödeme zamanına göre) karşılaştırması
  const collectedForSales = c.cash + c.card + c.veresiye - c.tip - c.account_collections;
  const explained = collectedForSales + sales.unpaid_closed;
  const diff = Math.round((sales.net - explained) * 100) / 100;

  const methods = [
    { key: 'cash', label: 'Nakit', Icon: Banknote, value: c.cash, count: c.counts.cash },
    { key: 'card', label: 'Kredi kartı', Icon: CreditCard, value: c.card, count: c.counts.credit_card },
    { key: 'veresiye', label: 'Veresiye', Icon: NotebookPen, value: c.veresiye, count: c.counts.veresiye }
  ];

  return (
    <div className="rh-section">
      <SectionHead
        title="Ödemeler & Kasa"
        description="Kasaya giren para, ödeme türleri ve satışla tahsilatın tutup tutmadığı."
        actions={onZReport && <button type="button" className="rh-btn primary" onClick={onZReport}><Printer size={15} /> Z-Raporu</button>}
      />

      <div className="rh-kpi-row">
        <Kpi Icon={Wallet} label="Kasaya giren" value={money(c.drawer_total)} sub="Nakit + kart" current={c.drawer_total} previous={prev('drawer_total')} />
        <Kpi Icon={NotebookPen} label="Veresiye yazılan" value={money(c.veresiye)} current={c.veresiye} previous={prev('veresiye')} inverse />
        <Kpi Icon={HandCoins} label="Bahşiş" value={money(c.tip)} sub="Kasaya girenin içinde" />
        <Kpi Icon={UserCheck} label="Cari tahsilat" value={money(c.account_collections)} sub="Eski borç ödemeleri" hint="Müşterilerin veresiye borçları için yaptığı ödemeler (adisyon dışı)" />
      </div>

      <div className="rh-grid-2">
        <Card title="Ödeme türleri" subtitle={`${num(c.payment_count)} tahsilat işlemi${c.counts.mixed ? ` · ${num(c.counts.mixed)} parçalı` : ''}`}>
          <StackedShare items={methods.map(m => ({ label: m.label, value: m.value, sub: `${num(m.count)} işlem` }))} />
          <div className="rh-method-grid">
            {methods.map(m => (
              <div key={m.key} className="rh-method">
                <m.Icon size={18} />
                <span>{m.label}</span>
                <strong>{money(m.value)}</strong>
                <em>{m.count ? `Ort. ${money(m.value / m.count)}` : '—'}</em>
              </div>
            ))}
          </div>
          {c.counts.mixed > 0 && <Note>Parçalı ödemelerin nakit ve kart kısımları ilgili türlere eklenmiştir.</Note>}
        </Card>

        <Card title="Satış ↔ tahsilat mutabakatı" subtitle="Net satışın nereye gittiği">
          <dl className="rh-recon">
            <div><dt>Net satış</dt><dd>{money(sales.net)}</dd></div>
            <div className="sub"><dt>Nakit</dt><dd>{money(c.cash)}</dd></div>
            <div className="sub"><dt>Kredi kartı</dt><dd>{money(c.card)}</dd></div>
            <div className="sub"><dt>Veresiye</dt><dd>{money(c.veresiye)}</dd></div>
            <div className="sub minus"><dt>Bahşiş (satış değil)</dt><dd>− {money(c.tip)}</dd></div>
            <div className="sub minus"><dt>Cari tahsilat (eski borç)</dt><dd>− {money(c.account_collections)}</dd></div>
            <div className="sub"><dt>Tahsilsiz kapatılan</dt><dd>{money(sales.unpaid_closed)}</dd></div>
            <div className={`total ${diff ? 'warn' : 'ok'}`}>
              <dt>{diff ? 'Açıklanamayan fark' : 'Fark yok'}</dt>
              <dd>{money(diff)}</dd>
            </div>
          </dl>
          <Note>
            Satış adisyonun kapandığı, tahsilat ödemenin alındığı zamana göre sayılır. Gece yarısını aşan veya dönem sınırındaki adisyonlarda küçük farklar normaldir.
          </Note>
        </Card>
      </div>
      {cmp && <p className="rh-footnote">Değişimler {compareLabel?.toLocaleLowerCase('tr-TR')} ile karşılaştırılmıştır.</p>}
    </div>
  );
}
