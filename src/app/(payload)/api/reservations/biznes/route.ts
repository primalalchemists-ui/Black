// import { NextResponse } from "next/server";
// import { getPayload } from "payload";
// import config from "@payload-config";

// import { businessRequestSchema } from "@/lib/validation/reservations";
// import { getMailTransport, getMailFrom, getOwnerTo } from "@/lib/mail";
// import { reservationClientText, reservationOwnerText } from "@/lib/mailTemplates";
// import { getEventDisplayDateTimePL } from "@/lib/cms/events";

// // Ważne na Railway/Next build: nie prerenderuj / nie collect page data dla route handlers
// export const dynamic = "force-dynamic";

// type Issue = { path: (string | number)[]; message: string };

// function json400(error: string, issues?: Issue[], extra?: any) {
//   return NextResponse.json({ error, issues: issues ?? [], ...extra }, { status: 400 });
// }

// function json409(error: string, issues?: Issue[], extra?: any) {
//   return NextResponse.json({ error, issues: issues ?? [], ...extra }, { status: 409 });
// }

// async function decrementCapacityOrFail(payload: any, eventId: string) {
//   const pool = (payload.db as any)?.pool;
//   if (!pool?.query) throw new Error("payload.db.pool not available (Postgres adapter).");

//   const r = await pool.query(
//     `UPDATE "events"
//      SET "capacity" = "capacity" - 1
//      WHERE "id" = $1 AND "capacity" > 0
//      RETURNING "capacity"`,
//     [eventId],
//   );

//   return (r?.rowCount ?? 0) > 0;
// }

// async function incrementCapacity(payload: any, eventId: string) {
//   const pool = (payload.db as any)?.pool;
//   if (!pool?.query) return;
//   await pool.query(`UPDATE "events" SET "capacity" = "capacity" + 1 WHERE "id" = $1`, [eventId]);
// }

// export async function POST(req: Request) {
//   const payload = await getPayload({ config });

//   const body = await req.json().catch(() => null);

//   const parsed = businessRequestSchema.safeParse(body);
//   if (!parsed.success) {
//     return json400(
//       "VALIDATION_ERROR",
//       parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
//     );
//   }

//   const data = parsed.data;

//   if (!data.eventId) {
//     return json400("VALIDATION_ERROR", [{ path: ["eventId"], message: "Brak eventId." }]);
//   }

//   const eventId = String(data.eventId);

//   // pobierz event
//   let event: any;
//   try {
//     event = await payload.findByID({ collection: "events", id: eventId });
//   } catch (e: any) {
//     return json400(
//       "EVENT_NOT_FOUND",
//       [{ path: ["eventId"], message: "Nie znaleziono wydarzenia." }],
//       { message: e?.message },
//     );
//   }

//   if (!event || !event.published || event.status !== "planned" || !event.registrationsEnabled) {
//     return json409("NO_AVAILABILITY", [
//       { path: ["eventId"], message: "Zapisy na to wydarzenie są wyłączone." },
//     ]);
//   }

//   const startsAt = new Date(event.startsAt);
//   const endsAt = event.endsAt ? new Date(event.endsAt) : null;

//   const dayISO = event.day ? new Date(event.day).toISOString() : new Date(startsAt).toISOString();
//   const startHour = String(startsAt.getHours());
//   const startMinute = String(startsAt.getMinutes());
//   const endHour = endsAt ? String(endsAt.getHours()) : undefined;
//   const endMinute = endsAt ? String(endsAt.getMinutes()) : undefined;

//   // ✅ KWOTA Z EVENTU (do zapisania w rezerwacji)
//   const pricePLN = typeof event?.pricePLN === "number" ? event.pricePLN : 0;

//   // capacity atomowo
//   let decremented = false;
//   if (event.capacity != null) {
//     try {
//       const ok = await decrementCapacityOrFail(payload, eventId);
//       if (!ok) {
//         return json409("NO_AVAILABILITY", [
//           { path: ["eventId"], message: "Brak wolnych miejsc (limit wyczerpany)." },
//         ]);
//       }
//       decremented = true;
//     } catch (e: any) {
//       return json400(
//         "CAPACITY_UPDATE_FAILED",
//         [{ path: ["eventId"], message: "Nie udało się zaktualizować limitu miejsc." }],
//         { message: e?.message },
//       );
//     }
//   }

//   try {
//     const reservationDoc = await payload.create({
//       collection: "reservations",
//       data: {
//         type: "biznes",
//         event: eventId,

//         customer: {
//           firstName: data.firstName,
//           lastName: data.lastName,
//           phone: data.phone,
//           email: data.email,
//         },

//         notes: data.notes || "",

