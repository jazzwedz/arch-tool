"use client"

// Solution detail — read-only view (MVP). Tabs: Overview (scoped
// diagram) · Members · Flows · Delivers · NFR & Risks. Resolves member
// component names/types from the live catalog.

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Boxes, Loader2, AlertCircle, Pencil, Trash2, Info } from "lucide-react"
import { MermaidPreview } from "@/components/mermaid-preview"
import { GeneratedDocModal } from "@/components/GeneratedDocModal"
import { DsdProgressModal } from "@/components/DsdProgressModal"
import { TypeIcon } from "@/components/TypeIcon"
import { buildSolutionMermaid } from "@/lib/architecture-mermaid"
import { buildSolutionSequenceMermaid } from "@/lib/solution-sequence"
import {
  SOLUTION_STATUS_COLORS,
  MEMBER_DISPOSITION_LABELS,
  MEMBER_DISPOSITION_COLORS,
} from "@/lib/constants"
import type { Component, Solution, SolutionWithSha } from "@/lib/types"
import type { DsdArtifactMeta } from "@/lib/dsd-store"

type TabId = "overview" | "members" | "flows" | "processes" | "delivers" | "risks" | "documentation"
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "flows", label: "Flows" },
  { id: "processes", label: "Processes" },
  { id: "delivers", label: "Delivers" },
  { id: "risks", label: "NFR & Risks" },
  { id: "documentation", label: "Documentation" },
]

