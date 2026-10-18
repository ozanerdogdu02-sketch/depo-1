// TCMB EVDS istemcisi — yıllık TÜFE enflasyonunu resmî kaynaktan çeker.
//
// Anahtar burada YOK: istek `netlify/functions/evds.mjs` proxy'sine gider, anahtar orada
// (sunucu ortam değişkeninde) durur. Bu modül anahtarı ne görür ne saklar.
//
// FAIL-SAFE TASARIM — en önemli özellik: bu modül HİÇBİR KOŞULDA hata fırlatmaz ve asla
// tahmin edilmiş bir sayı döndürmez. Beklenmedik her durumda `undefined` döner, çağıran da
// elle girilen enflasyon varsayımına düşer. Yanlış bir enflasyon oranı SESSİZCE yanlış
// sonuç üretirdi (reel getiri, vergi sonrası getiri, nakit erimesi — hepsi buna dayanıyor);
// "veri yok" demek, "yanlış veri" demekten her zaman iyidir.

const FN_URL = '/.netlify/functions/evds';
const CACHE_KEY = 'fagent.evds.v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 saat — TÜFE ayda bir açıklanır

// TÜFE genel endeksi. DOĞRULANMADI — EVDS arayüzünden teyit edilecek (kullanıcı seri kodunu
// gönderecek). Kod yanlışsa proxy boş/hatalı yanıt verir, bu modül `undefined` döner ve
// varsayıma düşülür; ekranda YANLIŞ BİR SAYI ÇIKMAZ. Yıllık değişimi endeksin kendisinden
// hesapladığımız için serinin baz yılı (2003=100 vb.) sonucu etkilemez.
export const TUFE_SERIES = 'TP.FG.J0';

export interface InflationReading {
  annualPct: number;    // yıllık % değişim
  periodLabel: string;  // ör. "07-2026" — hangi aya ait olduğu
  fetchedAt: string;
}

interface CacheShape {
  reading: InflationReading;
  storedAt: number;
}

function readCache(): InflationReading | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed?.reading || typeof parsed.storedAt !== 'number') return undefined;
    if (Date.now() - parsed.storedAt > CACHE_TTL_MS) return undefined;
    return typeof parsed.reading.annualPct === 'number' && Number.isFinite(parsed.reading.annualPct)
      ? parsed.reading
      : undefined;
  } catch { return undefined; }
}

function writeCache(reading: InflationReading): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ reading, storedAt: Date.now() })); } catch { /* kota */ }
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

function evdsDate(d: Date): string {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// EVDS satırlarında tarih alanı `Tarih`, değer alanı ise seri koduna göre adlandırılır
// (noktalar alt çizgiye dönüşür: TP.FG.J0 → TP_FG_J0). Alan adını VARSAYMAK yerine, tarih ve
// zaman damgası dışındaki ilk sayısal alanı buluyoruz — seri kodu değişse de çalışır.
function valueOf(item: Record<string, unknown>): number | undefined {
  for (const [k, v] of Object.entries(item)) {
    if (k === 'Tarih' || k === 'UNIXTIME' || k === 'YEARWEEK') continue;
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return undefined;
}

// Yıllık enflasyonu döner. Başarısızlıkta `undefined` — throw ETMEZ.
export async function fetchInflationPct(signal?: AbortSignal): Promise<InflationReading | undefined> {
  const cached = readCache();
  if (cached) return cached;

  if (!TUFE_SERIES) return undefined;

  // Son ~14 ay: yıllık değişimi hesaplamak için en az 13 gözlem gerekir (bu ay + 12 ay öncesi).
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - 14, 1);
  const qs = `series=${encodeURIComponent(TUFE_SERIES)}&startDate=${evdsDate(start)}&endDate=${evdsDate(end)}`;

  let res: Response;
  try {
    res = await fetch(`${FN_URL}?${qs}`, { signal });
  } catch {
    return undefined; // fonksiyon yok (yerel geliştirme), ağ yok, ya da istek iptal edildi
  }
  if (!res.ok) return undefined; // 503 = anahtar tanımsız; 502 = TCMB yanıt vermiyor

  const data = await res.json().catch(() => null) as { items?: Record<string, unknown>[] } | null;
  const items = Array.isArray(data?.items) ? data!.items : undefined;
  if (!items || items.length < 13) return undefined;

  // Boş/okunamayan satırları ayıkla — EVDS ileriye dönük boş aylar döndürebilir.
  const series = items
    .map(it => ({ label: typeof it.Tarih === 'string' ? it.Tarih : '', value: valueOf(it) }))
    .filter((r): r is { label: string; value: number } => r.value !== undefined);

  if (series.length < 13) return undefined;

  const latest = series[series.length - 1];
  const yearAgo = series[series.length - 13];
  if (!(yearAgo.value > 0)) return undefined;

  const annualPct = (latest.value / yearAgo.value - 1) * 100;
  // Akla yatkınlık kontrolü: ayrıştırma kayarsa saçma bir sayı çıkar. Sınır dışıysa veri yok say.
  if (!Number.isFinite(annualPct) || annualPct < -50 || annualPct > 500) return undefined;

  const reading: InflationReading = {
    annualPct: Math.round(annualPct * 10) / 10,
    periodLabel: latest.label,
    fetchedAt: new Date().toISOString(),
  };
  writeCache(reading);
  return reading;
}
