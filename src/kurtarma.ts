// Kurtarma rafı: listele, geri yükle, dışa aktar (veri yolculuğu sahne A6). ARKA PLAN İŞLEVİ: ekranı YOKTUR.
//
// Bozuk bir kayıt okunamayınca ham değer kurtarma rafına alınır (src/recovery.ts, src/storage/mirror.ts):
//   localStorage  `fagent.recovery.corrupt.<anahtar>[.2-.5]`  -> tür 'bozuk'  (ham değer var)
//   localStorage  `fagent.recovery.corrupt.<anahtar>.not`     -> tür 'buyuk'  (yalnız not; ham değer IndexedDB'de)
//   IndexedDB     `fagent.recovery.idb.bozuk.<anahtar>[.<ms>]` -> tür 'buyuk'  (256 KB üstü bozuk ham değer)
//   IndexedDB     `fagent.recovery.idb.<anahtar>[.<ms>]`       -> tür 'farklilik' (açılışta localStorage ile farklı bulunan kopya)
//   IndexedDB     `fagent.recovery.idb.geri.<anahtar>[.<ms>]`  -> tür 'onceki' (geri yüklemeden / başka sekmenin değerinin korunmasından ÖNCEKİ değer)
// Geri yükleme localStorage ESAS kuralına uyar: değer localStorage'a A14 yoluyla (applyUserData, anlık görüntü + rollback)
// yazılır; ayna (IndexedDB) o yazımın write-through'u ile eşitlenir. Kurtarma kayıtları geri yüklemede SİLİNMEZ.
// Saf mantık: depolar parametre olarak girer (tarayıcı bağı çağıranda); ağ/React yok. Hata fırlatmaz.
import { BACKED_UP_KEYS, applyUserData } from './backup.ts';
import { getUnsavedKeys } from './yazmaDurumu.ts';
import { reloadPortfolioFromDisk } from './store.ts';
import { bumpLayerEpoch } from './sekmeSenkron.ts';
import { CORRUPT_NOTE_PREFIX, RECOVERY_IDB_PREFIX, BOZUK_KOVA_ONEKI, GERI_KOVA_ONEKI, MIRROR_CLEARED_KEY, saveRecovery, recoveryBase, resetMarkerActive, ok, fail } from './storage/index.ts';
import type { KvStore, Result, StorageError } from './storage/index.ts';

export type KurtarmaTuru = 'bozuk' | 'farklilik' | 'buyuk' | 'onceki';
export type KurtarmaKaynagi = 'localStorage' | 'indexedDB';

export interface KurtarmaKaydi {
  id: string;                 // `ls:<tam anahtar>` ya da `idb:<tam anahtar>` (geri yükleme/dışa aktarma bunu alır)
  kaynak: KurtarmaKaynagi;
  anahtar: string;            // ait olduğu katman anahtarı (ör. fagent.portfolio.v1)
  tur: KurtarmaTuru;
  tarih?: string;             // ISO; YALNIZ kayıt adından çıkarılabiliyorsa (IndexedDB ek kayıtları). Uydurulmaz.
  boyut: number;              // ham değer (ya da not) uzunluğu, karakter
  hamDegerVar: boolean;       // false = yalnız not (ham değer başka kayıtta)
}

export interface KurtarmaDepolari {
  ls: KvStore;                // localStorage deposu
  idb?: KvStore;              // IndexedDB deposu (yoksa yalnız localStorage rafı)
}

const LS_PREFIX = CORRUPT_NOTE_PREFIX;
const MS_ESIK = 1e12;         // bundan küçük sayı sonekleri zaman damgası sayılmaz

// "<anahtar>[.<sayı>]" -> { anahtar, sonek }. Katman anahtarları ".v1" ile biter; "v1" salt rakam değildir.
function sonekAyir(rest: string): { anahtar: string; sonek?: number } {
  const m = /^(.*)\.(\d+)$/.exec(rest);
  return m ? { anahtar: m[1], sonek: Number(m[2]) } : { anahtar: rest };
}

