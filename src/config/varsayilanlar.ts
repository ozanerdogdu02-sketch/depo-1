/* Varsayılan oran, enflasyon, stopaj ve eşik sabitleri: TEK YAPILANDIRMA YERİ (spec P0 kural 6 ve P6: docs/veri-akisi/spec.md).
   Bu dosya saftır: I/O, React, window yok; yalnızca `import type` ve saf modül (vergiKurallari.ts) +
   JSON kullanır ki `node --test` doğrudan koşabilsin. Değerler taşınmadan önceki kodla BİREBİR aynıdır.

   Her sabitin yanında kaynak, tarih ve doğrulama durumu yazılır. "doğrulanmadı" etiketi taşıyan
   değer, kaynağı birincil belgeyle kontrol edilene kadar varsayımdır; gerçekmiş gibi gösterilmez. */
import type { AssetType } from '../store.ts';

/* ───────────── Stopaj oranları (%) ─────────────
   Kaynak: 27.03.2026 tarihli 11107 sayılı Cumhurbaşkanı Kararı (Resmî Gazete); yatırım fonu
   katılma payı kazançlarında stopaj %15 → %17,5 (01.05.2026'dan itibaren elde edilen kazançlar).
   TL mevduatta 6 aya kadar vade %17,5; 1 yıla kadar vade %15. Hisse senedi yoğun fonlarda %0
   istisnası sürüyor (TEFAS'ta işlem görmeyen serbest hisse yoğun fonlar hariç).
   Tarih: 2026-08-01 itibarıyla doğrulanmadı (ikincil okuma; birincil belgeyle kontrol edilmedi). Değerler ve geçerlilik aralığı artık src/config/tax_rules.json'dadır (P6); TODO(muhasebe) işaretleri orada `dogrulandi:false` olarak da görünür.
   DOĞRULANAMAYANLAR 0 BIRAKILDI, UYDURULMADI: sıfır "vergi yok" iddiası değil, "bu ürün oran
   varsaymıyor, sen gir" demektir (bkz. UNVERIFIED_TAX). */
// TODO(muhasebe): fon %17,5 ve 11107 sayılı karar için kaynak ve geçerlilik tarihi muhasebeci doğrulaması gerekir.
// TODO(muhasebe): mevduat stopajı vade basamaklıdır (6 ay %17,5 / 1 yıl %15); Holding vade tutmaz, varsayım 6 ay.
// TODO(muhasebe): BIST pay senedi alım-satım kazancında stopaj 0 (GVK geç. 67) ve hisse yoğun fon istisnası doğrulanmadı.
// TODO(muhasebe): kripto, altın, döviz, tahvil, BES, gayrimenkul oranları doğrulanamadı (0 + etiket).
// TODO(muhasebe): komisyon/masraf vergisel işlenişi (maliyete eklenir mi, BSMV/KDV) ve kur farkı kazancı ele alınmadı.
import taxRulesJson from './tax_rules.json' with { type: 'json' };
import { yukle, bugunkuVarsayilanOranlar, yerelBugun } from '../vergiKurallari.ts';
import varsayimlarJson from './varsayimlar.json' with { type: 'json' };
import { yukleVarsayim, varsayimDegeri } from '../varsayimlar.ts';

// Oranlar src/config/tax_rules.json'dan (tarih aralıklı, kaynak/doğrulama alanlı) bugünün tarihine göre türetilir.
// Kullanıcının kendi oranı (taxRates.ts) bunun üstüne yazar. Eşdeğerlik: tests/unit/vergi-kurallari.test.ts.
const TUM_TURLER: readonly AssetType[] = ['fon', 'mevduat', 'hisse', 'kripto', 'altin', 'doviz', 'tahvil', 'bes', 'gayrimenkul']; // eski nesneyle aynı anahtar sırası
export const VERGI_KURALLARI = yukle(taxRulesJson, TUM_TURLER);
// Çağrı anındaki tarihle (gece yarısını aşan açık sekmede de doğru; tarih başına önbellekli). Tüketiciler bunu çağırır.
export function varsayilanVergiOranlari(tarih: string = yerelBugun()): Record<AssetType, number> { return bugunkuVarsayilanOranlar(VERGI_KURALLARI, TUM_TURLER, tarih).oranlar; }
export function dogrulanamayanTurler(tarih: string = yerelBugun()): AssetType[] { return bugunkuVarsayilanOranlar(VERGI_KURALLARI, TUM_TURLER, tarih).bilinmeyen; }
// Sayfa yüklenme anındaki görüntü (eski dışa aktarım adları; testler ve geri uyumluluk için). Yeni kod yukarıdaki işlevleri kullanır.
const turetilen = bugunkuVarsayilanOranlar(VERGI_KURALLARI, TUM_TURLER, yerelBugun());
export const DEFAULT_TAX_RATES: Record<AssetType, number> = turetilen.oranlar;

