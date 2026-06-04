"use client"

// Form card — link this component to an entity in the external data
// model registry. Only rendered when the component type is `table`
// and the integration is enabled on the deployment (config is
// surfaced via a one-shot /api/healthcheck/data-model call).
//
// Persists as `data_model.entity` on the component YAML. There is no
// stored copy of the entity attributes — the detail page fetches
// them live so the registry stays the source of truth.

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Database, Unlink } from "lucide-react"

interface Props {
  entity: string | undefined
  onChange: (entity: string | undefined) => void
}

export function DataModelLinkCard({ entity, onChange }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [zone, setZone] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState(entity || "")

  useEffect(() => {
    setDraft(entity || "")
  }, [entity])

  // One-shot probe so the form silently hides when the integration is
  // off, without forcing the operator to flip a UI block toggle.
  useEffect(() => {
    let cancelled = false
    fetch("/api/healthcheck/data-model", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setEnabled(!!data.configured)
        if (typeof data.zone === "string") setZone(data.zone)
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (enabled === null) return null
  if (!enabled) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          Data model registry link
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Optional. Link this <code>table</code> component to an entity in
          the external data model registry. The catalog stores only the
          entity name; attributes and relationships are fetched live on
          the detail page so the registry remains the source of truth.
          {zone && (
            <>
              {" "}Active zone:{" "}
              <code className="font-mono">{zone}</code>.
            </>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="data-model-entity">Entity name</Label>
          <div className="flex items-center gap-2">
            <Input
              id="data-model-entity"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                const trimmed = e.target.value.trim()
                onChange(trimmed || undefined)
              }}
              placeholder="ENTITY_NAME"
              className="font-mono uppercase"
            />
            {draft && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft("")
                  onChange(undefined)
                }}
                title="Remove the registry link"
              >
                <Unlink className="h-3.5 w-3.5 mr-1" />
                Unlink
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Case-sensitive identifier as the registry knows it. Saved as
            <code className="font-mono"> data_model.entity</code> on the
            component YAML.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
