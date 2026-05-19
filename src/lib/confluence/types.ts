// Confluence provider abstraction.
//
// Two backends ship in the box:
//   - cloud       — Confluence Cloud, v2 REST API, Basic auth (email + API token)
//   - datacenter  — Confluence Data Center / Server, v1 REST API, Bearer PAT
//
// Both expose the same `ConfluenceProvider` surface so callers (publish,
// pull-smart, status, etc.) don't care which edition is on the other end.
//
// `spaceId` in the page refs holds the numeric space id on Cloud and the
// space key on Data Center — it's informational only (stored in the
// per-component link side-file, never used for further API calls).

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
  body: string // storage format XHTML
}

export interface ConfluenceProvider {
  readonly edition: "cloud" | "datacenter"

  getPage(pageId: string): Promise<ConfluencePageFull>

  createPage(args: {
    title: string
    storageBody: string
    parentId?: string | null
  }): Promise<ConfluencePageRef>

  updatePage(args: {
    pageId: string
    title: string
    storageBody: string
    currentVersion: number
    parentId?: string | null
    message?: string
  }): Promise<ConfluencePageRef>

  deletePage(pageId: string): Promise<void>

  findPageByTitleInSpace(title: string): Promise<ConfluencePageRef | null>
  findPageByComponentId(componentId: string): Promise<ConfluencePageRef | null>
}

export class ConfluenceHttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ConfluenceHttpError"
    this.status = status
  }
}
