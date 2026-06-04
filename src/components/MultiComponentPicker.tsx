"use client"

// Multi-value variant of ComponentTargetPicker — used for fields that
// hold a list of component references (e.g. data.outputs[i].consumers).
//
// UX:
//   - Selected values render as removable chips. When a chip matches an
//     existing component, the chip shows the type icon + the human name;
//     otherwise the chip shows the raw string (external label).
//   - Below the chips, a single typeahead row lets the analyst add
//     more entries. Picking from the dropdown auto-adds. Typing free
//     text and pressing Enter (or clicking Add) appends as-is — so
//     consumers / inputs that are not modelled in the catalog yet stay
//     supported.
//   - Duplicate entries are silently ignored.

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TypeIcon } from "@/components/TypeIcon"
import { X } from "lucide-react"
import {
  ComponentTargetPicker,
  type PickableComponent,
} from "@/components/ComponentTargetPicker"

interface Props {
  values: string[]
  onChange: (next: string[]) => void
  components: PickableComponent[]
  excludeId?: string
  placeholder?: string
}

export function MultiComponentPicker({
  values,
  onChange,
  components,
  excludeId,
  placeholder,
}: Props) {
  // Transient input buffer — value mid-typing, cleared on commit.
  const [buf, setBuf] = useState("")

  const add = (v: string) => {
    const t = v.trim()
    if (!t) return
    if (values.includes(t)) return
    onChange([...values, t])
    setBuf("")
  }

  const remove = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx))
  }

  const handlePickerChange = (v: string) => {
    // When the user picks a real component from the dropdown, the
    // picker emits its id. Auto-add and clear so the next pick starts
    // with an empty buffer.
    if (components.some((c) => c.id === v) && !values.includes(v)) {
      onChange([...values, v])
      setBuf("")
      return
    }
    // Otherwise (typing in progress), keep the partial text in the
    // buffer so the dropdown stays open and filters as the user types.
    setBuf(v)
  }

  const commitFreeText = () => add(buf)

  const bufMatchesKnown = !!components.find((c) => c.id === buf.trim())
  const showAddButton = buf.trim() !== "" && !bufMatchesKnown && !values.includes(buf.trim())

  return (
    <div
      className="space-y-1"
      onKeyDown={(e) => {
        // Treat Enter on free text as "commit" so the user can add
        // external labels without reaching for the mouse. Skip if a
        // child handler (the picker selecting a highlighted suggestion)
        // already prevented the default — that path is the auto-add
        // covered by handlePickerChange above.
        if (e.key !== "Enter") return
        if (e.defaultPrevented) return
        const t = buf.trim()
        if (!t) return
        if (bufMatchesKnown) return
        e.preventDefault()
        commitFreeText()
      }}
    >
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v, i) => {
            const linked = components.find((c) => c.id === v)
            return (
              <Badge
                key={`${v}-${i}`}
                variant="outline"
                className="gap-1 text-xs pl-1.5 pr-0.5 py-0.5"
              >
                {linked ? (
                  <span className="inline-flex items-center gap-1">
                    <TypeIcon
                      type={linked.type}
                      className="h-3 w-3 text-muted-foreground"
                    />
                    {linked.name}
                  </span>
                ) : (
                  <span className="font-mono">{v}</span>
                )}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="hover:bg-destructive/20 rounded-sm p-0.5"
                  title="Remove"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <ComponentTargetPicker
            value={buf}
            onChange={handlePickerChange}
            components={components}
            excludeId={excludeId}
            placeholder={placeholder ?? "Pick or type a component, then Enter"}
          />
        </div>
        {showAddButton && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={commitFreeText}
            className="h-9 shrink-0"
          >
            Add
          </Button>
        )}
      </div>
    </div>
  )
}
