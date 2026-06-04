"use client"

// React state hook backed by localStorage.
//
// Drop-in replacement for useState that survives page reloads,
// route navigations and tab swaps. Used for UI preferences (catalog
// view mode, filters, search) where the alternative is a forgetful
// page that punishes the analyst for clicking into a component and
// hitting Back.
//
// Lifecycle:
//
//   On the server (Next.js SSR pass for the "use client" component):
//     window is undefined, so the useState initialiser falls back to
//     the caller-supplied `initial`. Server-rendered HTML uses that.
//
//   On the client (hydration + every subsequent render):
//     the useState initialiser reads localStorage SYNCHRONOUSLY and
//     returns the stored value when one exists. The very first
//     client-side render therefore reflects the persisted value —
//     no second-pass effect, no flash of defaults that previously
//     looked like "the page forgot my filters".
//
//   On every state change after mount:
//     the persistence effect writes the new value back. No hydration
//     gate is needed any more — the initial state IS the persisted
//     value, so writing it on first run is at worst a no-op identity
//     write.
//
//   On errors (private-mode browsers, disabled storage, quota,
//     malformed JSON): silently fall back to the default. The in-
//     memory state still works — only the persistence is lost.
//
// Hydration-mismatch caveat: for keys whose stored value differs
// from `initial`, the server-rendered HTML uses `initial` but the
// client's first render uses the stored value. React 18+ tolerates
// this for input.value / aria attributes by re-rendering to client
// values; the visible result is the user's persisted choice from
// the first paint, with at most a console warning in dev. Worth
// it — the alternative (two-pass render via useEffect) was visibly
// flashing defaults on every navigation, which reads as "broken".

import {
  useState,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react"

const STORAGE_PREFIX = "arch-tool:"

function readStorage<T>(fullKey: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(fullKey)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function useStoredState<T>(
  key: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>] {
  const fullKey = STORAGE_PREFIX + key

  // Synchronous initialiser — reads localStorage on first client
  // render, returns `initial` on the server. No two-phase load.
  const [state, setState] = useState<T>(() => readStorage(fullKey, initial))

  // Persist on every change. Guarded against SSR; otherwise
  // unconditional, since the initial render already has either the
  // stored value or the default (writing the default first is fine
  // — it just records "this key exists with the default" and gets
  // overwritten the moment the user changes anything).
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(fullKey, JSON.stringify(state))
    } catch {
      // Quota / private mode / disabled storage — swallow. The in-
      // memory state still works, just won't survive a reload.
    }
  }, [fullKey, state])

  return [state, setState]
}
