"use client"

// Fancy progress modal for the Agent-team DSD generation. Shows the two
// agents (Writer & Critic) and which one is working right now, with light
// HTML/CSS animation, so the analyst sees the AI team at work. Driven by
// the job's current phase.

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sparkles } from "lucide-react"

type Phase = "grounding" | "drafting" | "reviewing" | "revising" | "consolidating" | "saving" | "done" | string

const STEPS: { key: Phase; label: string; icon: string }[] = [
  { key: "grounding", label: "Gathering facts", icon: "📚" },
  { key: "drafting", label: "Writers drafting", icon: "✍️" },
  { key: "reviewing", label: "Critics reviewing", icon: "🔎" },
  { key: "revising", label: "Writers revising", icon: "✏️" },
  { key: "consolidating", label: "Lead consolidating", icon: "🧩" },
  { key: "saving", label: "Saving", icon: "💾" },
]

const FRIENDLY: Record<string, string> = {
  grounding: "Reading the solution and pulling the verified facts…",
  drafting: "The section writers are composing their chapters from the facts…",
  reviewing: "The critic panel is checking the draft from every angle…",
  revising: "The writers are fixing what the critics flagged…",
  consolidating: "The lead editor is stitching it into one coherent document…",
  saving: "Filing it into your DSD library…",
  done: "Done!",
}

export function DsdProgressModal({
  open,
  phase,
  iterations,
}: {
  open: boolean
  phase: Phase
  iterations?: number
}) {
  const activeIndex = phase === "done" ? STEPS.length : STEPS.findIndex((s) => s.key === phase)
  const writerActive = phase === "drafting" || phase === "revising" || phase === "consolidating"
  const criticActive = phase === "reviewing"
  const flow: "none" | "toCritic" | "toWriter" =
    phase === "reviewing" ? "toCritic" : phase === "revising" ? "toWriter" : "none"

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-xl top-20 translate-y-0 [&>button:last-child]:hidden overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600 dsd-spark" />
            Your AI team is writing the DSD
          </DialogTitle>
        </DialogHeader>

        {/* agents scene */}
        <div className="relative flex items-center justify-between gap-4 py-6">
          <Agent emoji="✍️" name="Writers" active={writerActive} />

          {/* connector with flowing dots */}
          <div className="flex-1 relative h-10">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-blue-200 via-indigo-200 to-emerald-200 rounded" />
            {flow !== "none" && (
              <div className={`dsd-dots ${flow === "toWriter" ? "dsd-rev" : ""}`}>
                <span /> <span /> <span />
              </div>
            )}
          </div>

          <Agent emoji="🔎" name="Critics" active={criticActive} />
        </div>

        {/* stepper */}
        <div className="flex items-center justify-between gap-1 px-1">
          {STEPS.map((s, i) => {
            const done = activeIndex > i
            const active = activeIndex === i
            return (
              <div key={s.key} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-base border-2 transition-all ${
                    active
                      ? "border-blue-500 bg-blue-50 scale-110 dsd-pulse"
                      : done
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-gray-200 bg-gray-50 opacity-50"
                  }`}
                >
                  {done ? "✓" : s.icon}
                </div>
                <span
                  className={`text-[10px] text-center leading-tight ${
                    active ? "text-blue-700 font-medium" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* status line */}
        <div className="mt-4 text-center text-sm text-muted-foreground">
          <span className="dsd-shimmer">{FRIENDLY[phase] || "Working…"}</span>
          {phase === "revising" && iterations ? (
            <span className="ml-1 text-xs">(round {iterations})</span>
          ) : null}
        </div>

        <style jsx>{`
          .dsd-spark {
            animation: dsd-spin 2.4s linear infinite;
          }
          @keyframes dsd-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .dsd-pulse {
            animation: dsd-pulse 1.1s ease-in-out infinite;
          }
          @keyframes dsd-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.45); }
            50% { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
          }
          .dsd-dots {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .dsd-dots span {
            width: 8px;
            height: 8px;
            border-radius: 9999px;
            background: #6366f1;
            opacity: 0;
            animation: dsd-flow 1.4s linear infinite;
          }
          .dsd-dots span:nth-child(2) { animation-delay: 0.45s; }
          .dsd-dots span:nth-child(3) { animation-delay: 0.9s; }
          .dsd-dots.dsd-rev { flex-direction: row-reverse; }
          @keyframes dsd-flow {
            0% { opacity: 0; transform: translateX(0); }
            15% { opacity: 1; }
            85% { opacity: 1; }
            100% { opacity: 0; transform: translateX(60px); }
          }
          .dsd-rev span { animation-name: dsd-flow-rev; }
          @keyframes dsd-flow-rev {
            0% { opacity: 0; transform: translateX(0); }
            15% { opacity: 1; }
            85% { opacity: 1; }
            100% { opacity: 0; transform: translateX(-60px); }
          }
          .dsd-shimmer {
            background: linear-gradient(90deg, #6b7280 25%, #111827 50%, #6b7280 75%);
            background-size: 200% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            animation: dsd-shimmer 2s linear infinite;
          }
          @keyframes dsd-shimmer {
            from { background-position: 200% 0; }
            to { background-position: -200% 0; }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  )
}

function Agent({ emoji, name, active }: { emoji: string; name: string; active: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div
        className={`h-16 w-16 rounded-full flex items-center justify-center text-3xl border-2 transition-all duration-300 ${
          active
            ? "border-blue-500 bg-blue-50 scale-110 dsd-pulse"
            : "border-gray-200 bg-gray-50 grayscale opacity-60"
        }`}
      >
        {emoji}
      </div>
      <span className={`text-xs font-medium ${active ? "text-blue-700" : "text-muted-foreground"}`}>
        {name}
      </span>
      {active && <span className="text-[10px] text-blue-600">working…</span>}
    </div>
  )
}
