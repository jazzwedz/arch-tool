// Convert AI-generated markdown documentation + component metadata
// into Confluence Cloud storage format.

import { marked } from "marked"
import type { Component } from "./types"
import { escapeXml } from "./confluence"

const ARCH_TOOL_PUBLIC_URL =
  process.env.ARCH_TOOL_PUBLIC_URL || "https://arch-tool-jaso.up.railway.app"

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

function buildHeaderInfo(component: Component, audienceLabel: string): string {
  const archToolUrl = `${ARCH_TOOL_PUBLIC_URL}/component/${encodeURIComponent(component.id)}`
  return (
    `<ac:structured-macro ac:name="info">` +
    `<ac:rich-text-body>` +
    `<p><strong>Repository information:</strong> <a href="${escapeXml(archToolUrl)}">${escapeXml(component.name)} in arch-tool</a> · ` +
    `<strong>Audience:</strong> ${escapeXml(audienceLabel)} · ` +
    `<strong>Last sync:</strong> ${escapeXml(new Date().toISOString().slice(0, 10))}</p>` +
    `<p><em>Edit anywhere on this page. When you click <strong>Pull from Confluence</strong> in arch-tool, an AI scan compares the page to the catalog and proposes precise field-level patches you can approve. The narrative is regenerated on each publish.</em></p>` +
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
  // Prefer the new rich capabilities field.
  const caps = component.capabilities || []
  if (caps.length > 0) {
    const first = caps[0].name?.trim()
    if (first) return first
  }
  // Legacy fallback for any unmigrated read path in the same request.
  const legacy =
    (component as { business_capabilities?: string[] }).business_capabilities || []
  return legacy[0]?.trim() || "Uncategorized"
}
