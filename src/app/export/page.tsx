"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, FileBox } from "lucide-react"

export default function ExportPage() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Export for Draw.io</h1>
        <p className="text-muted-foreground mt-1">
          Use your architecture components as a custom library in Draw.io
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileBox className="h-5 w-5" />
            How to use
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside space-y-3 text-sm">
            <li>
              Click <strong>&quot;Download arch-components.xml&quot;</strong>{" "}
              below to get the library file.
            </li>
            <li>
              In Draw.io, go to{" "}
              <strong>Extras → Edit Diagram Libraries → Import</strong>.
            </li>
            <li>
              Select the downloaded <code>arch-components.xml</code> file.
            </li>
            <li>
              Your components will appear in the left panel as a{" "}
              <strong>Custom Library</strong>.
            </li>
            <li>
              When the catalog is updated, download again and re-import to get
              the latest components.
            </li>
          </ol>
        </CardContent>
      </Card>

      <a href="/api/export/drawio" download="arch-components.xml">
        <Button size="lg" className="w-full sm:w-auto">
          <Download className="h-4 w-4 mr-2" />
          Download arch-components.xml
        </Button>
      </a>
    </div>
  )
}
