"use client"

// Agents page — the DSD agent team (writer / critic / coach). View their
// prompts + version, and run the coach: it proposes prompt/lesson
// improvements from accumulated DSD feedback, which you approve to commit
// (propose → approve → commit training loop).

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Bot, Sparkles, Loader2, AlertCircle, Check, Pencil, X } from "lucide-react"
import type { Agent } from "@/lib/agents"
import type { CoachProposal, AgentDelta } from "@/lib/dsd-coach"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [proposing, setProposing] = useState(false)
  const [proposal, setProposal] = useState<CoachProposal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [savingName, setSavingName] = useState(false)

  // Direct (manual) editing of an agent's raw system prompt + lessons,
  // independent of the coach's propose → approve loop. Saving commits a new
  // version via the same /api/agents/apply endpoint.
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [draftPrompt, setDraftPrompt] = useState("")
  const [draftLessons, setDraftLessons] = useState("")
  const [savingPrompt, setSavingPrompt] = useState(false)

  const startEditPrompt = (a: Agent) => {
    setEditingPromptId(a.id)
    setDraftPrompt(a.system_prompt)
    setDraftLessons(a.lessons || "")
    setError(null)
  }

  const savePrompt = async (agentId: string) => {
    if (!draftPrompt.trim()) {
      setError("System prompt cannot be empty.")
      return
    }
    setSavingPrompt(true)
    setError(null)
    try {
      const r = await fetch("/api/agents/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          system_prompt: draftPrompt.trim(),
          lessons: draftLessons.trim(),
        }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error((d && d.error) || `Failed (${r.status})`)
      setAppliedMsg(`${agentId} updated to v${d.version}.`)
      setEditingPromptId(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingPrompt(false)
    }
  }

  const saveName = async (agentId: string) => {
    if (!editName.trim()) return
    setSavingName(true)
    setError(null)
    try {
      const r = await fetch("/api/agents/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, name: editName.trim() }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error((d && d.error) || `Failed (${r.status})`)
      setEditingId(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed")
    } finally {
      setSavingName(false)
    }
  }

  const load = () => {
    setLoading(true)
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(Array.isArray(d) ? d : []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const runCoach = async () => {
    setProposing(true)
    setError(null)
    setProposal(null)
    setAppliedMsg(null)
    try {
      const r = await fetch("/api/agents/coach/propose", { method: "POST" })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error((d && d.error) || `Failed (${r.status})`)
      setProposal(d as CoachProposal)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coaching failed")
    } finally {
      setProposing(false)
    }
  }

  // The feedback behind a proposal is already consumed server-side when
  // the round runs, so a rejected/declined suggestion never reappears.
  // Approving applies the prompt change; rejecting just drops it.
  const handleDelta = async (agentId: string, delta: AgentDelta, action: "approve" | "reject") => {
    setError(null)
    try {
      if (action === "approve") {
        const r = await fetch("/api/agents/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, ...delta }),
        })
        const d = await r.json().catch(() => null)
        if (!r.ok) throw new Error((d && d.error) || `Failed (${r.status})`)
        setAppliedMsg(`${agentId} updated to v${d.version}.`)
        load()
      }
      // Drop this agent's delta; clear the proposal once none remain.
      setProposal((p) => {
        if (!p) return p
        const deltas = { ...p.deltas }
        delete deltas[agentId]
        return Object.keys(deltas).length === 0 ? null : { ...p, deltas }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed")
    }
  }

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || id

  const dismissProposal = () => setProposal(null)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-7 w-7" />
            Agents
          </h1>
          <p className="text-muted-foreground mt-1">
            The DSD agent team — section writers, critic lenses, a lead editor and the coach.
            Edit a prompt directly, or let the coach turn analyst feedback into prompt
            improvements you approve. Every change is a new version.
          </p>
        </div>
        <Button onClick={runCoach} disabled={proposing}>
          {proposing ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Retraining…</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" />Retrain agents</>
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{error}
        </div>
      )}
      {appliedMsg && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-start gap-2">
          <Check className="h-4 w-4 mt-0.5 shrink-0" />{appliedMsg}
        </div>
      )}

      {proposal && (
        <Card className="border-blue-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              Coach proposal
              <Badge variant="outline" className="text-[10px]">{proposal.feedbackConsidered} feedback considered</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {proposal.rationale && <p className="text-sm text-muted-foreground">{proposal.rationale}</p>}
            {Object.keys(proposal.deltas).length === 0 && (
              <p className="text-sm text-muted-foreground">No changes proposed.</p>
            )}
            {Object.entries(proposal.deltas).map(([agentId, delta]) => (
              <DeltaBlock key={agentId} title={agentName(agentId)} agentId={agentId} delta={delta} onAction={handleDelta} />
            ))}
            <div className="flex justify-end pt-1">
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={dismissProposal}>
                Dismiss all
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />Loading agents…
        </div>
      ) : (
        <div className="space-y-6">
          {ROLE_GROUPS.map(({ role, label }) => {
            const group = agents.filter((a) => a.role === role)
            if (group.length === 0) return null
            return (
              <div key={role} className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
                {group.map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  {editingId === a.id ? (
                    <span className="flex items-center gap-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 w-56"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveName(a.id)
                          if (e.key === "Escape") setEditingId(null)
                        }}
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingName} onClick={() => saveName(a.id)}>
                        {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 group">
                      {a.name}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-50 hover:opacity-100"
                        title="Rename"
                        onClick={() => { setEditingId(a.id); setEditName(a.name) }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] uppercase">{a.role}</Badge>
                  <Badge variant="outline" className="text-[10px]">v{a.version}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {editingPromptId === a.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-sm text-muted-foreground">System prompt</label>
                      <Textarea
                        value={draftPrompt}
                        onChange={(e) => setDraftPrompt(e.target.value)}
                        rows={8}
                        className="text-xs font-mono"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-muted-foreground">Lessons (applied after the prompt)</label>
                      <Textarea
                        value={draftLessons}
                        onChange={(e) => setDraftLessons(e.target.value)}
                        rows={4}
                        className="text-xs font-mono"
                        placeholder="Optional — extra rules appended to the prompt at run time. Leave empty to clear."
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" disabled={savingPrompt} onClick={() => setEditingPromptId(null)}>
                        <X className="h-4 w-4 mr-1" />Cancel
                      </Button>
                      <Button size="sm" disabled={savingPrompt || !draftPrompt.trim()} onClick={() => savePrompt(a.id)}>
                        {savingPrompt ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                        Save &amp; commit
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">System prompt</span>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => startEditPrompt(a)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />Edit prompt
                      </Button>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-sm text-muted-foreground">Show prompt</summary>
                      <pre className="mt-1 text-xs whitespace-pre-wrap bg-muted/40 rounded p-2">{a.system_prompt}</pre>
                    </details>
                    {a.lessons && (
                      <details open>
                        <summary className="cursor-pointer text-sm text-muted-foreground">Lessons (coach-trained)</summary>
                        <pre className="mt-1 text-xs whitespace-pre-wrap bg-amber-50 rounded p-2">{a.lessons}</pre>
                      </details>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ROLE_GROUPS: { role: string; label: string }[] = [
  { role: "writer", label: "DSD · section writers" },
  { role: "critic", label: "DSD · critic panel" },
  { role: "lead", label: "DSD · lead editor" },
  { role: "coach", label: "Coach" },
  { role: "assistant", label: "AI assistants" },
]

function DeltaBlock({
  title,
  agentId,
  delta,
  onAction,
}: {
  title: string
  agentId: string
  delta: AgentDelta
  onAction: (agentId: string, delta: AgentDelta, action: "approve" | "reject") => void
}) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">{title}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onAction(agentId, delta, "reject")}>
            <X className="h-4 w-4 mr-1" />Reject
          </Button>
          <Button size="sm" onClick={() => onAction(agentId, delta, "approve")}>
            <Check className="h-4 w-4 mr-1" />Approve &amp; commit
          </Button>
        </div>
      </div>
      {delta.lessons && (
        <div>
          <div className="text-xs text-muted-foreground">Proposed lessons</div>
          <pre className="text-xs whitespace-pre-wrap bg-amber-50 rounded p-2">{delta.lessons}</pre>
        </div>
      )}
      {delta.system_prompt && (
        <div>
          <div className="text-xs text-muted-foreground">Proposed system prompt</div>
          <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-2">{delta.system_prompt}</pre>
        </div>
      )}
    </div>
  )
}
