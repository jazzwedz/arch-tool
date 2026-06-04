"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  COMPONENT_TYPES,
  COMPONENT_STATUSES,
  TYPE_LABELS,
  CONNECTOR_TYPES,
  INTERFACE_DIRECTIONS,
  RELATIONSHIP_TYPES,
  RELATIONSHIP_LABELS,
  BUSINESS_CAPABILITIES,
  DATA_CLASSIFICATIONS,
  DATA_CLASSIFICATION_LABELS,
  SCALING_MODELS,
  CAPABILITY_ROLES,
  CAPABILITY_ROLE_LABELS,
  FORMAT_DATA_KINDS,
  BUSINESS_DATA_KINDS,
  TECHNICAL_DATA_KINDS,
  DATA_KIND_LABELS,
  PROCESS_ROLES,
  PROCESS_ROLE_LABELS,
  RULE_KINDS,
  RULE_KIND_LABELS,
  RULE_KIND_HINTS,
} from "@/lib/constants"
import type {
  Component,
  ComponentInterface,
  ComponentRelationship,
  ComponentNFR,
  ComponentCapability,
  CapabilityRole,
  DataItem,
  DataKind,
  ComponentData,
  ComponentProcess,
  ProcessRole,
  ComponentRule,
  RuleKind,
} from "@/lib/types"
import { Plus, Trash2, Info, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

interface ComponentFormProps {
  initialData?: Component & { sha?: string }
  isEdit?: boolean
  // When true, the form renders as a passive viewer — Save is hidden
  // and the underlying <fieldset> blocks every input from accepting
  // keystrokes. Used by the edit page when the active component is
  // currently being edited by another user (lock denied).
  readOnly?: boolean
  // Lets the parent page render Cancel + Save buttons in the page
  // header instead of at the bottom of the (very long) form. The form
  // tags its <form> element with `id={formId}` so the parent can
  // submit via a `<button type="submit" form={formId}>` placed
  // anywhere in the React tree.
  formId?: string
  // Callback mirror of the internal saving flag — parent uses this to
  // disable the header Save button while a save is in flight.
  onSavingChange?: (saving: boolean) => void
}

const emptyInterface: ComponentInterface = {
  direction: "provides",
  type: "rest",
  target: "",
  description: "",
}

const emptyRelationship: ComponentRelationship = {
  target: "",
  type: "depends-on",
  description: "",
}

const emptyCapability: ComponentCapability = {
  name: "",
  role: "indirect",
  description: "",
}

const emptyDataItem: DataItem = {
  name: "",
  kind: "business",
}

type DataBucket = "owns" | "inputs" | "outputs"

const emptyProcess: ComponentProcess = {
  name: "",
  role: "participant",
  activity: "",
  description: "",
}

const emptyRule: ComponentRule = {
  name: "",
  kind: "formula",
  summary: "",
}

// Convert a free-form name into a YAML-safe component id.
// Lowercases, replaces whitespace with dashes, strips anything that is
// not a letter / digit / dash / underscore, and collapses runs of
// dashes. Returns "" when the input has no usable characters; the
// caller falls back to a timestamp-based id in that case.
export function slugifyForId(name: string): string {
  return (name || "")
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\s/\\]+/g, "-")
    .replace(/[^a-z0-9_\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
}

export function ComponentForm({
  initialData,
  isEdit,
  readOnly = false,
  formId,
  onSavingChange,
}: ComponentFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  // Mirror the internal saving flag back up to the parent so a header
  // Save button (rendered outside this form) can disable itself while
  // a save is in flight.
  useEffect(() => {
    onSavingChange?.(saving)
  }, [saving, onSavingChange])
  const [conflictOpen, setConflictOpen] = useState(false)
  const [conflictMessage, setConflictMessage] = useState<string>("")
  const [existingComponents, setExistingComponents] = useState<
    { id: string; name: string }[]
  >([])

  const [form, setForm] = useState<Component>({
    id: "",
    name: "",
    type: "component",
    status: "draft",
    owner: "",
    tags: [],
    description: { oneliner: "", description: "" },
    interfaces: [],
    relationships: [],
    risks: [],
    capabilities: [],
    data: undefined,
    processes: [],
    rules: [],
    nfr: {},
    ...(initialData || {}),
  })

  const [tagsInput, setTagsInput] = useState(
    initialData?.tags?.join(", ") || ""
  )
  const [risksInput, setRisksInput] = useState(
    initialData?.risks?.join("\n") || ""
  )
  // Per-output-row "consumers" string input (UI-only state, parsed to string[] on save).
  const [outputsConsumersInput, setOutputsConsumersInput] = useState<
    Record<number, string>
  >(() => {
    const initial: Record<number, string> = {}
    initialData?.data?.outputs?.forEach((item, i) => {
      if (item.consumers && item.consumers.length > 0) {
        initial[i] = item.consumers.join(", ")
      }
    })
    return initial
  })
  // Per-rule-row "enforced_in" string input for constraint kind.
  const [ruleEnforcedInput, setRuleEnforcedInput] = useState<
    Record<number, string>
  >(() => {
    const initial: Record<number, string> = {}
    initialData?.rules?.forEach((rule, i) => {
      if (rule.enforced_in && rule.enforced_in.length > 0) {
        initial[i] = rule.enforced_in.join(", ")
      }
    })
    return initial
  })

  useEffect(() => {
    fetch("/api/components")
      .then((r) => r.json())
      .then((data: Component[]) =>
        setExistingComponents(data.map((c) => ({ id: c.id, name: c.name })))
      )
      .catch(console.error)
  }, [])

  const updateField = <K extends keyof Component>(
    key: K,
    value: Component[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const updateInterface = (
    index: number,
    field: keyof ComponentInterface,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      interfaces: prev.interfaces.map((iface, i) =>
        i === index ? { ...iface, [field]: value } : iface
      ),
    }))
  }

  const updateNFR = (field: keyof ComponentNFR, value: string) => {
    setForm((prev) => ({
      ...prev,
      nfr: { ...prev.nfr, [field]: value || undefined },
    }))
  }

  const updateRelationship = (
    index: number,
    field: keyof ComponentRelationship,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      relationships: prev.relationships.map((rel, i) =>
        i === index ? { ...rel, [field]: value } : rel
      ),
    }))
  }

  const updateCapability = (
    index: number,
    field: keyof ComponentCapability,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      capabilities: (prev.capabilities || []).map((cap, i) =>
        i === index ? { ...cap, [field]: value } : cap
      ),
    }))
  }

  const updateDataItem = (
    bucket: DataBucket,
    index: number,
    field: keyof DataItem,
    value: string
  ) => {
    setForm((prev) => {
      const dataPrev = prev.data || {}
      const list = (dataPrev[bucket] || []).map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
      return { ...prev, data: { ...dataPrev, [bucket]: list } }
    })
  }

  const addDataItem = (bucket: DataBucket) => {
    setForm((prev) => {
      const dataPrev = prev.data || {}
      const list = [...(dataPrev[bucket] || []), { ...emptyDataItem }]
      return { ...prev, data: { ...dataPrev, [bucket]: list } }
    })
  }

  const removeDataItem = (bucket: DataBucket, index: number) => {
    setForm((prev) => {
      const dataPrev = prev.data || {}
      const list = (dataPrev[bucket] || []).filter((_, i) => i !== index)
      return { ...prev, data: { ...dataPrev, [bucket]: list } }
    })
    if (bucket === "outputs") {
      setOutputsConsumersInput((prev) => {
        const next: Record<number, string> = {}
        Object.entries(prev).forEach(([k, v]) => {
          const i = Number(k)
          if (i < index) next[i] = v
          else if (i > index) next[i - 1] = v
        })
        return next
      })
    }
  }

  const updateProcess = (
    index: number,
    field: keyof ComponentProcess,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      processes: (prev.processes || []).map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      ),
    }))
  }

  const updateRule = (
    index: number,
    field: keyof ComponentRule,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      rules: (prev.rules || []).map((r, i) =>
        i === index ? { ...r, [field]: value } : r
      ),
    }))
  }

  const removeRule = (index: number) => {
    setForm((prev) => ({
      ...prev,
      rules: (prev.rules || []).filter((_, i) => i !== index),
    }))
    setRuleEnforcedInput((prev) => {
      const next: Record<number, string> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k)
        if (i < index) next[i] = v
        else if (i > index) next[i - 1] = v
      })
      return next
    })
  }

  // Swap two rules by index. Mirrors the swap onto the per-row enforced_in
  // input state so the constraint-input value follows the rule it belongs to.
  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction
    setForm((prev) => {
      const rules = [...(prev.rules || [])]
      if (target < 0 || target >= rules.length) return prev
      const tmp = rules[index]
      rules[index] = rules[target]
      rules[target] = tmp
      return { ...prev, rules }
    })
    setRuleEnforcedInput((prev) => {
      const a = prev[index]
      const b = prev[target]
      const next: Record<number, string> = { ...prev }
      if (a === undefined) delete next[target]
      else next[target] = a
      if (b === undefined) delete next[index]
      else next[index] = b
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    // Clean NFR: remove empty values
    const cleanNfr = form.nfr
      ? Object.fromEntries(Object.entries(form.nfr).filter(([, v]) => v))
      : undefined
    const hasNfr = cleanNfr && Object.keys(cleanNfr).length > 0

    // Clean capabilities: drop rows with empty name; trim description.
    const cleanCapabilities: ComponentCapability[] = (form.capabilities || [])
      .filter((c) => c.name && c.name.trim().length > 0)
      .map((c) => ({
        name: c.name.trim(),
        role: c.role,
        ...(c.description && c.description.trim()
          ? { description: c.description.trim() }
          : {}),
      }))

    // Clean data: drop rows with empty name in each bucket; parse outputs.consumers
    // from the per-row textarea state; drop the whole `data` block if everything is empty.
    const cleanBucket = (
      bucket: DataBucket,
      items: DataItem[] | undefined
    ): DataItem[] | undefined => {
      const list = (items || [])
        .map((item, i) => {
          const name = item.name?.trim() || ""
          if (!name) return null
          const out: DataItem = { name, kind: item.kind }
          if (item.purpose && item.purpose.trim())
            out.purpose = item.purpose.trim()
          if (item.description && item.description.trim())
            out.description = item.description.trim()
          if (bucket === "inputs" && item.source && item.source.trim())
            out.source = item.source.trim()
          if (bucket === "outputs") {
            const raw = outputsConsumersInput[i]
            if (raw && raw.trim()) {
              const consumers = raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
              if (consumers.length > 0) out.consumers = consumers
            }
          }
          return out
        })
        .filter((x): x is DataItem => x !== null)
      return list.length > 0 ? list : undefined
    }

    const cleanData: ComponentData = {
      owns: cleanBucket("owns", form.data?.owns),
      inputs: cleanBucket("inputs", form.data?.inputs),
      outputs: cleanBucket("outputs", form.data?.outputs),
    }
    const hasData = !!(
      cleanData.owns ||
      cleanData.inputs ||
      cleanData.outputs
    )

    // Clean processes: drop rows with empty name; trim activity/description.
    const cleanProcesses: ComponentProcess[] = (form.processes || [])
      .filter((p) => p.name && p.name.trim().length > 0)
      .map((p) => ({
        name: p.name.trim(),
        role: p.role,
        ...(p.activity && p.activity.trim() ? { activity: p.activity.trim() } : {}),
        ...(p.description && p.description.trim()
          ? { description: p.description.trim() }
          : {}),
      }))

    // Clean rules: drop rows with empty name; only keep fields relevant to kind.
    const cleanRules: ComponentRule[] = (form.rules || [])
      .map((r, i) => {
        const name = r.name?.trim() || ""
        if (!name) return null
        const out: ComponentRule = { name, kind: r.kind }
        if (r.summary && r.summary.trim()) out.summary = r.summary.trim()
        if (r.description && r.description.trim()) out.description = r.description.trim()
        if (r.kind === "formula" && r.formula && r.formula.trim()) {
          out.formula = r.formula.trim()
        }
        if (r.kind === "rule") {
          if (r.given && r.given.trim()) out.given = r.given.trim()
          if (r.when && r.when.trim()) out.when = r.when.trim()
          if (r.then && r.then.trim()) out.then = r.then.trim()
        }
        if (r.kind === "constraint") {
          const raw = ruleEnforcedInput[i]
          if (raw && raw.trim()) {
            const ids = raw
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
            if (ids.length > 0) out.enforced_in = ids
          }
        }
        return out
      })
      .filter((x): x is ComponentRule => x !== null)

    // Auto-generate id from name on create when the analyst did not
    // type one. Edit mode keeps the existing id (the input is disabled
    // and the YAML filename cannot change without a rename flow).
    let finalId = form.id.trim()
    if (!isEdit && !finalId) {
      const slug = slugifyForId(form.name)
      finalId = slug || `component-${Date.now().toString(36)}`
    }

    // Clean description: drop every legacy field on save so the YAML
    // migrates to the unified shape. Only the unified `description`
    // survives when non-empty; oneliner / technical / business that
    // existed on the in-memory record (from migrateComponent) are not
    // re-written.
    const cleanDescription: { description?: string } = {}
    if (form.description?.description && form.description.description.trim()) {
      cleanDescription.description = form.description.description.trim()
    }

    const component: Component = {
      ...form,
      id: finalId,
      tags: tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      risks: risksInput
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean),
      // Unified description — legacy technical / business are dropped
      // on save; migrateComponent backfills `description` from them at
      // read time for any YAML that still has the old shape.
      description: cleanDescription,
      capabilities: cleanCapabilities.length > 0 ? cleanCapabilities : undefined,
      // Drop any legacy field on save so the YAML is upgraded.
      business_capabilities: undefined,
      data: hasData ? cleanData : undefined,
      processes: cleanProcesses.length > 0 ? cleanProcesses : undefined,
      rules: cleanRules.length > 0 ? cleanRules : undefined,
      nfr: hasNfr ? (cleanNfr as ComponentNFR) : undefined,
    }

    try {
      if (isEdit) {
        // Always fetch latest sha before saving to avoid stale sha conflicts
        let latestSha = initialData?.sha
        try {
          const freshRes = await fetch(`/api/components/${component.id}`)
          if (freshRes.ok) {
            const freshData = await freshRes.json()
            latestSha = freshData.sha
          }
        } catch { /* use initialData sha as fallback */ }

        const res = await fetch(`/api/components/${component.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...component, sha: latestSha }),
        })
        if (res.status === 409) {
          // Either someone else holds the edit lock or the component
          // was modified between our load and our save. Either way the
          // analyst's safest next action is to reload and re-apply,
          // so we surface the modal the user signed off on.
          const body = await res.json().catch(() => ({}))
          setConflictMessage(
            body.message ||
              "This component was changed by another user since you opened it. Reload to see the new state, then re-apply your changes."
          )
          setConflictOpen(true)
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          alert(`Failed to save: ${body.error || res.status}`)
          return
        }
      } else {
        await fetch("/api/components", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(component),
        })
      }
      router.push(`/component/${component.id}`)
    } catch (error) {
      console.error("Save failed:", error)
      alert("Failed to save component")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/*
        <fieldset disabled> is the cleanest way to block every input,
        select, textarea and button below — including dynamically-added
        rule rows — without threading a `disabled` prop through every
        component. The style override removes the default greyed-out
        appearance so the read-only view still reads clearly; the
        outer LockBanner already explains why saves are blocked.
      */}
      <fieldset disabled={readOnly} className="space-y-6 contents">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <p className="text-sm text-muted-foreground">
            Only <strong>Name</strong> is required. Everything else —
            type, status, owner, tags, description — is optional. The
            component id is auto-generated from the name; open
            &ldquo;Advanced&rdquo; to customise it.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name is the only required field for a new component.
              The id is auto-generated from the name on save unless the
              analyst opens the "Advanced" panel and types one. Edit
              mode locks the id because changing it would rename the
              backing YAML file. */}
          <div className="space-y-2">
            <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              placeholder="e.g. Authentication Service"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              required
            />
            {!isEdit && (
              <div className="text-xs text-muted-foreground">
                ID:{" "}
                <code className="font-mono">
                  {form.id || slugifyForId(form.name) || "(type a name first)"}
                </code>
              </div>
            )}
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="id">Component ID</Label>
              <Input
                id="id"
                value={form.id}
                disabled
                className="font-mono"
              />
            </div>
          )}
          {!isEdit && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1">
                Advanced — customize component id
              </summary>
              <div className="mt-2 space-y-2">
                <Label htmlFor="id">Component ID (optional)</Label>
                <Input
                  id="id"
                  placeholder={
                    slugifyForId(form.name) || "auto-generated from name"
                  }
                  value={form.id}
                  onChange={(e) => updateField("id", e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the auto-generated slug. Only
                  letters, digits, dashes and underscores; this becomes
                  the YAML filename and the URL slug for the component.
                </p>
              </div>
            </details>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  updateField("type", v as Component["type"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  updateField("status", v as Component["status"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                placeholder="e.g. platform-team (optional)"
                value={form.owner}
                onChange={(e) => updateField("owner", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                placeholder="e.g. auth, security, critical"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description — single unified field. Legacy YAML with separate
          technical + business sections (and / or oneliner) is merged
          into this on load via migrateComponent; the next save persists
          only the unified field and drops the legacy ones. */}
      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
          <p className="text-sm text-muted-foreground">
            One free-form description. Capture purpose, behaviour and
            any context an analyst would want to know — for any
            audience. Existing components that still carry separate
            technical / business / one-liner content are merged into
            this single field on load; the next save persists only the
            unified text.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What does this component do? Why does it exist? Who depends on it? Anything an architect or analyst should know at a glance."
              value={form.description.description || ""}
              onChange={(e) =>
                updateField("description", {
                  ...form.description,
                  description: e.target.value,
                })
              }
              rows={8}
            />
          </div>
        </CardContent>
      </Card>

      {/* Interfaces */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateField("interfaces", [
                ...form.interfaces,
                { ...emptyInterface },
              ])
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.interfaces.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No interfaces defined yet.
            </p>
          )}
          {form.interfaces.map((iface, i) => (
            <div
              key={i}
              className="grid grid-cols-[120px_100px_1fr_1fr_40px] gap-2 items-end"
            >
              <div>
                <Label className="text-xs">Direction</Label>
                <Select
                  value={iface.direction}
                  onValueChange={(v) => updateInterface(i, "direction", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERFACE_DIRECTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select
                  value={iface.type}
                  onValueChange={(v) => updateInterface(i, "type", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONNECTOR_TYPES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Target</Label>
                <Input
                  className="h-9"
                  placeholder="Optional target"
                  value={iface.target || ""}
                  onChange={(e) => updateInterface(i, "target", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input
                  className="h-9"
                  placeholder="What it does"
                  value={iface.description}
                  onChange={(e) =>
                    updateInterface(i, "description", e.target.value)
                  }
                  required
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() =>
                  updateField(
                    "interfaces",
                    form.interfaces.filter((_, idx) => idx !== i)
                  )
                }
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Relationships */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Relationships
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-left">
                <p className="font-semibold mb-1">How this component relates to others:</p>
                <ul className="text-xs space-y-0.5">
                  <li><strong>Parent of</strong> — this component contains/owns another (e.g. platform owns a module)</li>
                  <li><strong>Child of</strong> — this component belongs to a parent (e.g. module in a platform)</li>
                  <li><strong>Depends on</strong> — requires another component to function</li>
                  <li><strong>Communicates with</strong> — exchanges data with a peer</li>
                  <li><strong>Reads from</strong> — consumes data from another component</li>
                  <li><strong>Writes to</strong> — sends data to another component</li>
                  <li><strong>Fallback for</strong> — acts as backup when another component is unavailable</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateField("relationships", [
                ...form.relationships,
                { ...emptyRelationship },
              ])
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.relationships.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No relationships defined yet.
            </p>
          )}
          {form.relationships.map((rel, i) => {
            const hideConnector = rel.type === "parent-of" || rel.type === "child-of"
            return (
            <div
              key={i}
              className="grid grid-cols-[160px_1fr_120px_1fr_40px] gap-2 items-end"
            >
              <div>
                <Label className="text-xs">Relationship</Label>
                <Select
                  value={rel.type}
                  onValueChange={(v) => {
                    updateRelationship(i, "type", v)
                    // Clear connector for non-technical relationships
                    if (v === "parent-of" || v === "child-of") {
                      updateRelationship(i, "connector", "")
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {RELATIONSHIP_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Target Component</Label>
                <Select
                  value={rel.target}
                  onValueChange={(v) => updateRelationship(i, "target", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select component..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingComponents
                      .filter((c) => c.id !== form.id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.id})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {hideConnector ? (
                <div />
              ) : (
              <div>
                <Label className="text-xs">Connector</Label>
                <Select
                  value={rel.connector || "none"}
                  onValueChange={(v) => updateRelationship(i, "connector", v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">none</span>
                    </SelectItem>
                    {CONNECTOR_TYPES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}
              <div>
                <Label className="text-xs">Description</Label>
                <Input
                  className="h-9"
                  placeholder="Optional note"
                  value={rel.description || ""}
                  onChange={(e) =>
                    updateRelationship(i, "description", e.target.value)
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() =>
                  updateField(
                    "relationships",
                    form.relationships.filter((_, idx) => idx !== i)
                  )
                }
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Capabilities
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-left">
                <p className="font-semibold mb-1">Which business capabilities this component supports — and the role it plays.</p>
                <ul className="text-xs space-y-0.5">
                  <li><strong>Owner</strong> — implements the capability</li>
                  <li><strong>Contributor</strong> — assists (e.g., logs, metrics)</li>
                  <li><strong>Consumer</strong> — uses the capability</li>
                  <li><strong>Indirect</strong> — touches it incidentally (e.g., a gateway routing requests)</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <datalist id="capability-suggestions">
            {BUSINESS_CAPABILITIES.map((cap) => (
              <option key={cap} value={cap} />
            ))}
          </datalist>
          {(form.capabilities || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No capabilities defined.
            </p>
          ) : (
            (form.capabilities || []).map((cap, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr,auto,1.5fr,auto] gap-2 items-start"
              >
                <Input
                  list="capability-suggestions"
                  placeholder="Capability name"
                  value={cap.name}
                  onChange={(e) => updateCapability(i, "name", e.target.value)}
                  className="h-9"
                />
                <Select
                  value={cap.role}
                  onValueChange={(v) =>
                    updateCapability(i, "role", v as CapabilityRole)
                  }
                >
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAPABILITY_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {CAPABILITY_ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Description (optional)"
                  value={cap.description || ""}
                  onChange={(e) =>
                    updateCapability(i, "description", e.target.value)
                  }
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() =>
                    updateField(
                      "capabilities",
                      (form.capabilities || []).filter((_, idx) => idx !== i)
                    )
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateField("capabilities", [
                ...(form.capabilities || []),
                { ...emptyCapability },
              ])
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add capability
          </Button>
        </CardContent>
      </Card>

      {/* Inputs & Outputs (data) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Inputs &amp; Outputs
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-left">
                <p className="font-semibold mb-1">What this component receives and emits, and what it owns.</p>
                <ul className="text-xs space-y-0.5">
                  <li><strong>Inputs</strong> — events / commands / data the component receives</li>
                  <li><strong>Outputs</strong> — events / decisions / documents the component emits</li>
                  <li><strong>Owns</strong> — data the component is the source-of-truth for</li>
                </ul>
                <p className="mt-2 text-xs">
                  <strong>Format kinds:</strong> table, file, stream, message, form.{" "}
                  <strong>Business kinds:</strong> event, command, document, decision, signal.{" "}
                  <strong>Technical kinds:</strong> business state, reference, cache, config, transient, logs.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {(["inputs", "outputs", "owns"] as DataBucket[]).map((bucket) => {
            const items = form.data?.[bucket] || []
            const bucketLabel =
              bucket === "inputs"
                ? "Inputs"
                : bucket === "outputs"
                ? "Outputs"
                : "Owned data"
            const bucketHint =
              bucket === "inputs"
                ? "what comes in"
                : bucket === "outputs"
                ? "what goes out"
                : "what this component is source-of-truth for"
            return (
              <div key={bucket} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">{bucketLabel}</h4>
                    <p className="text-xs text-muted-foreground">{bucketHint}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => addDataItem(bucket)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No items.</p>
                ) : (
                  items.map((item, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1.2fr,auto,1.5fr,auto] gap-2 items-start"
                    >
                      <Input
                        placeholder={
                          bucket === "inputs"
                            ? "Input name (e.g. OrderRequest)"
                            : bucket === "outputs"
                            ? "Output name (e.g. OrderCreated)"
                            : "Data name (e.g. Customer record)"
                        }
                        value={item.name}
                        onChange={(e) =>
                          updateDataItem(bucket, i, "name", e.target.value)
                        }
                        className="h-9"
                      />
                      <Select
                        value={item.kind}
                        onValueChange={(v) =>
                          updateDataItem(bucket, i, "kind", v as DataKind)
                        }
                      >
                        <SelectTrigger className="h-9 w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Format
                          </div>
                          {FORMAT_DATA_KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {DATA_KIND_LABELS[k]}
                            </SelectItem>
                          ))}
                          <div className="px-2 py-1 mt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t">
                            Business
                          </div>
                          {BUSINESS_DATA_KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {DATA_KIND_LABELS[k]}
                            </SelectItem>
                          ))}
                          <div className="px-2 py-1 mt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t">
                            Technical
                          </div>
                          {TECHNICAL_DATA_KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {DATA_KIND_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="space-y-1.5">
                        <Input
                          placeholder="Purpose (optional)"
                          value={item.purpose || ""}
                          onChange={(e) =>
                            updateDataItem(bucket, i, "purpose", e.target.value)
                          }
                          className="h-9"
                        />
                        {bucket === "inputs" && (
                          <Input
                            placeholder="Source component id (optional)"
                            value={item.source || ""}
                            onChange={(e) =>
                              updateDataItem(bucket, i, "source", e.target.value)
                            }
                            className="h-9"
                          />
                        )}
                        {bucket === "outputs" && (
                          <Input
                            placeholder="Consumers, comma-separated (optional)"
                            value={outputsConsumersInput[i] || ""}
                            onChange={(e) =>
                              setOutputsConsumersInput((prev) => ({
                                ...prev,
                                [i]: e.target.value,
                              }))
                            }
                            className="h-9"
                          />
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => removeDataItem(bucket, i)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Processes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Processes
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-left">
                <p className="font-semibold mb-1">Business processes this component participates in.</p>
                <ul className="text-xs space-y-0.5">
                  <li><strong>Owner</strong> — runs the whole process</li>
                  <li><strong>Participant</strong> — performs one or more activities</li>
                  <li><strong>Listener</strong> — observes events from the process</li>
                  <li><strong>Trigger</strong> — initiates the process</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(form.processes || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No processes defined.
            </p>
          ) : (
            (form.processes || []).map((p, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr,auto,1fr,1.2fr,auto] gap-2 items-start"
              >
                <Input
                  placeholder="Process name (e.g. Customer Onboarding)"
                  value={p.name}
                  onChange={(e) => updateProcess(i, "name", e.target.value)}
                  className="h-9"
                />
                <Select
                  value={p.role}
                  onValueChange={(v) =>
                    updateProcess(i, "role", v as ProcessRole)
                  }
                >
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROCESS_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {PROCESS_ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Activity (what it does here)"
                  value={p.activity || ""}
                  onChange={(e) => updateProcess(i, "activity", e.target.value)}
                  className="h-9"
                />
                <Input
                  placeholder="Description (optional)"
                  value={p.description || ""}
                  onChange={(e) =>
                    updateProcess(i, "description", e.target.value)
                  }
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() =>
                    updateField(
                      "processes",
                      (form.processes || []).filter((_, idx) => idx !== i)
                    )
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateField("processes", [
                ...(form.processes || []),
                { ...emptyProcess },
              ])
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add process
          </Button>
        </CardContent>
      </Card>

      {/* Rules & Calculations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Rules &amp; Calculations
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-sm text-left">
                <p className="font-semibold mb-1">Business logic this component implements:</p>
                <ul className="text-xs space-y-0.5">
                  <li><strong>Formula</strong> — a calculation, e.g. <code>premium = base * (1 + risk)</code></li>
                  <li><strong>Rule</strong> — Given / When / Then behavior</li>
                  <li><strong>Constraint</strong> — invariant that must always hold</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(form.rules || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules defined.</p>
          ) : (
            (form.rules || []).map((r, i, arr) => (
              <div
                key={i}
                className="rounded-md border bg-muted/20 p-3 space-y-2"
              >
                <div className="grid grid-cols-[1.4fr,auto,auto,auto,auto] gap-2 items-start">
                  <Input
                    placeholder="Rule name (e.g. Premium calculation)"
                    value={r.name}
                    onChange={(e) => updateRule(i, "name", e.target.value)}
                    className="h-9"
                  />
                  <Select
                    value={r.kind}
                    onValueChange={(v) => updateRule(i, "kind", v as RuleKind)}
                  >
                    <SelectTrigger className="h-9 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {RULE_KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => moveRule(i, -1)}
                    disabled={i === 0}
                    aria-label="Move rule up"
                    title="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => moveRule(i, 1)}
                    disabled={i === arr.length - 1}
                    aria-label="Move rule down"
                    title="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => removeRule(i)}
                    aria-label="Remove rule"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  {RULE_KIND_HINTS[r.kind]}
                </p>
                <Input
                  placeholder="Summary (one line)"
                  value={r.summary || ""}
                  onChange={(e) => updateRule(i, "summary", e.target.value)}
                  className="h-9"
                />
                {r.kind === "formula" && (
                  <Input
                    placeholder="Formula — e.g. premium = baseRate * (1 + riskFactor)"
                    value={r.formula || ""}
                    onChange={(e) => updateRule(i, "formula", e.target.value)}
                    className="h-9 font-mono text-xs"
                  />
                )}
                {r.kind === "rule" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Input
                      placeholder="Given (precondition)"
                      value={r.given || ""}
                      onChange={(e) => updateRule(i, "given", e.target.value)}
                      className="h-9"
                    />
                    <Input
                      placeholder="When (trigger)"
                      value={r.when || ""}
                      onChange={(e) => updateRule(i, "when", e.target.value)}
                      className="h-9"
                    />
                    <Input
                      placeholder="Then (outcome)"
                      value={r.then || ""}
                      onChange={(e) => updateRule(i, "then", e.target.value)}
                      className="h-9"
                    />
                  </div>
                )}
                {r.kind === "constraint" && (
                  <Input
                    placeholder="Enforced in — comma-separated component ids (optional)"
                    value={ruleEnforcedInput[i] || ""}
                    onChange={(e) =>
                      setRuleEnforcedInput((prev) => ({
                        ...prev,
                        [i]: e.target.value,
                      }))
                    }
                    className="h-9"
                  />
                )}
                <Textarea
                  placeholder="Detailed description (optional)"
                  value={r.description || ""}
                  onChange={(e) => updateRule(i, "description", e.target.value)}
                  rows={2}
                />
              </div>
            ))
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateField("rules", [...(form.rules || []), { ...emptyRule }])
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add rule
          </Button>
        </CardContent>
      </Card>

      {/* Non-Functional Requirements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Non-Functional Requirements
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                Define availability, performance, and data requirements. All fields are optional — fill in what you know.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nfr-availability">Availability Target</Label>
              <Input
                id="nfr-availability"
                placeholder="e.g. 99.9%"
                value={form.nfr?.availability || ""}
                onChange={(e) => updateNFR("availability", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nfr-rto">RTO (Recovery Time)</Label>
              <Input
                id="nfr-rto"
                placeholder="e.g. 4h"
                value={form.nfr?.rto || ""}
                onChange={(e) => updateNFR("rto", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nfr-rpo">RPO (Recovery Point)</Label>
              <Input
                id="nfr-rpo"
                placeholder="e.g. 1h"
                value={form.nfr?.rpo || ""}
                onChange={(e) => updateNFR("rpo", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nfr-latency">Max Latency</Label>
              <Input
                id="nfr-latency"
                placeholder="e.g. 200ms"
                value={form.nfr?.max_latency || ""}
                onChange={(e) => updateNFR("max_latency", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nfr-throughput">Throughput</Label>
              <Input
                id="nfr-throughput"
                placeholder="e.g. 1000 req/s"
                value={form.nfr?.throughput || ""}
                onChange={(e) => updateNFR("throughput", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Classification</Label>
              <Select
                value={form.nfr?.data_classification || "none"}
                onValueChange={(v) => updateNFR("data_classification", v === "none" ? "" : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Not set</span>
                  </SelectItem>
                  {DATA_CLASSIFICATIONS.map((dc) => (
                    <SelectItem key={dc} value={dc}>
                      {DATA_CLASSIFICATION_LABELS[dc]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scaling Model</Label>
              <Select
                value={form.nfr?.scaling || "_notset"}
                onValueChange={(v) => updateNFR("scaling", v === "_notset" ? "" : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_notset">
                    <span className="text-muted-foreground">Not set</span>
                  </SelectItem>
                  {SCALING_MODELS.map((sm) => (
                    <SelectItem key={sm} value={sm}>
                      {sm.charAt(0).toUpperCase() + sm.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risks */}
      <Card>
        <CardHeader>
          <CardTitle>Risks</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="One risk per line..."
            value={risksInput}
            onChange={(e) => setRisksInput(e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      </fieldset>

      {/* Save-conflict modal — surfaced when the server returns 409
          (someone else edited or holds the lock). User chooses Reload
          (re-fetch + replace form state, losing unsaved local edits)
          or Cancel (keep the form state and try saving again later). */}
      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Component changed by another user
            </DialogTitle>
            <DialogDescription className="text-sm pt-2">
              {conflictMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setConflictOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConflictOpen(false)
                if (initialData?.id) {
                  router.push(`/component/${initialData.id}`)
                  router.refresh()
                }
              }}
            >
              Reload
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Submit lives in the page header — see edit/[id]/page.tsx and
          new/page.tsx, which render Cancel + Save buttons that target
          this form via `<button type="submit" form={formId}>`. The
          old bottom-of-form buttons were too easy to miss on a long
          form. */}
    </form>
  )
}
