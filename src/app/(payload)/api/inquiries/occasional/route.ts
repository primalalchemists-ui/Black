// import { NextResponse } from "next/server";
// import { getMailTransport, getMailFrom, getOwnerTo } from "@/lib/mail";
// import { inquiryClientText, inquiryOwnerText } from "@/lib/mailTemplates";
// import { occasionalInquirySchema } from "@/lib/validation/occasionalInquiry";

// export async function POST(req: Request) {
//   try {
//     const json = await req.json();
//     const parsed = occasionalInquirySchema.safeParse(json);

//     if (!parsed.success) {
//       return NextResponse.json(
//         { error: "VALIDATION_ERROR", issues: parsed.error.issues },
//         { status: 400 }
//       );
//     }

//     const v = parsed.data;

//     // opcjonalnie: zapis do Payload / bazy

//     // ✅ runtime init (nie zabija builda)
//     let mailTransport;
//     try {
//       mailTransport = getMailTransport();
//     } catch (e: any) {
//       if (e?.message === "MAIL_NOT_CONFIGURED") {
//         return NextResponse.json(
//           { error: "MAIL_NOT_CONFIGURED" },
//           { status: 503 }
//         );
//       }
//       throw e;
//     }

//     const ownerTo = getOwnerTo();
//     const from = getMailFrom();

//     await mailTransport.sendMail({
//       from,
//       to: ownerTo,
//       subject: `Zapytanie o event: ${v.firstName} ${v.lastName}`,
//       text: inquiryOwnerText({
//         firstName: v.firstName,
//         lastName: v.lastName,
//         phone: v.phone,
//         email: v.email,
//         isCompany: v.isCompany,
//         nip: v.nip,
//         message: v.message,
//       }),
//       replyTo: v.email,
//     });

//     await mailTransport.sendMail({
//       from,
//       to: v.email,
//       subject: "Potwierdzenie otrzymania zapytania",
//       text: inquiryClientText({ firstName: v.firstName }),
//     });

//     return NextResponse.json({ ok: true });
//   } catch (e: any) {
//     console.error("MAIL/INQUIRY ERROR:", e);
//     return NextResponse.json(
//       { error: "SERVER_ERROR", message: "Wystąpił błąd serwera." },
//       { status: 500 }
//     );
//   }
// }

import { NextResponse } from "next/server";
import { getMailClient, getMailFrom, getOwnerTo } from "@/lib/mail";
import { inquiryClientText, inquiryOwnerText } from "@/lib/mailTemplates";
import { occasionalInquirySchema } from "@/lib/validation/occasionalInquiry";

export const runtime = "nodejs"; // ważne na Next
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = occasionalInquirySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const v = parsed.data;

    // ✅ runtime init (nie zabija builda)
    let resend;
    try {
      resend = getMailClient();
    } catch (e: any) {
      if (e?.message === "MAIL_NOT_CONFIGURED") {
        return NextResponse.json(
          { error: "MAIL_NOT_CONFIGURED" },
          { status: 503 }
        );
      }
      throw e;
    }

    const ownerTo = getOwnerTo();
    const from = getMailFrom();

    // mail do właściciela
    await resend.emails.send({
      from,
      to: ownerTo,
      subject: `Zapytanie o event: ${v.firstName} ${v.lastName}`,
      text: inquiryOwnerText({
        firstName: v.firstName,
        lastName: v.lastName,
        phone: v.phone,
        email: v.email,
        isCompany: v.isCompany,
        nip: v.nip,
        message: v.message,
      }),
      reply_to: v.email,
    });

    // mail do klienta
    await resend.emails.send({
      from,
      to: v.email,
      subject: "Potwierdzenie otrzymania zapytania",
      text: inquiryClientText({ firstName: v.firstName }),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("MAIL/INQUIRY ERROR:", e);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Wystąpił błąd serwera." },
      { status: 500 }
    );
  }
}

