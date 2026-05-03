// Convert AI-generated markdown documentation + component metadata
// into Confluence Cloud storage format.

import { marked } from "marked"
import type { Component } from "./types"
import { TYPE_LABELS, DATA_CLASSIFICATION_LABELS } from "./constants"
import { escapeXml } from "./confluence"

const ARCH_TOOL_PUBLIC_URL =
  process.env.ARCH_TOOL_PUBLIC_URL || "https://arch-tool-jaso.up.railway.app"

interface MetaFieldDef {
  key: string
  label: string
  editable: boolean
  group: "core" | "nfr"
}

const META_FIELDS: MetaFieldDef[] = [
  { key: "id", label: "Component ID", editable: false, group: "core" },
  { key: "type", label: "Type", editable: false, group: "core" },
  { key: "name", label: "Name", editable: true, group: "core" },
  { key: "status", label: "Status", editable: true, group: "core" },
  { key: "owner", label: "Owner", editable: true, group: "core" },
  { key: "tags", label: "Tags", editable: true, group: "core" },
  { key: "oneliner", label: "Description", editable: true, group: "core" },
  { key: "availability", label: "Availability Target", editable: true, group: "nfr" },
  { key: "rto", label: "RTO", editable: true, group: "nfr" },
  { key: "rpo", label: "RPO", editable: true, group: "nfr" },
  { key: "max_latency", label: "Max Latency", editable: true, group: "nfr" },
  { key: "throughput", label: "Throughput", editable: true, group: "nfr" },
  { key: "data_classification", label: "Data Classification", editable: true, group: "nfr" },
  { key: "scaling", label: "Scaling Model", editable: true, group: "nfr" },
]

export type EditableMetaKey =
  | "name"
  | "status"
  | "owner"
  | "tags"
  | "oneliner"
  | "availability"
  | "rto"
  | "rpo"
  | "max_latency"
  | "throughput"
  | "data_classification"
  | "scaling"

// Convert markdown produced by /api/generate into Confluence storage XHTML.
export async function markdownToStorage(markdown: string): Promise<string> {
  const html = await marked.parse(markdown, { async: true, gfm: true, breaks: false })
  return processCodeBlocks(html as string)
}

// Replace <pre><code class="language-X">...</code></pre> with a Confluence
// code macro so syntax highlighting works (and mermaid renders if the
// space has a mermaid plugin or a workspace renderer that consumes it).
function processCodeBlocks(html: string): string {
  return html.replace(
    /<pre><code class="language-([\w+-]+)">([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      const decoded = decodeHtmlEntities(code)
      return (
        `<ac:structured-macro ac:name="code">` +
        `<ac:parameter ac:name="language">${escapeXml(lang)}</ac:parameter>` +
        `<ac:plain-text-body><![CDATA[${cdataSafe(decoded)}]]></ac:plain-text-body>` +
        `</ac:structured-macro>`
      )
    }
  )
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function cdataSafe(s: string): string {
  // ]]> sequences need to be split.
  return s.replace(/]]>/g, "]]]]><![CDATA[>")
}

function joinTags(tags?: string[]): string {
  return (tags || []).join(", ")
}

// Build the editable properties table that goes at the top of the page.
function buildPropertiesTable(component: Component): string {
  const dataClass = component.nfr?.data_classification
  const values: Record<string, string> = {
    id: component.id,
    type: TYPE_LABELS[component.type] || component.type,
    name: component.name,
    status: component.status,
    owner: component.owner || "",
    tags: joinTags(component.tags),
    oneliner: component.description?.oneliner || "",
    availability: component.nfr?.availability || "",
    rto: component.nfr?.rto || "",
    rpo: component.nfr?.rpo || "",
    max_latency: component.nfr?.max_latency || "",
    throughput: component.nfr?.throughput || "",
    data_classification: dataClass ? DATA_CLASSIFICATION_LABELS[dataClass] || dataClass : "",
    scaling: component.nfr?.scaling || "",
  }
  const renderRows = (group: "core" | "nfr") =>
    META_FIELDS.filter((f) => f.group === group)
      .map((f) => {
        const cellClass = f.editable ? "" : ' style="color:#6b7280;"'
        const note = f.editable ? "" : " <em>(read-only)</em>"
        return (
          `<tr>` +
          `<th${cellClass}>${escapeXml(f.label)}${note}</th>` +
          `<td>${escapeXml(values[f.key] || "")}</td>` +
          `</tr>`
        )
      })
      .join("")
  return (
    `<h2>Component Properties</h2>` +
    `<p><em>Edit values in the right column. Changes pulled back into the architecture catalog when "Pull from Confluence" is clicked in arch-tool. Leave a value empty to clear it. Read-only fields are managed in arch-tool.</em></p>` +
    `<table data-arch-tool="properties"><tbody>` +
    renderRows("core") +
    `<tr><th colspan="2" style="background:#f3f4f6;font-weight:600;">Non-Functional Requirements</th></tr>` +
    renderRows("nfr") +
    `</tbody></table>`
  )
}

function buildHeaderInfo(component: Component, audienceLabel: string): string {
  const archToolUrl = `${ARCH_TOOL_PUBLIC_URL}/component/${encodeURIComponent(component.id)}`
  return (
    `<ac:structured-macro ac:name="info">` +
    `<ac:rich-text-body>` +
    `<p><strong>Source of truth:</strong> <a href="${escapeXml(archToolUrl)}">${escapeXml(component.name)} in arch-tool</a> · ` +
    `<strong>Audience:</strong> ${escapeXml(audienceLabel)} · ` +
    `<strong>Last sync:</strong> ${escapeXml(new Date().toISOString().slice(0, 10))}</p>` +
    `<p><em>This page is generated and synced from arch-tool. The Component Properties table below is the only editable section — changes there flow back to the architecture catalog. The narrative below is regenerated each time you publish.</em></p>` +
    `</ac:rich-text-body>` +
    `</ac:structured-macro>`
  )
}

function buildFooter(componentId: string): string {
  // Hidden marker as a defensive fallback; primary identification is via the
  // confluence-link side file in the arch-tool repo.
  return `<hr/><p style="color:#9ca3af;font-size:11px;">arch-tool-meta:${escapeXml(componentId)}</p>`
}

export interface BuildPageArgs {
  component: Component
  audienceLabel: string
  narrativeMarkdown: string
}

export async function buildPageBody(args: BuildPageArgs): Promise<string> {
  const narrativeStorage = await markdownToStorage(args.narrativeMarkdown)
  return [
    buildHeaderInfo(args.component, args.audienceLabel),
    buildPropertiesTable(args.component),
    `<h2>Documentation</h2>`,
    narrativeStorage,
    buildFooter(args.component.id),
  ].join("\n")
}

export function pageTitleFor(component: Component): string {
  // Confluence page titles must be unique within a space; prefix with the
  // component ID so renames don't break uniqueness.
  return `${component.name} (${component.id})`
}

export function capabilityForHierarchy(component: Component): string {
  const list = component.business_capabilities || []
  return list[0]?.trim() || "Uncategorized"
}
