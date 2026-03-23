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
import { Badge } from "@/components/ui/badge"
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
} from "@/lib/constants"
import type {
  Component,
  ComponentInterface,
  ComponentRelationship,
  ComponentNFR,
} from "@/lib/types"
import { Plus, Trash2, Save, Loader2, Info, X } from "lucide-react"
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

const emptyRelationship: ComponentRelationship = {
  target: "",
  type: "depends-on",
  description: "",
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
    relationships: [],
    risks: [],
    business_capabilities: [],
    nfr: {},
    ...(initialData || {}),
  })

  const [tagsInput, setTagsInput] = useState(
    initialData?.tags?.join(", ") || ""
  )
  const [risksInput, setRisksInput] = useState(
    initialData?.risks?.join("\n") || ""
  )
  const [capabilitySearch, setCapabilitySearch] = useState("")

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    // Clean NFR: remove empty values
    const cleanNfr = form.nfr
      ? Object.fromEntries(Object.entries(form.nfr).filter(([, v]) => v))
      : undefined
    const hasNfr = cleanNfr && Object.keys(cleanNfr).length > 0

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
      business_capabilities: (form.business_capabilities || []).length > 0
        ? form.business_capabilities
        : undefined,
      nfr: hasNfr ? (cleanNfr as ComponentNFR) : undefined,
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

      {/* Business Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Business Capabilities
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                Which business capabilities does this component support? Select from the predefined list or type to filter.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Selected capabilities */}
          {(form.business_capabilities?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.business_capabilities!.map((cap) => (
                <Badge key={cap} variant="secondary" className="flex items-center gap-1 pr-1">
                  {cap}
                  <button
                    type="button"
                    onClick={() =>
                      updateField(
                        "business_capabilities",
                        form.business_capabilities!.filter((c) => c !== cap)
                      )
                    }
                    className="ml-0.5 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {/* Search + add */}
          <div className="space-y-1">
            <Input
              placeholder="Search capabilities..."
              value={capabilitySearch}
              onChange={(e) => setCapabilitySearch(e.target.value)}
              className="h-9"
            />
            {capabilitySearch && (
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {BUSINESS_CAPABILITIES
                  .filter(
                    (cap) =>
                      cap.toLowerCase().includes(capabilitySearch.toLowerCase()) &&
                      !(form.business_capabilities || []).includes(cap)
                  )
                  .map((cap) => (
                    <button
                      key={cap}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                      onClick={() => {
                        updateField("business_capabilities", [
                          ...(form.business_capabilities || []),
                          cap,
                        ])
                        setCapabilitySearch("")
                      }}
                    >
                      {cap}
                    </button>
                  ))}
                {BUSINESS_CAPABILITIES.filter(
                  (cap) =>
                    cap.toLowerCase().includes(capabilitySearch.toLowerCase()) &&
                    !(form.business_capabilities || []).includes(cap)
                ).length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching capabilities</p>
                )}
              </div>
            )}
          </div>
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
