"use client"

// Typeahead picker for an interface target.
//
// Two modes share one input field:
//   - Pick an existing component from the catalog — suggestions filter
//     as the user types; arrow keys + Enter accept the highlight, click
//     picks directly. The stored value is the component id (so the
//     detail page can render it as a working link and the backlinks
//     scan can find it).
//   - Or just type anything — for external systems / partners / things
//     that are not modelled in the catalog yet. On blur or Enter with
//     no suggestion, the typed text stays as-is.
//
// A small "linked" badge appears when the current value matches an
// existing component id, so the analyst can tell at a glance whether
// the value will resolve to a clickable link on the detail page.
//
// Component list is fetched once and cached at module scope — multiple
// pickers in the same form share the request. Cache invalidation is
// page-scoped (a fresh page load re-fetches).

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { TypeIcon } from "@/components/TypeIcon"
import { Link as LinkIcon } from "lucide-react"
import type { Component } from "@/lib/types"

// Module-level cache. Reset on page navigation, intentionally.
let cache: Component[] | null = null
let inflight: Promise<Component[]> | null = null

async function loadComponents(): Promise<Component[]> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = fetch("/api/components")
    .then((r) => (r.ok ? r.json() : []))
    .then((data: unknown) => {
      cache = Array.isArray(data) ? (data as Component[]) : []
      return cache
    })
    .catch(() => {
      cache = []
      return cache
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Optional id to hide from suggestions (typically the current component, to prevent self-reference). */
  excludeId?: string
  className?: string
}

const MAX_SUGGESTIONS = 8

export function ComponentTargetPicker({
  value,
  onChange,
  placeholder,
  excludeId,
  className,
}: Props) {
  const [components, setComponents] = useState<Component[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    loadComponents().then((list) => {
      if (alive) setComponents(list)
    })
    return () => {
      alive = false
    }
  }, [])

  // Close on click outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const q = value.trim().toLowerCase()
  const pool = components.filter((c) => c.id !== excludeId)
  const suggestions =
    q === ""
      ? pool.slice(0, MAX_SUGGESTIONS)
      : pool
          .filter(
            (c) =>
              c.id.toLowerCase().includes(q) ||
              c.name.toLowerCase().includes(q)
          )
          .slice(0, MAX_SUGGESTIONS)

  // Resolve whether the current value matches a known component id —
  // drives the "linked" badge.
  const linkedComponent = components.find((c) => c.id === value)

  const pickComponent = (c: Component) => {
    onChange(c.id)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5">
        <Input
          className={`h-9 ${className || ""}`}
          placeholder={placeholder ?? "Component or external label"}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setHighlight(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open) {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setOpen(true)
              }
              return
            }
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setHighlight((h) => Math.min(h + 1, suggestions.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setHighlight((h) => Math.max(h - 1, 0))
            } else if (e.key === "Enter") {
              if (suggestions[highlight]) {
                e.preventDefault()
                pickComponent(suggestions[highlight])
              }
              // Otherwise let Enter behave normally — the typed value
              // stays as a free-form external label.
            } else if (e.key === "Escape") {
              setOpen(false)
            }
          }}
        />
        {linkedComponent && (
          <Badge
            variant="outline"
            className="shrink-0 gap-1 text-[10px] text-blue-700 border-blue-300 bg-blue-50"
            title={`Linked to ${linkedComponent.name}`}
          >
            <LinkIcon className="h-3 w-3" />
            linked
          </Badge>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-64 overflow-y-auto bg-popover border rounded-md shadow-md py-1">
          {suggestions.map((c, i) => (
            <button
              type="button"
              key={c.id}
              // onMouseDown fires before onBlur, so the click is registered
              // before the dropdown closes.
              onMouseDown={(e) => {
                e.preventDefault()
                pickComponent(c)
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-accent ${
                i === highlight ? "bg-accent" : ""
              }`}
            >
              <TypeIcon
                type={c.type}
                className="h-3.5 w-3.5 text-muted-foreground shrink-0"
              />
              <span className="truncate">{c.name}</span>
              <span className="font-mono text-xs text-muted-foreground ml-auto shrink-0">
                {c.id}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && value && suggestions.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border rounded-md shadow-md py-2 px-3 text-xs text-muted-foreground">
          No matching component. Press Tab or Enter to keep{" "}
          <code className="font-mono">{value}</code> as an external label.
        </div>
      )}
    </div>
  )
}
