import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { Layers, FileText } from "lucide-react"

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
})
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
})

export const metadata: Metadata = {
  title: "Architecture Repository",
  description: "IT Component Catalog & Architecture Documentation",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          "font-sans antialiased min-h-screen bg-background"
        )}
      >
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="container mx-auto px-4 h-14 flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <Layers className="h-5 w-5" />
              Arch Repo
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Catalog
              </Link>
              <Link
                href="/generate"
                className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <FileText className="h-3.5 w-3.5" />
                Generate
              </Link>
            </nav>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