//         day: dayISO,
//         allDay: false,
//         startHour,
//         startMinute,
//         endHour,
//         endMinute,

//         startsAt: startsAt.toISOString(),
//         endsAt: endsAt ? endsAt.toISOString() : undefined,

//         disabledPerson: Boolean(data.disabledPerson),
//         disabilityDetails: data.disabilityDetails || "",

//         invoice: {
//           wantInvoice: Boolean(data.wantInvoice),
//           nip: data.nip || "",
//         },

//         acceptRules: Boolean(data.acceptRules),

//         source: "online",
//         status: "new",

//         // ✅ płatność na miejscu -> czeka na opłacenie
//         paymentStatus: "pending",

//         // ✅ TU ZAPISUJEMY KWOTĘ Z EVENTU
//         depositRequired: pricePLN > 0,
//         depositAmount: pricePLN,
//       },
//     });

//     // ====== MAIL SECTION ======
//     // Mail jest "best-effort": jeśli env od maila nie jest ustawione, rezerwacja ma się nadal utworzyć.
//     try {
//       const dt = getEventDisplayDateTimePL(event);
//       const eventTitle = event?.title ?? "Wydarzenie biznesowe";
//       const dateLabel = dt?.date ?? "—";
//       const timeLabel = dt?.time ?? "—";

//       const from = getMailFrom();
//       const ownerTo = getOwnerTo();
//       const mailTransport = getMailTransport();

//       await mailTransport.sendMail({
//         from,
//         to: ownerTo,
//         subject: `Rezerwacja: ${eventTitle} — ${data.firstName} ${data.lastName}`,
//         text: reservationOwnerText({
//           eventTitle,
//           dateLabel,
//           timeLabel,
//           pricePLN,
//           firstName: data.firstName,
//           lastName: data.lastName,
//           phone: data.phone,
//           email: data.email,
//           disabledPerson: Boolean(data.disabledPerson),
//           disabilityDetails: data.disabilityDetails || "",
//           wantInvoice: Boolean(data.wantInvoice),
//           nip: data.nip || "",
//           notes: data.notes || "",
//         }),
//         replyTo: data.email,
//       });

//       await mailTransport.sendMail({
//         from,
//         to: data.email,
//         subject: `Potwierdzenie rezerwacji: ${eventTitle}`,
//         text: reservationClientText({
//           firstName: data.firstName,
//           lastName: data.lastName,
//           eventTitle,
//           dateLabel,
//           timeLabel,
//           pricePLN,
//         }),
//       });
//     } catch (mailErr: any) {
//       console.warn("[MAIL] skipped / failed:", mailErr?.message || mailErr);
//     }
//     // ====== /MAIL SECTION ======

//     return NextResponse.json({ ok: true, reservationId: reservationDoc.id });
//   } catch (e: any) {
//     if (decremented) await incrementCapacity(payload, eventId);

//     const msg = e?.message || "Unknown error";
//     return json400(
//       "CREATE_FAILED",
//       [{ path: [], message: "Nie udało się utworzyć rezerwacji." }],
//       { message: msg },
//     );
//   }
// }

import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

import { businessRequestSchema } from "@/lib/validation/reservations";
import { getMailClient, getMailFrom, getOwnerTo } from "@/lib/mail";
import { reservationClientText, reservationOwnerText } from "@/lib/mailTemplates";
import { getEventDisplayDateTimePL } from "@/lib/cms/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Issue = { path: (string | number)[]; message: string };

function json400(error: string, issues?: Issue[], extra?: any) {
  return NextResponse.json({ error, issues: issues ?? [], ...extra }, { status: 400 });
}

function json409(error: string, issues?: Issue[], extra?: any) {
  return NextResponse.json({ error, issues: issues ?? [], ...extra }, { status: 409 });
}

async function decrementCapacityOrFail(payload: any, eventId: string) {
  const pool = (payload.db as any)?.pool;
  if (!pool?.query) throw new Error("payload.db.pool not available (Postgres adapter).");

  const r = await pool.query(
    `UPDATE "events"
     SET "capacity" = "capacity" - 1
     WHERE "id" = $1 AND "capacity" > 0
     RETURNING "capacity"`,
    [eventId],
  );

  return (r?.rowCount ?? 0) > 0;
}

async function incrementCapacity(payload: any, eventId: string) {
  const pool = (payload.db as any)?.pool;
  if (!pool?.query) return;
  await pool.query(`UPDATE "events" SET "capacity" = "capacity" + 1 WHERE "id" = $1`, [eventId]);
}

