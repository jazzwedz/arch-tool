// Confluence Cloud REST API v2 adapter.
// Uses Basic auth (email + API token).
// Storage format only (no ADF).

const BASE = process.env.CONFLUENCE_BASE_URL
const EMAIL = process.env.CONFLUENCE_EMAIL
const TOKEN = process.env.CONFLUENCE_API_TOKEN
const SPACE_ID = process.env.CONFLUENCE_SPACE_ID

export function isConfluenceConfigured(): boolean {
  return !!(BASE && EMAIL && TOKEN && SPACE_ID)
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")
}

interface ConfluenceError {
  status: number
  message: string
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  if (!isConfluenceConfigured()) {
    throw {
      status: 500,
      message: "Confluence is not configured (set CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_ID).",
    } as ConfluenceError
  }
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    let body = ""
    try {
      body = await res.text()
    } catch {
      // ignore
    }
    throw {
      status: res.status,
      message: `Confluence ${init?.method || "GET"} ${path} → ${res.status}: ${body.slice(0, 500)}`,
    } as ConfluenceError
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export interface ConfluencePageRef {
  id: string
  title: string
  spaceId: string
  parentId?: string | null
  version: { number: number }
  webui: string
  fullUrl: string
}

export interface ConfluencePageFull extends ConfluencePageRef {
  body: string // storage format
}

function buildFullUrl(webui: string): string {
  return `${BASE}/wiki${webui}`
}

export async function getPage(pageId: string): Promise<ConfluencePageFull> {
  const data = await request<{
    id: string
    title: string
    spaceId: string
    parentId?: string
    version: { number: number }
    body: { storage: { value: string } }
    _links: { webui: string }
  }>(`/wiki/api/v2/pages/${pageId}?body-format=storage`)
  return {
    id: data.id,
    title: data.title,
    spaceId: data.spaceId,
    parentId: data.parentId,
    version: data.version,
    webui: data._links.webui,
    fullUrl: buildFullUrl(data._links.webui),
    body: data.body.storage.value,
  }
}

export async function createPage(args: {
  title: string
  storageBody: string
  parentId?: string | null
}): Promise<ConfluencePageRef> {
  const payload: Record<string, unknown> = {
    spaceId: SPACE_ID,
    status: "current",
    title: args.title,
    body: { representation: "storage", value: args.storageBody },
  }
  if (args.parentId) payload.parentId = args.parentId
  const data = await request<{
    id: string
    title: string
    spaceId: string
    parentId?: string
    version: { number: number }
    _links: { webui: string }
  }>(`/wiki/api/v2/pages`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  return {
    id: data.id,
    title: data.title,
    spaceId: data.spaceId,
    parentId: data.parentId,
    version: data.version,
    webui: data._links.webui,
    fullUrl: buildFullUrl(data._links.webui),
  }
}

export async function updatePage(args: {
  pageId: string
  title: string
  storageBody: string
  currentVersion: number
  parentId?: string | null
  message?: string
}): Promise<ConfluencePageRef> {
  const payload: Record<string, unknown> = {
    id: args.pageId,
    status: "current",
    title: args.title,
    body: { representation: "storage", value: args.storageBody },
    version: {
      number: args.currentVersion + 1,
      message: args.message || "synced from arch-tool",
    },
  }
  if (args.parentId) payload.parentId = args.parentId
  const data = await request<{
    id: string
    title: string
    spaceId: string
    parentId?: string
    version: { number: number }
    _links: { webui: string }
  }>(`/wiki/api/v2/pages/${args.pageId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  })
  return {
    id: data.id,
    title: data.title,
    spaceId: data.spaceId,
    parentId: data.parentId,
    version: data.version,
    webui: data._links.webui,
    fullUrl: buildFullUrl(data._links.webui),
  }
}

export async function deletePage(pageId: string): Promise<void> {
  await request<void>(`/wiki/api/v2/pages/${pageId}`, { method: "DELETE" })
}

// Search pages by exact title in our space.
// Returns the first match if any.
export async function findPageByTitleInSpace(
  title: string
): Promise<ConfluencePageRef | null> {
  const params = new URLSearchParams({
    "space-id": SPACE_ID!,
    title,
    limit: "5",
    "body-format": "storage",
  })
  const data = await request<{
    results: Array<{
      id: string
      title: string
      spaceId: string
      parentId?: string
      version: { number: number }
      _links: { webui: string }
    }>
  }>(`/wiki/api/v2/pages?${params.toString()}`)
  const match = data.results.find((r) => r.title === title)
  if (!match) return null
  return {
    id: match.id,
    title: match.title,
    spaceId: match.spaceId,
    parentId: match.parentId,
    version: match.version,
    webui: match._links.webui,
    fullUrl: buildFullUrl(match._links.webui),
  }
}

// Title-based fallback for finding a previously published component page.
// We use the convention: title is `${componentName} (${componentId})`.
// This finds any page in the space whose title ends with `(${componentId})`.
export async function findPageByComponentId(
  componentId: string
): Promise<ConfluencePageRef | null> {
  const suffix = `(${componentId})`
  // Iterate space pages, paginate up to ~500 pages.
  let cursor: string | undefined = undefined
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ limit: "100" })
    if (cursor) params.set("cursor", cursor)
    const data = await request<{
      results: Array<{
        id: string
        title: string
        spaceId: string
        parentId?: string
        version: { number: number }
        _links: { webui: string }
      }>
      _links?: { next?: string }
    }>(`/wiki/api/v2/spaces/${SPACE_ID}/pages?${params.toString()}`)
    const match = data.results.find((r) => r.title.endsWith(suffix))
    if (match) {
      return {
        id: match.id,
        title: match.title,
        spaceId: match.spaceId,
        parentId: match.parentId,
        version: match.version,
        webui: match._links.webui,
        fullUrl: buildFullUrl(match._links.webui),
      }
    }
    // Extract cursor from next link if present.
    const next = data._links?.next
    if (!next) break
    const m = next.match(/[?&]cursor=([^&]+)/)
    if (!m) break
    cursor = decodeURIComponent(m[1])
  }
  return null
}

// Find a page by exact title under a known parent (used to find capability folders).
export async function findOrCreateCapabilityPage(
  capabilityName: string
): Promise<ConfluencePageRef> {
  const safe = capabilityName.trim() || "Uncategorized"
  const existing = await findPageByTitleInSpace(safe)
  if (existing) return existing
  return createPage({
    title: safe,
    storageBody: `<p>Components in capability <strong>${escapeXml(safe)}</strong> are listed below.</p><p><em>Auto-created by arch-tool. Do not rename — page tree mirrors the architecture catalog.</em></p>`,
  })
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
