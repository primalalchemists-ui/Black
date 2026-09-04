/**
 * Wspólna logika wygasania nieopłaconych rezerwacji.
 *
 * Jeden mechanizm dla WSZYSTKICH typów rezerwacji (kręgle, bilard, impreza,
 * biznes, …). Kwalifikacja wynika WYŁĄCZNIE z właściwości rekordu
 * (paymentStatus / expiresAt / createdAt / status), nigdy z `type`.
 * Rezerwacje bez płatności (paymentStatus = 'not_required', np. stoliki)
 * nie mają expiresAt i nigdy nie kwalifikują się do wygaszenia.
 *
 * Rozdzielenie pojęć:
 *   - hold slotu       → expiresAt (createdAt + 15 min) — NIE zmieniamy go tutaj.
 *                        Dostępność slotu liczona jest z expiresAt w zapytaniach,
 *                        więc slot zwalnia się sam, niezależnie od tego sweepa.
 *   - status rekordu   → dopiero po eligibleForExpiryAt (min. createdAt + 20 min).
 *
 * Rekordy NIE są usuwane ani numerowane od nowa — zostają w bazie jako
 * historia próby rezerwacji.
 */

import { tryPaymentLock } from "@/lib/paymentLifecycle"

/** Hold slotu ustawiany przy tworzeniu płatnej rezerwacji (informacyjnie). */
export const HOLD_MINUTES = 15

/** Twarda dolna granica: nigdy nie wygaszamy wcześniej niż tyle od utworzenia. */
export const EXPIRY_MIN_AGE_MINUTES = 20

/** Margines bezpieczeństwa liczony od końca holdu. */
export const EXPIRY_GRACE_AFTER_HOLD_MINUTES = 5

/** Statusy, przy których rekord jest już rozstrzygnięty — nie ruszamy go. */
export const NON_EXPIRABLE_STATUSES = ["cancelled", "confirmed", "completed", "no_show"] as const

/** Statusy płatności blokujące wygaszenie (płatność w toku lub zakończona). */
export const NON_EXPIRABLE_PAYMENT_STATUSES = [
  "not_required",
  "verifying",
  "paid",
  "failed",
  "expired",
  "refunded",
  "forfeited",
] as const

export type ExpireOutcome =
  | "expired"
  | "skipped_locked"
  | "skipped_not_eligible"
  | "skipped_payment_settled"
  | "error"

export type SweepResult = {
  scanned: number
  updated: number
  skippedLocked: number
  skippedNotEligible: number
  skippedPaymentSettled: number
  errors: string[]
}

const MINUTE_MS = 60 * 1000

