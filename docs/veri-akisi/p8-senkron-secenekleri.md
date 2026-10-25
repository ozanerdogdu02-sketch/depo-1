# P8 — Ekip senkronu: seçenek karşılaştırması

Durum: ÖNERİ, kullanıcı onayı bekliyor; uygulama yok (spec P8: "ve onayımı bekle"). 2026-10-25.
Ortak hedef (spec): sunucu yalnız şifreli blob ve üye listesi görür; ekip anahtarı üye ekle/çıkarmada döner; roller (yönetici, editör, görüntüleyici) istemcide ve imzalı işlem kayıtlarıyla zorlanır; denetim izi ekip verisinin parçası olarak şifreli; anahtar kaybı ve kurtarma yazılı.
Kripto: yalnız tarayıcı WebCrypto (AES-GCM, ECDH, ECDSA, HKDF, PBKDF2). Kendi algoritma yok. Tarayıcı destek ayrıntıları (örn. Ed25519) doğrulanamadı; ECDSA/ECDH P-256 varsayılır.
Ön koşul: P3 yerel veri katmanı (kayıtlarda `id`, `updatedAt`, `deviceId`, `audit_log`) bitmiş olmalı. Mevcut Supabase düz metin senkronu (`src/cloud.ts`) bu işle ilgisizdir; kaderi `mevcut-durum-ve-plan.md` §4.

## Ortak tasarım parçaları (üç seçenekte de gerekir)
- Veri bir "işlem günlüğü" (append-only op log) olarak modellenir: her op = {opId, epoch, yazan üye, zaman, tür, yük}; yük ve imza şifreli blob içinde. Alan bazında son-yazan-kazanır (`updatedAt`, `deviceId` ile deterministik), işlemler (`transactions`) ekleme ağırlıklı olduğu için çakışma azdır. CRDT kütüphanesi şart değildir.
- Anahtarlar: her üyede cihaz başına ECDSA imza çifti + ECDH çifti; ekip anahtarı AES-GCM-256 "epoch" anahtarıdır; üyeye ECDH ile sarılarak verilir.
- Epoch: üye eklenince/çıkarılınca yönetici yeni epoch anahtarı üretir, kalan üyelere sarar; yeni op'lar yeni epoch ile şifrelenir.
- Dürüst sınır: çıkarılan üye KENDİ çıkışından önce okuduğu verinin kopyasına sahiptir; "eski anahtar çalışmaz" yalnız yeni epoch verisi için doğrudur ve sunucu yeni yazılara eski epoch'u reddederek bunu pekiştirir (sunucu epoch numarasını bilir, anahtarı bilmez).
- Rol zorlaması: üyelik ve rol kayıtları YÖNETİCİ imzalı op'lardır; istemci imzasını/rolünü doğrulamadan op uygulamaz. Sunucu yalnız "üye listesi" sorusuna cevap verir. Sunucu op düşürebilir veya sırayı bozabilir (sansür/geri alma); sıra numarası ve op hash zinciri bunu tespit ettirir ama engellemez.

## Karşılaştırma

