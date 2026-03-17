import type { Component, ComponentType } from "./types"

const typeStyles: Record<ComponentType, string> = {
  microservice: "rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;fontSize=11;",
  frontend:     "rounded=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;fontSize=11;",
  database:     "shape=cylinder3;fillColor=#fff2cc;strokeColor=#d6b656;fontStyle=1;fontSize=11;",
  queue:        "rounded=1;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;fontSize=11;",
  gateway:      "rhombus;fillColor=#e1d5e7;strokeColor=#9673a6;fontStyle=1;fontSize=11;",
  external:     "rounded=1;fillColor=#f5f5f5;strokeColor=#666666;fontStyle=1;fontSize=11;dashed=1;",
  platform:     "rounded=1;fillColor=#ffe6cc;strokeColor=#d79b00;fontStyle=1;fontSize=11;",
  library:      "rounded=1;fillColor=#f0f0f0;strokeColor=#999999;fontStyle=1;fontSize=11;",
}

const typeSizes: Record<ComponentType, { w: number; h: number }> = {
  microservice: { w: 120, h: 60 },
  frontend:     { w: 120, h: 60 },
  gateway:      { w: 120, h: 60 },
  database:     { w: 60,  h: 70 },
  queue:        { w: 60,  h: 60 },
  external:     { w: 120, h: 60 },
  platform:     { w: 120, h: 60 },
  library:      { w: 120, h: 60 },
}

const connectorEntries = [
  {
    title: "REST",
    xml: `<mxGraphModel><root><mxCell id='0'/><mxCell id='1' parent='0'/><mxCell id='2' parent='1' style='endArrow=block;endFill=1;strokeColor=#6c8ebf;fontSize=10;' value='REST' connector_type='rest' edge='1'><mxGeometry width='120' height='20' as='geometry'/></mxCell></root></mxGraphModel>`,
    w: 120, h: 20,
  },
  {
    title: "Async",
    xml: `<mxGraphModel><root><mxCell id='0'/><mxCell id='1' parent='0'/><mxCell id='2' parent='1' style='endArrow=block;endFill=0;dashed=1;strokeColor=#b85450;fontSize=10;' value='Async' connector_type='async' edge='1'><mxGeometry width='120' height='20' as='geometry'/></mxCell></root></mxGraphModel>`,
    w: 120, h: 20,
  },
  {
    title: "DB",
    xml: `<mxGraphModel><root><mxCell id='0'/><mxCell id='1' parent='0'/><mxCell id='2' parent='1' style='endArrow=ERmany;endFill=0;strokeColor=#d6b656;fontSize=10;' value='DB' connector_type='db' edge='1'><mxGeometry width='120' height='20' as='geometry'/></mxCell></root></mxGraphModel>`,
    w: 120, h: 20,
  },
  {
    title: "gRPC",
    xml: `<mxGraphModel><root><mxCell id='0'/><mxCell id='1' parent='0'/><mxCell id='2' parent='1' style='endArrow=block;endFill=1;strokeColor=#9673a6;fontSize=10;' value='gRPC' connector_type='grpc' edge='1'><mxGeometry width='120' height='20' as='geometry'/></mxCell></root></mxGraphModel>`,
    w: 120, h: 20,
  },
  {
    title: "File",
    xml: `<mxGraphModel><root><mxCell id='0'/><mxCell id='1' parent='0'/><mxCell id='2' parent='1' style='endArrow=open;endFill=0;dashed=1;strokeColor=#999999;fontSize=10;' value='File' connector_type='file' edge='1'><mxGeometry width='120' height='20' as='geometry'/></mxCell></root></mxGraphModel>`,
    w: 120, h: 20,
  },
  {
    title: "Human",
    xml: `<mxGraphModel><root><mxCell id='0'/><mxCell id='1' parent='0'/><mxCell id='2' parent='1' style='endArrow=open;endFill=0;dashed=1;strokeColor=#d79b00;fontSize=10;' value='Human' connector_type='human' edge='1'><mxGeometry width='120' height='20' as='geometry'/></mxCell></root></mxGraphModel>`,
    w: 120, h: 20,
  },
]

function htmlEncode(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildComponentXml(component: Component): string {
  const size = typeSizes[component.type]
  const style = typeStyles[component.type]

  const raw =
    `<mxGraphModel><root>` +
    `<mxCell id="0"/><mxCell id="1" parent="0"/>` +
    `<UserObject label="${component.id}" arch_id="${component.id}" arch_type="${component.type}" id="2">` +
    `<mxCell style="${style}" vertex="1" parent="1">` +
    `<mxGeometry height="${size.h}" width="${size.w}" as="geometry"/>` +
    `</mxCell></UserObject>` +
    `</root></mxGraphModel>`

  return htmlEncode(raw)
}

export function generateMxLibrary(components: Component[]): string {
  const componentEntries = components.map((c) => ({
    xml: buildComponentXml(c),
    w: typeSizes[c.type].w,
    h: typeSizes[c.type].h,
    title: c.id,
  }))

  // Connector entries also need HTML-encoded xml
  const encodedConnectors = connectorEntries.map((e) => ({
    ...e,
    xml: htmlEncode(e.xml),
  }))

  const allEntries = [...componentEntries, ...encodedConnectors]
  return `<mxlibrary>${JSON.stringify(allEntries)}</mxlibrary>`
}
