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
} from "@/lib/constants"
import type {
  Component,
  ComponentInterface,
  ComponentDependency,
} from "@/lib/types"
import { Plus, Trash2, Save, Loader2, Info } from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

interface ComponentFormProps {
  initialData?: Component & { sha?: string }
  isEdit?: boolean
}

const emptyInterface: ComponentInterface = {
  direction: "provides",
  type: "rest",
  target: "",
  description: "",
}

const emptyDependency: ComponentDependency = {
  id: "",
  connector: "rest",
}

export function ComponentForm({ initialData, isEdit }: ComponentFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [existingComponents, setExistingComponents] = useState<
    { id: string; name: string }[]
  >([])

  const [form, setForm] = useState<Component>({
    id: "",
    name: "",
    type: "microservice",
    status: "draft",
    owner: "",
    tags: [],
    description: { oneliner: "", technical: "", business: "" },
    interfaces: [],
    dependencies: [],
    risks: [],
    ...(initialData || {}),
  })

  const [tagsInput, setTagsInput] = useState(
    initialData?.tags?.join(", ") || ""
  )
  const [risksInput, setRisksInput] = useState(
    initialData?.risks?.join("\n") || ""
  )

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

  const updateDependency = (
    index: number,
    field: keyof ComponentDependency,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      dependencies: prev.dependencies.map((dep, i) =>
        i === index ? { ...dep, [field]: value } : dep
      ),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const component: Component = {
      ...form,
      tags: tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      risks: risksInput
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean),
    }

    try {
      if (isEdit && initialData?.sha) {
        await fetch(`/api/components/${component.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...component, sha: initialData.sha }),
        })
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="id">Component ID</Label>
              <Input
                id="id"
                placeholder="e.g. auth-service"
                value={form.id}
                onChange={(e) => updateField("id", e.target.value)}
                disabled={isEdit}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. Authentication Service"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
              />
            </div>
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
                placeholder="e.g. platform-team"
                value={form.owner}
                onChange={(e) => updateField("owner", e.target.value)}
                required
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

      {/* Descriptions */}
      <Card>
        <CardHeader>
          <CardTitle>Descriptions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="oneliner">One-liner</Label>
            <Input
              id="oneliner"
              placeholder="Short description..."
              value={form.description.oneliner}
              onChange={(e) =>
                updateField("description", {
                  ...form.description,
                  oneliner: e.target.value,
                })
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="technical">Technical Description</Label>
            <Textarea
              id="technical"
              placeholder="Detailed technical description..."
              value={form.description.technical}
              onChange={(e) =>
                updateField("description", {
                  ...form.description,
                  technical: e.target.value,
                })
              }
              rows={3}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business">Business Description</Label>
            <Textarea
              id="business"
              placeholder="Business-friendly description..."
              value={form.description.business}
              onChange={(e) =>
                updateField("description", {
                  ...form.description,
                  business: e.target.value,
                })
              }
              rows={3}
              required
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

      {/* Dependencies */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Dependencies
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                Other components this one depends on to function. If a dependency is unavailable, this component may be degraded or non-functional. Each dependency links to the target component and shows the connection type used.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateField("dependencies", [
                ...form.dependencies,
                { ...emptyDependency },
              ])
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.dependencies.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No dependencies defined yet.
            </p>
          )}
          {form.dependencies.map((dep, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_120px_40px] gap-2 items-end"
            >
              <div>
                <Label className="text-xs">Component</Label>
                <Select
                  value={dep.id}
                  onValueChange={(v) => updateDependency(i, "id", v)}
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
              <div>
                <Label className="text-xs">Connector</Label>
                <Select
                  value={dep.connector}
                  onValueChange={(v) => updateDependency(i, "connector", v)}
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() =>
                  updateField(
                    "dependencies",
                    form.dependencies.filter((_, idx) => idx !== i)
                  )
                }
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
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

      {/* Submit */}
      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {isEdit ? "Update Component" : "Create Component"}
        </Button>
      </div>
    </form>
  )
}
