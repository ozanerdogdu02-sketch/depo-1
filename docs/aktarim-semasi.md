# Otomasyon Aktarımı — `fagent-aktarim.json` şeması (sürüm 1)

Panel'deki **Otomasyon Aktarımı** kartı, harici bir araçla (ör. kendi Python betiğin,
bir aracı kurum dökümünü dönüştüren script) üretilmiş bir JSON dosyasını içe alır.
Fagent ağ isteği yapmaz; dosyayı kullanıcı seçer. Ayrıştırıcı: `src/otoAktarim.ts`
(`parseOtoAktarim` — hiçbir şey yazmaz, yazma kararı onaydan sonra verilir).

**Ya hep ya hiç:** tek bir bozuk varlık kalemi varsa dosyanın tamamı reddedilir.
Aktarım mevcut portföyün **üzerine yazar** — önce tam yedek al.

## Alanlar

| Alan | Tür | Zorunlu | Anlamı |
|---|---|---|---|
| `sema_surum` | sayı | evet | `1` olmalı. Farklıysa dosya reddedilir. |
| `portfoy.holdings[]` | dizi | evet | En az bir kalem. |
| `portfoy.holdings[].id` | metin | evet | Kalemin kalıcı kimliği. |
| `portfoy.holdings[].name` | metin | evet | Görünen ad. |
| `portfoy.holdings[].type` | metin | evet | `hisse` · `fon` · `doviz` · `altin` · `kripto` · `mevduat` |
| `portfoy.holdings[].amount` | sayı | evet | Güncel değer (TL). |
| `portfoy.holdings[].costBasis` | sayı | evet | Net yatırılan tutar (TL). |
| `portfoy.txns[]` | dizi | hayır | İşlem geçmişi. Geçersiz satırlar atlanır. |
| `portfoy.txns[].date` | metin | evet* | `YYYY-MM-DD` (yerel gün). |
| `portfoy.txns[].kind` | metin | evet* | `alis` · `satis` |
| `portfoy.txns[].amount` | sayı | evet* | İşlem tutarı, komisyon **hariç** (TL). |
| `portfoy.txns[].holdingId` | metin | hayır | İlgili kalemin `id`'si. |
| `portfoy.txns[].holdingName` | metin | hayır | İşlem anındaki ad. |
| `portfoy.txns[].commission` | sayı | hayır | Komisyon (TL). |
| `ornek` | mantıksal | hayır | `true` ise dosya SAHTE örnek veridir; arayüz bunu açıkça yazar. |
| `kaynak.bayat` | mantıksal | hayır | `true` ise fiyatların bayat olduğu uyarısı gösterilir. |
| `kaynak.veri_yasi_saat` | sayı | hayır | Fiyatların kaç saat önce çekildiği. |
| `bilinmeyen_maliyet` | metin[] | hayır | Alış kaydı olmayan kalemlerin adları (bkz. aşağı). |
| `guncel_fiyati_olmayan` | metin[] | hayır | Güncel fiyatı bulunamayan kalemlerin adları. |
| `makro.tufe_yillik` | sayı | hayır | Bilgi amaçlı yıllık TÜFE (%). |

\* `txns[]` içindeki bir satır bu alanlardan biri eksikse atlanır, dosya reddedilmez.

## Maliyeti bilinmeyen kalemler

Alış kaydı olmayan bir kalem için **maliyet uydurma**. `costBasis = amount` yaz ve kalemi
`bilinmeyen_maliyet` listesine ekle. Arayüz o kalemde görünen "kazanç yok" ifadesinin
"kazanç bilinmiyor" anlamına geldiğini kullanıcıya söyler.

## Asgari örnek

```json
{
  "sema_surum": 1,
  "portfoy": {
    "holdings": [
      { "id": "h1", "name": "BIST 30 Fonu", "type": "fon", "amount": 48500, "costBasis": 45000 }
    ],
    "txns": [
      { "date": "2026-10-01", "kind": "alis", "amount": 45000, "holdingId": "h1", "holdingName": "BIST 30 Fonu" }
    ]
  }
}
```