function toDate(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(value as any)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Moment, od którego rekord wolno oznaczyć jako wygasły:
 *
 *   MAX(createdAt + 20 min, expiresAt + 5 min)
 *
 * Dzięki MAX ręczne skrócenie holdu (np. przez /api/reservations/cancel,
 * które ustawia expiresAt = now) NIE przyspiesza zmiany statusu poniżej
 * 20 minut od utworzenia rekordu.
 *
 * Zwraca null, gdy rekord w ogóle nie podlega wygaszaniu (brak expiresAt →
 * rezerwacja nie wymagała płatności online).
 */
export function eligibleForExpiryAt(doc: any): Date | null {
  const expiresAt = toDate(doc?.expiresAt)
  if (!expiresAt) return null

  const fromHold = expiresAt.getTime() + EXPIRY_GRACE_AFTER_HOLD_MINUTES * MINUTE_MS

  const createdAt = toDate(doc?.createdAt)
  // Brak createdAt (nie powinien wystąpić) → zostaje sam warunek z holdu.
  const fromCreated = createdAt
    ? createdAt.getTime() + EXPIRY_MIN_AGE_MINUTES * MINUTE_MS
    : fromHold

  return new Date(Math.max(fromCreated, fromHold))
}

/**
 * Pełny warunek kwalifikacji — używany zarówno do zapytania wstępnego,
 * jak i do PONOWNEJ weryfikacji na świeżym odczycie pod lockiem.
 */
export function isExpirable(doc: any, now: Date): boolean {
  if (!doc) return false
  if (doc.paymentStatus !== "pending") return false
  if (NON_EXPIRABLE_STATUSES.includes(doc.status)) return false

  const eligibleAt = eligibleForExpiryAt(doc)
  if (!eligibleAt) return false

  return eligibleAt.getTime() <= now.getTime()
}

/**
 * Kandydaci do wygaszenia. Warunek MAX(...) rozkłada się na koniunkcję
 * dwóch niezależnych warunków, więc da się go wyrazić w całości po stronie
 * bazy (bez filtrowania w JS):
 *
 *   MAX(a, b) <= now   ⟺   a <= now AND b <= now
 */
export async function findExpirableReservations(
  payload: any,
  opts?: { now?: Date; limit?: number },
): Promise<any[]> {
  const now = opts?.now ?? new Date()
  const limit = opts?.limit ?? 200

  const createdBefore = new Date(now.getTime() - EXPIRY_MIN_AGE_MINUTES * MINUTE_MS).toISOString()
  const expiresBefore = new Date(
    now.getTime() - EXPIRY_GRACE_AFTER_HOLD_MINUTES * MINUTE_MS,
  ).toISOString()

  const result = await payload.find({
    collection: "reservations",
    limit,
    depth: 0,
    overrideAccess: true,
    sort: "expiresAt",
    where: {
      and: [
        { paymentStatus: { equals: "pending" } },
        { status: { not_in: [...NON_EXPIRABLE_STATUSES] } },
        { expiresAt: { exists: true } },
        { expiresAt: { less_than_equal: expiresBefore } },
        { createdAt: { less_than_equal: createdBefore } },
      ],
    },
  })

  return (result.docs as any[]) ?? []
}

/**
 * Czy dla danej sesji płatniczej istnieje płatność, która została już
 * rozstrzygnięta na korzyść klienta? Wtedy nie wolno nic wygaszać —
 * webhook jest w locie albo już przeszedł.
 */
async function paymentIsSettled(payload: any, sessionId: string): Promise<boolean> {
  if (!sessionId) return false
  const result = await payload.find({
    collection: "payments",
    limit: 5,
    depth: 0,
    overrideAccess: true,
    where: { p24SessionId: { equals: sessionId } },
  })
  return (result.docs as any[]).some((p) => p.status === "paid" || p.status === "refunded")
}

/**
 * Wygaszenie jednej grupy rezerwacji (jedna sesja P24 = jeden groupId).
 *
 * Cała operacja pod TYM SAMYM advisory lockiem, którego używa
 * confirmGroupPayment (`payment|<sessionId>`), więc sweep i webhook nigdy
 * nie działają równolegle na tej samej sesji. Lock zajęty → pomijamy rekord,
 * kolejny sweep go obsłuży.
 *
 * Idempotencja: po zdobyciu locka robimy ŚWIEŻY odczyt i ponownie sprawdzamy
 * wszystkie warunki. Rekord już obsłużony nie zostanie zmieniony po raz drugi.
 */
export async function expireReservationGroup(
  payload: any,
  args: { groupId: string | null; ids: Array<string | number>; now?: Date },
): Promise<{ outcome: ExpireOutcome; updated: number }> {
  const now = args.now ?? new Date()
  const groupId = args.groupId

  const critical = async (): Promise<{ outcome: ExpireOutcome; updated: number }> => {
    // ŚWIEŻY odczyt — nigdy nie aktualizujemy na podstawie odczytu sprzed locka.
    const fresh = groupId
      ? ((
          await payload.find({
            collection: "reservations",
            limit: 100,
            depth: 0,
            overrideAccess: true,
            where: { groupId: { equals: groupId } },
          })
        ).docs as any[])
      : await Promise.all(
          args.ids.map((id) =>
            payload
              .findByID({ collection: "reservations", id, depth: 0, overrideAccess: true })
              .catch(() => null),
          ),
        ).then((docs) => docs.filter(Boolean) as any[])

    if (!fresh.length) return { outcome: "skipped_not_eligible", updated: 0 }

    // Płatność rozstrzygnięta (paid/refunded) → nie ruszamy niczego w grupie.
    if (groupId && (await paymentIsSettled(payload, groupId))) {
      console.log(`[expiry] SKIPPED_PAYMENT_SETTLED groupId=${groupId}`)
      return { outcome: "skipped_payment_settled", updated: 0 }
    }

    // Jakikolwiek dokument w grupie już opłacony / w weryfikacji → grupa żyje.
    if (fresh.some((d) => d.paymentStatus === "paid" || d.paymentStatus === "verifying")) {
      console.log(
        `[expiry] SKIPPED_GROUP_ACTIVE groupId=${groupId ?? "-"}` +
          ` statuses=${fresh.map((d) => d.paymentStatus).join(",")}`,
      )
      return { outcome: "skipped_payment_settled", updated: 0 }
    }

    const eligible = fresh.filter((d) => isExpirable(d, now))
    if (!eligible.length) return { outcome: "skipped_not_eligible", updated: 0 }

    let updated = 0
    for (const doc of eligible) {
      await payload.update({
        collection: "reservations",
        id: doc.id,
        overrideAccess: true,
        // beforeChange i tak przerywa dla statusu 'cancelled', ale pomijamy
        // kosztowny conflict-check jawnie (spójnie z resztą projektu).
        context: { skipConflictCheck: true },
        data: {
          status: "cancelled",
          paymentStatus: "expired",
          cancellationReason: "payment_expired",
        } as any,
      })
      updated++
      console.log(
        `[expiry] RESERVATION_EXPIRED reservationId=${doc.id}` +
          ` reservationNumber=${doc.reservationNumber ?? "-"} type=${doc.type}` +
          ` groupId=${groupId ?? "-"} expiresAt=${doc.expiresAt} createdAt=${doc.createdAt}`,
      )
    }

    // Powiązana płatność: tylko pending → expired.
    // skipPaymentSync — hook Payments.afterChange nie może cofnąć
    // reservation.paymentStatus, który właśnie ustawiliśmy.
    if (groupId) {
      const payments = await payload.find({
        collection: "payments",
        limit: 10,
        depth: 0,
        overrideAccess: true,
        where: {
          and: [{ p24SessionId: { equals: groupId } }, { status: { equals: "pending" } }],
        },
      })

      for (const pmt of payments.docs as any[]) {
        await payload
          .update({
            collection: "payments",
            id: pmt.id,
            overrideAccess: true,
            context: { skipPaymentSync: true },
            data: { status: "expired" } as any,
          })
          .catch((err: any) =>
            console.error(`[expiry] PAYMENT_EXPIRE_FAILED paymentId=${pmt.id}:`, err?.message ?? err),
          )
      }
    }

    return { outcome: "expired", updated }
  }

  try {
    // Rekord bez groupId nie ma sesji płatniczej, o którą można się ścigać
    // z webhookiem — wykonujemy bez locka (nadal ze świeżym odczytem).
    if (!groupId) return await critical()

    const locked = await tryPaymentLock(payload, groupId, critical)
    if (locked === null) {
      console.log(`[expiry] SKIPPED_LOCK_UNAVAILABLE groupId=${groupId} — webhook w trakcie`)
      return { outcome: "skipped_locked", updated: 0 }
    }
    return locked
  } catch (err: any) {
    console.error(`[expiry] ERROR groupId=${groupId ?? "-"}:`, err?.message ?? err)
    return { outcome: "error", updated: 0 }
  }
}

/**
 * Pełny przebieg: znajdź kandydatów, pogrupuj po sesji płatniczej,
 * wygaś każdą grupę pod jej własnym lockiem.
 *
 * Bezpieczne przy wielokrotnym uruchomieniu (również równolegle).
 * Nie wysyła żadnych maili ani innych efektów ubocznych.
 */
export async function runExpirySweep(
  payload: any,
  opts?: { now?: Date; limit?: number },
): Promise<SweepResult> {
  const now = opts?.now ?? new Date()
  const candidates = await findExpirableReservations(payload, { now, limit: opts?.limit })

  const result: SweepResult = {
    scanned: candidates.length,
    updated: 0,
    skippedLocked: 0,
    skippedNotEligible: 0,
    skippedPaymentSettled: 0,
    errors: [],
  }

  if (!candidates.length) return result

  // Grupowanie po sesji płatniczej — jeden lock na grupę.
  const groups = new Map<string, { groupId: string | null; ids: Array<string | number> }>()
  for (const doc of candidates) {
    const groupId = typeof doc.groupId === "string" && doc.groupId ? doc.groupId : null
    const key = groupId ?? `__no_group__${doc.id}`
    const entry = groups.get(key) ?? { groupId, ids: [] as Array<string | number> }
    entry.ids.push(doc.id)
    groups.set(key, entry)
  }

  for (const [key, group] of groups) {
    try {
      const { outcome, updated } = await expireReservationGroup(payload, {
        groupId: group.groupId,
        ids: group.ids,
        now,
      })

      if (outcome === "expired") result.updated += updated
      else if (outcome === "skipped_locked") result.skippedLocked++
      else if (outcome === "skipped_payment_settled") result.skippedPaymentSettled++
      else if (outcome === "skipped_not_eligible") result.skippedNotEligible++
      else result.errors.push(`group=${key}: unknown outcome`)
    } catch (err: any) {
      const msg = `group=${key}: ${err?.message ?? String(err)}`
      result.errors.push(msg)
      console.error(`[expiry] SWEEP_GROUP_ERROR ${msg}`)
    }
  }

  console.log(
    `[expiry] SWEEP_DONE scanned=${result.scanned} updated=${result.updated}` +
      ` locked=${result.skippedLocked} settled=${result.skippedPaymentSettled}` +
      ` notEligible=${result.skippedNotEligible} errors=${result.errors.length}`,
  )

  return result
}
