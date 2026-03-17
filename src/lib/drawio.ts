import type { Component, ComponentType } from "./types"

const shapeStyles: Record<ComponentType, string> = {
  microservice: "shape=mxgraph.archimate3.application;whiteSpace=wrap;html=1;",
  frontend: "shape=mxgraph.archimate3.application;whiteSpace=wrap;html=1;",
  database: "shape=mxgraph.archimate3.tech;whiteSpace=wrap;html=1;",
  queue: "shape=mxgraph.archimate3.tech;whiteSpace=wrap;html=1;",
  gateway: "shape=mxgraph.archimate3.tech;whiteSpace=wrap;html=1;",
  external: "shape=mxgraph.archimate3.actor;whiteSpace=wrap;html=1;",
  platform: "shape=mxgraph.archimate3.tech;whiteSpace=wrap;html=1;",
  library: "shape=mxgraph.archimate3.application;whiteSpace=wrap;html=1;",
}

const shapeSizes: Record<ComponentType, { w: number; h: number }> = {
  microservice: { w: 120, h: 60 },
  frontend: { w: 120, h: 60 },
  gateway: { w: 120, h: 60 },
  database: { w: 60, h: 60 },
  queue: { w: 60, h: 60 },
  external: { w: 120, h: 60 },
  platform: { w: 120, h: 60 },
  library: { w: 120, h: 60 },
}

function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function buildMxGraphModel(component: Component): string {
  const size = shapeSizes[component.type]
  const fillColor = component.diagram?.color ?? "#f5f5f5"
  const style = `${shapeStyles[component.type]}fillColor=${fillColor};`
  const label = escapeXmlAttr(component.name)

  return (
    `<mxGraphModel>` +
    `<root>` +
    `<mxCell id="0"/>` +
    `<mxCell id="1" parent="0"/>` +
    `<mxCell id="2" parent="1" style="${escapeXmlAttr(style)}" value="${label}" vertex="1">` +
    `<mxGeometry height="${size.h}" width="${size.w}" as="geometry"/>` +
    `</mxCell>` +
    `</root>` +
    `</mxGraphModel>`
  )
}

export function generateMxLibrary(components: Component[]): string {
  const entries = components.map((c) => {
    const size = shapeSizes[c.type]
    const xml = buildMxGraphModel(c)

    return {
      xml: escapeXmlAttr(xml),
      w: size.w,
      h: size.h,
    }
  })

  const json = JSON.stringify(entries)
  return `<mxlibrary>${json}</mxlibrary>`
}
