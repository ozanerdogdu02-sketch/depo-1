import { ASSET_LABELS, Holding, Txn, pnlOf } from './store';

function toCsv(rows: string[][]): string {
  return rows
    .map(row => row.map(cell => {
      const needsQuote = /[",\n;]/.test(cell);
      const escaped = cell.replace(/"/g, '""');
      return needsQuote ? `"${escaped}"` : escaped;
    }).join(';'))
    .join('\r\n');
}

function downloadCsv(filename: string, csv: string): void {
  // Başına BOM eklenir — Excel'in Türkçe karakterleri (ı, ş, ğ...) doğru göstermesi için.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportHoldingsCsv(holdings: Holding[]): void {
  const rows: string[][] = [
    ['Varlık', 'Tür', 'Maliyet (TL)', 'Güncel Değer (TL)', 'Kâr/Zarar (TL)', 'Kâr/Zarar (%)'],
    ...holdings.map(h => {
      const { abs, pct } = pnlOf(h.amount, h.costBasis);
      return [
        h.name,
        ASSET_LABELS[h.type],
        h.costBasis.toFixed(2),
        h.amount.toFixed(2),
        abs.toFixed(2),
        pct.toFixed(2),
      ];
    }),
  ];
  downloadCsv(`fagent-varliklar-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
}

export function exportTxnsCsv(txns: Txn[]): void {
  const rows: string[][] = [
    ['Tarih', 'Varlık', 'İşlem', 'Tutar (TL)'],
    ...txns.map(t => [t.date, t.holdingName, t.kind === 'alis' ? 'Alış' : 'Satış', t.amount.toFixed(2)]),
  ];
  downloadCsv(`fagent-islemler-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
}
