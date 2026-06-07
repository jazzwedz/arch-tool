"use client"

// Processes overview — every business process declared anywhere in the
// catalog, aggregated across components, with the components that
// support each one (and the role they play).
//
// Read-only view built from /api/components: each component carries a
// `processes[]` list ({ name, role, activity?, description? }); this
// page inverts that into process → supporting components.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { TypeIcon } from "@/components/TypeIcon"
import { Workflow, Loader2, AlertCircle, Search } from "lucide-react"
import {
  PROCESS_ROLES,
  PROCESS_ROLE_LABELS,
  PROCESS_ROLE_COLORS,
} from "@/lib/constants"
import type { Component, ProcessRole } from "@/lib/types"

interface Supporter {
  id: string
  name: string
  type: Component["type"]
  role: ProcessRole
  activity?: string
  description?: string
}

interface ProcessGroup {
  /** Display name (first spelling seen). */
  name: string
  supporters: Supporter[]
}

// Sort supporters by role importance (owner → trigger → participant →
// listener), then by component name. PROCESS_ROLES is the canonical
// order used everywhere else, so reuse its index.
const ROLE_ORDER = new Map(PROCESS_ROLES.map((r, i) => [r, i]))

export default function ProcessesPage() {
  const [components, setComponents] = useState<Component[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch("/api/components")
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok) {
          const msg =
            data && typeof data === "object" && "error" in data
              ? String((data as { error: unknown }).error)
              : `Request failed (${r.status})`
          throw new Error(msg)
        }
        return data
      })
      .then((data) => setComponents(Array.isArray(data) ? data : []))
      .catch((err: Error) => setError(err.message || "Failed to load"))
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo<ProcessGroup[]>(() => {
    const map = new Map<string, ProcessGroup>()
    for (const c of components) {
      for (const p of c.processes || []) {
        const name = (p.name || "").trim()
        if (!name) continue
        const key = name.toLowerCase()
        let g = map.get(key)
        if (!g) {
          g = { name, supporters: [] }
          map.set(key, g)
        }
        g.supporters.push({
          id: c.id,
          name: c.name,
          type: c.type,
          role: p.role,
          activity: p.activity,
          description: p.description,
        })
      }
    }
    const out = Array.from(map.values())
    for (const g of out) {
      g.supporters.sort((a, b) => {
        const ra = ROLE_ORDER.get(a.role) ?? 99
        const rb = ROLE_ORDER.get(b.role) ?? 99
        if (ra !== rb) return ra - rb
        return a.name.localeCompare(b.name)
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [components])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.supporters.some((s) => s.name.toLowerCase().includes(q))
    )
  }, [groups, search])

  const totalLinks = useMemo(
    () => groups.reduce((n, g) => n + g.supporters.length, 0),
    [groups]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Workflow className="h-7 w-7" />
            Processes
          </h1>
          <p className="text-muted-foreground mt-1">
            {loading
              ? "Loading…"
              : `${groups.length} process${groups.length === 1 ? "" : "es"} across ${totalLinks} component link${totalLinks === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter processes or components…"
            className="pl-8"
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading catalog…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Workflow className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No processes declared yet.</p>
          <p className="text-sm mt-1">
            Add a <span className="font-medium">Processes</span> entry on any
            component (Properties tab) and it will show up here.
          </p>
        </div>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((g) => (
            <Card key={g.name}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{g.name}</CardTitle>
                  <Badge variant="outline" className="shrink-0">
                    {g.supporters.length} component
                    {g.supporters.length === 1 ? "" : "s"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {g.supporters.map((s, i) => (
                    <li key={`${s.id}-${i}`} className="flex items-start gap-2 text-sm">
                      <TypeIcon type={s.type} className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/component/${s.id}`}
                            className="font-medium hover:underline truncate"
                          >
                            {s.name}
                          </Link>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${PROCESS_ROLE_COLORS[s.role] || ""}`}
                          >
                            {PROCESS_ROLE_LABELS[s.role] || s.role}
                          </Badge>
                        </div>
                        {s.activity && (
                          <p className="text-xs text-muted-foreground mt-0.5">{s.activity}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full py-8 text-center">
              No processes match “{search}”.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
