import { ASSET_LABELS, AssetType, Holding, Txn, pnlOf } from './store';

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

const LABEL_TO_TYPE: Record<string, AssetType> = Object.fromEntries(
  Object.entries(ASSET_LABELS).map(([type, label]) => [label.toLocaleLowerCase('tr-TR'), type as AssetType]),
);

// Tırnaklı hücreleri (içinde ; veya " geçenleri) doğru ayrıştıran basit CSV satır ayrıştırıcı
// — exportHoldingsCsv'nin ürettiği kaçışlamayla (RFC 4180 benzeri) uyumludur.
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      cells.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export interface ParsedHoldingRow {
  name: string;
  type: AssetType;
  costBasis: number;
  amount: number;
}

export interface ImportResult {
  rows: ParsedHoldingRow[];
  skipped: number;
}

// "Varlık;Tür;Maliyet (TL);Güncel Değer (TL);..." biçimini bekler (exportHoldingsCsv çıktısı).
// Fazladan sütunlar (Kâr/Zarar vb.) yok sayılır. Geçersiz satırlar sessizce atlanır, sayılır.
export function parseHoldingsCsv(text: string): ImportResult {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r\n|\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], skipped: 0 };

  const startIdx = /varlık/i.test(lines[0]) ? 1 : 0;
  const rows: ParsedHoldingRow[] = [];
  let skipped = 0;

  for (let i = startIdx; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const name = (cells[0] ?? '').trim();
    const type = LABEL_TO_TYPE[(cells[1] ?? '').trim().toLocaleLowerCase('tr-TR')];
    const costBasis = Number((cells[2] ?? '').trim().replace(',', '.'));
    const amount = Number((cells[3] ?? '').trim().replace(',', '.'));

    if (!name || !type || !Number.isFinite(costBasis) || costBasis < 0 || !Number.isFinite(amount) || amount < 0) {
      skipped++;
      continue;
    }
    rows.push({ name, type, costBasis, amount });
  }
  return { rows, skipped };
}