function isoOrUndefined(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < MS_ESIK) return undefined;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// Anahtar adından kayıt üstverisi (içerik okunmadan).
export function kurtarmaAdiniCoz(kaynak: KurtarmaKaynagi, tamAnahtar: string): Omit<KurtarmaKaydi, 'boyut' | 'hamDegerVar'> | undefined {
  if (kaynak === 'localStorage') {
    if (!tamAnahtar.startsWith(LS_PREFIX)) return undefined;
    const rest = tamAnahtar.slice(LS_PREFIX.length);
    if (rest.endsWith('.not')) return { id: `ls:${tamAnahtar}`, kaynak, anahtar: rest.slice(0, -4), tur: 'buyuk' };
    return { id: `ls:${tamAnahtar}`, kaynak, anahtar: sonekAyir(rest).anahtar, tur: 'bozuk' };
  }
  if (!tamAnahtar.startsWith(RECOVERY_IDB_PREFIX)) return undefined;
  let rest = tamAnahtar.slice(RECOVERY_IDB_PREFIX.length);
  let tur: KurtarmaTuru = 'farklilik';
  if (rest.startsWith(BOZUK_KOVA_ONEKI)) { tur = 'buyuk'; rest = rest.slice(BOZUK_KOVA_ONEKI.length); }
  else if (rest.startsWith(GERI_KOVA_ONEKI)) { tur = 'onceki'; rest = rest.slice(GERI_KOVA_ONEKI.length); }
  const { anahtar, sonek } = sonekAyir(rest);
  return { id: `idb:${tamAnahtar}`, kaynak, anahtar, tur, tarih: isoOrUndefined(sonek) };
}

// Raftaki tüm kayıtlar: en yeni (tarihli) önce; tarihsizler anahtar adına göre sonra.
// PERFORMANS: boyut için her kaydın değeri okunur (KvStore'da yalnız-uzunluk okuması yok). Raf küçük ve sınırlıdır
// (localStorage'da anahtar başına en çok 5 kopya, IndexedDB'de kova başına anahtar başına 3; en kötü durumda birkaç MB), bu yüzden
// kabul edildi; sık aralıkla (ör. her render) çağrılmamalıdır — açılışta ya da kullanıcı isteğiyle çağrılır.
export async function listRecoveries(d: KurtarmaDepolari): Promise<Result<KurtarmaKaydi[]>> {
  const out: KurtarmaKaydi[] = [];
  const kaynaklar: [KurtarmaKaynagi, KvStore | undefined, string][] = [
    ['localStorage', d.ls, LS_PREFIX], ['indexedDB', d.idb, RECOVERY_IDB_PREFIX],
  ];
  for (const [kaynak, store, onek] of kaynaklar) {
    if (!store) continue;
    const l = await store.list(onek);
    if (!l.ok) return l;
    for (const k of l.value) {
      const ad = kurtarmaAdiniCoz(kaynak, k);
      if (!ad) continue;
      const v = await store.get(k);
      if (!v.ok) return v;
      if (v.value === undefined) continue; // listeleme ile okuma arasında silinmiş
      out.push({ ...ad, boyut: v.value.length, hamDegerVar: !(kaynak === 'localStorage' && ad.tur === 'buyuk') });
    }
  }
  out.sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? '') || a.id.localeCompare(b.id));
  return ok(out);
}

function depoVeKey(d: KurtarmaDepolari, id: string): { store?: KvStore; key: string } {
  if (id.startsWith('ls:')) return { store: d.ls, key: id.slice(3) };
  if (id.startsWith('idb:')) return { store: d.idb, key: id.slice(4) };
  return { key: id };
}

