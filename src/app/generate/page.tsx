"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ArrowLeft, FileText, Loader2, ExternalLink, Upload, X } from "lucide-react"
import Link from "next/link"
import type { Component } from "@/lib/types"
import yaml from "js-yaml"

type GenerateResult = {
  confluenceUrl?: string
  pdfUrl?: string
  message?: string
  timeout?: boolean
  error?: string
}

export default function GeneratePage() {
  const [components, setComponents] = useState<Component[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [audience, setAudience] = useState<string>("Technical")
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [diagramFile, setDiagramFile] = useState<File | null>(null)

  useEffect(() => {
    fetch("/api/components")
      .then((r) => r.json())
      .then(setComponents)
      .catch(console.error)
  }, [])

  const selectedComponent = components.find((c) => c.id === selectedId)

  const handleGenerate = async () => {
    if (!selectedComponent) return

    setGenerating(true)
    setResult(null)

    try {
      const yamlContent = yaml.dump(selectedComponent)

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          componentId: selectedId,
          audience,
          yamlContent,
        }),
      })

      const data = await response.json()
      setResult(data)
    } catch {
      setResult({ error: "Failed to trigger generation. Check console." })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Generate Documentation</h1>
          <p className="text-muted-foreground mt-1">
            Generate architecture documentation via AI
          </p>
        </div>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generation Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Component</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select component..." />
              </SelectTrigger>
              <SelectContent>
                {components.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Technical">Technical</SelectItem>
                <SelectItem value="Business">Business</SelectItem>
                <SelectItem value="Executive">Executive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Draw.io Diagram (optional)</Label>
            {diagramFile ? (
              <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/50">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1">{diagramFile.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {(diagramFile.size / 1024).toFixed(1)} KB
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setDiagramFile(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-md border-2 border-dashed cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Click to select a .drawio file
                </span>
                <input
                  type="file"
                  accept=".drawio,.xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) setDiagramFile(file)
                    e.target.value = ""
                  }}
                />
              </label>
            )}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!selectedId || generating}
            className="w-full"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Generate
          </Button>

          {result && (
            <div className="mt-4 p-4 rounded-md border bg-muted/50">
              {result.error ? (
                <p className="text-destructive text-sm">{result.error}</p>
              ) : result.timeout ? (
                <p className="text-yellow-700 text-sm">{result.message}</p>
              ) : (
                <div className="space-y-2">
                  {result.confluenceUrl && (
                    <a
                      href={result.confluenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open in Confluence
                    </a>
                  )}
                  {result.pdfUrl && (
                    <a
                      href={result.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Download PDF
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
