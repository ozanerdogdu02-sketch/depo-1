// Tüm sayı/tarih biçimlemesi TEK yerden geçer. Elle string birleştirme yapılmaz —
// Türkçede binlik ayıracı nokta, ondalık virgüldür (1.234,56 ₺) ve bunu her çağrı
// yerinde tekrar tekrar doğru yapmak mümkün değil.

const TL = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TL0 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Para tutarı: 1.234,56 ₺ */
export function fmtTL(n: number): string {
  if (!Number.isFinite(n)) return '—';
  // Büyük tutarlarda kuruş gürültüdür; 100.000 ₺ üstünde kuruşu at.
  return `${Math.abs(n) >= 100_000 ? TL0.format(n) : TL.format(n)} ₺`;
}

/** İşaretli para tutarı: +1.234,56 ₺ / -1.234,56 ₺ */
export function fmtSignedTL(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : '−'}${fmtTL(Math.abs(n)).replace('−', '')}`;
}

/**
 * Birim FİYAT biçimleme — ölçeğe duyarlı.
 * BTC 3.500.000 ₺ ile SHIB 0,00042 ₺ aynı kuralla basılamaz: sabit 2 hane kullanılsa
 * küçük fiyatlar "0,00 ₺" görünürdü (bu sınıf hata FAGENT'ta bir kez yaşandı).
 */
export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  let decimals: number;
  if (abs >= 1000) decimals = 2;
  else if (abs >= 1) decimals = 2;
  else if (abs >= 0.01) decimals = 4;
  else if (abs >= 0.0001) decimals = 6;
  else decimals = 8;
  const fmt = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${fmt.format(n)} ₺`;
}

/** Yüzde: Türkçede işaret sayının ÖNÜNE gelir — %12,3 */
export function fmtPct(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '—';
  const fmt = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `%${fmt.format(n)}`;
}

/** İşaretli yüzde: +%12,3 / −%4,5 */
export function fmtSignedPct(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : '−'}${fmtPct(Math.abs(n), decimals)}`;
}

/** Adet/miktar: 0,5 BTC gibi — gereksiz sıfır basmaz. */
export function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 8 }).format(n);
}

// ── Tarih ────────────────────────────────────────────────────────────────────
// KRİTİK: `toISOString().slice(0,10)` UTC günü verir. Konteyner UTC'de çalıştığı için
// TSİ 01:30'da yazılan bir işlem BİR ÖNCEKİ güne düşerdi. Tüm takvim günü üretimi
// buradan, açıkça saat dilimi verilerek yapılır.

/** Verilen saat diliminde YYYY-AA-GG döner. */
export function localDateString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function todayLocalDate(timeZone: string): string {
  return localDateString(new Date(), timeZone);
}

/** N gün öncesinin takvim günü (aynı saat diliminde). */
export function daysAgoLocalDate(days: number, timeZone: string): string {
  return localDateString(new Date(Date.now() - days * 86_400_000), timeZone);
}

/** "31 Ağustos 2026 20:15" */
export function fmtDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** "20:15" — veri ne zaman alındı notları için. */
export function fmtTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Selamlama için günün vakti. */
export function partOfDay(timeZone: string, now = new Date()): 'sabah' | 'gunduz' | 'aksam' {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now),
  );
  if (hour < 11) return 'sabah';
  if (hour < 18) return 'gunduz';
  return 'aksam';
}

/**
 * Ad karşılaştırması: büyük/küçük harf ve boşluk duyarsız.
 * 'tr-TR' locale kullanılır — İngilizce toLowerCase() "IŞIK" → "işik" yapıp
 * Türkçe İ/I ayrımını bozardı.
 */
export function normalizeName(s: string): string {
  return s.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

/**
 * Telegram HTML parse_mode için kaçış.
 * MarkdownV2 yerine HTML seçildi: MarkdownV2 `.`, `-`, `(`, `!` dahil 18 karakter kaçışı
 * ister ve Türkçe metin + para tutarları bunlarla dolu — tek kaçırılan nokta mesajın
 * tamamının gönderilememesine yol açar. HTML'de yalnızca üç karakter kaçmak yeterli.
 * Kullanıcının girdiği HER metin (varlık adları, notlar) buradan geçmeli.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