// YALNIZ kurtarma önekleri okunur (kullanıcı katmanlarını ya da başka anahtarları bu yoldan okumak mümkün değildir).
export async function readRecovery(d: KurtarmaDepolari, id: string): Promise<Result<string | undefined>> {
  const { store, key } = depoVeKey(d, id);
  if (!store) return fail('unavailable', 'Bu kurtarma kaynağı kullanılamıyor');
  const onek = id.startsWith('ls:') ? LS_PREFIX : RECOVERY_IDB_PREFIX;
  if (!key.startsWith(onek)) return fail('corrupt', 'Bu anahtar bir kurtarma kaydı değil');
  return store.get(key);
}

// Katman başına yapısal doğrulama (yazmadan önce). Yükleyicilerin kabul ettiği biçimle uyumlu, onlardan sıkı değil:
// amaç "ayrıştırılabilir ve katmanın ana şekline sahip" demek; alan göçünü yükleyici yapar.
const sayiOrani = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
  && Object.values(v as Record<string, unknown>).every(x => typeof x === 'number' && Number.isFinite(x));
const nesne = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
const DOGRULAYICI: Record<string, (v: unknown) => boolean> = {
  'fagent.portfolio.v1': v => nesne(v) && Array.isArray((v as { holdings?: unknown }).holdings) && Array.isArray((v as { txns?: unknown }).txns),
  'fagent.agent.memory.v1': nesne,
  'fagent.agent.training.v1': v => Array.isArray(v),
  'fagent.tax.v1': sayiOrani,
  'fagent.target.v1': sayiOrani,
};

export interface KurtarmaDisaAktarim {
  dosyaAdi: string;
  icerik: string;             // yedek dosyası biçimi (fagentBackup + data); ham metin data[anahtar] içinde, DEĞİŞTİRİLMEDEN
}

// Ham metni yedek dosyası mantığıyla dışa aktarılabilir biçime sarar. Ayrıştırılamasa da ham metin aynen taşınır.
export function disaAktarimOlustur(anahtar: string, ham: string, id: string, simdi = new Date()): KurtarmaDisaAktarim {
  const kisa = id.replace(/^(ls|idb):/, '').replace(/^fagent\.recovery\.(corrupt|idb)\./, '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  const icerik = JSON.stringify({
    fagentBackup: 1,
    createdAt: simdi.toISOString(),
    kurtarma: { id, anahtar, not: 'Kurtarma rafından dışa aktarıldı; ham değer değiştirilmedi, geçerli olmayabilir.' },
    data: { [anahtar]: ham },
  }, null, 2);
  return { dosyaAdi: `fagent-kurtarma-${kisa}.json`, icerik };
}

export async function exportRecovery(d: KurtarmaDepolari, id: string, simdi = new Date()): Promise<Result<KurtarmaDisaAktarim>> {
  const kayit = (await listRecoveries(d));
  if (!kayit.ok) return kayit;
  const k = kayit.value.find(x => x.id === id);
  if (!k) return fail('corrupt', 'Kurtarma kaydı bulunamadı');
  const r = await readRecovery(d, id);
  if (!r.ok) return r;
  if (r.value === undefined) return fail('corrupt', 'Kurtarma kaydı bulunamadı');
  return ok(disaAktarimOlustur(k.anahtar, r.value, id, simdi));
}

export type KurtarmaNedeni =
  | 'bulunamadi'          // kayıt yok
  | 'yalniz-not'          // yalnız uzunluk notu; ham değer bu kayıtta yok
  | 'desteklenmiyor'      // anahtar yedeklenen katmanlardan biri değil
  | 'ayristirilamadi'     // JSON değil: disaAktarim döner
  | 'gecersiz-bicim'      // JSON ama katmanın biçiminde değil: disaAktarim döner
  | 'bekleyen-var'        // bu anahtarda diske yazılamamış (bekleyen) değer var: ezilmez
  | 'sifirlama-suruyor'   // SIFIRLA/çıkış sürüyor ya da bitti (kaynak kayıt artık yok): silinen veri geri yazılmaz
  | 'durum-degisti'       // beklemeler sırasında katmanın diskteki değeri başka yerden değişti: hiçbir şey yazılmadı
  | 'onceki-korunamadi'   // mevcut değer kurtarma rafına alınamadı: hiçbir şey yazılmadı
  | 'yazilamadi'          // A14 yolu: rollback durumu döner
  | 'okuma-hatasi';

