/* ─────────────────────────  Otomasyon hattından portföy aktarımı  ─────────────────────────

   Ozan'ın `Borsa Paneli` Python hattı `fagent-aktarim.json` üretir; bu modül onu okur.

   NEDEN DOSYA, NEDEN AĞ DEĞİL: Fagent'ın ayırt edici tezi "anahtarsız, veri tarayıcıdan
   çıkmaz". Bir uca bağlanmak o tezi bitirirdi. Dosyayı kullanıcı taşır — Fagent hiçbir
   istek yapmaz, hiçbir anahtar istemez. Bu bilinçli bir sınırdır, eksik değil.

   ŞEMA SÖZLEŞMESİ (sürüm 1) — Python tarafı `Borsa Paneli\fagent_aktar.py` ile birebir aynı:
     holdings[].amount    = güncel değer (TL)
     holdings[].costBasis = net yatırılan (TL)
     txns[].amount        = işlem tutarı, komisyon HARİÇ
     txns[].kind          = 'alis' | 'satis'

   MALİYETİ BİLİNMEYEN KALEMLER: Otomasyon tarafında bazı kalemlerin (para piyasası fonu,
   serbest nakit) alış kaydı yok. Python tarafı maliyet UYDURMAZ; `costBasis = amount` yazıp
   kalemi `bilinmeyen_maliyet` listesine koyar. Sonuç ekranda "kazanç sıfır" gibi görünür ama
   anlamı "kazanç bilinmiyor"dur. Bu ayrım kullanıcıya SÖYLENMELİ — `uyarilar` bunun içindir.
   Sıfır göstermek ile bilinmediğini söylemek aynı şey değildir (bkz. UNVERIFIED_TAX deseni). */

import { AssetType, Holding, PortfolioState, Txn } from './store';

export const AKTARIM_SEMA_SURUM = 1;

const GECERLI_TIP: AssetType[] = ['hisse', 'fon', 'doviz', 'altin', 'kripto', 'mevduat'];

export interface AktarimOzeti {
  kalemSayisi: number;
  islemSayisi: number;
  toplamDeger: number;
  toplamMaliyet: number;
  veriYasiSaat: number | null;
  tufeYillik: number | null;
}

export interface AktarimSonuc {
  ok: boolean;
  message: string;
  /** Doğrulama geçtiyse yazılmaya hazır durum. Bu fonksiyon HİÇBİR ŞEY YAZMAZ. */
  state?: PortfolioState;
  /** Kullanıcıya gösterilmesi gereken, veriyi yanlış okumasını engelleyen notlar. */
  uyarilar?: string[];
  ozet?: AktarimOzeti;
  /** Dosya `--ornek` ile üretilmiş sahte veri mi. */
  ornek?: boolean;
}

