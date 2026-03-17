import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { componentId, audience, yamlContent } = await request.json()

    const webhookUrl = process.env.N8N_ARCH_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json(
        { error: "N8N webhook URL not configured" },
        { status: 500 }
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentId, audience, yaml: yamlContent }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`n8n responded with ${response.status}`)
      }

      const result = await response.json()
      return NextResponse.json(result)
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof DOMException && error.name === "AbortError") {
        return NextResponse.json({
          message:
            "Spracováva sa, skontroluj Confluence. Generovanie trvá dlhšie ako obvykle.",
          timeout: true,
        })
      }
      throw error
    }
  } catch (error) {
    console.error("Failed to generate doc:", error)
    return NextResponse.json(
      { error: "Failed to trigger generation" },
      { status: 500 }
    )
  }
}
