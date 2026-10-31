// ÖRNEK FİKSTÜR — KÜTÜPHANE KODLARINDAN TÜRETİLDİ, GERÇEK KAP YANITIYLA DOĞRULANMADI.
// Alan adları docs/veri-akisi/kap-bist-erisim.md §2.1 tablosundan (kap-client `DisclosureRow`, kap-mcp, pykap kaynak
// kodları). Şirketler ve kodlar UYDURMADIR (gerçek şirket değildir). Tarih biçimi: "GG.AA.YYYY SS:DD:ss".
// `summary` ve `hasAttachment` alanları bilerek var: sunucu bunları yanıta GEÇİRMEMELİ.
export default [
  {
    disclosureIndex: 1000003, publishDate: '28.10.2026 18:42:10', stockCodes: 'ORNKA',
    memberTitle: 'ÖRNEK SANAYİ A.Ş.', subject: 'Özel Durum Açıklaması (Genel)', disclosureClass: 'ODA',
    disclosureType: 'ODA', disclosureCategory: 'ODA', isLate: false, isCorrective: false,
    summary: 'ÖZET METNİ — yanıta geçmemeli', hasAttachment: true, attachmentCount: 2,
  },
  {
    disclosureIndex: 1000002, publishDate: '28.10.2026 09:05:00', stockCodes: 'ORNKB,ORNKC',
    memberTitle: 'ÖRNEK HOLDİNG A.Ş.', subject: 'Finansal Rapor', disclosureClass: 'FR',
    isLate: true, isCorrective: false, summary: 'ÖZET 2', hasAttachment: false, attachmentCount: 0,
  },
  {
    disclosureIndex: 1000001, publishDate: '27.10.2026 23:59:59', stockCodes: '',
    memberTitle: 'ÖRNEK FON YÖNETİMİ A.Ş.', subject: 'Diğer Açıklamalar', disclosureClass: 'DG',
    isCorrective: true, ekAlan: { ic: 1 },
  },
];
