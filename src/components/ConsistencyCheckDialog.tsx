"use client"

// Consistency Check — catalog-wide deterministic backlink audit.
//
// One button on the catalog header opens this dialog. The dialog runs
// the scan once on mount, groups the resulting issues by category
// (Duplicate links / Links), and renders one row per
// issue with a per-row Fix button. Each Fix call hits the apply API
// independently: a successful response marks the row green and locks
// the button; the rest of the list stays editable so the analyst can
// triage the remaining cases at their own pace.
//
// "Apply all" sits at the dialog footer for the case where the
// analyst has reviewed the list and trusts every proposed fix in
// bulk — the dialog runs them serially (sha conflicts would otherwise
// trip the optimistic-concurrency lock on the second hit to the same
// target) and updates the per-row state as each one lands.

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react"

interface Issue {
  id: string
  category: "duplicate-links" | "links"
  applyTo: string
  applyToName: string
  declaredOn: string
  declaredOnName: string
  title: string
  details: string
}

interface ScanResponse {
  components: number
  issues: Issue[]
}

type RowState =
  | { kind: "pending" }
  | { kind: "applying" }
  | { kind: "fixed" }
  | { kind: "error"; message: string }

const CATEGORY_HEADINGS: Record<Issue["category"], string> = {
  "duplicate-links": "Duplicate links",
  links: "Links",
}

const CATEGORY_DESCRIPTIONS: Record<Issue["category"], string> = {
  "duplicate-links":
    "the same link (target + role + protocol + name) declared more than once on a component — the fix keeps one and removes the rest",
  links:
    "calls ↔ serves, part-of ↔ contains and reads-from ↔ writes-to mirror pairs (target + role + protocol + name)",
}

