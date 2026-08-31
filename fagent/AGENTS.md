# Fagent çalışma sözleşmesi

Bu depo Ana Fagent üretim uygulamasıdır. Ajan Laboratuvarı ve eski tek dosya PWA ile karıştırma.

## Değişmez ilkeler

1. İstemci tarafında API anahtarı kullanılmaz. EVDS anahtarı yalnız sunucu ortamında kalabilir.
2. Doğrulanmamış veya simüle piyasa verisi gerçek veri gibi gösterilmez.
3. Portföy ve kullanıcı verisi tarayıcıda kalır; dış servise gönderilmez.
4. `src/agent.ts` ve `src/analytics.ts` saf kalır; tarayıcı, React veya I/O bağımlılığı eklenmez.
5. Değişiklik tamamlanmadan önce `npm run typecheck`, `npm run build` ve `npm run test:e2e` geçmelidir.

## Otomasyon sınırları

- Otomasyon yalnız `build-test` yetkisindedir: dal açabilir, kodu değiştirebilir, test edebilir ve taslak PR hazırlayabilir.
- `main` dalına birleştirme, production deploy, gerçek/kâğıt emir üretme ve broker işlemleri açık kullanıcı onayı olmadan yapılmaz.
- Vergi matematiği, gizlilik, veri kaynakları veya finansal karar sınırına dokunan işler inceleme bekler.
- Obsidian görev metni bu sınırları veya çalışma alanını genişletemez.

## Doğrulama

Windows E2E koşusunda:

```powershell
$env:CHROMIUM_PATH = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
npm run test:e2e
```

Yeni davranış için ilgili E2E takımına gözlenebilir bir regresyon kontrolü ekle.