function sayiMi(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/* Ayrıştırır ve DOĞRULAR — hiçbir şey yazmaz. Yazma kararını çağıran verir, çünkü bu işlem
   mevcut portföyün üzerine yazar (restoreBackup ile aynı ilke: ya hep ya hiç, önce onay). */
export function parseOtoAktarim(text: string): AktarimSonuc {
  let ham: unknown;
  try {
    ham = JSON.parse(text);
  } catch {
    return { ok: false, message: 'Dosya okunamadı — geçerli bir JSON değil.' };
  }

  const d = ham as Record<string, unknown>;
  if (!d || typeof d !== 'object') {
    return { ok: false, message: 'Dosya beklenen biçimde değil.' };
  }
  if (d.sema_surum !== AKTARIM_SEMA_SURUM) {
    return {
      ok: false,
      message:
        `Bu dosyanın şema sürümü ${String(d.sema_surum ?? 'yok')}, beklenen ${AKTARIM_SEMA_SURUM}. ` +
        'Otomasyon tarafındaki `fagent_aktar.py` ile bu sürüm eşleşmiyor — biri güncellenmiş olmalı.',
    };
  }

  const p = d.portfoy as Record<string, unknown> | undefined;
  if (!p || !Array.isArray(p.holdings)) {
    return { ok: false, message: 'Dosyada portföy kalemleri yok.' };
  }

  // Beyaz liste + tam doğrulama. Tek bir bozuk kalem varsa HİÇBİR ŞEY alınmaz:
  // yarım aktarılmış portföy, hiç aktarılmamış portföyden tehlikelidir.
  const holdings: Holding[] = [];
  for (const x of p.holdings as Record<string, unknown>[]) {
    if (typeof x?.id !== 'string' || typeof x?.name !== 'string') {
      return { ok: false, message: 'Bir kalemin kimliği ya da adı eksik — aktarım yapılmadı.' };
    }
    if (!GECERLI_TIP.includes(x.type as AssetType)) {
      return { ok: false, message: `Tanınmayan varlık türü: "${String(x.type)}" (${x.name}).` };
    }
    if (!sayiMi(x.amount) || !sayiMi(x.costBasis)) {
      return { ok: false, message: `"${x.name}" kaleminde tutar sayı değil — aktarım yapılmadı.` };
    }
    holdings.push({
      id: x.id,
      name: x.name,
      type: x.type as AssetType,
      amount: x.amount,
      costBasis: x.costBasis,
    });
  }
  if (holdings.length === 0) {
    return { ok: false, message: 'Dosyada aktarılacak kalem yok.' };
  }

  const txns: Txn[] = [];
  for (const x of (Array.isArray(p.txns) ? p.txns : []) as Record<string, unknown>[]) {
    if (x?.kind !== 'alis' && x?.kind !== 'satis') continue;
    if (typeof x.date !== 'string' || !sayiMi(x.amount)) continue;
    txns.push({
      id: typeof x.id === 'string' ? x.id : `oto${txns.length + 1}`,
      date: x.date,
      holdingId: typeof x.holdingId === 'string' ? x.holdingId : '',
      holdingName: typeof x.holdingName === 'string' ? x.holdingName : '',
      kind: x.kind,
      amount: x.amount,
      commission: sayiMi(x.commission) ? x.commission : 0,
    });
  }

  // ── Uyarılar: kullanıcının sayıyı YANLIŞ OKUMASINI engelleyenler
  const uyarilar: string[] = [];

  // Örnek veri uyarısı EN BAŞTA: sahte portföyü gerçek sanmak, sahte fiyat
  // göstermekle aynı sınıfta bir hatadır. Diğer uyarıların arasında kaybolmamalı.
  const ornek = d.ornek === true;
  if (ornek) {
    uyarilar.push(
      'ÖRNEK VERİ: bu dosya `python fagent_aktar.py --ornek` ile üretilmiş SAHTE bir ' +
        'portföydür. Buradaki hiçbir sayı gerçek pozisyonunu göstermez. Gerçek portföy için ' +
        'bayraksız çalıştır.',
    );
  }

  const kaynak = (d.kaynak ?? {}) as Record<string, unknown>;
  const yas = sayiMi(kaynak.veri_yasi_saat) ? kaynak.veri_yasi_saat : null;

  if (kaynak.bayat === true) {
    uyarilar.push(
      `BAYAT VERİ: fiyatlar ${yas ?? '?'} saat önce çekilmiş. Otomasyon tarafında önce ` +
        '`python veri.py` koşturup dosyayı yeniden üret.',
    );
  }

  const bilinmeyen = Array.isArray(d.bilinmeyen_maliyet) ? (d.bilinmeyen_maliyet as string[]) : [];
  if (bilinmeyen.length > 0) {
    uyarilar.push(
      // Markdown YOK — bu metin düz metin olarak basılıyor, yıldızlar ekranda görünürdü.
      `Maliyeti bilinmeyen kalem(ler): ${bilinmeyen.join(', ')}. Alış kaydı olmadığı için ` +
        'maliyet = güncel değer yazıldı. Bu kalemlerde görünen "kazanç yok" ifadesi ' +
        'KAZANÇ BİLİNMİYOR demektir, kazanç sıfır demek değildir.',
    );
  }

  const fiyatsiz = Array.isArray(d.guncel_fiyati_olmayan) ? (d.guncel_fiyati_olmayan as string[]) : [];
  if (fiyatsiz.length > 0) {
    uyarilar.push(
      `Güncel fiyatı olmayan kalem(ler): ${fiyatsiz.join(', ')}. Değer maliyet üzerinden sayıldı.`,
    );
  }

  const makro = (d.makro ?? {}) as Record<string, unknown>;
  const tufe = sayiMi(makro.tufe_yillik) ? makro.tufe_yillik : null;

  const toplamDeger = holdings.reduce((a, h) => a + h.amount, 0);
  const toplamMaliyet = holdings.reduce((a, h) => a + h.costBasis, 0);

  return {
    ok: true,
    message:
      (ornek ? 'ÖRNEK veri — ' : '') +
      `${holdings.length} kalem ve ${txns.length} işlem okundu.`,
    ornek,
    state: { onboarded: true, holdings, txns, realizedPnl: 0 },
    uyarilar,
    ozet: {
      kalemSayisi: holdings.length,
      islemSayisi: txns.length,
      toplamDeger,
      toplamMaliyet,
      veriYasiSaat: yas,
      tufeYillik: tufe,
    },
  };
}
