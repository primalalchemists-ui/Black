export const MAINTENANCE_COOKIE = "__maint_auth"

// Runs in both Edge (middleware) and Node.js (API routes).
// Uses Web Crypto API — available in both runtimes.
export async function computeMaintenanceToken(password: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(password))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export function maintenancePageHtml(opts: { redirectTo?: string; error?: string } = {}): string {
  const errorHtml = opts.error
    ? `<p style="color:#f85149;font-size:.85rem;margin:0 0 14px 0;">${opts.error}</p>`
    : ""
  const redirect = opts.redirectTo ?? "/"
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prace techniczne — BLACK</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#c9d1d9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:36px 32px;width:100%;max-width:380px}
h1{font-size:1.05rem;font-weight:700;color:#f0f6fc;margin-bottom:8px}
.info{font-size:.85rem;color:#8b949e;margin-bottom:22px;line-height:1.6}
label{display:block;font-size:.75rem;color:#8b949e;font-weight:600;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}
input[type=password]{width:100%;padding:9px 12px;background:#0d1117;border:1px solid #30363d;border-radius:7px;color:#c9d1d9;font-size:.9rem;outline:none;transition:border-color .15s}
input[type=password]:focus{border-color:#58a6ff}
button{margin-top:10px;width:100%;padding:9px;background:#238636;color:#fff;border:none;border-radius:7px;font-size:.875rem;font-weight:600;cursor:pointer;transition:background .15s}
button:hover{background:#2ea043}
</style>
</head>
<body>
<div class="card">
<h1>Centrum Spotkań BLACK</h1>
<p class="info">Strona jest chwilowo niedostępna z powodu prac technicznych.</p>
${errorHtml}<form method="POST" action="/api/maintenance/login">
<input type="hidden" name="redirect" value="${redirect}">
<label for="pw">Hasło</label>
<input type="password" id="pw" name="password" autofocus autocomplete="current-password">
<button type="submit">Wejdź</button>
</form>
</div>
</body>
</html>`
}