export default function SolutionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = decodeURIComponent(String(params.id))
  const [sha, setSha] = useState<string>("")
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [solution, setSolution] = useState<Solution | null>(null)
  const [components, setComponents] = useState<Component[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>("overview")
  const [reload, setReload] = useState(0)

  // DSD generation + flow promotion state
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [genPhase, setGenPhase] = useState<string | null>(null)
  const [genPhaseKey, setGenPhaseKey] = useState<string>("grounding")
  const [genIterations, setGenIterations] = useState<number>(0)
  const [genMode, setGenMode] = useState<"quick" | "team">("team")
  const [showDocModal, setShowDocModal] = useState(false)
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<DsdArtifactMeta[]>([])
  const [promoting, setPromoting] = useState(false)
  const [promoteMsg, setPromoteMsg] = useState<string | null>(null)

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
        setSha((sol as SolutionWithSha).sha || "")
        setComponents(comps)
      })
      .catch((err: Error) => setError(err.message || "Failed to load"))
      .finally(() => setLoading(false))
  }, [id, reload])

  const byId = useMemo(() => new Map(components.map((c) => [c.id, c])), [components])

  const hasProposed = (solution?.flows || []).some((f) => f.status === "proposed")

  const PHASE_LABEL: Record<string, string> = {
    grounding: "Reading the solution & components…",
    drafting: "Section writers drafting…",
    reviewing: "Critic panel reviewing…",
    revising: "Writers revising…",
    consolidating: "Lead editor consolidating…",
    done: "Done",
  }

  // Multi-step generation runs as a job (draft → critic → revise); we
  // poll for phase + result so it survives the gateway request timeout.
  const generateBrd = async () => {
    if (!solution) return
    setGenerating(true)
    setGenError(null)
    setGenPhase("Starting…")
    setGenPhaseKey("grounding")
    setGenIterations(0)
    try {
      const start = await fetch(`/api/solutions/${encodeURIComponent(id)}/dsd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: genMode }),
      })
      const sj = await start.json().catch(() => null)
      if (!start.ok || !sj?.jobId) throw new Error((sj && sj.error) || `Failed to start (${start.status})`)
      const jobId = sj.jobId as string

      for (let i = 0; i < 160; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        const r = await fetch(`/api/solutions/${encodeURIComponent(id)}/dsd?jobId=${encodeURIComponent(jobId)}`)
        const j = await r.json().catch(() => null)
        if (!r.ok || !j) throw new Error((j && j.error) || `Status check failed (${r.status})`)
        setGenPhase(PHASE_LABEL[j.phase] || j.phase)
        setGenPhaseKey(j.phase || "grounding")
        if (typeof j.iterations === "number") setGenIterations(j.iterations)
        if (j.status === "done") {
          setGenerated(j.markdown || "")
          setCurrentArtifactId(j.artifactId || null)
          setShowDocModal(true)
          loadArtifacts()
          return
        }
        if (j.status === "error") throw new Error(j.error || "Generation failed")
      }
      throw new Error("Generation timed out. Try again.")
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed")
    } finally {
      setGenerating(false)
      setGenPhase(null)
    }
  }

  const loadArtifacts = async () => {
    try {
      const r = await fetch(`/api/solutions/${encodeURIComponent(id)}/dsd/artifacts`)
      const d = await r.json().catch(() => null)
      setArtifacts(Array.isArray(d) ? d : [])
    } catch {
      setArtifacts([])
    }
  }

  const openArtifact = async (artifactId: string) => {
    try {
      const r = await fetch(
        `/api/solutions/${encodeURIComponent(id)}/dsd/artifacts/${encodeURIComponent(artifactId)}`
      )
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) throw new Error((d && d.error) || "Failed to open")
      setGenerated(d.markdown || "")
      setCurrentArtifactId(artifactId)
      setShowDocModal(true)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Failed to open DSD")
    }
  }

  const deleteArtifact = async (artifactId: string) => {
    if (!confirm("Delete this DSD? This cannot be undone.")) return
    try {
      const r = await fetch(
        `/api/solutions/${encodeURIComponent(id)}/dsd/artifacts/${encodeURIComponent(artifactId)}`,
        { method: "DELETE" }
      )
      if (!r.ok) throw new Error("Failed to delete")
      loadArtifacts()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Failed to delete DSD")
    }
  }

  const submitDsdFeedback = async (
    rating: "up" | "down",
    comment: string,
    correctedText: string,
    section?: string
  ): Promise<string | void> => {
    if (!currentArtifactId) return "No saved document to rate."
    try {
      const r = await fetch(
        `/api/solutions/${encodeURIComponent(id)}/dsd/artifacts/${encodeURIComponent(currentArtifactId)}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating, comment, correctedText, section }),
        }
      )
      const d = await r.json().catch(() => null)
      if (!r.ok) return (d && d.error) || `Failed (${r.status})`
      loadArtifacts()
    } catch (e) {
      return e instanceof Error ? e.message : "Failed to submit feedback"
    }
  }

  // Load the DSD library when the solution loads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadArtifacts() }, [id])

  const promoteFlows = async () => {
    if (!solution) return
    setPromoting(true)
    setPromoteMsg(null)
    try {
      const res = await fetch(`/api/solutions/${encodeURIComponent(solution.id)}/promote-flows`, {
        method: "POST",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error((json && json.error) || `HTTP ${res.status}`)
      setPromoteMsg(`Promoted ${json.promoted} flow(s) into component links.`)
      setReload((n) => n + 1)
    } catch (e) {
      setPromoteMsg(e instanceof Error ? e.message : "Promote failed")
    } finally {
      setPromoting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/solutions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha }),
      })
      if (!res.ok) throw new Error("Failed to delete")
      router.push("/solutions")
    } catch {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }
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
        <div className="flex gap-2 shrink-0">
          <Link href={`/solutions/${encodeURIComponent(id)}/edit`}>
            <Button variant="outline">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-red-900">
            Delete solution <strong>{solution.name}</strong>? This removes the
            solution file; member components are not touched.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </div>
        </div>
      )}

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
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              These are references. To change a component&apos;s detailed
              functionality — logic, rules, NFR, capabilities, processes — open
              the component (click its name) and edit it there.
            </span>
          </div>
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
          {hasProposed && (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                Proposed flows can be written into the members&apos; real links.
              </span>
              <Button size="sm" onClick={promoteFlows} disabled={promoting}>
                {promoting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Promoting…
                  </>
                ) : (
                  "Promote proposed flows"
                )}
              </Button>
            </div>
          )}
          {promoteMsg && <p className="text-xs text-emerald-700">{promoteMsg}</p>}
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

      {tab === "processes" && (
        <div className="space-y-4">
          {(solution.processes || []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No process sequences. Add them in the editor to document how the solution runs
              step by step.
            </p>
          )}
          {(solution.processes || []).map((p, i) => (
            <Card key={i}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="outline" className="text-[10px]">{p.steps.length} steps</Badge>
                </div>
                {p.goal && <p className="text-sm text-muted-foreground">{p.goal}</p>}
                {p.actors.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.actors.map((a) => (
                      <Badge key={a.id} variant="outline" className="text-[10px]">
                        {a.label}{a.role ? ` · ${a.role}` : ""}
                      </Badge>
                    ))}
                  </div>
                )}
                {p.steps.length > 0 && (
                  <MermaidPreview
                    chart={buildSolutionSequenceMermaid(p, new Map(components.map((c) => [c.id, c.name])))}
                    className="w-full"
                    zoomable
                    expandable
                    expandTitle={p.name || "Process sequence"}
                    height={320}
                  />
                )}
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
            <p className="text-xs text-muted-foreground">
              Processes a solution runs are modelled on the <strong>Processes</strong> tab.
            </p>
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

      {tab === "documentation" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Generate a Detailed Solution Description (DSD).
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs">Mode:</span>
                <div className="flex gap-1 rounded-md border p-0.5">
                  {(["quick", "team"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setGenMode(m)}
                      title={m === "quick" ? "Fast single draft → critic → revise" : "Writer & critic agents (configurable, trainable)"}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${genMode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      {m === "quick" ? "Quick" : "Agent team"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Button onClick={generateBrd} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {genPhase || "Generating…"}
                </>
              ) : (
                "Generate DSD"
              )}
            </Button>
          </div>
          {genError && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {genError}
            </div>
          )}

          {/* DSD library */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Generated DSDs ({artifacts.length})</h3>
            {artifacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No DSDs yet — generate one above.</p>
            ) : (
              <div className="space-y-2">
                {artifacts.map((a) => {
                  const up = (a.feedback || []).filter((f) => f.rating === "up").length
                  const down = (a.feedback || []).filter((f) => f.rating === "down").length
                  return (
                    <Card key={a.id}>
                      <CardContent className="py-3 flex items-center gap-3 flex-wrap">
                        <span className="text-sm">{new Date(a.createdAt).toLocaleString()}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">{a.mode}</Badge>
                        {(up > 0 || down > 0) && (
                          <span className="text-xs text-muted-foreground">👍 {up} · 👎 {down}</span>
                        )}
                        <div className="ml-auto flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openArtifact(a.id)}>Open</Button>
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteArtifact(a.id)}>Delete</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <GeneratedDocModal
        open={showDocModal}
        onOpenChange={setShowDocModal}
        title={solution.name}
        badge="Detailed Solution Description"
        markdown={generated || ""}
        feedback={
          currentArtifactId
            ? {
                onSubmit: submitDsdFeedback,
                existingCount: artifacts.find((a) => a.id === currentArtifactId)?.feedback?.length || 0,
                sections: (artifacts.find((a) => a.id === currentArtifactId)?.sections || []).map((s) => ({
                  id: s.id,
                  title: s.title,
                })),
              }
            : undefined
        }
      />

      <DsdProgressModal
        open={generating && genMode === "team"}
        phase={genPhaseKey}
        iterations={genIterations}
      />
    </div>
  )
}
