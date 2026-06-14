"use client"

// Agent-team "command center" — a dark, futuristic visualization of the
// whole DSD pipeline at work: facts ingest → section writers (parallel) →
// critic panel (parallel) → lead consolidation → library. Driven by the
// job phase. Built for impact (management demos): neon nodes, flowing data
// streams, glow + scanline effects. Pure CSS, no dependencies.

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WRITER_GROUPS, CRITIC_LENSES } from "@/lib/dsd-sections"

type Phase =
  | "grounding"
  | "drafting"
  | "reviewing"
  | "revising"
  | "consolidating"
  | "saving"
  | "done"
  | string

const ORDER: Record<string, number> = {
  grounding: 0,
  drafting: 1,
  reviewing: 2,
  revising: 3,
  consolidating: 4,
  saving: 5,
  done: 6,
}

const FRIENDLY: Record<string, string> = {
  grounding: "Ingesting the solution and locking the verified facts…",
  drafting: "Section writers are composing their chapters in parallel…",
  reviewing: "The critic panel is scrutinising the draft from every angle…",
  revising: "Writers are resolving what the critics flagged…",
  consolidating: "The lead editor is fusing the sections into one document…",
  saving: "Committing the document to your DSD library…",
  done: "Document delivered.",
}

const WRITER_EMOJI = ["💼", "🏗️", "🛡️", "📋"]
const CRITIC_EMOJI = ["🔬", "🧩", "✨", "🧭"]

