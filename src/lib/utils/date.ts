export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toNumberSafe(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Safari fix:
 * - "YYYY-MM-DD" nie zawsze parsuje się poprawnie przez new Date(str)
 * - więc robimy lokalny Date(y, m-1, d)
 */
export function parseISODateLocal(iso: string): Date | null {
  if (!iso) return null;

  // jeśli to pełny ISO z czasem -> Date(iso) zazwyczaj ok
  if (iso.includes("T")) {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // obsługa "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(y, mo - 1, day);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatDatePL(d: Date) {
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