| | 1) Şifreli röle sunucusu (+ imzalı op günlüğü) | 2) WebRTC eşler arası | 3) Kullanıcının kendi depolaması |
|---|---|---|---|
| Nasıl çalışır | İstemciler şifreli op blob'larını ince bir sunucuya yazar/okur; sunucu yalnız saklar ve sıralar | Eşler birbirine doğrudan DataChannel ile op yollar; sinyalleme için küçük bir sunucu | Şifreli günlük dosyası ortak bir klasöre (kullanıcının sağlayıcısı veya yerel dosya sistemi) yazılır, istemciler okur |
| Sunucunun gördüğü | Üye listesi, epoch no, blob boyutu, zaman damgası, IP, (hesap kullanılıyorsa) e-posta; içerik yok | Sinyalleme: eşlerin IP/SDP bilgisi, oda kimliği; içerik hiç uğramaz. TURN kullanılırsa şifreli trafik | Depolama sağlayıcısı dosya adı, boyut, zaman, hesap; içerik yok. Bizim sunucumuz yok |
| Anahtar yönetimi | Yönetici epoch anahtarını ECDH ile sarar, röleye bırakır; çıkarmada yeni epoch | Eşler çevrimiçi buluşunca anahtar el sıkışması; çevrimdışı üyeye anahtar iletimi zor | Anahtar sarmalı dosyalar klasörde; çıkarmada yeni epoch + sağlayıcı izni geri alma ayrıca gerekir |
| Rol zorlaması | İmzalı op + istemci doğrulama; sunucu üye listesi ile yazma izni (görüntüleyici yazamasın) | Yalnız eş doğrulaması; merkezi bir kapı yok | Sağlayıcı izinleri (okuma/yazma) + imza; sağlayıcı izni ile uygulama rolü senkron tutulmalı |
| Denetim izi | op günlüğünün kendisi; şifreli, hash zincirli | Her eş kendi kopyasını tutar; eşler arası tutarsızlık olabilir | Dosyada; sağlayıcı sürüm geçmişi ek kaynak |
| Anahtar kaybı / kurtarma | Cihaz kaybı: başka cihaz/yönetici yeniden sarar. Tüm yöneticiler kaybederse: yazılı kurtarma kodu (anahtar PBKDF2/HKDF ile sarılı yedek) yoksa VERİ KURTARILAMAZ | Kopya başka eşte varsa oradan; kimse yoksa kayıp | Dosya sağlayıcıda durur; anahtar kaybı yine geri döndürülemez |
| Çevrimdışı çalışma | İyi (asenkron) | Zayıf (eşzamanlı çevrimiçi gerekir) | İyi (dosya eşitlemesi gecikmeli) |
| Yeni bağımlılık | Yok gerekmez (WebCrypto, mevcut Supabase ya da `api/` fonksiyonu + depolama). CRDT kütüphanesi (Yjs/Automerge) YALNIZ istenirse: Üst Kurul talebi, lisans/boyut doğrulanamadı | WebRTC yerleşik ama STUN/TURN servisi (üçüncü taraf ya da barındırma) | Sağlayıcı SDK/OAuth ya da File System Access API (tarayıcı desteği sınırlı, doğrulanamadı) |
| Efor | BÜYÜK | BÜYÜK (NAT/TURN, bağlantı yönetimi) | ORTA-BÜYÜK (sağlayıcıya bağlı) |
| Başlıca risk | Sunucu sansürü/geri alma; operasyon yükü (sunucu bizde); meta veri (zaman, boyut, üye grafiği) | Güvenilirlik, NAT, ekip için pratik değil; IP'lerin eşlere açılması | Çakışan dosya sürümleri; sağlayıcı bağımlılığı ve koşulları; rol ayrımı zayıf; her kullanıcı sağlayıcı hesabı ister |

## Öneri
Seçenek 1: şifreli röle + imzalı, hash zincirli, ekleme ağırlıklı op günlüğü; CRDT kütüphanesi eklemeden. Gerekçe: asenkron ekip çalışmasına uygun tek seçenek, rol ve üye çıkarma için merkezi bir kapı (epoch reddi) verir, sunucu yalnız şifreli blob ve üye listesi görür (spec ile birebir), sunucuya yeni bağımlılık gerektirmez, mevcut `api/` fonksiyon düzeni ve (karar verilirse) Supabase/RLS yatırımı kullanılabilir. Eksileri açık: meta veri sızar, sunucu sansürü tespit edilir ama engellenmez, işletme yükü bizdedir.
Önerilen aşamalama (onaydan sonra): (a) tek kullanıcı, çoklu cihaz şifreli yedek senkronu (aynı kripto, ekip yok); (b) ekip, tek rol; (c) roller ve epoch dönüşü; (d) denetim izi görünümü.

## Kullanıcı kararı bekleyen noktalar
1. Seçenek 1 / 2 / 3 (veya birlikte: 1 öne, 3 ikinci yol).
2. Röle barındırması: mevcut Supabase mi, Vercel fonksiyonu + ayrı depolama mı (hesap kimliği e-posta içerir; P0.1 "yalnız blob" katı okunursa kimliksiz erişim jetonu gerekir).
3. CRDT kütüphanesi yerine kendi op günlüğü (önerilen) mü.
4. Kurtarma politikası: kurtarma kodu zorunlu mu, kaybında veri kaybını kullanıcı kabul eder mi.
5. TODO(hukuk): ekip verisi işleyen/işletmeci rolleri, KVKK, denetim izi saklama süresi, sunucunun meta verisinin aydınlatma metnine girişi.
6. Güvenlik incelemesi: protokol tasarımı bağımsız uzman incelemesinden geçmeden "güvenli" iddiası yapılmaz (kendi protokolümüzü kuruyoruz, ilkelleri değil; doğrulanamadı).
