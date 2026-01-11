const ADDRESS = "Sieradzka 28, 98-300 Wieluń";

function renderPriceLine(pricePLN: number | null | undefined) {
  if (pricePLN == null || Number(pricePLN) === 0) {
    return "Wejście darmowe";
  }
  return `Kwota: ${Number(pricePLN)} zł (płatność na miejscu)`;
}

export function reservationClientText(p: {
  firstName: string;
  lastName: string;
  eventTitle: string;
  dateLabel: string;
  timeLabel: string;
  pricePLN: number | null | undefined;
}) {
  return `Cześć ${p.firstName}!

Twoja rezerwacja miejsca została przyjęta ✅

Wydarzenie: ${p.eventTitle}
Data: ${p.dateLabel}
Godzina: ${p.timeLabel}
Adres: ${ADDRESS}
${renderPriceLine(p.pricePLN)}

Jeśli nie możesz się pojawić, daj nam znać mailowo — pomoże to nie blokować miejsc innym osobom.

Do zobaczenia!`;
}

export function reservationOwnerText(p: {
  eventTitle: string;
  dateLabel: string;
  timeLabel: string;
  pricePLN: number | null | undefined;

  firstName: string;
  lastName: string;
  phone: string;
  email: string;

  disabledPerson: boolean;
  disabilityDetails?: string;

  wantInvoice: boolean;
  nip?: string;

  notes?: string;
}) {
  return `NOWA REZERWACJA (biznes)

Wydarzenie: ${p.eventTitle}
Data: ${p.dateLabel}
Godzina: ${p.timeLabel}
Adres: ${ADDRESS}
${renderPriceLine(p.pricePLN)}

Klient:
- Imię i nazwisko: ${p.firstName} ${p.lastName}
- Telefon: ${p.phone}
- Email: ${p.email}

Dostępność:
- Osoba niepełnosprawna: ${p.disabledPerson ? "TAK" : "NIE"}
- Szczegóły: ${p.disabilityDetails?.trim() || "—"}

Faktura:
- Chce fakturę: ${p.wantInvoice ? "TAK" : "NIE"}
- NIP: ${p.nip?.trim() || "—"}

Notatki:
${p.notes?.trim() || "—"}
`;
}

export function inquiryClientText(p: { firstName: string }) {
  return `Cześć ${p.firstName}!

Otrzymaliśmy Twoje zapytanie ✅
Skontaktujemy się z Tobą najszybciej jak to możliwe.

Pozdrawiamy!`;
}

export function inquiryOwnerText(p: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  isCompany: boolean;
  nip?: string;
  message: string;
}) {
  return `NOWE ZAPYTANIE O ORGANIZACJĘ EVENTU

Klient:
- Imię i nazwisko: ${p.firstName} ${p.lastName}
- Telefon: ${p.phone}
- Email: ${p.email}

Firma:
- Czy firma: ${p.isCompany ? "TAK" : "NIE"}
- NIP: ${p.nip?.trim() || "—"}

Wiadomość:
${p.message?.trim() || "—"}
`;
}
