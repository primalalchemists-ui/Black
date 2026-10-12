/**
 * Bramka dostępu do środowiska staging.
 *
 * Odrębna od trybu maintenance i celowo szersza. Maintenance wyklucza `/api/*`
 * (matcher w middleware), więc nie chroni endpointów rezerwacji ani płatności.
 * Staging musi chronić także je — żądanie bez poświadczeń nie może dotrzeć do
 * handlera mutującego.
 *
 * ── ZASADY ───────────────────────────────────────────────────────────────────
 *
 * • Włączana wyłącznie przez STAGING_PROTECTION=true. Domyślnie wyłączona,
 *   więc produkcja zachowuje się dokładnie tak jak dotąd.
 * • Fail closed: gdy jest włączona, a brakuje STAGING_ACCESS_KEY albo
 *   PAYLOAD_SECRET — cały ruch dostaje 503, zamiast przypadkiem się otworzyć.
 * • Sekret nie trafia do repozytorium ani do ciasteczka: ciasteczko trzyma
 *   HMAC-SHA256 klucza, nie sam klucz.
 *
 * ── DWIE DROGI UWIERZYTELNIENIA ──────────────────────────────────────────────
 *
 * 1. Ciasteczko — dla przeglądarki, ustawiane przez /api/staging/login.
 * 2. Nagłówek `x-staging-access: <STAGING_ACCESS_KEY>` — dla Playwrighta
 *    (`extraHTTPHeaders`) oraz dla wewnętrznych fetchy serwer→własne API.
 *
 * Obie ścieżki porównują HMAC, nie surowy tekst: długość porównywanych ciągów
 * jest stała niezależnie od wejścia.
 */

export const STAGING_COOKIE = "__staging_auth"
export const STAGING_HEADER = "x-staging-access"

/** Ścieżki nigdy nie bramkowane — inaczej zepsułyby się zasoby i samo logowanie. */
export const STAGING_LOGIN_PATH = "/api/staging/login"
export const STAGING_LOGOUT_PATH = "/api/staging/logout"

/**
 * Webhook P24.
 *
 * Dziś niepotrzebny: staging działa z P24_ENV=mock, który nie kontaktuje się
 * z żadnym API Przelewy24, więc żaden webhook nie przyjdzie.
 *
 * Gdy kiedyś włączymy P24_ENV=sandbox, Przelewy24 musi móc wywołać dokładnie
 * JEDEN endpoint — i tylko ten. Dlatego wyjątek jest osobną zmienną
 * (STAGING_ALLOW_P24_WEBHOOK=true), domyślnie wyłączoną, i obejmuje wyłącznie
 * ścieżkę poniżej. Nie otwiera żadnego innego endpointu.
 *
 * Ten endpoint pozostaje chroniony własnym mechanizmem: weryfikuje podpis
 * sha384 z CRC sandboxa (`verifyCallbackSign`) i bez poprawnego podpisu nic
 * nie robi. Dopuszczenie go tutaj nie czyni go publicznym w sensie działania —
 * czyni go jedynie osiągalnym.
 */
export const P24_WEBHOOK_PATH = "/api/payments/p24/status"

export type StagingEnv = {
  STAGING_PROTECTION?: string
  STAGING_ACCESS_KEY?: string
  STAGING_ALLOW_P24_WEBHOOK?: string
  PAYLOAD_SECRET?: string
  // process.env ma sygnaturę indeksową — bez jej odwzorowania TS odrzuca
  // przypisanie ProcessEnv do typu o samych polach opcjonalnych (TS2559).
  [key: string]: string | undefined
}

export function isStagingProtectionEnabled(env: StagingEnv = process.env): boolean {
  return env.STAGING_PROTECTION === "true"
}

/** Ścieżki dostępne bez poświadczeń, gdy bramka jest włączona. */
export function isAlwaysAllowedPath(pathname: string, env: StagingEnv = process.env): boolean {
  if (pathname === STAGING_LOGIN_PATH || pathname === STAGING_LOGOUT_PATH) return true
  if (env.STAGING_ALLOW_P24_WEBHOOK === "true" && pathname === P24_WEBHOOK_PATH) return true
  return false
}

/**
 * HMAC-SHA256 klucza. Działa zarówno w Edge (middleware), jak i w Node
 * (route handlery) — Web Crypto jest w obu runtime'ach.
 */
export async function computeStagingToken(key: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(key))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Nagłówki dla wewnętrznych fetchy serwer→własne `/api/*`.
 *
 * Bramka obejmuje także `/api/*`, a te żądania nie niosą ciasteczka
 * przeglądarki. Poza stagingiem zwraca pusty obiekt, więc nic nie zmienia
 * w zachowaniu produkcji.
 */
export function internalFetchHeaders(env: StagingEnv = process.env): Record<string, string> {
  if (!isStagingProtectionEnabled(env)) return {}
  const key = env.STAGING_ACCESS_KEY
  if (!key) return {}
  return { [STAGING_HEADER]: key }
}

/**
 * Escapowanie do kontekstu HTML.
 *
 * Parser URL-a i tak koduje `"`, `<` i `>` w ścieżce oraz query, więc dziś nie
 * ma tu wektora wstrzyknięcia. Nie chcemy jednak opierać bezpieczeństwa na
 * cudzej normalizacji — wartość trafia do atrybutu, więc escapujemy wprost.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function stagingLoginPageHtml(opts: { redirectTo?: string; error?: string } = {}): string {
  const errorHtml = opts.error
    ? `<p style="color:#f85149;font-size:.85rem;margin:0 0 14px 0;">${escapeHtml(opts.error)}</p>`
    : ""
  const redirect = escapeHtml(opts.redirectTo ?? "/")
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Staging — BLACK</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#c9d1d9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:36px 32px;width:100%;max-width:380px}
.tag{display:inline-block;background:#1f6feb;color:#fff;font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;margin-bottom:16px}
h1{font-size:1.05rem;font-weight:700;color:#f0f6fc;margin-bottom:8px}
.info{font-size:.85rem;color:#8b949e;margin-bottom:22px;line-height:1.6}
label{display:block;font-size:.75rem;color:#8b949e;font-weight:600;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}
input[type=password]{width:100%;padding:9px 12px;background:#0d1117;border:1px solid #30363d;border-radius:7px;color:#c9d1d9;font-size:.9rem;outline:none;transition:border-color .15s}
input[type=password]:focus{border-color:#58a6ff}
button{margin-top:10px;width:100%;padding:9px;background:#1f6feb;color:#fff;border:none;border-radius:7px;font-size:.875rem;font-weight:600;cursor:pointer;transition:background .15s}
button:hover{background:#388bfd}
</style>
</head>
<body>
<div class="card">
<span class="tag">Staging</span>
<h1>Środowisko testowe</h1>
<p class="info">To nie jest strona produkcyjna. Dostęp wymaga klucza środowiska testowego.</p>
${errorHtml}<form method="POST" action="${STAGING_LOGIN_PATH}">
<input type="hidden" name="redirect" value="${redirect}">
<label for="pw">Klucz dostępu</label>
<input type="password" id="pw" name="key" autofocus autocomplete="current-password">
<button type="submit">Wejdź</button>
</form>
</div>
</body>
</html>`
}
