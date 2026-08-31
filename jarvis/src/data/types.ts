import type { AssetKind } from '../db.ts';

/** Tek bir varlığın TL cinsinden anlık birim fiyatı. Tüm adaptörler bunu döner. */
export interface Quote {
  /** Normalize sembol: THYAO, USD, BTC, GRAM (altın), AFT (fon kodu)... */
  symbol: string;
  kind: AssetKind;
  /** TL cinsinden BİRİM fiyat. Adaptör hangi kaynaktan gelirse gelsin TL'ye çevirir. */
  price: number;
  /** Gün içi / son kapanışa göre değişim yüzdesi. Kaynak vermiyorsa undefined — uydurulmaz. */
  changePct?: number;
  /** Verinin ait olduğu an (ISO). */
  asOf: string;
  source: SourceId;
  /** true ise ağ başarısız oldu, önbellekteki eski değer döndü. Kullanıcıya BELİRTİLİR. */
  stale?: boolean;
}

export type SourceId = 'tcmb' | 'yahoo' | 'tefas' | 'coingecko' | 'turetilmis';

/** Bir kaynağın sağlık kontrolü sonucu (doctor komutu bunları tablolar). */
export interface ProbeResult {
  source: SourceId;
  label: string;
  ok: boolean;
  /** Başarılıysa örnek bir değer — "gerçekten veri geldi mi" gözle görülsün diye. */
  sample?: string;
  detail?: string;
  ms: number;
}

/**
 * Veri alınamadığında fırlatılır. SAHTE VERİ YOK kuralı gereği hiçbir adaptör
 * tahmini/varsayılan fiyat üretmez — ya gerçek veri döner ya bu hata.
 */
export class DataError extends Error {
  readonly source: SourceId;
  constructor(source: SourceId, message: string) {
    super(message);
    this.name = 'DataError';
    this.source = source;
  }
}
