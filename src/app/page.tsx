"use client"

import { useEffect, useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ComponentCard } from "@/components/ComponentCard"
import { COMPONENT_TYPES, COMPONENT_STATUSES, TYPE_LABELS, TYPE_COLORS } from "@/lib/constants"
import type { Component, ComponentType } from "@/lib/types"
import { Search, LayoutGrid, List, Plus, Download, Grid3X3, Group } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TypeIcon } from "@/components/TypeIcon"
import { TypeModelDialog } from "@/components/TypeModelDialog"
import Link from "next/link"

type ViewMode = "grid" | "list" | "compact"

export default function CatalogPage() {
  const [components, setComponents] = useState<Component[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [ownerFilter, setOwnerFilter] = useState<string>("all")
  const [tagFilter, setTagFilter] = useState<string>("all")
  const [view, setView] = useState<ViewMode>("grid")
  const [isGrouped, setIsGrouped] = useState(false)

  useEffect(() => {
    fetch("/api/components")
      .then((r) => r.json())
      .then(setComponents)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const allOwners = useMemo(
    () => Array.from(new Set(components.map((c) => c.owner).filter(Boolean))).sort(),
    [components]
  )

  const allTags = useMemo(
    () => Array.from(new Set(components.flatMap((c) => c.tags))).sort(),
    [components]
  )

  const filtered = useMemo(() => {
    return components.filter((c) => {
      const matchesSearch =
        !search ||
        c.id.toLowerCase().includes(search.toLowerCase()) ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.description.oneliner.toLowerCase().includes(search.toLowerCase())

      const matchesType = typeFilter === "all" || c.type === typeFilter
      const matchesStatus = statusFilter === "all" || c.status === statusFilter
      const matchesOwner = ownerFilter === "all" || c.owner === ownerFilter
      const matchesTag = tagFilter === "all" || c.tags.includes(tagFilter)

      return matchesSearch && matchesType && matchesStatus && matchesOwner && matchesTag
    })
  }, [components, search, typeFilter, statusFilter, ownerFilter, tagFilter])

  const grouped = useMemo(() => {
    const groups: Partial<Record<ComponentType, Component[]>> = {}
    for (const c of filtered) {
      if (!groups[c.type]) groups[c.type] = []
      groups[c.type]!.push(c)
    }
    return COMPONENT_TYPES
      .filter((t) => groups[t] && groups[t]!.length > 0)
      .map((t) => ({ type: t, components: groups[t]! }))
  }, [filtered])

  const viewButtons: { mode: ViewMode; icon: typeof LayoutGrid; title: string }[] = [
    { mode: "grid", icon: LayoutGrid, title: "Cards" },
    { mode: "compact", icon: Grid3X3, title: "Tiles" },
    { mode: "list", icon: List, title: "List" },
  ]

  function renderComponents(items: Component[]) {
    if (view === "grid") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c) => (
            <ComponentCard key={c.id} component={c} />
          ))}
        </div>
      )
    }
    if (view === "compact") {
      return (
        <div className="flex flex-wrap gap-2">
          {items.map((c) => (
            <ComponentCard key={c.id} component={c} compact />
          ))}
        </div>
      )
    }
    // list
    return (
      <div className="space-y-2">
        {items.map((c) => (
          <ComponentCard key={c.id} component={c} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Component Catalog</h1>
          <p className="text-muted-foreground mt-1">
            {components.length} components registered
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/export/drawio" download="arch-components.xml">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download Draw.io Library
            </Button>
          </a>
          <Link href="/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Component
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID, name, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {COMPONENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {COMPONENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {allOwners.length > 0 && (
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {allOwners.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {allTags.length > 0 && (
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-1 border rounded-md p-1">
          {viewButtons.map(({ mode, icon: Icon, title }) => (
            <Button
              key={mode}
              variant={view === mode ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setView(mode)}
              title={title}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
          <div className="w-px bg-border mx-0.5" />
          <Button
            variant={isGrouped ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setIsGrouped(!isGrouped)}
            title="Group by type"
          >
            <Group className="h-4 w-4" />
          </Button>
        </div>
        <TypeModelDialog />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading components...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {components.length === 0
            ? "No components yet. Create your first one!"
            : "No components match your filters."}
        </div>
      ) : isGrouped ? (
        <div className="space-y-8">
          {grouped.map(({ type, components: groupComponents }) => {
            const colors = TYPE_COLORS[type]
            return (
              <div key={type}>
                <div
                  className="flex items-center gap-2 mb-3 pb-2 border-b-2"
                  style={{ borderBottomColor: colors.border }}
                >
                  <TypeIcon type={type} style={{ color: colors.text }} />
                  <h2 className="text-lg font-semibold" style={{ color: colors.text }}>
                    {TYPE_LABELS[type]}
                  </h2>
                  <span className="text-sm text-muted-foreground ml-1">
                    ({groupComponents.length})
                  </span>
                </div>
                {renderComponents(groupComponents)}
              </div>
            )
          })}
        </div>
      ) : (
        renderComponents(filtered)
      )}
    </div>
  )
}