// Oranı "0 çünkü öyle" ile "0 çünkü doğrulayamadık" ayrımı: arayüz bunu farklı anlatır (tax_rules.json oranBilinmiyor).
export const UNVERIFIED_TAX: AssetType[] = turetilen.bilinmeyen;

/* Ekranda (App.tsx stopaj kartı) ve ajanda (agent.ts vergi yanıtı) gösterilen dayanak cümlesinin parçaları: değerler
   tax_rules.json'dan türetilir, metinde elle yazılı oran/karar numarası kalmaz. Bugünkü çıktı eski sabit metinle aynıdır
   (tests/unit/vergi-kurallari.test.ts). dayanak null ise (o tarih için fon kuralı ya da dayanak yok) cümle "kaynağı
   doğrulanmadı" diye söyler; sayı uydurulmaz. */
export function stopajAciklamasi(tarih: string = yerelBugun()): { dayanak: string | null; ozet: string } {
  const sayi = (n: number) => String(n).replace('.', ',');
  const kural = (tur: AssetType) => VERGI_KURALLARI.kurallar.find(k => k.varlikTuru === tur && (k.baslangic === null || k.baslangic <= tarih) && (k.bitis === null || tarih <= k.bitis));
  const fon = kural('fon'), mev = kural('mevduat'), his = kural('hisse');
  const parcalar: string[] = [];
  if (fon && mev && fon.oranPct === mev.oranPct) parcalar.push(`fon ve 6 aya kadar vadeli TL mevduat %${sayi(fon.oranPct)}`);
  else {
    parcalar.push(fon ? `fon %${sayi(fon.oranPct)}` : 'fon için bu tarihte kural yok');
    if (mev) parcalar.push(`6 aya kadar vadeli TL mevduat %${sayi(mev.oranPct)}`);
  }
  const hisse = his && his.oranPct === 0 ? 'BIST pay senedi alım-satımında stopaj yok' : his ? `BIST pay senedi alım-satımında %${sayi(his.oranPct)}` : 'BIST pay senedi için kural yok';
  return { dayanak: fon?.dayanakMetni ?? null, ozet: `${parcalar.join(', ')}; ${hisse}` };
}

/* ───────────── Piyasa varsayımları (zamanla değişir): src/config/varsayimlar.json ─────────────
   Enflasyon (%30), mevduat faizi (%45), risksiz faiz (%45), senaryo getirileri (%20/35/50) ve sıra riski sapması (15 pp)
   tarih aralıklı, kaynaklı ve `dogrulandi:false` alanlı JSON'dadır; değerler taşınmadan önceki sabitlerle BİREBİR aynıdır.
   Enflasyon kaynağı: TÜİK Eylül 2026 yıllık TÜFE %29,73 (haber kaynaklı, tam sayıya yuvarlandı), doğrulanmadı; canlı
   TCMB EVDS (TP.FG.J0, o da doğrulanmadı) gelemezse geri düşme değeridir. Diğerleri kaynaksız elle varsayımdır. */
// TODO(muhasebe): TÜFE değeri ve TP.FG.J0 seri kodu birincil kaynakla doğrulanmadı.
// TODO(muhasebe): faiz ve senaryo getirileri kaynaksız varsayımdır; "senin varsayımın" etiketiyle gösterilir.
const VARSAYIM_ANAHTARLARI = ['enflasyon_pct', 'mevduat_faiz_pct', 'risksiz_faiz_pct', 'senaryo_dusuk_pct', 'senaryo_orta_pct', 'senaryo_yuksek_pct', 'sira_riski_sapma_pp'] as const;
export const VARSAYIMLAR = yukleVarsayim(varsayimlarJson, VARSAYIM_ANAHTARLARI);
/* Çağrı anındaki tarihle okunur. Tarih için kayıt yoksa (sınırlı aralıklı bir kural bitmişse) en yakın geçmiş kaydın değeri
   kullanılır (hâlâ varsayım etiketli); hiç geçmiş kayıt yoksa sonraki ilk kayıt. Sayı uydurulmaz, bilinen varsayımdan seçilir.
   Geri düşme `varsayimDetay().geriDusuldu` bayrağıyla görünür (şimdilik ekrana bağlı değil: bugünkü kayıtlar açık uçlu).
   Vergi ile fark (gerekçe): yanlış bir stopaj oranı kullanıcıya yanlış NET para gösterir, o yüzden kuralı olmayan tarihte
   oran 0 ve "bilinmiyor" olur; varsayım ise zaten kullanıcının değiştirebildiği, etiketli bir ön değerdir, en yakın bilinen
   değer boş ekrandan daha dürüst bir başlangıçtır. */
