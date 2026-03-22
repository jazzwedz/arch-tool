"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Upload,
  Trash2,
  FileImage,
  Loader2,
  Download,
  ArrowLeft,
  Eye,
  X,
} from "lucide-react"
import Link from "next/link"
import mermaid from "mermaid"
import type { DiagramWithSha } from "@/lib/types"

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "strict",
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: "basis",
  },
})

function drawioToMermaid(xml: string): string | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, "text/xml")

    const nodes = new Map<string, string>()
    const edges: { source: string; target: string; label: string }[] = []

    const stripHtml = (s: string) =>
      s
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim()

    // Process UserObject/object wrappers (draw.io uses these for custom properties)
    doc.querySelectorAll("UserObject, object").forEach((obj) => {
      const id = obj.getAttribute("id")
      const label = obj.getAttribute("label")
      const childCell = obj.querySelector("mxCell")
      if (!id || !childCell) return

      if (childCell.getAttribute("vertex") === "1" && label) {
        nodes.set(id, stripHtml(label))
      }
      if (childCell.getAttribute("edge") === "1") {
        const source = childCell.getAttribute("source")
        const target = childCell.getAttribute("target")
        if (source && target) {
          edges.push({ source, target, label: stripHtml(label || "") })
        }
      }
    })

    // Process standalone mxCell elements (not inside UserObject)
    doc.querySelectorAll("mxCell").forEach((cell) => {
      // Skip cells that are children of UserObject/object
      if (cell.parentElement?.tagName === "UserObject" || cell.parentElement?.tagName === "object") return

      const id = cell.getAttribute("id")
      const value = cell.getAttribute("value")
      const parent = cell.getAttribute("parent")

      if (cell.getAttribute("vertex") === "1" && id && parent !== "0" && value) {
        const label = stripHtml(value)
        if (label) nodes.set(id, label)
      }

      if (cell.getAttribute("edge") === "1") {
        const source = cell.getAttribute("source")
        const target = cell.getAttribute("target")
        if (source && target) {
          edges.push({ source, target, label: stripHtml(value || "") })
        }
      }
    })

    if (nodes.size === 0) return null

    // Build mermaid flowchart
    const lines: string[] = ["graph TD"]

    // Sanitize label for mermaid (escape quotes, brackets)
    const sanitize = (s: string) =>
      s.replace(/"/g, "'").replace(/[\[\](){}]/g, " ").replace(/\s+/g, " ").trim()

    nodes.forEach((label, id) => {
      lines.push(`  ${id}["${sanitize(label)}"]`)
    })

    edges.forEach((e) => {
      if (nodes.has(e.source) && nodes.has(e.target)) {
        if (e.label) {
          lines.push(`  ${e.source} -->|${sanitize(e.label)}| ${e.target}`)
        } else {
          lines.push(`  ${e.source} --> ${e.target}`)
        }
      }
    })

    // Only return if we have edges or multiple nodes
    if (edges.length === 0 && nodes.size < 2) return null

    return lines.join("\n")
  } catch {
    return null
  }
}

function MermaidPreview({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>("")

  useEffect(() => {
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
    mermaid
      .render(id, chart)
      .then(({ svg }) => setSvg(svg))
      .catch((err) => {
        console.error("Mermaid render failed:", err)
        setSvg("")
      })
  }, [chart])

  if (!svg) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Rendering diagram...
      </div>
    )
  }

  return (
    <div
      className="flex items-center justify-center p-6 overflow-auto h-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export default function DiagramsPage() {
  const [diagrams, setDiagrams] = useState<DiagramWithSha[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [previewDiagram, setPreviewDiagram] = useState<DiagramWithSha | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDiagrams = () => {
    fetch("/api/diagrams")
      .then((r) => r.json())
      .then(setDiagrams)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDiagrams()
  }, [])

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".drawio")) {
      alert("Only .drawio files are allowed.")
      return
    }
    setUploading(true)
    try {
      const content = await file.text()
      const name = file.name.replace(/\.drawio$/i, "")

      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content }),
      })

      if (!res.ok) throw new Error("Failed to upload")
      fetchDiagrams()
    } catch (err) {
      console.error("Upload failed:", err)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (diagram: DiagramWithSha) => {
    setDeletingName(diagram.name)
    try {
      const res = await fetch(`/api/diagrams/${diagram.name}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: diagram.sha }),
      })

      if (!res.ok) throw new Error("Failed to delete")
      setDiagrams((prev) => prev.filter((d) => d.name !== diagram.name))
    } catch (err) {
      console.error("Delete failed:", err)
    } finally {
      setDeletingName(null)
    }
  }

  const handleDownload = (diagram: DiagramWithSha) => {
    const blob = new Blob([diagram.content], { type: "application/xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${diagram.name}.drawio`
    a.click()
    URL.revokeObjectURL(url)
  }

  const previewChart = previewDiagram
    ? drawioToMermaid(previewDiagram.content)
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Architecture Diagrams</h1>
          <p className="text-muted-foreground mt-1">
            Upload and manage Draw.io architecture diagrams stored in the
            repository
          </p>
        </div>
      </div>

      {/* Upload area */}
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <label className="flex flex-col items-center justify-center gap-3 p-8 rounded-md border-2 border-dashed cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
            {uploading ? (
              <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
            ) : (
              <Upload className="h-10 w-10 text-muted-foreground" />
            )}
            <div className="text-center">
              <p className="text-sm font-medium">
                {uploading ? "Uploading..." : "Click to upload a diagram"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Only .drawio files are supported
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".drawio"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                e.target.value = ""
              }}
            />
          </label>
        </CardContent>
      </Card>

      {/* Diagrams list */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="h-5 w-5" />
            Stored Diagrams
            {!loading && (
              <span className="text-sm font-normal text-muted-foreground">
                ({diagrams.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">
              Loading diagrams...
            </p>
          ) : diagrams.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No diagrams uploaded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {diagrams.map((d) => (
                <div
                  key={d.name}
                  className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted/50 transition-colors"
                >
                  <FileImage className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="font-mono text-sm flex-1">
                    {d.name}.drawio
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {(d.content.length / 1024).toFixed(1)} KB
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPreviewDiagram(d)}
                    title="Preview"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(d)}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(d)}
                    disabled={deletingName === d.name}
                    title="Delete"
                  >
                    {deletingName === d.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagram preview modal */}
      <Dialog
        open={!!previewDiagram}
        onOpenChange={(open) => !open && setPreviewDiagram(null)}
      >
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 [&>button:last-child]:hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-gray-50">
            <div className="flex items-center gap-2">
              <FileImage className="h-5 w-5" />
              <DialogTitle className="text-lg font-semibold">
                {previewDiagram?.name}.drawio
              </DialogTitle>
              <span className="text-xs text-muted-foreground ml-2">
                Simplified preview (mermaid)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {previewDiagram && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(previewDiagram)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewDiagram(null)}
              >
                <X className="h-4 w-4 mr-1" />
                Close
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden bg-white">
            {previewChart ? (
              <MermaidPreview chart={previewChart} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Could not parse diagram for preview. Download the .drawio file to view it in Draw.io.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
