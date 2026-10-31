/* Tarih aralıklı vergi/stopaj kuralları: SAF okuyucu ve doğrulayıcı (P6, veri yolculuğu A10).
   I/O, React, window YOK; kural listesi parametreyle girer. Yeni bağımlılık yok (elle doğrulayıcı).
   Kural dosyası: src/config/tax_rules.json. Şema:
     { surum: 1, aciklama?: string, kurallar: Kural[] }
     Kural = { id, varlikTuru, oranPct (0-100), baslangic: 'YYYY-AA-GG'|null, bitis: 'YYYY-AA-GG'|null (dahil),
               kaynak: string|null, dogrulandi: boolean, oranBilinmiyor: boolean, not: string }
   Aynı varlık türünde aralıklar çakışamaz ve aralarında boşluk olamaz (bitis + 1 gün = sonraki baslangic);
   yalnız ilk kuralın baslangic'ı, yalnız son kuralın bitis'i null (açık uç) olabilir. */

export interface VergiKurali {
  id: string;
  varlikTuru: string;
  oranPct: number;
  baslangic: string | null;
  bitis: string | null;
  kaynak: string | null;
  dogrulandi: boolean;
  oranBilinmiyor: boolean;
  /** İsteğe bağlı: ekranda/ajanda gösterilen dayanak adı (ör. karar tarihi ve sayısı). Doğrulanmadıysa kural dogrulandi:false kalır. */
  dayanakMetni?: string | null;
  not: string;
}
export interface VergiKuralDosyasi { surum: number; aciklama?: string; kurallar: VergiKurali[] }

const TARIH = /^\d{4}-\d{2}-\d{2}$/;

