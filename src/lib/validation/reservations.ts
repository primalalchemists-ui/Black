import { z } from "zod";

/** helpers */
const phonePL = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, "")) // usuń spacje
  .refine((v) => {
    // akceptujemy: 9 cyfr PL (np. 728031213) albo +48XXXXXXXXX
    const plain9 = /^[0-9]{9}$/;
    const plus48 = /^\+48[0-9]{9}$/;
    return plain9.test(v) || plus48.test(v);
  }, "Podaj poprawny numer telefonu (9 cyfr lub +48XXXXXXXXX)");

const emailOptional = z.string().trim().email("Podaj poprawny email").optional().or(z.literal(""));

const nipPL = z.string().trim().regex(/^[0-9]{10}$/, "NIP musi mieć 10 cyfr");

/** shared sections */
export const customerSchema = z.object({
  firstName: z.string().trim().min(2, "Imię jest wymagane"),
  lastName: z.string().trim().min(2, "Nazwisko jest wymagane"),
  phone: phonePL,
  email: z.string().trim().email("Podaj poprawny email"),
  notes: z.string().trim().max(1000, "Za długie uwagi").optional().or(z.literal("")),
});

// Tylko shape — superRefine jest dodawany na każdym request schema osobno,
// bo Zod .merge() ciche gubi .superRefine() ze schematu źródłowego.
export const invoiceSchema = z.object({
  wantInvoice: z.boolean().default(false),
  invoiceType: z.enum(["", "personal", "company"]).default(""),
  nip: z.string().trim().optional().or(z.literal("")),
});

function applyInvoiceRules(
  val: { wantInvoice?: boolean; invoiceType?: string; nip?: string },
  ctx: z.RefinementCtx,
) {
  if (!val.wantInvoice) return;
  if (!val.invoiceType) {
    ctx.addIssue({ code: "custom", path: ["invoiceType"], message: "Wybierz rodzaj faktury" });
  }
  if (val.invoiceType === "company") {
    const res = nipPL.safeParse(val.nip ?? "");
    if (!res.success) {
      ctx.addIssue({ code: "custom", path: ["nip"], message: "Podaj NIP firmy." });
    }
  }
}

// export const acceptRulesSchema = z.object({
//   acceptRules: z.boolean().refine((v) => v === true, {
//     message: "Musisz zaakceptować regulamin obiektu",
//   }),
// });

export const acceptDocumentsSchema = z.object({
  acceptRules: z
    .boolean()
    .default(false)
    .refine((v) => v === true, { message: "Musisz zaakceptować regulamin obiektu" }),

  acceptPrivacyPolicy: z
    .boolean()
    .default(false)
    .refine((v) => v === true, { message: "Musisz zaakceptować politykę prywatności" }),
});




const isQuarterHourFloat = (n: number) => Number.isFinite(n) && Math.round(n * 4) === n * 4;

/**
 * ✅ FIX: startHour/endHour mogą być floatami co 15 min (np. 16.25, 16.5, 16.75).
 * ResourceGrid emituje floaty -> nie blokujemy submitu.
 */
export const gridSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Wybierz poprawną datę"),
    startHour: z.number().min(0).max(23.75, "Niepoprawna godzina startu"),
    endHour: z.number().min(0).max(23.75, "Niepoprawna godzina końca"),
    resources: z.array(z.number().int().min(1)).min(1, "Wybierz przynajmniej 1 zasób"),
    totalPrice: z.number().nonnegative(),
  })
  .superRefine((val, ctx) => {
    if (!isQuarterHourFloat(val.startHour)) {
      ctx.addIssue({ code: "custom", path: ["startHour"], message: "Start musi być co 15 minut." });
    }
    if (!isQuarterHourFloat(val.endHour)) {
      ctx.addIssue({ code: "custom", path: ["endHour"], message: "Koniec musi być co 15 minut." });
    }
    if (val.endHour < val.startHour) {
      ctx.addIssue({ code: "custom", path: ["endHour"], message: "Koniec musi być po początku" });
    }
  });