export function ConsistencyCheckDialog() {
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [components, setComponents] = useState(0)
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [rowState, setRowState] = useState<Record<string, RowState>>({})
  const [scanError, setScanError] = useState<string | null>(null)
  const [applyingAll, setApplyingAll] = useState(false)

  const runScan = async () => {
    setScanning(true)
    setScanError(null)
    setRowState({})
    try {
      const r = await fetch("/api/admin/consistency-check")
      const data: ScanResponse | { error?: string } = await r.json()
      if (!r.ok) {
        setScanError(
          ("error" in data && data.error) ||
            `Scan failed (${r.status})`
        )
        setIssues([])
        setComponents(0)
        return
      }
      const ok = data as ScanResponse
      setComponents(ok.components)
      setIssues(ok.issues)
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Network error")
      setIssues([])
    } finally {
      setScanning(false)
    }
  }

  // Kick off a scan when the dialog opens. Closing the dialog clears
  // the result so the next open starts fresh.
  useEffect(() => {
    if (open) {
      runScan()
    } else {
      setIssues(null)
      setRowState({})
      setScanError(null)
      setApplyingAll(false)
    }
  }, [open])

  const applyOne = async (id: string): Promise<boolean> => {
    setRowState((s) => ({ ...s, [id]: { kind: "applying" } }))
    try {
      const r = await fetch("/api/admin/consistency-check/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: id }),
      })
      const data = await r.json().catch(() => null)
      if (!r.ok) {
        const msg =
          (data && typeof data === "object" && "error" in data
            ? String(data.error)
            : null) || `Fix failed (${r.status})`
        setRowState((s) => ({ ...s, [id]: { kind: "error", message: msg } }))
        return false
      }
      setRowState((s) => ({ ...s, [id]: { kind: "fixed" } }))
      return true
    } catch (err) {
      setRowState((s) => ({
        ...s,
        [id]: {
          kind: "error",
          message: err instanceof Error ? err.message : "Network error",
        },
      }))
      return false
    }
  }

  const applyAll = async () => {
    if (!issues || issues.length === 0) return
    setApplyingAll(true)
    // Serial — fixes to the same target would race on sha otherwise.
    for (const it of issues) {
      const state = rowState[it.id]
      if (state?.kind === "fixed") continue
      await applyOne(it.id)
    }
    setApplyingAll(false)
  }

  // Group issues by category for the rendered list.
  const grouped: Record<Issue["category"], Issue[]> = {
    "duplicate-links": [],
    links: [],
  }
  for (const it of issues || []) grouped[it.category].push(it)

  const pendingCount = issues
    ? issues.filter(
        (it) =>
          rowState[it.id]?.kind !== "fixed" &&
          rowState[it.id]?.kind !== "applying"
      ).length
    : 0
  const fixedCount = issues
    ? issues.filter((it) => rowState[it.id]?.kind === "fixed").length
    : 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ShieldCheck className="h-4 w-4 mr-2" />
          Consistency check
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Catalog consistency check
          </DialogTitle>
          <DialogDescription>
            Deterministic scan for missing backlinks and duplicate links
            across the whole catalog. Each row below is one specific issue and
            one specific patch — click Fix to apply only that one, or use the
            bulk action at the bottom.
          </DialogDescription>
        </DialogHeader>

        {scanning && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning catalog…
          </div>
        )}

        {!scanning && scanError && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">{scanError}</div>
            <Button size="sm" variant="outline" onClick={runScan}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </div>
        )}

        {!scanning && !scanError && issues !== null && (
          <>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm flex items-center justify-between flex-wrap gap-2">
              <span>
                Scanned <strong>{components}</strong> component
                {components === 1 ? "" : "s"} —{" "}
                {issues.length === 0 ? (
                  <span className="text-emerald-700 font-medium">
                    catalog is consistent ✓
                  </span>
                ) : (
                  <>
                    <strong>{issues.length}</strong> issue
                    {issues.length === 1 ? "" : "s"} found
                    {fixedCount > 0 && (
                      <>
                        {" "}
                        ({fixedCount} fixed, {pendingCount} remaining)
                      </>
                    )}
                  </>
                )}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={runScan}
                disabled={applyingAll}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Rescan
              </Button>
            </div>

            {issues.length > 0 && (
              <div className="space-y-5">
                {(["duplicate-links", "links"] as const).map((cat) => {
                  const items = grouped[cat]
                  if (items.length === 0) return null
                  return (
                    <div key={cat}>
                      <div className="flex items-baseline gap-2 mb-2">
                        <h3 className="text-sm font-semibold">
                          {CATEGORY_HEADINGS[cat]}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                          ({items.length})
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {CATEGORY_DESCRIPTIONS[cat]}
                      </p>
                      <div className="space-y-2">
                        {items.map((it) => {
                          const st = rowState[it.id] ?? { kind: "pending" }
                          const fixed = st.kind === "fixed"
                          const applying = st.kind === "applying"
                          const errored = st.kind === "error"
                          return (
                            <div
                              key={it.id}
                              className={`rounded-md border p-3 ${
                                fixed
                                  ? "bg-emerald-50/50 border-emerald-200"
                                  : errored
                                  ? "bg-red-50/40 border-red-200"
                                  : "bg-white"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap text-sm font-medium">
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] uppercase shrink-0"
                                    >
                                      Apply to {it.applyToName}
                                    </Badge>
                                    <span className="truncate">{it.title}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {it.details}
                                  </p>
                                  {errored && (
                                    <p className="text-xs text-red-700 mt-2 flex items-start gap-1">
                                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                      {st.message}
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0">
                                  {fixed ? (
                                    <Badge
                                      variant="outline"
                                      className="gap-1 text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50"
                                    >
                                      <CheckCircle2 className="h-3 w-3" />
                                      Fixed
                                    </Badge>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant={errored ? "outline" : "default"}
                                      onClick={() => applyOne(it.id)}
                                      disabled={applying || applyingAll}
                                    >
                                      {applying ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Applying…
                                        </>
                                      ) : errored ? (
                                        "Retry"
                                      ) : (
                                        "Fix"
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {issues.length > 0 && pendingCount > 0 && (
              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <Button
                  variant="default"
                  onClick={applyAll}
                  disabled={applyingAll}
                >
                  {applyingAll ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Applying {pendingCount} fix
                      {pendingCount === 1 ? "" : "es"}…
                    </>
                  ) : (
                    <>Apply all ({pendingCount})</>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