/** Takvimde var olan 'YYYY-AA-GG' mi (2026-02-30 geçersiz). */
export function gecerliTarihMi(s: unknown): s is string {
  if (typeof s !== 'string' || !TARIH.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function ertesiGun(s: string): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Yerel takvim günü (store.todayLocalDate ile aynı kural; store.ts yan etkili olduğundan burada tekrar). */
export function yerelBugun(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Aynı grubun (varlık türü / varsayım anahtarı) aralıklarında çakışma, boşluk ve yanlış yerde null kontrolü.
    Vergi kuralları ve piyasa varsayımları (src/varsayimlar.ts) bu tek doğrulayıcıyı paylaşır. */
export function aralikHatalari(liste: readonly { id: string; baslangic: string | null; bitis: string | null }[], t: string): string[] {
  const h: string[] = [];
  const s = [...liste].sort((a, b) => (a.baslangic ?? '').localeCompare(b.baslangic ?? ''));
  for (let i = 0; i < s.length; i++) {
    const k = s[i];
    if (k.baslangic === null && i > 0) h.push(`${t}: baslangic null yalnız ilk kuralda olabilir (${k.id})`);
    if (k.bitis === null && i < s.length - 1) h.push(`${t}: bitis null yalnız son kuralda olabilir (${k.id})`);
    if (i > 0) {
      const onceki = s[i - 1];
      if (onceki.bitis !== null && k.baslangic !== null) {
        if (k.baslangic <= onceki.bitis) h.push(`${t}: ${onceki.id} ile ${k.id} çakışıyor`);
        else if (k.baslangic !== ertesiGun(onceki.bitis)) h.push(`${t}: ${onceki.id} ile ${k.id} arasında boşluk var`);
      }
    }
  }
  return h;
}

/** Hata listesi döner; boş liste = geçerli. gerekliTurler verilirse her türün en az bir kuralı olmalı. */
export function dogrula(dosya: unknown, gerekliTurler: readonly string[] = []): string[] {
  const h: string[] = [];
  if (!dosya || typeof dosya !== 'object' || Array.isArray(dosya)) return ['kök nesne değil'];
  const o = dosya as Record<string, unknown>;
  if (o.surum !== 1) h.push(`desteklenmeyen sürüm: ${String(o.surum)}`);
  if (!Array.isArray(o.kurallar)) return [...h, 'kurallar dizi değil'];
  const ids = new Set<string>();
  const turler = new Map<string, VergiKurali[]>();
  o.kurallar.forEach((k, i) => {
    const ad = `kurallar[${i}]`;
    if (!k || typeof k !== 'object' || Array.isArray(k)) { h.push(`${ad}: nesne değil`); return; }
    const r = k as Record<string, unknown>;
    let ok = true;
    const kotu = (m: string) => { h.push(`${ad}: ${m}`); ok = false; };
    if (typeof r.id !== 'string' || !r.id) kotu('id yok'); else if (ids.has(r.id)) kotu(`yinelenen id ${r.id}`); else ids.add(r.id);
    if (typeof r.varlikTuru !== 'string' || !r.varlikTuru) kotu('varlikTuru yok');
    if (typeof r.oranPct !== 'number' || !Number.isFinite(r.oranPct) || r.oranPct < 0 || r.oranPct > 100) kotu('oranPct 0-100 sayı değil');
    if (r.baslangic !== null && !gecerliTarihMi(r.baslangic)) kotu('baslangic tarih ya da null değil');
    if (r.bitis !== null && !gecerliTarihMi(r.bitis)) kotu('bitis tarih ya da null değil');
    if (r.kaynak !== null && typeof r.kaynak !== 'string') kotu('kaynak metin ya da null değil');
    if (typeof r.dogrulandi !== 'boolean') kotu('dogrulandi boolean değil');
    if (typeof r.oranBilinmiyor !== 'boolean') kotu('oranBilinmiyor boolean değil');
    if (r.dayanakMetni !== undefined && r.dayanakMetni !== null && typeof r.dayanakMetni !== 'string') kotu('dayanakMetni metin ya da null değil');
    if (typeof r.not !== 'string') kotu('not metin değil');
    if (ok) {
      const kr = r as unknown as VergiKurali;
      if (kr.baslangic && kr.bitis && kr.baslangic > kr.bitis) { h.push(`${ad}: baslangic > bitis`); return; }
      (turler.get(kr.varlikTuru) ?? turler.set(kr.varlikTuru, []).get(kr.varlikTuru)!).push(kr);
    }
  });
  for (const t of gerekliTurler) if (!turler.has(t)) h.push(`${t}: kural yok`);
  for (const [t, liste] of turler) h.push(...aralikHatalari(liste, t));
  return h;
}

/** Doğrulanmış dosyayı döner; geçersizse Error fırlatır (sessiz yanlış oran yerine yüksek sesle başarısızlık). */
export function yukle(dosya: unknown, gerekliTurler: readonly string[] = []): VergiKuralDosyasi {
  const hatalar = dogrula(dosya, gerekliTurler);
  if (hatalar.length) throw new Error(`tax_rules.json geçersiz: ${hatalar.join('; ')}`);
  return dosya as VergiKuralDosyasi;
}

/** Tarihte geçerli kural; yoksa undefined (o tarih için kural yok: sayı uydurulmaz). */
export function gecerliKural(d: VergiKuralDosyasi, tur: string, tarih: string): VergiKurali | undefined {
  if (!gecerliTarihMi(tarih)) return undefined;
  return d.kurallar.find(k => k.varlikTuru === tur && (k.baslangic === null || k.baslangic <= tarih) && (k.bitis === null || tarih <= k.bitis));
}

/** Tarihte her tür için varsayılan oran. Kural yoksa oran 0 ve tür 'bilinmiyor' sayılır (varsaymıyor, kullanıcı girer). */
export function varsayilanOranlar<T extends string>(d: VergiKuralDosyasi, turler: readonly T[], tarih: string): { oranlar: Record<T, number>; bilinmeyen: T[] } {
  const oranlar = {} as Record<T, number>;
  const bilinmeyen: T[] = [];
  for (const t of turler) {
    const k = gecerliKural(d, t, tarih);
    oranlar[t] = k ? k.oranPct : 0;
    if (!k || k.oranBilinmiyor) bilinmeyen.push(t);
  }
  return { oranlar, bilinmeyen };
}

/* Çağrı anında (gece yarısını aşan açık sekmede de doğru) bugünün varsayılanları: tarih başına önbellekli.
   Kullanıcı oranı (taxRates.ts) bunun üstüne yazar. Yükleme/doğrulama varsayilanlar.ts'te bir kez yapılır. */
let onbellek: { dosya: VergiKuralDosyasi; tarih: string; anahtar: string; sonuc: { oranlar: Record<string, number>; bilinmeyen: string[] } } | null = null;
export function bugunkuVarsayilanOranlar<T extends string>(d: VergiKuralDosyasi, turler: readonly T[], tarih: string = yerelBugun()): { oranlar: Record<T, number>; bilinmeyen: T[] } {
  const anahtar = turler.join(',');
  // Anahtar: kural dosyası nesnesi + tarih + türler (farklı dosya aynı tarihte eski sonucu döndürmesin).
  if (!onbellek || onbellek.dosya !== d || onbellek.tarih !== tarih || onbellek.anahtar !== anahtar) {
    const r = varsayilanOranlar(d, turler, tarih);
    // Önbellekteki nesne paylaşılır; çağıran değiştiremesin diye dondurulur (değiştirmek isteyen kopyalar: { ...oranlar }).
    onbellek = { dosya: d, tarih, anahtar, sonuc: { oranlar: Object.freeze(r.oranlar), bilinmeyen: Object.freeze(r.bilinmeyen) as unknown as string[] } };
  }
  return onbellek.sonuc as { oranlar: Record<T, number>; bilinmeyen: T[] };
}
