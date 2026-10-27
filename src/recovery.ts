// Bozuk kayıt koruması. Bir katmanın localStorage değeri okunamıyorsa (bozuk JSON / beklenmeyen biçim)
// katman boş durumla açılır; İLK KAYITTA bozuk ham değer ezilirdi. Bunu önlemek için ham değer
// ayrı bir anahtara kopyalanır: `fagent.recovery.corrupt.<anahtar>[.2-.5]`.
//  * Ham değer MAX_RAW_COPY (256 KB) üstündeyse localStorage'a kopyalanmaz: `<anahtar>.not` notu (uzunluk) yazılır ve
//    ham değer IndexedDB kurtarma kaydına (fagent.recovery.idb.*) alınır (setOversizeSink).
//  * Aynı ham değer ikinci kez yazılmaz (okuma her renderda çağrılabilir). En çok 5 farklı kopya tutulur.
//  * Bu anahtarlar BACKED_UP_KEYS'te DEĞİLDİR: yedek dosyasına ve buluta GİTMEZ (yalnızca bu tarayıcıda).
//  * SIFIRLA ve çıkış bunları siler (clearRecoveryKeys) — kullanıcının "sil" isteği kalıntı bırakmaz.
// Saf yardımcı: yalnız localStorage; ağ/React yok; hata fırlatmaz.
export const RECOVERY_PREFIX = 'fagent.recovery.';
const MAX_COPIES = 5;
// Bundan büyük ham değer KOPYALANMAZ (localStorage kotasını doldurmasın): yalnızca anahtar/uzunluk notu yazılır.
export const MAX_RAW_COPY = 256 * 1024;

// Büyük ham değer için kopya localStorage'a YAZILMAZ. Sıra: (1) IndexedDB kurtarma kaydını alacak alıcı ÇAĞRILIR
// (src/mirror.ts bootStorage sonrası kaydeder; true = kayıt alındı), (2) AYRI bir try ile `.not` notu yazılır.
// Not yazılamazsa (kota) ve kayıt henüz alınmadıysa anahtar "korumalı" işaretlenir: ayna yazıcısı o anahtara
// kayıt alınana dek yazmaz/silmez (bozuk kopya kurtarılmadan ezilmesin). Not = "kurtarma kaydı henüz alınmadı";
// kayıt alınınca alıcı notu siler. Aynı anahtar+ham değer oturumda BİR kez işlenir (okuyucular her çağrıda load() yapar).
type OversizeSink = (key: string, raw: string) => Promise<boolean> | boolean | void;
type ProtectSink = (key: string, on: boolean) => void;
let oversizeSink: OversizeSink | undefined;
let protectSink: ProtectSink | undefined;
const handled = new Map<string, string>();
export function setOversizeSink(fn: OversizeSink | undefined, protect?: ProtectSink): void {
  oversizeSink = fn; protectSink = protect; handled.clear();
}

export function preserveCorruptRaw(key: string, raw: string): void {
  try {
    const base = `${RECOVERY_PREFIX}corrupt.${key}`;
    if (raw.length > MAX_RAW_COPY) {
      if (handled.get(key) === raw) return;
      handled.set(key, raw);
      let saving: Promise<boolean> = Promise.resolve(false);
      try {
        const r = oversizeSink?.(key, raw);
        saving = Promise.resolve(r === undefined ? false : r).then(v => v === true, () => false);
      } catch { /* alıcı hatası: kayıt alınmadı sayılır */ }
      let noteOk = false;
      try {
        localStorage.setItem(`${base}.not`, `ham değer ${raw.length} karakter; ${MAX_RAW_COPY} sınırını aştığı için localStorage'a kopyalanmadı; IndexedDB kurtarma kaydı henüz alınmadı (alınınca bu not silinir)`);
        noteOk = true;
      } catch { /* kota: not yazılamadı */ }
      if (!noteOk) {
        try { protectSink?.(key, true); } catch { /* yok */ }
        void saving.then(ok => { if (ok) { try { protectSink?.(key, false); } catch { /* yok */ } } });
      }
      return;
    }
    for (let n = 1; n <= MAX_COPIES; n++) {
      const slot = n === 1 ? base : `${base}.${n}`;
      const cur = localStorage.getItem(slot);
      if (cur === raw) return;
      if (cur === null) { localStorage.setItem(slot, raw); return; }
    }
  } catch { /* kota/erişim yok: kopya alınamadı, mevcut davranış (boş açılış) sürer */ }
}

export function clearRecoveryKeys(): void {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(RECOVERY_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* yok */ }
}
