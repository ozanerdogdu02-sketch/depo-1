// SQLite şeması + göç (migration) yönetimi.
// Tek dosyalık veritabanı: Docker'da kalıcı volume'e, yerelde ./data/jarvis.db'ye düşer.
// Göçler `PRAGMA user_version` ile sürümlenir — yeni sürüm eklerken MIGRATIONS dizisinin
// SONUNA ekle, mevcut olanları DEĞİŞTİRME (kullanıcının verisi zaten o şemayla yazıldı).
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = Database.Database;

/** Varlık sınıfları. Jarvis yalnızca bunları tanır. */
export const ASSET_KINDS = ['hisse', 'fon', 'doviz', 'altin', 'kripto', 'mevduat'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_LABELS: Record<AssetKind, string> = {
  hisse: 'Hisse',
  fon: 'Fon',
  doviz: 'Döviz',
  altin: 'Altın',
  kripto: 'Kripto',
  mevduat: 'Mevduat',
};

export interface HoldingRow {
  id: string;
  name: string;
  kind: AssetKind;
  /** Canlı fiyata bağlıysa kaynak sembolü (THYAO, USD, BTC, GRAM, AFT...). Yoksa null. */
  symbol: string | null;
  /** Canlı fiyata bağlıysa adet/miktar. Yoksa null — değer elle güncellenir. */
  quantity: number | null;
  /** Güncel piyasa değeri (TL). */
  amount: number;
  /** Net yatırılan tutar (TL) — ağırlıklı ortalama maliyet. */
  cost_basis: number;
  created_at: string;
  updated_at: string;
  last_priced_at: string | null;
}

export interface TxnRow {
  id: string;
  holding_id: string;
  /** İşlem anındaki ad — varlık silinse/adı değişse de defter kaydı sabit kalır. */
  holding_name: string;
  kind: 'alis' | 'satis';
  amount: number;
  /** Yerel takvim günü, YYYY-AA-GG. */
  date: string;
  created_at: string;
}

export interface AlertRow {
  id: string;
  /** Neyi izliyor: canlı fiyat sembolü (BTC, USD, THYAO) ya da 'PORTFOY'. */
  target: string;
  kind: AssetKind | 'portfoy';
  direction: 'ustunde' | 'altinda';
  threshold: number;
  note: string | null;
  active: number;
  created_at: string;
  triggered_at: string | null;
  last_value: number | null;
}

export interface SnapshotRow {
  date: string;
  total_value: number;
  total_cost: number;
  created_at: string;
}

const MIGRATIONS: string[] = [
  // v1 — çekirdek şema
  `
  CREATE TABLE holdings (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    kind           TEXT NOT NULL,
    symbol         TEXT,
    quantity       REAL,
    amount         REAL NOT NULL DEFAULT 0,
    cost_basis     REAL NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    last_priced_at TEXT
  );
  -- Ad tekilliği büyük/küçük harf duyarsız olmalı ("Altın" ile "altın" aynı varlıktır).
  -- SQLite NOCASE yalnızca ASCII'de çalışır; Türkçe İ/ı için uygulama katmanında
  -- normalizeName() ile ayrıca kontrol ediyoruz (bkz. core/portfolio.ts).
  CREATE UNIQUE INDEX idx_holdings_name ON holdings(name COLLATE NOCASE);

  CREATE TABLE txns (
    id           TEXT PRIMARY KEY,
    holding_id   TEXT NOT NULL,
    holding_name TEXT NOT NULL,
    kind         TEXT NOT NULL,
    amount       REAL NOT NULL,
    date         TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX idx_txns_holding ON txns(holding_id);
  CREATE INDEX idx_txns_date ON txns(date);

  CREATE TABLE alerts (
    id           TEXT PRIMARY KEY,
    target       TEXT NOT NULL,
    kind         TEXT NOT NULL,
    direction    TEXT NOT NULL,
    threshold    REAL NOT NULL,
    note         TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL,
    triggered_at TEXT,
    last_value   REAL
  );

  -- Ağ önbelleği. Yeniden başlatmada da yaşar — CoinGecko hız sınırına takılmamak için önemli.
  CREATE TABLE cache (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    ttl_sec    INTEGER NOT NULL
  );

  -- Günlük portföy anlık görüntüsü — brifingdeki "dünden bugüne" karşılaştırması buradan gelir.
  CREATE TABLE snapshots (
    date        TEXT PRIMARY KEY,
    total_value REAL NOT NULL,
    total_cost  REAL NOT NULL,
    created_at  TEXT NOT NULL
  );

  -- Kısa süreli sohbet bağlamı (dil katmanına verilir). Sınırlı tutulur, sonsuz büyümez.
  CREATE TABLE chat_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    role       TEXT NOT NULL,
    text       TEXT NOT NULL,
    intent     TEXT,
    created_at TEXT NOT NULL
  );

  -- Onay bekleyen aksiyonlar (Onayla/Vazgeç akışı). Onaylanmadan HİÇBİR veri değişmez.
  CREATE TABLE pending_actions (
    id         TEXT PRIMARY KEY,
    chat_id    INTEGER NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved   TEXT
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const sql = MIGRATIONS[v];
    if (!sql) continue;
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.pragma(`user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Veritabanı göçü v${v + 1} başarısız: ${(err as Error).message}`);
    }
  }
}

/** Test ve doctor için: diskte iz bırakmayan bellek içi veritabanı. */
export function openMemoryDb(): Db {
  return openDb(':memory:');
}
