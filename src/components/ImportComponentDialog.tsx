"use client"

// Import wizard for pasting a single component YAML.
//
// Workflow:
//   1. User pastes YAML into the textarea.
//   2. Optional "Validate" runs the same validator the server uses
//      (src/lib/component-schema.ts) and surfaces errors + warnings
//      inline so the user can fix the YAML before submitting.
//   3. "Import" POSTs to /api/components/import; on success the user
//      is redirected to /component/<id>/edit. The server may rename
//      the id with a `-2` suffix on collision; the response carries
//      the final id so the redirect lands in the right place.

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Upload, AlertCircle, CheckCircle2, Info } from "lucide-react"
import { validateComponentYaml, type ValidationIssue } from "@/lib/component-schema"

interface ValidationState {
  status: "idle" | "valid" | "invalid"
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  /** When valid, the parsed name + id so the user sees what will be created. */
  preview?: { name: string; id: string; type: string }
}

const EMPTY: ValidationState = { status: "idle", errors: [], warnings: [] }

export function ImportComponentDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [yamlText, setYamlText] = useState("")
  const [check, setCheck] = useState<ValidationState>(EMPTY)
  const [importing, setImporting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  function resetAndClose() {
    setOpen(false)
    // Defer reset so the closing animation doesn't show a flash of cleared state.
    setTimeout(() => {
      setYamlText("")
      setCheck(EMPTY)
      setServerError(null)
      setImporting(false)
    }, 200)
  }

  function runValidate() {
    setServerError(null)
    if (yamlText.trim() === "") {
      setCheck({
        status: "invalid",
        errors: [{ path: "", message: "Paste some YAML first." }],
        warnings: [],
      })
      return
    }
    const result = validateComponentYaml(yamlText)
    if (result.ok) {
      setCheck({
        status: "valid",
        errors: [],
        warnings: result.warnings,
        preview: {
          name: result.value.name,
          id: result.value.id,
          type: result.value.type,
        },
      })
    } else {
      setCheck({
        status: "invalid",
        errors: result.errors,
        warnings: result.warnings,
      })
    }
  }

  async function runImport() {
    setServerError(null)
    setImporting(true)
    try {
      const r = await fetch("/api/components/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: yamlText }),
      })
      const data = (await r.json().catch(() => null)) as
        | { success?: boolean; id?: string; renamed?: boolean; error?: string; issues?: ValidationIssue[]; warnings?: ValidationIssue[] }
        | null

      if (!r.ok) {
        if (data?.issues && Array.isArray(data.issues)) {
          // Server-side validation rejection: replace local check state
          // with the server's view so the user sees the same errors.
          setCheck({
            status: "invalid",
            errors: data.issues,
            warnings: data.warnings ?? [],
          })
        }
        setServerError(data?.error || `Import failed (${r.status})`)
        return
      }

      if (data?.success && typeof data.id === "string") {
        // Redirect to the edit page so the user can immediately tweak
        // the imported component. resetAndClose runs before the navigation
        // — fine, the dialog will unmount when the route changes anyway.
        router.push(`/component/${encodeURIComponent(data.id)}/edit`)
        resetAndClose()
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import component</DialogTitle>
          <DialogDescription>
            Paste a single component as YAML. Only <code>name</code> is required —
            <code> id</code> is auto-generated from the name. See{" "}
            <a href="/architecture.html" className="underline" target="_blank" rel="noreferrer">
              the model sheet
            </a>{" "}
            for the full schema.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={yamlText}
          onChange={(e) => {
            setYamlText(e.target.value)
            // Any edit invalidates the previous check result.
            if (check.status !== "idle") setCheck(EMPTY)
            if (serverError) setServerError(null)
          }}
          placeholder={`name: Order Service\ntype: service\nowner: payments-team\ndescription:\n  description: |\n    Handles the order lifecycle from cart to fulfilment.\n`}
          spellCheck={false}
          className="font-mono text-xs min-h-[280px] w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />

        {check.status === "valid" && check.preview && (
          <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 font-medium text-green-900">
              <CheckCircle2 className="h-4 w-4" />
              Valid. Will create:
            </div>
            <div className="text-green-900 pl-6">
              <div>
                <span className="text-green-700">name:</span> {check.preview.name}
              </div>
              <div>
                <span className="text-green-700">id:</span> <code>{check.preview.id}</code>
              </div>
              <div>
                <span className="text-green-700">type:</span> {check.preview.type}
              </div>
            </div>
            {check.warnings.length > 0 && <IssueList kind="warning" items={check.warnings} />}
          </div>
        )}

        {check.status === "invalid" && (
          <div className="space-y-2">
            <IssueList kind="error" items={check.errors} />
            {check.warnings.length > 0 && <IssueList kind="warning" items={check.warnings} />}
          </div>
        )}

        {serverError && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>{serverError}</div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={runValidate} disabled={importing}>
            Validate
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={resetAndClose} disabled={importing}>
              Cancel
            </Button>
            <Button type="button" onClick={runImport} disabled={importing || yamlText.trim() === ""}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function IssueList({
  kind,
  items,
}: {
  kind: "error" | "warning"
  items: ValidationIssue[]
}) {
  const tone =
    kind === "error"
      ? "border-red-300 bg-red-50 text-red-900"
      : "border-amber-300 bg-amber-50 text-amber-900"
  const Icon = kind === "error" ? AlertCircle : Info
  const label = kind === "error" ? "Errors" : "Warnings"
  return (
    <div className={`rounded-md border p-3 text-sm space-y-1 ${tone}`}>
      <div className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4" />
        {label} ({items.length})
      </div>
      <ul className="pl-6 list-disc space-y-0.5">
        {items.map((it, i) => (
          <li key={i}>
            {it.path && (
              <>
                <code className="font-mono text-xs">{it.path}</code> —{" "}
              </>
            )}
            {it.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
