"use client"

// Processes hub — the single place that ties the "process" concept
// together. For every business process it shows:
//   - supporting components (from each component's processes[] tags),
//   - solutions that DELIVER it (Solution.delivers.processes),
//   - solutions that MODEL it as a sequence (Solution.processes[], linked
//     by deliversProcess or matching name) — with a link to drill in.
//
// A process can originate from components, deliveries or sequences; the
// union is shown, and a process modelled/delivered but declared by no
// component is flagged (a naming-consistency hint).

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { TypeIcon } from "@/components/TypeIcon"
import { Workflow, Loader2, AlertCircle, Search, GitBranch, Boxes } from "lucide-react"
import {
  PROCESS_ROLES,
  PROCESS_ROLE_LABELS,
  PROCESS_ROLE_COLORS,
} from "@/lib/constants"
import type { Component, ProcessRole, Solution } from "@/lib/types"

interface Supporter {
  id: string
  name: string
  type: Component["type"]
  role: ProcessRole
  activity?: string
}
interface SolutionRef {
  id: string
  name: string
}
interface ModelRef extends SolutionRef {
  /** The sequence's own name (may differ from the registry process name). */
  processName: string
  steps: number
}
interface ProcessGroup {
  name: string
  supporters: Supporter[]
  deliveredBy: SolutionRef[]
  modelledBy: ModelRef[]
}

const ROLE_ORDER = new Map(PROCESS_ROLES.map((r, i) => [r, i]))

export default function ProcessesPage() {
  const [components, setComponents] = useState<Component[]>([])
  const [solutions, setSolutions] = useState<Solution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch("/api/components").then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok) throw new Error((data && data.error) || `Request failed (${r.status})`)
        return Array.isArray(data) ? (data as Component[]) : []
      }),
      fetch("/api/solutions").then(async (r) => {
        const data = await r.json().catch(() => null)
        return Array.isArray(data) ? (data as Solution[]) : []
      }),
    ])
      .then(([comps, sols]) => {
        setComponents(comps)
        setSolutions(sols)
      })
      .catch((err: Error) => setError(err.message || "Failed to load"))
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo<ProcessGroup[]>(() => {
    const map = new Map<string, ProcessGroup>()
    const get = (name: string): ProcessGroup => {
      const key = name.trim().toLowerCase()
      let g = map.get(key)
      if (!g) {
        g = { name: name.trim(), supporters: [], deliveredBy: [], modelledBy: [] }
        map.set(key, g)
      }
      return g
    }

    // Supporters from components.
    for (const c of components) {
      for (const p of c.processes || []) {
        const name = (p.name || "").trim()
        if (!name) continue
        get(name).supporters.push({ id: c.id, name: c.name, type: c.type, role: p.role, activity: p.activity })
      }
    }

    // Deliveries + sequences from solutions.
    for (const s of solutions) {
      for (const d of s.delivers?.processes || []) {
        const name = (d || "").trim()
        if (!name) continue
        get(name).deliveredBy.push({ id: s.id, name: s.name })
      }
      for (const sp of s.processes || []) {
        const name = (sp.deliversProcess || sp.name || "").trim()
        if (!name) continue
        get(name).modelledBy.push({ id: s.id, name: s.name, processName: sp.name, steps: sp.steps?.length || 0 })
      }
    }

    const out = Array.from(map.values())
    for (const g of out) {
      g.supporters.sort((a, b) => {
        const ra = ROLE_ORDER.get(a.role) ?? 99
        const rb = ROLE_ORDER.get(b.role) ?? 99
        return ra !== rb ? ra - rb : a.name.localeCompare(b.name)
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [components, solutions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.supporters.some((s) => s.name.toLowerCase().includes(q)) ||
        g.modelledBy.some((m) => m.name.toLowerCase().includes(q)) ||
        g.deliveredBy.some((m) => m.name.toLowerCase().includes(q))
    )
  }, [groups, search])

  const modelledCount = useMemo(() => groups.filter((g) => g.modelledBy.length).length, [groups])

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
              : `${groups.length} process${groups.length === 1 ? "" : "es"} across the catalog · ${modelledCount} modelled as a sequence`}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter processes, components or solutions…"
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
            Add a <span className="font-medium">Processes</span> entry on a component, deliver a
            process from a solution, or model a process sequence on a solution.
          </p>
        </div>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((g) => (
            <Card key={g.name}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-lg">{g.name}</CardTitle>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {g.supporters.length === 0 && (g.modelledBy.length > 0 || g.deliveredBy.length > 0) && (
                      <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300" title="No component declares this process — names may be out of sync">
                        not in component catalog
                      </Badge>
                    )}
                    <Badge variant="outline" className="shrink-0">
                      {g.supporters.length} component{g.supporters.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {g.supporters.length > 0 && (
                  <ul className="space-y-2">
                    {g.supporters.map((s, i) => (
                      <li key={`${s.id}-${i}`} className="flex items-start gap-2 text-sm">
                        <TypeIcon type={s.type} className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/component/${s.id}`} className="font-medium hover:underline truncate">
                              {s.name}
                            </Link>
                            <Badge variant="outline" className={`text-[10px] ${PROCESS_ROLE_COLORS[s.role] || ""}`}>
                              {PROCESS_ROLE_LABELS[s.role] || s.role}
                            </Badge>
                          </div>
                          {s.activity && <p className="text-xs text-muted-foreground mt-0.5">{s.activity}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {g.modelledBy.length > 0 && (
                  <div className="rounded-md border bg-muted/20 p-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <GitBranch className="h-3.5 w-3.5" />Modelled as a sequence in
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.modelledBy.map((m, i) => (
                        <Link
                          key={`${m.id}-${i}`}
                          href={`/solutions/${m.id}`}
                          className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-xs hover:underline"
                          title={m.processName !== g.name ? `Sequence "${m.processName}"` : undefined}
                        >
                          {m.name}
                          <span className="text-[10px] text-muted-foreground">· {m.steps} steps</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {g.deliveredBy.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                    <Boxes className="h-3.5 w-3.5" />Delivered by
                    {g.deliveredBy.map((m, i) => (
                      <Link key={`${m.id}-${i}`} href={`/solutions/${m.id}`} className="hover:underline">
                        {m.name}{i < g.deliveredBy.length - 1 ? "," : ""}
                      </Link>
                    ))}
                  </div>
                )}
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
