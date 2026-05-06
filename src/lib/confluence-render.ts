// Convert AI-generated markdown documentation + component metadata
// into Confluence Cloud storage format.

import { marked } from "marked"
import type { Component } from "./types"
import { escapeXml } from "./confluence"

const ARCH_TOOL_PUBLIC_URL =
  process.env.ARCH_TOOL_PUBLIC_URL || "https://arch-tool-jaso.up.railway.app"

// Convert markdown produced by /api/generate into Confluence storage XHTML.
// Confluence Cloud (without a mermaid plugin) renders ```mermaid blocks as
// raw text — ugly and useless to readers. We strip them before conversion
// and replace the AI's manual table-of-contents with the native Confluence
// TOC macro, which auto-builds a clickable navigator from headings.
export async function markdownToStorage(markdown: string): Promise<string> {
  const cleaned = stripMermaidBlocks(markdown)
  const html = await marked.parse(cleaned, { async: true, gfm: true, breaks: false })
  let storage = processCodeBlocks(html as string)
  storage = replaceTableOfContents(storage)
  storage = polishParagraphs(storage)
  return storage
}

// Remove ```mermaid ... ``` fenced blocks AND any "leftover" empty paragraph
// nudges that surrounded them in the AI output (e.g., "Example format:").
function stripMermaidBlocks(markdown: string): string {
  let out = markdown
  // Strip the fenced mermaid blocks themselves.
  out = out.replace(/```mermaid[\s\S]*?```\s*/gi, "")
  // Strip prompt-leak phrases that sometimes appear when AI parrots the
  // instruction template. Keep this surgical to avoid eating real prose.
  out = out.replace(/^\s*Example format:\s*$/gim, "")
  out = out.replace(
    /(?:Include|Add)\s+a\s+mermaid\s+(?:flowchart|diagram|er\s*diagram)[^.\n]*\.?\s*/gi,
    ""
  )
  // Collapse 3+ consecutive blank lines created by the strip.
  out = out.replace(/\n{3,}/g, "\n\n")
  return out
}

// Replace <pre><code class="language-X">...</code></pre> with a Confluence
// code macro so syntax highlighting works in Confluence's native renderer.
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

// Replace the AI's hand-written "## Table of Contents" + numbered list
// with Confluence's native TOC macro. Cleaner visual, clickable, and
// auto-stays in sync with H2/H3 headings.
function replaceTableOfContents(html: string): string {
  // Match: <h2>Table of Contents</h2> followed by an <ol>/<ul>/<p> block of
  // chapters. Replace the list with the TOC macro; keep the heading.
  return html.replace(
    /<h2[^>]*>\s*Table of Contents\s*<\/h2>\s*(?:<ol[^>]*>[\s\S]*?<\/ol>|<ul[^>]*>[\s\S]*?<\/ul>|<p[^>]*>[\s\S]*?<\/p>)/i,
    `<h2>Table of Contents</h2>` +
      `<ac:structured-macro ac:name="toc">` +
      `<ac:parameter ac:name="minLevel">2</ac:parameter>` +
      `<ac:parameter ac:name="maxLevel">3</ac:parameter>` +
      `<ac:parameter ac:name="outline">false</ac:parameter>` +
      `<ac:parameter ac:name="style">none</ac:parameter>` +
      `</ac:structured-macro>`
  )
}

// Insert a soft <hr/> visual break before every numbered top-level chapter
// (e.g. "## 1. Version History") so chapters feel like separate sections
// rather than a single wall of text.
function polishParagraphs(html: string): string {
  return html.replace(
    /(<h2[^>]*>\s*\d+\.\s+[^<]+<\/h2>)/g,
    (_, heading: string) => `<hr/>${heading}`
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