export function varsayimDetay(anahtar: (typeof VARSAYIM_ANAHTARLARI)[number], tarih: string = yerelBugun(), dosya: typeof VARSAYIMLAR = VARSAYIMLAR): { deger: number; geriDusuldu: boolean } {
  const d = varsayimDegeri(dosya, anahtar, tarih);
  if (d !== undefined) return { deger: d, geriDusuldu: false };
  const hepsi = dosya.varsayimlar.filter(v => v.anahtar === anahtar).sort((x, y) => (x.baslangic ?? '').localeCompare(y.baslangic ?? ''));
  const gecmis = hepsi.filter(v => v.baslangic === null || v.baslangic <= tarih);
  return { deger: (gecmis.length ? gecmis[gecmis.length - 1] : hepsi[0]).deger, geriDusuldu: true };
}
function varsayim(anahtar: (typeof VARSAYIM_ANAHTARLARI)[number]): number { return varsayimDetay(anahtar).deger; }
export const varsayilanEnflasyonPct = (): number => varsayim('enflasyon_pct');
export const varsayilanMevduatFaizPct = (): number => varsayim('mevduat_faiz_pct');
export const varsayilanRisksizFaizPct = (): number => varsayim('risksiz_faiz_pct');
export const siraRiskiSapmaPP = (): number => varsayim('sira_riski_sapma_pp');
export const senaryoVarsayilanGetirileriPct = (): { dusuk: number; orta: number; yuksek: number } =>
  ({ dusuk: varsayim('senaryo_dusuk_pct'), orta: varsayim('senaryo_orta_pct'), yuksek: varsayim('senaryo_yuksek_pct') });

// Sayfa yüklenme anındaki görüntü (eski dışa aktarım adları; testler ve geri uyumluluk için). Yeni kod yukarıdaki işlevleri kullanır.
export const VARSAYILAN_ENFLASYON_PCT = varsayilanEnflasyonPct();
export const DEFAULT_DEPOSIT_RATE_PCT = varsayilanMevduatFaizPct();
export const DEFAULT_RISK_FREE_PCT = varsayilanRisksizFaizPct();
export const SCENARIO_DEFAULT_RATES_PCT = senaryoVarsayilanGetirileriPct();
export const SIRA_RISKI_SAPMA_PP = siraRiskiSapmaPP();

/* ───────────── Hedef sapma eşikleri (ürün sabiti, TS'te kalır) ─────────────
   bant = min(DRIFT_ABSOLUTE_BAND_PP, hedef × DRIFT_RELATIVE_BAND) puan (gerekçe: analytics.ts driftBandOf).
   Kaynak: ürün tasarım kararı (bir hukuki/vergisel kaynak yok). */
export const DRIFT_ABSOLUTE_BAND_PP = 5;
export const DRIFT_RELATIVE_BAND = 0.25;

/* ───────────── Kaynak bağdaştırıcı sabitleri (src/kaynaklar/) ─────────────
   Kaynak: ürün tasarım kararı (docs/veri-akisi/cok-kaynakli-veri-plani.md §2.2–2.3); hukuki/vergisel iddia yok.
   Tarih: 2026-10-28. Kur günlük sapma eşiği kaynaksız bir akla yatkınlık sınırıdır, piyasa iddiası değildir. */
// En kötü durumda bir kaynağın vazgeçme süresi: 5 sn + 1 sn bekleme + 5 sn = 11 sn (eski: ~34 sn).
// Sunucu ucunun yukarı akış zaman aşımı (4 sn) bundan kısa tutulur.
export const KAYNAK_ZAMAN_ASIMI_MS = 5_000;                    // her istek için
export const KAYNAK_YENIDEN_DENEME_BEKLEME_MS = [1_000] as const; // en çok 1 yeniden deneme
export const KAYNAK_DEVRE_KESICI_MS = 15 * 60 * 1000;          // denemeler tükenince kaynak bu süre denenmez
export const TCMB_TUFE_TTL_MS = 12 * 60 * 60 * 1000;           // TÜFE ayda bir açıklanır
export const TCMB_KUR_TTL_MS = 60 * 60 * 1000;                 // kur günde bir açıklanır
export const KAP_TTL_MS = 15 * 60 * 1000;                      // KAP bildirim listesi: sunucu CDN'i seans içinde 15 dk
export const BIST_TTL_MS = 60 * 60 * 1000;                     // BİST gün sonu tablosu günde bir yayımlanır; istemci 1 saat tutar
export const BIST_GUNLUK_SAPMA_PCT = 20;                       // önceki kapanıştan ± bu kadar dışı: veri yok say (bedelsiz/bölünme günü dahil)
export const TUFE_MANTIK_ARALIK_PCT = { min: -50, max: 500 } as const; // dışı: veri yok say
// TÜFE son dönemi bugünden bu kadar aydan eskiyse veri yok sayılır (eski veri hesaba girmez). TÜİK ayın 3'ünde açıklar:
// normalde en eski kabul edilen dönem ~2 ay geridir; 3 ay bir ay gecikmeye tolerans verir. Kaynak: ürün kararı,
// Tarih: 2026-11-02, tahmin/piyasa iddiası değil; doğrulanmadı.
export const TUFE_DONEM_MAX_YAS_AY = 3;
export const KUR_GUNLUK_SAPMA_PCT = 20;                        // bir önceki gözlemden ± bu kadar dışı: veri yok say