export type KurtarmaSonucu =
  | { ok: true; anahtar: string; oncekiKorundu: boolean }
  | { ok: false; neden: KurtarmaNedeni; disaAktarim?: KurtarmaDisaAktarim; rollback?: 'tamam' | 'eksik'; hata?: StorageError };

export interface GeriYuklemeSecenekleri {
  // Başarılı yazımdan sonra EK olarak çağrılır. Bellek tazelemesi (portföy yeniden yükleme / katman sayacı) her durumda
  // restoreRecovery İÇİNDE yapılır; çağıranın unutma ihtimali yoktur.
  sonrasi?: (anahtar: string) => void;
  simdi?: Date;
}

// Bir kurtarma kaydını ilgili katmana geri yükler. Sıra: (1) kayıt okunur, (2) anahtar beyaz listede mi, (3) JSON + katman
// biçimi doğrulanır — başarısızsa HİÇBİR ŞEY yazılmaz ve ham metin dışa aktarılabilir biçimde döner, (4) bekleyen değer
// ezilmez, (5) mevcut değer (varsa, farklıysa) kurtarma rafına alınır ki geri yükleme de geri alınabilsin, (6) yazım
// applyUserData ile (anlık görüntü + rollback; yalnız bu katman), (7) bellek tazelenir.
// İKİ SEKME: aynı kayıt iki sekmede eşzamanlı geri yüklenirse son yazan kazanır; öteki sekme storage olayıyla diskten yeniden
// yükler (src/sekmeSenkron.ts), ezilen değer 'onceki' kovasına alınmış olur. Kilit yoktur.
export async function restoreRecovery(d: KurtarmaDepolari, id: string, opts: GeriYuklemeSecenekleri = {}): Promise<KurtarmaSonucu> {
  const liste = await listRecoveries(d);
  if (!liste.ok) return { ok: false, neden: 'okuma-hatasi', hata: liste.error };
  const kayit = liste.value.find(x => x.id === id);
  if (!kayit) return { ok: false, neden: 'bulunamadi' };
  if (!kayit.hamDegerVar) return { ok: false, neden: 'yalniz-not' };
  const r = await readRecovery(d, id);
  if (!r.ok) return { ok: false, neden: 'okuma-hatasi', hata: r.error };
  if (r.value === undefined) return { ok: false, neden: 'bulunamadi' };
  const ham = r.value;
  const anahtar = kayit.anahtar;
  if (!(BACKED_UP_KEYS as readonly string[]).includes(anahtar)) return { ok: false, neden: 'desteklenmiyor' };

  const disaAktarim = () => disaAktarimOlustur(anahtar, ham, id, opts.simdi);
  let parsed: unknown;
  try { parsed = JSON.parse(ham); } catch { return { ok: false, neden: 'ayristirilamadi', disaAktarim: disaAktarim() }; }
  if (!DOGRULAYICI[anahtar]?.(parsed)) return { ok: false, neden: 'gecersiz-bicim', disaAktarim: disaAktarim() };

  if (getUnsavedKeys().includes(anahtar)) return { ok: false, neden: 'bekleyen-var' };

  // Mevcut değer: localStorage'daki ham metin. Aynıysa korumaya gerek yok.
  let oncekiKorundu = false;
  const kaynakKey = kayit.kaynak === 'indexedDB' ? id.slice(4) : undefined;
  const sifirlama = await d.ls.get(MIRROR_CLEARED_KEY);
  if (!sifirlama.ok) return { ok: false, neden: 'okuma-hatasi', hata: sifirlama.error };
  if (resetMarkerActive(sifirlama.value)) return { ok: false, neden: 'sifirlama-suruyor' };
  const mevcut = await d.ls.get(anahtar);
  if (!mevcut.ok) return { ok: false, neden: 'okuma-hatasi', hata: mevcut.error };
  let yeniKayit: string | undefined; // bu çağrıda OLUŞTURULAN 'geri' kaydı (önceden var olan eşleşme sayılmaz)
  if (mevcut.value !== undefined && mevcut.value !== ham) {
    if (!d.idb) return { ok: false, neden: 'onceki-korunamadi' }; // geri alınabilirlik güvencesi verilemiyor: yazma
    const onceki = await d.idb.list(recoveryBase(anahtar, 'geri'));
    const sv = await saveRecovery(d.idb, anahtar, mevcut.value, 'geri', kaynakKey ? [kaynakKey] : []);
    if (sv.error) return { ok: false, neden: 'onceki-korunamadi', hata: sv.error };
    if (sv.key && onceki.ok && !onceki.value.includes(sv.key)) yeniKayit = sv.key;
    oncekiKorundu = true;
  }

  // KVKK (D-b): kopya alınırken SIFIRLA/çıkış tamamlanmış olabilir (işaret artık yok!). Katmanın diskteki değeri ve kaynak kayıt
  // hâlâ olduğu gibi mi diye yeniden bakılır; değilse bu çağrıda oluşturulan 'geri' kaydı SİLİNİR ve hiçbir şey yazılmaz.
  const geriAl = async (): Promise<void> => { if (yeniKayit && d.idb) { try { await d.idb.delete(yeniKayit); } catch { /* yok */ } } };
  const simdiki = await d.ls.get(anahtar);
  const kaynakSimdi = await readRecovery(d, id);
  const isaretSimdi = await d.ls.get(MIRROR_CLEARED_KEY);
  const sifirlandi = isaretSimdi.ok && resetMarkerActive(isaretSimdi.value);
  if (sifirlandi || !kaynakSimdi.ok || kaynakSimdi.value !== ham) { await geriAl(); return { ok: false, neden: 'sifirlama-suruyor' }; }
  if (!simdiki.ok || simdiki.value !== mevcut.value) { await geriAl(); return { ok: false, neden: 'durum-degisti' }; }

  // Beklemeler (await) sırasında durum değişmiş olabilir: yazımdan HEMEN önce SENKRON yeniden denetle (D1/D2).
  if (getUnsavedKeys().includes(anahtar)) return { ok: false, neden: 'bekleyen-var' };
  try { if (resetMarkerActive(localStorage.getItem(MIRROR_CLEARED_KEY))) { await geriAl(); return { ok: false, neden: 'sifirlama-suruyor' }; } } catch { /* okunamıyor: applyUserData da başarısız olur */ }
  const sonuc = applyUserData({ [anahtar]: ham }, { mode: 'selected', only: [anahtar] });
  if (!sonuc.ok) {
    if (sonuc.reason === 'yazilamadi') return { ok: false, neden: 'yazilamadi', rollback: sonuc.rollback };
    return { ok: false, neden: 'gecersiz-bicim', disaAktarim: disaAktarim() };
  }
  // Bellek tazelemesi: portföy diskten yeniden yüklenir, diğer katmanların ekran durumu için sayaç artar.
  try { if (anahtar === 'fagent.portfolio.v1') reloadPortfolioFromDisk(); else bumpLayerEpoch(); } catch { /* tazeleme hatası geri yüklemeyi geri almaz */ }
  try { opts.sonrasi?.(anahtar); } catch { /* ek geri çağrı hatası geri yüklemeyi geri almaz */ }
  return { ok: true, anahtar, oncekiKorundu };
}
