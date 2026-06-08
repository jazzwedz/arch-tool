"use client"

// Solution detail — read-only view (MVP). Tabs: Overview (scoped
// diagram) · Members · Flows · Delivers · NFR & Risks. Resolves member
// component names/types from the live catalog.

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Boxes, Loader2, AlertCircle } from "lucide-react"
import { MermaidPreview } from "@/components/mermaid-preview"
import { TypeIcon } from "@/components/TypeIcon"
import { buildSolutionMermaid } from "@/lib/architecture-mermaid"
import {
  SOLUTION_STATUS_COLORS,
  MEMBER_DISPOSITION_LABELS,
  MEMBER_DISPOSITION_COLORS,
} from "@/lib/constants"
import type { Component, Solution } from "@/lib/types"

type TabId = "overview" | "members" | "flows" | "delivers" | "risks"
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "flows", label: "Flows" },
  { id: "delivers", label: "Delivers" },
  { id: "risks", label: "NFR & Risks" },
]

export default function SolutionDetailPage() {
  const params = useParams()
  const id = decodeURIComponent(String(params.id))
  const [solution, setSolution] = useState<Solution | null>(null)
  const [components, setComponents] = useState<Component[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>("overview")

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`/api/solutions/${encodeURIComponent(id)}`).then(async (r) => {
        const d = await r.json().catch(() => null)
        if (!r.ok) throw new Error((d && d.error) || `Solution not found (${r.status})`)
        return d as Solution
      }),
      fetch("/api/components").then(async (r) => {
        const d = await r.json().catch(() => null)
        return Array.isArray(d) ? (d as Component[]) : []
      }),
    ])
      .then(([sol, comps]) => {
        setSolution(sol)
        setComponents(comps)
      })
      .catch((err: Error) => setError(err.message || "Failed to load"))
      .finally(() => setLoading(false))
  }, [id])

  const byId = useMemo(() => new Map(components.map((c) => [c.id, c])), [components])
  const chart = useMemo(
    () =>
      solution
        ? buildSolutionMermaid(solution.members || [], components, solution.flows || [])
        : "",
    [solution, components]
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading solution…
      </div>
    )
  }
  if (error || !solution) {
    return (
      <div className="space-y-4">
        <Link href="/solutions">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Solutions
          </Button>
        </Link>
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {error || "Solution not found"}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link href="/solutions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <Boxes className="h-6 w-6" />
            <h1 className="text-3xl font-bold">{solution.name}</h1>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase ${SOLUTION_STATUS_COLORS[solution.status] || ""}`}
            >
              {solution.status}
            </Badge>
          </div>
          {solution.goal && <p className="text-muted-foreground mt-1">{solution.goal}</p>}
          {solution.owner && (
            <p className="text-xs text-muted-foreground mt-1">Owner: {solution.owner}</p>
          )}
        </div>
      </div>

      <div className="border-b flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {solution.description?.description && (
            <Card>
              <CardContent className="pt-4 text-sm whitespace-pre-wrap">
                {solution.description.description}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-4">
              <MermaidPreview chart={chart} className="w-full" />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "members" && (
        <div className="space-y-2">
          {(solution.members || []).length === 0 && (
            <p className="text-sm text-muted-foreground">No members.</p>
          )}
          {(solution.members || []).map((m, i) => {
            const c = byId.get(m.component)
            return (
              <Card key={`${m.component}-${i}`}>
                <CardContent className="py-3 flex items-start gap-3">
                  <TypeIcon
                    type={c?.type || "component"}
                    className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c ? (
                        <Link href={`/component/${m.component}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{m.component}</span>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${MEMBER_DISPOSITION_COLORS[m.disposition] || ""}`}
                      >
                        {MEMBER_DISPOSITION_LABELS[m.disposition] || m.disposition}
                      </Badge>
                      {!c && (
                        <Badge variant="outline" className="text-[10px] text-red-700 border-red-300">
                          not in catalog
                        </Badge>
                      )}
                    </div>
                    {m.role && <p className="text-xs text-muted-foreground mt-0.5">{m.role}</p>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {tab === "flows" && (
        <div className="space-y-2">
          {(solution.flows || []).length === 0 && (
            <p className="text-sm text-muted-foreground">No flows.</p>
          )}
          {(solution.flows || []).map((f, i) => (
            <Card key={i}>
              <CardContent className="py-3 flex items-center gap-2 text-sm flex-wrap">
                <span className="font-medium">{byId.get(f.from)?.name || f.from}</span>
                <span className="text-muted-foreground">{f.status === "proposed" ? "⇢" : "→"}</span>
                <span className="font-medium">{byId.get(f.to)?.name || f.to}</span>
                <Badge variant="outline" className="text-[10px]">
                  {f.role}
                  {f.protocol ? ` · ${f.protocol}` : ""}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${f.status === "proposed" ? "text-blue-700 border-blue-300" : "text-muted-foreground"}`}
                >
                  {f.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "delivers" && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Capabilities</h3>
              <div className="flex flex-wrap gap-1">
                {(solution.delivers?.capabilities || []).map((c) => (
                  <Badge key={c} variant="outline">{c}</Badge>
                ))}
                {(solution.delivers?.capabilities?.length ?? 0) === 0 && (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Processes</h3>
              <div className="flex flex-wrap gap-1">
                {(solution.delivers?.processes || []).map((p) => (
                  <Badge key={p} variant="outline">{p}</Badge>
                ))}
                {(solution.delivers?.processes?.length ?? 0) === 0 && (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "risks" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold mb-2">Non-functional requirements</h3>
              {solution.nfr && Object.keys(solution.nfr).length > 0 ? (
                <ul className="text-sm space-y-1">
                  {Object.entries(solution.nfr).map(([k, v]) => (
                    <li key={k}>
                      <span className="text-muted-foreground">{k}:</span> {String(v)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold mb-2">Risks</h3>
              {(solution.risks?.length ?? 0) > 0 ? (
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {solution.risks!.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
