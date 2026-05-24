// Per-request context — user identity, anything else we need to thread
// through code that lives below the route handler without changing every
// signature on the way down.
//
// Backed by Node's AsyncLocalStorage (https://nodejs.org/api/async_context.html)
// so the value follows the async chain naturally — no manual passing.
//
// API routes wrap their handler body in `withRequestContext({ user, ... }, fn)`.
// Anything inside the chain (e.g. the filesystem provider writing to a
// history sidecar) can call `getRequestUser()` to find out who is on the
// other end. When called outside any context (e.g. background jobs,
// startup paths), the helper returns "anonymous".

import { AsyncLocalStorage } from "node:async_hooks"
import { ANONYMOUS } from "./current-user"

interface RequestContext {
  user: string
}

const store = new AsyncLocalStorage<RequestContext>()

export function withRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return store.run(ctx, fn)
}

export function getRequestUser(): string {
  return store.getStore()?.user ?? ANONYMOUS
}
