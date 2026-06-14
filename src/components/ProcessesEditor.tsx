"use client"

// Shared editor for a solution's process sequences (actor→target steps),
// used by both the composer (/solutions/new) and the solution editor.
//
// Actors are auto-managed: picking a member in a step dropdown adds it as a
// participant; "+ External…" adds an off-catalog actor (user/role/system).
// Steps are an ordered list (manual ↑/↓ — order is the meaning, so no A–Z).
// A live mermaid sequence diagram updates as you edit.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { MermaidPreview } from "@/components/mermaid-preview"
import { ChevronUp, ChevronDown, Plus, X, Trash2, Sparkles, Loader2 } from "lucide-react"
import { PROCESS_STEP_KINDS, PROCESS_STEP_KIND_LABELS } from "@/lib/constants"
import { buildSolutionSequenceMermaid } from "@/lib/solution-sequence"
import { slugifyId } from "@/lib/component-schema"
import type {
  SolutionProcess,
  SolutionProcessStep,
  ProcessActor,
} from "@/lib/types"

export interface ProcessMember {
  id: string
  name: string
}

const INTERNAL = "__internal__"
const ADD_EXTERNAL = "__add_external__"

export function ProcessesEditor({
  processes,
  onChange,
  members,
  deliversProcesses = [],
  onAiDraft,
}: {
  processes: SolutionProcess[]
  onChange: (next: SolutionProcess[]) => void
  members: ProcessMember[]
  deliversProcesses?: string[]
  /** When provided, each process gets an AI-draft button. Returns the
   *  drafted actors + steps for the given process name (or null). */
  onAiDraft?: (processName: string) => Promise<{ actors: ProcessActor[]; steps: SolutionProcessStep[] } | null>
}) {
  const [aiBusyId, setAiBusyId] = useState<string | null>(null)
  const memberName = (id: string) => members.find((m) => m.id === id)?.name || id
  const lookup = new Map(members.map((m) => [m.id, m.name]))

  const setProcess = (i: number, patch: Partial<SolutionProcess>) =>
    onChange(processes.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const addProcess = () => {
    const n = processes.length + 1
    onChange([...processes, { id: `process-${n}`, name: `Process ${n}`, actors: [], steps: [] }])
  }
  const removeProcess = (i: number) => onChange(processes.filter((_, j) => j !== i))

  const ensureMember = (p: SolutionProcess, componentId: string): SolutionProcess =>
    p.actors.some((a) => a.id === componentId)
      ? p
      : {
          ...p,
          actors: [
            ...p.actors,
            { id: componentId, label: memberName(componentId), kind: "member", component: componentId },
          ],
        }

  const addStep = (i: number) => {
    const p = processes[i]
    setProcess(i, { steps: [...p.steps, { from: p.actors[0]?.id || "", to: undefined, label: "", kind: "sync" }] })
  }
  const setStep = (i: number, si: number, patch: Partial<SolutionProcessStep>) =>
    setProcess(i, { steps: processes[i].steps.map((s, k) => (k === si ? { ...s, ...patch } : s)) })
  const moveStep = (i: number, si: number, dir: -1 | 1) => {
    const p = processes[i]
    const j = si + dir
    if (j < 0 || j >= p.steps.length) return
    const steps = [...p.steps]
    ;[steps[si], steps[j]] = [steps[j], steps[si]]
    setProcess(i, { steps })
  }
  const removeStep = (i: number, si: number) =>
    setProcess(i, { steps: processes[i].steps.filter((_, k) => k !== si) })

  // Resolve a from/to dropdown selection into an actor id (adding the actor
  // if needed), and write it to the step — all in one update to avoid races.
  const selectActor = (i: number, si: number, field: "from" | "to", value: string) => {
    let p = processes[i]
    let actorId: string | undefined

    if (value === INTERNAL) {
      actorId = undefined
    } else if (value === ADD_EXTERNAL) {
      const label = window.prompt("External actor (user, role, external system):")?.trim()
      if (!label) return
      const base = `ext:${slugifyId(label) || "actor"}`
      let id = base
      let n = 2
      while (p.actors.some((a) => a.id === id)) id = `${base}-${n++}`
      p = { ...p, actors: [...p.actors, { id, label, kind: "external" }] }
      actorId = id
    } else {
      if (members.some((m) => m.id === value)) p = ensureMember(p, value)
      actorId = value
    }

    const steps = p.steps.map((s, k) => (k === si ? { ...s, [field]: actorId } : s))
    setProcess(i, { actors: p.actors, steps })
  }

  const runAi = async (i: number) => {
    if (!onAiDraft) return
    const p = processes[i]
    setAiBusyId(p.id)
    try {
      const res = await onAiDraft(p.name)
      if (res && (res.actors?.length || res.steps?.length)) {
        setProcess(i, { actors: res.actors || [], steps: res.steps || [] })
      }
    } finally {
      setAiBusyId(null)
    }
  }

  const ActorSelect = ({
    i,
    si,
    field,
    value,
    externals,
  }: {
    i: number
    si: number
    field: "from" | "to"
    value: string | undefined
    externals: ProcessActor[]
  }) => (
    <select
      className="h-8 rounded-md border bg-background px-2 text-sm max-w-[40%]"
      value={value ?? (field === "to" ? INTERNAL : "")}
      onChange={(e) => selectActor(i, si, field, e.target.value)}
    >
      {field === "to" && <option value={INTERNAL}>— internal (note)</option>}
      <optgroup label="Members">
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </optgroup>
      {externals.length > 0 && (
        <optgroup label="External">
          {externals.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </optgroup>
      )}
      <option value={ADD_EXTERNAL}>+ External…</option>
    </select>
  )

  return (
    <div className="space-y-4">
      {processes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No process sequences yet. Add one to document how the solution runs a process,
          step by step.
        </p>
      )}

      {processes.map((p, i) => {
        const externals = p.actors.filter((a) => a.kind === "external")
        return (
          <Card key={i}>
            <CardContent className="py-4 space-y-3">
              {/* header */}
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  value={p.name}
                  onChange={(e) => setProcess(i, { name: e.target.value })}
                  className="h-8 w-64 font-medium"
                  placeholder="Process name"
                />
                {deliversProcesses.length > 0 && (
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-xs text-muted-foreground"
                    value={p.deliversProcess || ""}
                    onChange={(e) => setProcess(i, { deliversProcess: e.target.value || undefined })}
                    title="Optionally link to a delivered process"
                  >
                    <option value="">(standalone)</option>
                    {deliversProcesses.map((d) => (
                      <option key={d} value={d}>delivers: {d}</option>
                    ))}
                  </select>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {onAiDraft && (
                    <Button size="sm" variant="outline" disabled={aiBusyId === p.id} onClick={() => runAi(i)}>
                      {aiBusyId === p.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                      AI draft
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-600" title="Remove process" onClick={() => removeProcess(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* steps */}
              <div className="space-y-2">
                {p.steps.length === 0 && (
                  <p className="text-xs text-muted-foreground">No steps yet.</p>
                )}
                {p.steps.map((s, si) => (
                  <div key={si} className="rounded-md border p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button disabled={si === 0} onClick={() => moveStep(i, si, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button disabled={si === p.steps.length - 1} onClick={() => moveStep(i, si, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                      <span className="text-[11px] text-muted-foreground w-5 text-right">{si + 1}.</span>
                      <ActorSelect i={i} si={si} field="from" value={s.from} externals={externals} />
                      <select
                        className="h-8 rounded-md border bg-background px-1.5 text-xs"
                        value={s.kind || "sync"}
                        onChange={(e) => setStep(i, si, { kind: e.target.value as SolutionProcessStep["kind"] })}
                        title="Step type"
                      >
                        {PROCESS_STEP_KINDS.map((k) => (
                          <option key={k} value={k}>{PROCESS_STEP_KIND_LABELS[k]}</option>
                        ))}
                      </select>
                      <ActorSelect i={i} si={si} field="to" value={s.to} externals={externals} />
                      <button onClick={() => removeStep(i, si)} className="ml-auto text-muted-foreground hover:text-red-600" title="Remove step"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <Input
                      value={s.label}
                      onChange={(e) => setStep(i, si, { label: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="What happens in this step"
                    />
                    <Input
                      value={s.description || ""}
                      onChange={(e) => setStep(i, si, { description: e.target.value || undefined })}
                      className="h-7 text-xs"
                      placeholder="Detail (optional)"
                    />
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => addStep(i)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add step
                </Button>
              </div>

              {/* live preview */}
              {p.steps.length > 0 && (
                <MermaidPreview
                  chart={buildSolutionSequenceMermaid(p, lookup)}
                  className="w-full"
                  zoomable
                  expandable
                  expandTitle={p.name || "Process sequence"}
                  height={280}
                />
              )}
            </CardContent>
          </Card>
        )
      })}

      <Button variant="outline" onClick={addProcess}>
        <Plus className="h-4 w-4 mr-1" />Add process
      </Button>
    </div>
  )
}
