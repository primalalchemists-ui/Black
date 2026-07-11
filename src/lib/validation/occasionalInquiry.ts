import { z } from "zod";

const phonePL = z
  .string()
  .min(1, "Telefon jest wymagany")
  .trim()
  .transform((v) => v.replace(/\s|-/g, ""))
  .refine((v) => {
    const vv = v.startsWith("+48") ? v.slice(3) : v;
    return /^\d{9}$/.test(vv);
  }, { message: "Podaj poprawny numer telefonu (9 cyfr)" });

const nipPL = z
  .string()
  .min(1, "NIP jest wymagany")
  .trim()
  .transform((v) => v.replace(/\s|-/g, ""))
  .refine((v) => /^\d{10}$/.test(v), { message: "NIP musi mieć 10 cyfr" });

export const occasionalInquirySchema = z
  .object({
    firstName: z.string().min(1, "Imię jest wymagane").trim().min(2, "Imię jest wymagane"),
    lastName: z.string().min(1, "Nazwisko jest wymagane").trim().min(2, "Nazwisko jest wymagane"),
    phone: phonePL,
    email: z.string().min(1, "Email jest wymagany").trim().email("Podaj poprawny email"),

    isCompany: z.boolean().default(false),
    nip: z.string().trim().optional().or(z.literal("")),

    message: z
      .string()
      .min(1, "Wiadomość jest wymagana")
      .trim()
      .min(10, "Napisz proszę krótką wiadomość (min. 10 znaków)")
      .max(3000, "Za długa wiadomość"),

    // ✅ tylko polityka prywatności
    acceptPrivacyPolicy: z
      .boolean({ invalid_type_error: "Musisz zaakceptować politykę prywatności" })
      .refine((v) => v === true, { message: "Musisz zaakceptować politykę prywatności" }),
  })
  .superRefine((val, ctx) => {
    // ✅ NIP wymagany tylko gdy firma
    if (val.isCompany) {
      const res = nipPL.safeParse(val.nip ?? "");
      if (!res.success) {
        ctx.addIssue({
          code: "custom",
          path: ["nip"],
          message: "Podaj poprawny NIP (10 cyfr)",
        });
      }
    }
  });

export type OccasionalInquiry = z.infer<typeof occasionalInquirySchema>;
