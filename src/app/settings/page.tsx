"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft,
  Loader2,
  Save,
  Check,
  X,
  Play,
  HeartPulse,
} from "lucide-react"
import {
  BLOCK_METAS,
  type DetailTabId,
  type UIBlocksConfig,
} from "@/lib/ui-blocks"
import { useUIConfig } from "@/components/UIConfigProvider"

const TAB_LABELS: Record<DetailTabId, string> = {
  overview: "Overview",
  technical: "Technical",
  business: "Business",
  rules: "Rules & Calculations",
  "blast-radius": "Blast Radius",
  documentation: "Documentation",
  diagrams: "Diagrams",
  history: "History",
}

function blockKey(group: string, field: string): string {
  return `${group}.${field}`
}

function readVisible(
  blocks: UIBlocksConfig,
  group: string,
  field: string
): boolean {
  const groupCfg = (blocks as Record<string, Record<string, boolean | undefined> | undefined>)[
    group
  ]
  return groupCfg?.[field] !== false
}

type HealthKind = "llm" | "git" | "confluence"

interface HealthResult {
  ok: boolean
  elapsedMs?: number
  provider?: string
  edition?: string
  model?: string
  branch?: string
  componentsFound?: number
  error?: string
}

interface HealthState {
  status: "idle" | "running" | "done"
  result?: HealthResult
}

const HEALTH_LABELS: Record<HealthKind, string> = {
  llm: "LLM",
  git: "Git backend",
  confluence: "Confluence",
}

export default function SettingsPage() {
  const { blocks, loaded, refresh } = useUIConfig()
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<Record<HealthKind, HealthState>>({
    llm: { status: "idle" },
    git: { status: "idle" },
    confluence: { status: "idle" },
  })

  // Hydrate local state from the loaded config once.
  useEffect(() => {
    if (!loaded) return
    const next: Record<string, boolean> = {}
    for (const b of BLOCK_METAS) {
      next[blockKey(b.group as string, b.field)] = readVisible(
        blocks,
        b.group as string,
        b.field
      )
    }
    setVisible(next)
  }, [loaded, blocks])

  const groupedByTab = BLOCK_METAS.reduce((acc, b) => {
    if (!acc[b.tab]) acc[b.tab] = []
    acc[b.tab].push(b)
    return acc
  }, {} as Record<DetailTabId, typeof BLOCK_METAS>)

  function toggle(group: string, field: string) {
    setVisible((prev) => ({ ...prev, [blockKey(group, field)]: !prev[blockKey(group, field)] }))
  }

  function setAll(value: boolean) {
    const next: Record<string, boolean> = {}
    for (const b of BLOCK_METAS) {
      next[blockKey(b.group as string, b.field)] = value
    }
    setVisible(next)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSavedAt(null)

    // Build nested UIBlocksConfig from the flat checkbox map.
    const blocksOut: UIBlocksConfig = {}
    for (const b of BLOCK_METAS) {
      const v = visible[blockKey(b.group as string, b.field)]
      // Persist only the explicit false values to keep YAML small;
      // missing keys default to visible.
      if (v === false) {
        const groupKey = b.group as keyof UIBlocksConfig
        const group =
          (blocksOut[groupKey] as Record<string, boolean> | undefined) || {}
        group[b.field] = false
        ;(blocksOut as Record<string, Record<string, boolean>>)[
          groupKey as string
        ] = group
      }
    }

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: blocksOut }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(body.error || `Save failed: ${res.status}`)
      }
      await refresh()
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function runHealth(kind: HealthKind) {
    setHealth((prev) => ({ ...prev, [kind]: { status: "running" } }))
    try {
      const res = await fetch(`/api/healthcheck/${kind}`, { method: "POST" })
      const data = (await res.json()) as HealthResult
      setHealth((prev) => ({
        ...prev,
        [kind]: { status: "done", result: data },
      }))
    } catch (e) {
      setHealth((prev) => ({
        ...prev,
        [kind]: {
          status: "done",
          result: { ok: false, error: e instanceof Error ? e.message : "Request failed" },
        },
      }))
    }
  }

  function runAllHealth() {
    void runHealth("llm")
    void runHealth("git")
    void runHealth("confluence")
  }

  if (!loaded) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
        Loading settings...
      </div>
    )
  }

  const tabsInOrder: DetailTabId[] = [
    "overview",
    "technical",
    "business",
    "rules",
    "blast-radius",
    "documentation",
    "diagrams",
    "history",
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hide blocks on the component detail page. Applies to every component for everyone in the team. Saved in <code className="font-mono text-xs">config.yaml</code> in the data repo.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="h-4 w-4 text-muted-foreground" />
              Health checks
            </CardTitle>
            <Button variant="outline" size="sm" onClick={runAllHealth}>
              <Play className="h-3.5 w-3.5 mr-1" />
              Run all
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {(["llm", "git", "confluence"] as HealthKind[]).map((kind) => {
            const s = health[kind]
            const r = s.result
            return (
              <div
                key={kind}
                className="flex items-center gap-3 py-1.5 border-b last:border-b-0"
              >
                <div className="w-32 text-sm font-medium">
                  {HEALTH_LABELS[kind]}
                </div>
                <div className="flex-1 text-xs text-muted-foreground">
                  {s.status === "running" ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Probing...
                    </span>
                  ) : s.status === "idle" || !r ? (
                    <span className="opacity-60">Not tested yet</span>
                  ) : r.ok ? (
                    <span className="inline-flex items-center gap-2 text-green-700">
                      <Check className="h-3.5 w-3.5" />
                      <span>
                        OK
                        {r.elapsedMs !== undefined ? ` · ${r.elapsedMs}ms` : ""}
                        {r.provider ? ` · ${r.provider}` : ""}
                        {r.edition ? ` · ${r.edition}` : ""}
                        {r.model ? ` · ${r.model}` : ""}
                        {r.branch ? ` · ${r.branch}` : ""}
                        {r.componentsFound !== undefined
                          ? ` · ${r.componentsFound} components`
                          : ""}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-start gap-2 text-destructive">
                      <X className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="break-all">
                        {r.error || "Failed"}
                      </span>
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runHealth(kind)}
                  disabled={s.status === "running"}
                >
                  Test
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setAll(true)}>
          Show all
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAll(false)}>
          Hide all
        </Button>
      </div>

      {tabsInOrder.map((tabId) => {
        const blocksInTab = groupedByTab[tabId] || []
        if (blocksInTab.length === 0) return null
        return (
          <Card key={tabId}>
            <CardHeader>
              <CardTitle className="text-base">{TAB_LABELS[tabId]} tab</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {blocksInTab.map((b) => {
                const k = blockKey(b.group as string, b.field)
                const checked = visible[k] ?? true
                return (
                  <label
                    key={k}
                    className="flex items-start gap-3 cursor-pointer select-none rounded-md p-2 hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(b.group as string, b.field)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{b.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.description}
                      </div>
                    </div>
                  </label>
                )
              })}
            </CardContent>
          </Card>
        )
      })}

      <div className="flex items-center gap-3 sticky bottom-0 bg-background/95 backdrop-blur border-t py-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save
            </>
          )}
        </Button>
        {savedAt && (
          <span className="text-sm text-green-700 flex items-center gap-1">
            <Check className="h-4 w-4" />
            Saved
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  )
}
