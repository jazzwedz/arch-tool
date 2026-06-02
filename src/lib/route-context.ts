// Glue between Next.js route handlers and the request-scoped context
// the rest of the codebase reads through AsyncLocalStorage.
//
// Each route handler that wants logger + lock + history sidecar
// integration wraps its body in `withRouteContext(request, fn)`. The
// helper:
//   - reads the user from the configured X-Forwarded-User-style header
//   - reuses an upstream x-request-id when the reverse proxy set one,
//     otherwise mints a fresh UUID so every log line in the request
//     chain shares a correlation id
//   - records the URL path so the logger can show `route` without
//     every caller having to repeat it
//
// Handlers stay thin — `return withRouteContext(req, async () => { ... })`.

import { randomUUID } from "node:crypto"
import { withRequestContext } from "./request-context"
import { getCurrentUser } from "./current-user"

export function withRouteContext<T>(
  request: Request,
  fn: () => Promise<T>
): Promise<T> {
  const user = getCurrentUser(request)
  const headerId = request.headers.get("x-request-id")
  const requestId = (headerId && headerId.slice(0, 80)) || randomUUID()
  let route: string | undefined
  try {
    route = new URL(request.url).pathname
  } catch {
    // ignore
  }
  return withRequestContext({ user, requestId, route }, fn)
}
