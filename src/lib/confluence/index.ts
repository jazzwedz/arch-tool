// Confluence provider factory — selects Cloud or Data Center based on
// the CONFLUENCE_EDITION env var.
//
//   CONFLUENCE_EDITION=cloud        → ConfluenceCloudProvider (default)
//   CONFLUENCE_EDITION=datacenter   → ConfluenceDataCenterProvider
//                                     (also accepts: "server", "dc")
//
// Cloud uses Basic auth (email + API token); Data Center uses Bearer PAT.
// Both write storage-format XHTML — the rest of the app is agnostic.

import { ConfluenceCloudProvider } from "./cloud"
import { ConfluenceDataCenterProvider } from "./datacenter"
import type { ConfluenceProvider } from "./types"

export type {
  ConfluenceProvider,
  ConfluencePageRef,
  ConfluencePageFull,
} from "./types"
export { ConfluenceHttpError } from "./types"

export type ConfluenceEdition = "cloud" | "datacenter"

let _provider: ConfluenceProvider | null = null

export function getConfluenceEdition(): ConfluenceEdition {
  const raw = (process.env.CONFLUENCE_EDITION || "cloud").toLowerCase().trim()
  if (raw === "datacenter" || raw === "server" || raw === "dc") {
    return "datacenter"
  }
  return "cloud"
}

export function isConfluenceConfigured(): boolean {
  const edition = getConfluenceEdition()
  if (edition === "cloud") {
    return !!(
      process.env.CONFLUENCE_BASE_URL &&
      process.env.CONFLUENCE_EMAIL &&
      process.env.CONFLUENCE_API_TOKEN &&
      process.env.CONFLUENCE_SPACE_ID
    )
  }
  return !!(
    process.env.CONFLUENCE_BASE_URL &&
    process.env.CONFLUENCE_PAT &&
    process.env.CONFLUENCE_SPACE_KEY
  )
}

export function getConfluenceProvider(): ConfluenceProvider {
  if (_provider) return _provider

  const edition = getConfluenceEdition()
  const baseUrl = process.env.CONFLUENCE_BASE_URL

  if (edition === "cloud") {
    const email = process.env.CONFLUENCE_EMAIL
    const apiToken = process.env.CONFLUENCE_API_TOKEN
    const spaceId = process.env.CONFLUENCE_SPACE_ID
    if (!baseUrl || !email || !apiToken || !spaceId) {
      throw new Error(
        "Confluence Cloud is not configured (set CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_ID)."
      )
    }
    _provider = new ConfluenceCloudProvider({
      baseUrl,
      email,
      apiToken,
      spaceId,
    })
    return _provider
  }

  const pat = process.env.CONFLUENCE_PAT
  const spaceKey = process.env.CONFLUENCE_SPACE_KEY
  if (!baseUrl || !pat || !spaceKey) {
    throw new Error(
      "Confluence Data Center is not configured (set CONFLUENCE_BASE_URL, CONFLUENCE_PAT, CONFLUENCE_SPACE_KEY)."
    )
  }
  _provider = new ConfluenceDataCenterProvider({ baseUrl, pat, spaceKey })
  return _provider
}

export function resetConfluenceProvider(): void {
  _provider = null
}