export async function POST(req: Request) {
  const payload = await getPayload({ config });

  const body = await req.json().catch(() => null);

  const parsed = businessRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json400(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    );
  }

  const data = parsed.data;

  if (!data.eventId) {
    return json400("VALIDATION_ERROR", [{ path: ["eventId"], message: "Brak eventId." }]);
  }

  const eventId = String(data.eventId);

  // pobierz event
  let event: any;
  try {
    event = await payload.findByID({ collection: "events", id: eventId });
  } catch (e: any) {
    return json400(
      "EVENT_NOT_FOUND",
      [{ path: ["eventId"], message: "Nie znaleziono wydarzenia." }],
      { message: e?.message },
    );
  }

  if (!event || !event.published || event.status !== "planned" || !event.registrationsEnabled) {
    return json409("NO_AVAILABILITY", [
      { path: ["eventId"], message: "Zapisy na to wydarzenie są wyłączone." },
    ]);
  }

  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt ? new Date(event.endsAt) : null;

  const dayISO = event.day ? new Date(event.day).toISOString() : new Date(startsAt).toISOString();
  const startHour = String(startsAt.getHours());
  const startMinute = String(startsAt.getMinutes());
  const endHour = endsAt ? String(endsAt.getHours()) : undefined;
  const endMinute = endsAt ? String(endsAt.getMinutes()) : undefined;

  // ✅ KWOTA Z EVENTU (do zapisania w rezerwacji)
  const pricePLN = typeof event?.pricePLN === "number" ? event.pricePLN : 0;

  // capacity atomowo
  let decremented = false;
  if (event.capacity != null) {
    try {
      const ok = await decrementCapacityOrFail(payload, eventId);
      if (!ok) {
        return json409("NO_AVAILABILITY", [
          { path: ["eventId"], message: "Brak wolnych miejsc (limit wyczerpany)." },
        ]);
      }
      decremented = true;
    } catch (e: any) {
      return json400(
        "CAPACITY_UPDATE_FAILED",
        [{ path: ["eventId"], message: "Nie udało się zaktualizować limitu miejsc." }],
        { message: e?.message },
      );
    }
  }

  try {
    const reservationDoc = await payload.create({
      collection: "reservations",
      data: {
        type: "biznes",
        event: eventId,

        customer: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          email: data.email,
        },

        notes: data.notes || "",

        day: dayISO,
        allDay: false,
        startHour,
        startMinute,
        endHour,
        endMinute,

        startsAt: startsAt.toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : undefined,

        disabledPerson: Boolean(data.disabledPerson),
        disabilityDetails: data.disabilityDetails || "",

        invoice: {
          wantInvoice: Boolean(data.wantInvoice),
          nip: data.nip || "",
        },

        acceptRules: Boolean(data.acceptRules),

        source: "online",
        status: "new",

        paymentStatus: "pending",

        depositRequired: pricePLN > 0,
        depositAmount: pricePLN,
      },
    });

    // ====== MAIL SECTION ======
    // Mail jest "best-effort": jeśli env od maila nie jest ustawione, rezerwacja ma się nadal utworzyć.
    try {
      const dt = getEventDisplayDateTimePL(event);
      const eventTitle = event?.title ?? "Wydarzenie biznesowe";
      const dateLabel = dt?.date ?? "—";
      const timeLabel = dt?.time ?? "—";

      const from = getMailFrom();
      const ownerTo = getOwnerTo();
      const resend = getMailClient();

      await resend.emails.send({
        from,
        to: ownerTo,
        subject: `Rezerwacja: ${eventTitle} — ${data.firstName} ${data.lastName}`,
        text: reservationOwnerText({
          eventTitle,
          dateLabel,
          timeLabel,
          pricePLN,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          email: data.email,
          disabledPerson: Boolean(data.disabledPerson),
          disabilityDetails: data.disabilityDetails || "",
          wantInvoice: Boolean(data.wantInvoice),
          nip: data.nip || "",
          notes: data.notes || "",
        }),
        reply_to: data.email,
      });

      await resend.emails.send({
        from,
        to: data.email,
        subject: `Potwierdzenie rezerwacji: ${eventTitle}`,
        text: reservationClientText({
          firstName: data.firstName,
          lastName: data.lastName,
          eventTitle,
          dateLabel,
          timeLabel,
          pricePLN,
        }),
      });
    } catch (mailErr: any) {
      console.warn("[MAIL] skipped / failed:", mailErr?.message || mailErr);
    }
    // ====== /MAIL SECTION ======

    return NextResponse.json({ ok: true, reservationId: reservationDoc.id });
  } catch (e: any) {
    if (decremented) await incrementCapacity(payload, eventId);

    const msg = e?.message || "Unknown error";
    return json400(
      "CREATE_FAILED",
      [{ path: [], message: "Nie udało się utworzyć rezerwacji." }],
      { message: msg },
    );
  }
}