export function DsdProgressModal({
  open,
  phase,
  iterations,
}: {
  open: boolean
  phase: Phase
  iterations?: number
}) {
  const o = ORDER[phase] ?? 0

  const factsActive = phase === "grounding"
  const writersActive = phase === "drafting" || phase === "revising"
  const criticsActive = phase === "reviewing"
  const leadActive = phase === "consolidating"
  const libActive = phase === "saving"

  const factsDone = o > 0
  const writersDone = o > 3
  const criticsDone = o > 2
  const leadDone = o > 4
  const libDone = o > 5
  const allDone = phase === "done"

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-3xl top-16 translate-y-0 p-0 overflow-hidden border-0 bg-transparent shadow-none [&>button:last-child]:hidden">
        <div className="dsd-stage relative overflow-hidden rounded-xl">
          <div className="dsd-grid" />
          <div className="dsd-aurora" />
          <div className="dsd-scan" />

          <div className="relative px-7 pt-6 pb-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-cyan-50">
                <span className="dsd-orb" />
                <span className="tracking-wide">AI Architecture Team</span>
                <span className="ml-1 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300/70">
                  · live
                </span>
              </DialogTitle>
            </DialogHeader>

            {/* pipeline */}
            <div className="mt-7 flex items-stretch justify-between gap-1 overflow-x-auto pb-2">
              <Node emoji="📚" label="Facts" active={factsActive} done={factsDone} />
              <Link active={writersActive || writersDone} />
              <Cluster
                title="Writers"
                active={writersActive}
                done={writersDone}
                items={WRITER_GROUPS.map((g, i) => ({ emoji: WRITER_EMOJI[i] || "✍️", label: shortName(g.name) }))}
              />
              <Link active={criticsActive || criticsDone} />
              <Cluster
                title="Critics"
                active={criticsActive}
                done={criticsDone}
                items={CRITIC_LENSES.map((c, i) => ({ emoji: CRITIC_EMOJI[i] || "🔎", label: shortName(c.name) }))}
              />
              <Link active={leadActive || leadDone} />
              <Node emoji="🧩" label="Lead" active={leadActive} done={leadDone} />
              <Link active={libActive || libDone} />
              <Node emoji="💾" label="Library" active={libActive} done={libDone} />
            </div>

            {/* console */}
            <div className="mt-6 rounded-lg border border-cyan-400/20 bg-slate-950/50 px-4 py-3 font-mono text-[13px] text-cyan-100/90 backdrop-blur">
              <span className="text-emerald-400">›</span>{" "}
              <span className="dsd-type">{allDone ? "Document delivered." : FRIENDLY[phase] || "Working…"}</span>
              {phase === "revising" && iterations ? (
                <span className="ml-2 text-cyan-400/70">[pass {iterations}]</span>
              ) : null}
              <span className="dsd-cursor">▋</span>
            </div>

            {/* progress rail */}
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="dsd-rail h-full rounded-full"
                style={{ width: `${Math.min(100, Math.round((o / 6) * 100))}%` }}
              />
            </div>
          </div>
        </div>

        <style jsx>{`
          .dsd-stage {
            background:
              radial-gradient(1200px 400px at 50% -10%, rgba(56, 189, 248, 0.12), transparent 60%),
              linear-gradient(160deg, #0b1220 0%, #0a0f1c 55%, #0d1326 100%);
            box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(56, 189, 248, 0.12);
          }
          .dsd-grid {
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(rgba(56, 189, 248, 0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(56, 189, 248, 0.06) 1px, transparent 1px);
            background-size: 28px 28px;
            mask-image: radial-gradient(ellipse at 50% 30%, black 40%, transparent 85%);
          }
          .dsd-aurora {
            position: absolute;
            inset: -40%;
            background:
              radial-gradient(closest-side, rgba(99, 102, 241, 0.18), transparent),
              radial-gradient(closest-side, rgba(16, 185, 129, 0.12), transparent);
            background-position: 20% 30%, 80% 70%;
            background-repeat: no-repeat;
            background-size: 50% 50%, 45% 45%;
            animation: dsd-aurora 14s ease-in-out infinite alternate;
            filter: blur(8px);
          }
          @keyframes dsd-aurora {
            0% { transform: translate3d(-4%, -2%, 0) rotate(0deg); }
            100% { transform: translate3d(4%, 3%, 0) rotate(8deg); }
          }
          .dsd-scan {
            position: absolute;
            inset: 0;
            background: linear-gradient(to bottom, transparent 0%, rgba(56, 189, 248, 0.05) 50%, transparent 100%);
            height: 40%;
            animation: dsd-scan 5s linear infinite;
            pointer-events: none;
          }
          @keyframes dsd-scan {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(350%); }
          }
          .dsd-orb {
            width: 14px;
            height: 14px;
            border-radius: 9999px;
            background: radial-gradient(circle at 30% 30%, #a5f3fc, #06b6d4 60%, #0e7490);
            box-shadow: 0 0 12px rgba(34, 211, 238, 0.9), 0 0 24px rgba(34, 211, 238, 0.5);
            animation: dsd-breathe 2s ease-in-out infinite;
          }
          @keyframes dsd-breathe {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.25); opacity: 0.8; }
          }
          .dsd-rail {
            background: linear-gradient(90deg, #22d3ee, #6366f1, #10b981);
            background-size: 200% 100%;
            box-shadow: 0 0 14px rgba(34, 211, 238, 0.7);
            transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            animation: dsd-rail 3s linear infinite;
          }
          @keyframes dsd-rail {
            from { background-position: 0 0; }
            to { background-position: 200% 0; }
          }
          .dsd-cursor {
            animation: dsd-blink 1s steps(1) infinite;
            color: #34d399;
          }
          @keyframes dsd-blink {
            50% { opacity: 0; }
          }
          .dsd-type {
            background: linear-gradient(90deg, #67e8f9 30%, #e0f2fe 50%, #67e8f9 70%);
            background-size: 200% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            animation: dsd-type 3s linear infinite;
          }
          @keyframes dsd-type {
            from { background-position: 200% 0; }
            to { background-position: -200% 0; }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  )
}

function shortName(name: string): string {
  return name.replace(/ writer| critic/i, "")
}

function statusClass(active: boolean, done: boolean): string {
  if (active) return "dsd-node-active"
  if (done) return "dsd-node-done"
  return "dsd-node-idle"
}

function Node({ emoji, label, active, done }: { emoji: string; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1.5">
      <div className={`dsd-node ${statusClass(active, done)}`}>
        <span className="text-xl">{done && !active ? "✓" : emoji}</span>
      </div>
      <span className={`text-[10px] font-medium ${active ? "text-cyan-200" : done ? "text-emerald-300/80" : "text-slate-500"}`}>
        {label}
      </span>
      <style jsx>{`
        .dsd-node {
          height: 52px;
          width: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(15, 23, 42, 0.6);
          transition: all 0.3s ease;
        }
        .dsd-node-idle {
          filter: grayscale(0.7);
          opacity: 0.45;
        }
        .dsd-node-done {
          border-color: rgba(16, 185, 129, 0.6);
          background: rgba(6, 78, 59, 0.35);
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.25);
        }
        .dsd-node-active {
          border-color: rgba(34, 211, 238, 0.9);
          background: rgba(8, 47, 73, 0.6);
          box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.6), 0 0 18px rgba(34, 211, 238, 0.55), 0 0 36px rgba(34, 211, 238, 0.3);
          animation: dsd-node-pulse 1.3s ease-in-out infinite;
        }
        @keyframes dsd-node-pulse {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-2px) scale(1.06); }
        }
      `}</style>
    </div>
  )
}

function Cluster({
  title,
  items,
  active,
  done,
}: {
  title: string
  items: { emoji: string; label: string }[]
  active: boolean
  done: boolean
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <span
        className={`text-[9px] font-semibold uppercase tracking-[0.15em] ${
          active ? "text-cyan-300" : done ? "text-emerald-300/70" : "text-slate-600"
        }`}
      >
        {title}
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((it, i) => (
          <div
            key={i}
            className={`dsd-chip ${statusClass(active, done)}`}
            style={{ animationDelay: `${i * 0.12}s` }}
            title={it.label}
          >
            <span className="text-sm leading-none">{done && !active ? "✓" : it.emoji}</span>
            <span className="dsd-chip-label">{it.label}</span>
          </div>
        ))}
      </div>
      <style jsx>{`
        .dsd-chip {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 8px;
          border-radius: 9px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(15, 23, 42, 0.6);
          transition: all 0.3s ease;
          max-width: 92px;
        }
        .dsd-chip-label {
          font-size: 9px;
          line-height: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #cbd5e1;
        }
        .dsd-node-idle.dsd-chip {
          opacity: 0.4;
          filter: grayscale(0.7);
        }
        .dsd-node-done.dsd-chip {
          border-color: rgba(16, 185, 129, 0.55);
          background: rgba(6, 78, 59, 0.3);
        }
        .dsd-node-active.dsd-chip {
          border-color: rgba(34, 211, 238, 0.85);
          background: rgba(8, 47, 73, 0.6);
          box-shadow: 0 0 14px rgba(34, 211, 238, 0.45);
          animation: dsd-chip-pulse 1.2s ease-in-out infinite;
        }
        @keyframes dsd-chip-pulse {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.05); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function Link({ active }: { active: boolean }) {
  return (
    <div className="dsd-link relative flex min-w-[26px] flex-1 items-center self-center">
      <div className="dsd-wire" />
      {active && (
        <div className="dsd-flow">
          <span /> <span /> <span />
        </div>
      )}
      <style jsx>{`
        .dsd-link {
          height: 28px;
        }
        .dsd-wire {
          position: absolute;
          inset-inline: 0;
          top: 50%;
          height: 2px;
          transform: translateY(-50%);
          background: linear-gradient(90deg, rgba(34, 211, 238, 0.15), rgba(99, 102, 241, 0.35), rgba(16, 185, 129, 0.15));
          border-radius: 2px;
        }
        .dsd-flow {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dsd-flow span {
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: #67e8f9;
          box-shadow: 0 0 8px rgba(34, 211, 238, 0.9);
          opacity: 0;
          animation: dsd-flow 1.3s linear infinite;
        }
        .dsd-flow span:nth-child(2) { animation-delay: 0.43s; }
        .dsd-flow span:nth-child(3) { animation-delay: 0.86s; }
        @keyframes dsd-flow {
          0% { opacity: 0; transform: translateX(-6px); }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; transform: translateX(28px); }
        }
      `}</style>
    </div>
  )
}