/* ───────────── Yedek dosyası boyut sınırı ─────────────
   Yedek geri yüklemede dosya okunmadan/ayrıştırılmadan ÖNCE uygulanır (güvenilmeyen girdi).
   Birim: bayt ya da karakter, hangisi önce aşılırsa (arayüz dosya baytını, restoreBackup metin karakterini sayar;
   karakter sayısı baytı aşamaz, yani sınır en geç baytta tetiklenir).
   Gerekçe: tarayıcı localStorage kotası köken başına yaklaşık 5 milyon karakterdir; geçerli bir
   yedeğin verisi bunu aşamaz. Dosya biçimi iç içe JSON metni (kaçışlı) ve girintili olduğundan
   bunun yaklaşık iki katı tolerans verilir. Bulut senkron sınırı (cloud.ts MAX_SYNC_CHARS) ayrıdır.
   Kaynak: tarayıcı kotası genel bilgi (ikincil), birincil belgeyle doğrulanmadı. */
export const YEDEK_DOSYA_MAX_BOYUT = 10_000_000;

/* ───────────── SIFIRLA silme işareti ömrü (sekmeler arası, veri yolculuğu A8) ─────────────
   SIFIRLA/çıkış localStorage'a 'fagent.mirror.cleared.v1' işaretini (değer: Date.now()) koyar ve IndexedDB silmesi
   bitince kaldırır. Silme hata alırsa işaret kalır (sonraki açılış yeniden dener). İşaret süresiz "silme sürüyor"
   sayılırsa başka sekmenin sıradan yazımı silme sanılır, bekleyen değerler atılır ve ayna yazıcısı sonsuza dek durur.
   Bu yüzden işaret yalnız bu süre boyunca "etkin" sayılır; eski (sayı olmayan) biçimli işaret etkin SAYILMAZ.
   Gerekçe: IndexedDB'de birkaç anahtarı silmek normalde milisaniyeler sürer; 30 sn, yavaş cihaz ve çok sekmeli açılışlar
   için bol, takılı işareti ise çabucak etkisiz kılan bir üst sınırdır. Ölçülmedi; varsayım (gerçek cihazlarda doğrulanmadı). */
export const SIFIRLA_ISARETI_OMRU_MS = 30_000;

/* ───────────── Karantina ömrü (hesaba gitmemiş yerel kopya) ─────────────
   Çıkışta/oturum düşüşünde hesaba henüz gitmemiş veri silinmek yerine bu cihazda ayrı bir anahtarda
   (fagent.quarantine.v1, src/karantina.ts) en çok bu süre saklanır; süre dolunca silinir.
   Gerekçe: kullanıcıya "geri alma" için makul bir pencere vermek (bir hafta sonu + birkaç gün) ile ortak
   cihazda portföy verisinin gereğinden uzun kalmaması arasındaki denge. Kullanıcı kararı (2026-10-31): 7 gün.
   Süre dolması okuma/açılış anında kontrol edilir (zamanlayıcı yok); kullanıcı hesabı değişirse,
   SIFIRLA yapılırsa ya da hesap silinirse süre beklenmeden silinir.
   Doğrulama durumu: ürün kararı, dış kaynağa dayanmaz. */
export const KARANTINA_OMRU_MS = 7 * 24 * 60 * 60 * 1000;

/* Karantinada aynı anda tutulan en çok kayıt sayısı. Karara bağlanmamış (kullanıcının indir/yükle/sil demediği) bir
   kopyanın üzerine yenisi sessizce yazılmasın diye yeni kopya ikinci kayıt olarak eklenir; sayı sınırsız büyümesin
   (localStorage kotası köken başına ~5 milyon karakter, bulut satırı sınırı 1,5 milyon karakter) ve kullanıcı karar
   kartında az sayıda kopyayı ayırt edebilsin diye 2. Üçüncü kopya gelirse EN ESKİ kayıt düşer; kullanıcı bu durumda
   kartta "iki kopya" görmüştür ve her birini indirebilir. Kaynak: ürün kararı (2026-10-31 tur 2), dış kaynağa dayanmaz. */
export const KARANTINA_MAKS_KAYIT = 2;
