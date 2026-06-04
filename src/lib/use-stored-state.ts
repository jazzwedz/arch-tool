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
//   1. On mount the state initialises with the caller-supplied
//      default — same value on server and client, so the initial
//      HTML hydrates without a mismatch.
//   2. A post-mount effect reads localStorage and, if a value is
//      present, calls setState to swap to it. The visible flash is
//      one frame in practice.
//   3. A second effect persists every subsequent state change. It is
//      gated by a `hydrated` flag so the first render's default
//      cannot clobber a stored value before step 2 finishes.
//   4. Errors (private-mode browsers, disabled storage, malformed
//      JSON) fall back to the default silently.

import {
  useState,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react"

const STORAGE_PREFIX = "arch-tool:"

export function useStoredState<T>(
  key: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>] {
  const fullKey = STORAGE_PREFIX + key
  const [state, setState] = useState<T>(initial)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage once. setHydrated flips after — its
  // delayed render is what unblocks the persistence effect below.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(fullKey)
      if (raw !== null) {
        setState(JSON.parse(raw) as T)
      }
    } catch {
      // Storage unavailable or value malformed — keep the default.
    }
    setHydrated(true)
  }, [fullKey])

  // Persist on each subsequent change. Skipped on the very first
  // mount render so the default never overwrites a stored value
  // before the hydration effect has had a chance to load it.
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(fullKey, JSON.stringify(state))
    } catch {
      // Storage may be unavailable or quota-exceeded; swallow it —
      // the in-memory state still works, just won't survive a reload.
    }
  }, [fullKey, state, hydrated])

  return [state, setState]
}