export const tablesSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Wybierz poprawną datę"),
    hour: z.string().regex(/^\d{2}:\d{2}$/, "Wybierz godzinę"),
    partySize: z.number().int().min(1, "Minimum 1 osoba").max(16, "Maksymalnie 16 osób na jedną rezerwację online"),
    tablesCount: z.number().int().min(1),
    deposit: z.number().nonnegative(),
  })
  .superRefine((val, ctx) => {
    const [hh, mm] = val.hour.split(":").map(Number);
    if (Number.isNaN(hh) || hh < 0 || hh > 23) {
      ctx.addIssue({ code: "custom", path: ["hour"], message: "Niepoprawna godzina" });
    }
    if (Number.isNaN(mm) || mm < 0 || mm > 59) {
      ctx.addIssue({ code: "custom", path: ["hour"], message: "Niepoprawne minuty" });
    }
    if (mm % 15 !== 0) {
      ctx.addIssue({ code: "custom", path: ["hour"], message: "Rezerwacje są możliwe wyłącznie co 15 minut" });
    }
  });

export const businessSchema = z
  .object({
    eventId: z.string().min(1, "Wybierz wydarzenie"),
    partySize: z.number({ invalid_type_error: "Podaj liczbę osób" }).int().min(1, "Minimalna liczba osób: 1").optional().default(1),
    disabledPerson: z.boolean().default(false),
    disabilityDetails: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.disabledPerson) {
      if (!val.disabilityDetails || val.disabilityDetails.trim().length < 5) {
        ctx.addIssue({
          code: "custom",
          path: ["disabilityDetails"],
          message: "Opisz krótko problem (min. 5 znaków)",
        });
      }
    }
  });

export const imprezaSchema = z.object({
  eventId: z.string().min(1, "Wybierz imprezę"),
  partySize: z.preprocess(
    (v) => (typeof v === "number" && Number.isNaN(v) ? undefined : v),
    z.number({ required_error: "Podaj liczbę osób", invalid_type_error: "Podaj liczbę osób" })
      .int()
      .min(1, "Minimalna liczba osób: 1"),
  ),
});

/** request schemas
 * ✅ TS FIX: składamy schemy przez .merge(), a nie przez rozsypywanie .shape
 * (po superRefine / effects TS potrafi robić boolean | undefined).
 */
export const billiardsRequestSchema = z
  .object({ type: z.literal("bilard") })
  .merge(gridSchema)
  .merge(customerSchema)
  .merge(invoiceSchema)
  .merge(acceptDocumentsSchema)
  .superRefine(applyInvoiceRules);

export type BilliardsRequest = z.infer<typeof billiardsRequestSchema>;

export const bowlingRequestSchema = z
  .object({ type: z.literal("kregle") })
  .merge(gridSchema)
  .merge(customerSchema)
  .merge(invoiceSchema)
  .merge(acceptDocumentsSchema)
  .superRefine(applyInvoiceRules);

export type BowlingRequest = z.infer<typeof bowlingRequestSchema>;

export const tablesRequestSchema = z
  .object({ type: z.literal("stolik") })
  .merge(tablesSchema)
  .merge(customerSchema)
  .merge(invoiceSchema)
  .merge(acceptDocumentsSchema)
  .superRefine(applyInvoiceRules);

export type TablesRequest = z.infer<typeof tablesRequestSchema>;

export const businessRequestSchema = z
  .object({ type: z.literal("biznes") })
  .merge(businessSchema)
  .merge(customerSchema)
  .merge(invoiceSchema)
  .merge(acceptDocumentsSchema)
  .superRefine(applyInvoiceRules);

export type BusinessRequest = z.infer<typeof businessRequestSchema>;

export const imprezaRequestSchema = z
  .object({ type: z.literal("impreza") })
  .merge(imprezaSchema)
  .merge(customerSchema)
  .merge(invoiceSchema)
  .merge(acceptDocumentsSchema)
  .superRefine(applyInvoiceRules);

export type ImprezaRequest = z.infer<typeof imprezaRequestSchema>;

/** union */
export const reservationCreateRequestSchema = z.discriminatedUnion("type", [
  billiardsRequestSchema,
  bowlingRequestSchema,
  tablesRequestSchema,
  businessRequestSchema,
]);

export type ReservationCreateRequest = z.infer<typeof reservationCreateRequestSchema>;
