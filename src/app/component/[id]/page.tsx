"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TypeIcon } from "@/components/TypeIcon"
import { StatusBadge } from "@/components/StatusBadge"
import { TYPE_LABELS, RELATIONSHIP_LABELS, DATA_CLASSIFICATION_LABELS } from "@/lib/constants"
import type { ComponentWithSha } from "@/lib/types"
import {
  ArrowLeft,
  Copy,
  Check,
  Pencil,
  ArrowRight,
  Download,
  Trash2,
  Info,
  History,
  Radar,
  ExternalLink,
  RefreshCw,
  Loader2,
} from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { BlastRadiusDialog } from "@/components/BlastRadiusDialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

export default function ComponentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [component, setComponent] = useState<ComponentWithSha | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [history, setHistory] = useState<{ sha: string; message: string; author: string; date: string }[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [showBlastRadius, setShowBlastRadius] = useState(false)
  const [confluence, setConfluence] = useState<{
    configured: boolean
    published: boolean
    pageUrl?: string
    pageId?: string
    lastSyncedAt?: string
  } | null>(null)
  type SmartPatch = {
    field: string
    oldValue: string
    newValue: string
    source: "table" | "ai"
    confidence: "high" | "medium" | "low"
    evidence?: string
  }
  const [pullState, setPullState] = useState<{
    loading: boolean
    patches?: SmartPatch[]
    selected: Record<number, boolean> // index → selected
    confluenceVersion?: number
    confluenceUrl?: string
    error?: string
    showDialog: boolean
    applying: boolean
    appliedCount?: number
  }>({ loading: false, showDialog: false, applying: false, selected: {} })

  useEffect(() => {
    fetch(`/api/components/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found")
        return r.json()
      })
      .then(setComponent)
      .catch(() => router.push("/"))
      .finally(() => setLoading(false))

    fetch(`/api/components/${id}/history`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`)
        return r.json()
      })
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))

    fetch(`/api/confluence/status?componentId=${encodeURIComponent(id)}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((data) => setConfluence(data))
      .catch(() => setConfluence(null))
  }, [id, router])

  const fetchPullDiff = async () => {
    if (!component) return
    setPullState((s) => ({
      ...s,
      loading: true,
      error: undefined,
      showDialog: true,
      patches: undefined,
      appliedCount: undefined,
      selected: {},
    }))
    try {
      const res = await fetch("/api/confluence/pull-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentId: component.id, apply: false }),
      })
      const json = await res.json()
      if (!res.ok) {
        setPullState((s) => ({
          ...s,
          loading: false,
          error: json.error || `HTTP ${res.status}`,
        }))
      } else {
        const patches: SmartPatch[] = json.patches || []
        // Default-check: table source (always) + AI high/medium confidence.
        const selected: Record<number, boolean> = {}
        patches.forEach((p, i) => {
          selected[i] = p.source === "table" || p.confidence !== "low"
        })
        setPullState((s) => ({
          ...s,
          loading: false,
          patches,
          confluenceVersion: json.confluenceVersion,
          confluenceUrl: json.confluenceUrl,
          error: undefined,
          selected,
        }))
      }
    } catch (e) {
      setPullState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "Unknown error",
      }))
    }
  }

  const applyPull = async () => {
    if (!component || !pullState.patches) return
    const chosen = pullState.patches.filter((_, i) => pullState.selected[i])
    if (chosen.length === 0) return
    setPullState((s) => ({ ...s, applying: true, error: undefined }))
    try {
      const res = await fetch("/api/confluence/pull-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          componentId: component.id,
          apply: true,
          patches: chosen,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setPullState((s) => ({
          ...s,
          applying: false,
          error: json.error || `HTTP ${res.status}`,
        }))
      } else {
        setPullState((s) => ({
          ...s,
          applying: false,
          appliedCount: json.appliedCount ?? chosen.length,
        }))
        // Refresh component data
        const fresh = await fetch(`/api/components/${component.id}`).then((r) =>
          r.json()
        )
        setComponent(fresh)
      }
    } catch (e) {
      setPullState((s) => ({
        ...s,
        applying: false,
        error: e instanceof Error ? e.message : "Unknown error",
      }))
    }
  }

  const togglePatch = (index: number) => {
    setPullState((s) => ({
      ...s,
      selected: { ...s.selected, [index]: !s.selected[index] },
    }))
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleDelete = async () => {
    if (!component) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/components/${component.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: component.sha }),
      })
      if (!res.ok) throw new Error("Failed to delete")
      router.push("/")
    } catch {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading || !component) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading component...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <TypeIcon type={component.type} className="h-6 w-6" />
            <h1 className="text-3xl font-bold">{component.name}</h1>
            <StatusBadge status={component.status} />
          </div>
          <p className="text-muted-foreground mt-1">
            {component.description.oneliner}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            className="bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setShowBlastRadius(true)}
          >
            <Radar className="h-4 w-4 mr-2" />
            Blast Radius
          </Button>
          {confluence?.published && confluence.pageUrl && (
            <a href={confluence.pageUrl} target="_blank" rel="noreferrer">
              <Button
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Confluence
              </Button>
            </a>
          )}
          {confluence?.published && (
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={fetchPullDiff}
              disabled={pullState.loading}
            >
              {pullState.loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Pull from Confluence
            </Button>
          )}
          <a href="/api/export/drawio" download="arch-components.xml">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Draw.io
            </Button>
          </a>
          <Link href={`/edit/${component.id}`}>
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

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="rounded-lg border border-destructive bg-destructive/5 p-4">
          <p className="text-sm font-medium mb-3">
            Are you sure you want to delete <strong>{component.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Yes, delete"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyToClipboard(component.id, "id")}
        >
          {copiedField === "id" ? (
            <Check className="h-3 w-3 mr-1" />
          ) : (
            <Copy className="h-3 w-3 mr-1" />
          )}
          Copy ID
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            copyToClipboard(component.description.technical, "technical")
          }
        >
          {copiedField === "technical" ? (
            <Check className="h-3 w-3 mr-1" />
          ) : (
            <Copy className="h-3 w-3 mr-1" />
          )}
          Copy Technical Desc
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            copyToClipboard(component.description.business, "business")
          }
        >
          {copiedField === "business" ? (
            <Check className="h-3 w-3 mr-1" />
          ) : (
            <Copy className="h-3 w-3 mr-1" />
          )}
          Copy Business Desc
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">ID</span>
                <p className="font-mono">{component.id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Type</span>
                <p>{TYPE_LABELS[component.type]}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Owner</span>
                <p>{component.owner}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <p>
                  <StatusBadge status={component.status} />
                </p>
              </div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Tags</span>
              <div className="flex gap-1 flex-wrap mt-1">
                {component.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Descriptions */}
        <Card>
          <CardHeader>
            <CardTitle>Descriptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-sm text-muted-foreground font-medium">
                Technical
              </span>
              <p className="text-sm mt-1">{component.description.technical}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground font-medium">
                Business
              </span>
              <p className="text-sm mt-1">{component.description.business}</p>
            </div>
          </CardContent>
        </Card>

        {/* Interfaces */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Interfaces
              <Tooltip>
                <TooltipTrigger className="cursor-help">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  What this component exposes to others (provides) and what it consumes from other components. Interfaces describe the API surface — the protocols, directions, and purposes of each connection point.
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {component.interfaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No interfaces defined.
              </p>
            ) : (
              <div className="space-y-3">
                {component.interfaces.map((iface, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-sm border-b last:border-0 pb-2"
                  >
                    <Badge
                      variant={
                        iface.direction === "provides" ? "default" : "outline"
                      }
                      className="text-xs w-20 justify-center"
                    >
                      {iface.direction}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {iface.type}
                    </Badge>
                    <span className="flex-1">{iface.description}</span>
                    {iface.target && (
                      <span className="text-muted-foreground font-mono text-xs">
                        → {iface.target}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Relationships */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Relationships
              <Tooltip>
                <TooltipTrigger className="cursor-help">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-left">
                  <p className="font-semibold mb-1">How this component relates to others:</p>
                  <ul className="text-xs space-y-0.5">
                    <li><strong>Parent of</strong> — contains/owns another component</li>
                    <li><strong>Child of</strong> — belongs to a parent component</li>
                    <li><strong>Depends on</strong> — requires another to function</li>
                    <li><strong>Communicates with</strong> — exchanges data with a peer</li>
                    <li><strong>Reads / Writes</strong> — directional data flow</li>
                    <li><strong>Fallback for</strong> — backup when another is unavailable</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!component.relationships || component.relationships.length === 0) ? (
              <p className="text-sm text-muted-foreground">
                No relationships defined.
              </p>
            ) : (
              <div className="space-y-2">
                {component.relationships.map((rel, i) => (
                  <Link
                    key={`${rel.target}-${i}`}
                    href={`/component/${rel.target}`}
                    className="flex items-center gap-3 text-sm p-2 rounded-md hover:bg-muted transition-colors"
                  >
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="outline" className="text-xs shrink-0">
                      {RELATIONSHIP_LABELS[rel.type] || rel.type}
                    </Badge>
                    <span className="font-mono">{rel.target}</span>
                    {rel.connector && (
                      <Badge variant="secondary" className="text-xs">
                        {rel.connector}
                      </Badge>
                    )}
                    {rel.description && (
                      <span className="text-muted-foreground text-xs truncate">
                        {rel.description}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Business Capabilities */}
        {component.business_capabilities && component.business_capabilities.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Business Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {component.business_capabilities.map((cap) => (
                  <Badge key={cap} variant="secondary">
                    {cap}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Non-Functional Requirements */}
        {component.nfr && Object.values(component.nfr).some(Boolean) && (
          <Card>
            <CardHeader>
              <CardTitle>Non-Functional Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {component.nfr.availability && (
                  <div>
                    <span className="text-muted-foreground">Availability</span>
                    <p className="font-medium">{component.nfr.availability}</p>
                  </div>
                )}
                {component.nfr.rto && (
                  <div>
                    <span className="text-muted-foreground">RTO</span>
                    <p className="font-medium">{component.nfr.rto}</p>
                  </div>
                )}
                {component.nfr.rpo && (
                  <div>
                    <span className="text-muted-foreground">RPO</span>
                    <p className="font-medium">{component.nfr.rpo}</p>
                  </div>
                )}
                {component.nfr.max_latency && (
                  <div>
                    <span className="text-muted-foreground">Max Latency</span>
                    <p className="font-medium">{component.nfr.max_latency}</p>
                  </div>
                )}
                {component.nfr.throughput && (
                  <div>
                    <span className="text-muted-foreground">Throughput</span>
                    <p className="font-medium">{component.nfr.throughput}</p>
                  </div>
                )}
                {component.nfr.data_classification && (
                  <div>
                    <span className="text-muted-foreground">Data Classification</span>
                    <p className="font-medium">{DATA_CLASSIFICATION_LABELS[component.nfr.data_classification]}</p>
                  </div>
                )}
                {component.nfr.scaling && (
                  <div>
                    <span className="text-muted-foreground">Scaling</span>
                    <p className="font-medium capitalize">{component.nfr.scaling}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Risks */}
        {component.risks && component.risks.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Risks</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {component.risks.map((risk, i) => (
                  <li key={i}>{risk}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Change History */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4" />
            Change History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <p className="text-xs text-muted-foreground">Loading history...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No history available.</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((commit) => (
                <div
                  key={commit.sha}
                  className="flex items-baseline gap-3 text-xs text-muted-foreground"
                >
                  <span className="font-mono shrink-0">{commit.sha}</span>
                  <span className="shrink-0">
                    {commit.date
                      ? new Date(commit.date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : ""}
                  </span>
                  <span className="truncate text-foreground/70">
                    {commit.message.split("\n")[0]}
                  </span>
                  <span className="shrink-0 ml-auto">{commit.author}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BlastRadiusDialog
        open={showBlastRadius}
        onOpenChange={setShowBlastRadius}
        componentId={component.id}
      />

      <Dialog
        open={pullState.showDialog}
        onOpenChange={(v) =>
          setPullState((s) => ({
            ...s,
            showDialog: v,
            ...(v
              ? {}
              : {
                  patches: undefined,
                  error: undefined,
                  appliedCount: undefined,
                  selected: {},
                }),
          }))
        }
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-600" />
              Pull from Confluence — {component.name}
            </DialogTitle>
            <DialogDescription>
              Smart scan combines the deterministic Properties table with an AI
              read of the whole page. Tick the changes you want to apply — each
              applied change is committed to the GitHub repo.
            </DialogDescription>
          </DialogHeader>

          {pullState.loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading Confluence page and running AI scan...
            </div>
          )}

          {pullState.error && (
            <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3">
              {pullState.error}
            </div>
          )}

          {!pullState.loading && pullState.patches !== undefined && !pullState.error && (
            <div className="space-y-4">
              {pullState.appliedCount !== undefined ? (
                <div className="bg-green-50 border border-green-200 text-green-900 text-sm rounded-md p-3">
                  Applied {pullState.appliedCount} change
                  {pullState.appliedCount === 1 ? "" : "s"} to the catalog.
                  New commit pushed to GitHub.
                </div>
              ) : pullState.patches.length === 0 ? (
                <div className="bg-muted/40 text-sm rounded-md p-4 text-center">
                  No differences detected. Catalog and Confluence agree.
                </div>
              ) : (
                <>
                  <div className="text-sm flex items-center justify-between">
                    <span>
                      <strong>{pullState.patches.length}</strong> proposed
                      change{pullState.patches.length === 1 ? "" : "s"}.
                      Default selection: all from table + AI high/medium
                      confidence.
                    </span>
                    {pullState.confluenceUrl && (
                      <a
                        href={pullState.confluenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline text-blue-700 inline-flex items-center gap-1"
                      >
                        Open page
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="space-y-2">
                    {pullState.patches.map((p, i) => {
                      const checked = !!pullState.selected[i]
                      const sourceLabel =
                        p.source === "table" ? "from table" : "from narrative"
                      const confColor =
                        p.confidence === "high"
                          ? "bg-green-100 text-green-800 border-green-300"
                          : p.confidence === "medium"
                          ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                          : "bg-gray-100 text-gray-700 border-gray-300"
                      const sourceColor =
                        p.source === "table"
                          ? "bg-blue-100 text-blue-800 border-blue-300"
                          : "bg-purple-100 text-purple-800 border-purple-300"
                      return (
                        <label
                          key={i}
                          className={`flex items-start gap-3 border rounded-md p-3 cursor-pointer transition-colors ${
                            checked ? "bg-blue-50/50 border-blue-200" : "bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePatch(i)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono text-xs font-semibold">
                                {p.field}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] uppercase ${sourceColor}`}
                              >
                                {sourceLabel}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`text-[10px] uppercase ${confColor}`}
                              >
                                {p.confidence}
                              </Badge>
                            </div>
                            <div className="text-xs space-y-0.5">
                              <div className="text-muted-foreground">
                                <span className="font-medium text-gray-500">Current:</span>{" "}
                                <span className="line-through">
                                  {p.oldValue || "(empty)"}
                                </span>
                              </div>
                              <div className="text-blue-900">
                                <span className="font-medium text-blue-700">New:</span>{" "}
                                <span className="font-medium">
                                  {p.newValue || "(empty)"}
                                </span>
                              </div>
                              {p.evidence && (
                                <div className="text-muted-foreground italic mt-1">
                                  &ldquo;{p.evidence}&rdquo;
                                </div>
                              )}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t pt-3">
                    <Button
                      onClick={applyPull}
                      disabled={
                        pullState.applying ||
                        Object.values(pullState.selected).every((v) => !v)
                      }
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {pullState.applying ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        <>
                          Apply selected ({Object.values(pullState.selected).filter(Boolean).length}) &amp; commit
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
