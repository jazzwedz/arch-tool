"use client"

// Generic "agent at work" modal — the command-center aesthetic reused for
// the single-agent AI moments (compose, rules import, doc generation,
// process draft). Synchronous calls have no real phases, so this runs in
// an indeterminate mode: the agent node(s) pulse, data streams flow, and
// the status text cycles while `open` is true. Parent closes it when the
// call resolves. Positioned high on screen.

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface AgentRunNode {
  label: string
  /** Emoji glyph for the node face. */
  icon: string
}

export function AgentRunModal({
  open,
  title,
  nodes,
  stages,
}: {
  open: boolean
  title: string
  nodes: AgentRunNode[]
  /** Cycling status lines shown in the console. */
  stages: string[]
}) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!open) {
      setTick(0)
      return
    }
    const t = setInterval(() => setTick((x) => x + 1), 1400)
    return () => clearInterval(t)
  }, [open])

  const stage = stages.length ? stages[tick % stages.length] : "Working…"
  const activeNode = nodes.length > 1 ? tick % nodes.length : 0

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl top-16 translate-y-0 p-0 overflow-hidden border-0 bg-transparent shadow-none [&>button:last-child]:hidden">
        <div className="ar-stage relative overflow-hidden rounded-xl">
          <div className="ar-grid" />
          <div className="ar-aurora" />
          <div className="ar-scan" />

          <div className="relative px-7 pt-6 pb-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-cyan-50">
                <span className="ar-orb" />
                <span className="tracking-wide">{title}</span>
                <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">· working</span>
              </DialogTitle>
            </DialogHeader>

            <div className="mt-7 flex items-center justify-center gap-1">
              <Chip icon="📥" label="Context" tone="edge" />
              <Wire />
              {nodes.map((n, i) => (
                <div key={i} className="flex items-center">
                  <AgentDot icon={n.icon} label={n.label} active={i === activeNode} />
                  {i < nodes.length - 1 && <Wire />}
                </div>
              ))}
              <Wire />
              <Chip icon="📄" label="Output" tone="edge" />
            </div>

            <div className="mt-6 rounded-lg border border-cyan-400/20 bg-slate-950/50 px-4 py-3 font-mono text-[13px] text-cyan-100/90">
              <span className="text-emerald-400">›</span> <span className="ar-type">{stage}</span>
              <span className="ar-cursor">▋</span>
            </div>

            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
              <div className="ar-rail h-full rounded-full" />
            </div>
          </div>
        </div>

        <style jsx>{`
          .ar-stage {
            background:
              radial-gradient(1000px 360px at 50% -10%, rgba(56, 189, 248, 0.12), transparent 60%),
              linear-gradient(160deg, #0b1220 0%, #0a0f1c 55%, #0d1326 100%);
            box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(56, 189, 248, 0.12);
          }
          .ar-grid {
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(rgba(56, 189, 248, 0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(56, 189, 248, 0.06) 1px, transparent 1px);
            background-size: 28px 28px;
            mask-image: radial-gradient(ellipse at 50% 30%, black 40%, transparent 85%);
          }
          .ar-aurora {
            position: absolute;
            inset: -40%;
            background:
              radial-gradient(closest-side, rgba(99, 102, 241, 0.18), transparent),
              radial-gradient(closest-side, rgba(16, 185, 129, 0.12), transparent);
            background-position: 25% 30%, 75% 70%;
            background-repeat: no-repeat;
            background-size: 50% 50%, 45% 45%;
            filter: blur(8px);
            animation: ar-aurora 14s ease-in-out infinite alternate;
          }
          @keyframes ar-aurora {
            0% { transform: translate3d(-4%, -2%, 0) rotate(0deg); }
            100% { transform: translate3d(4%, 3%, 0) rotate(8deg); }
          }
          .ar-scan {
            position: absolute;
            inset: 0;
            height: 40%;
            background: linear-gradient(to bottom, transparent, rgba(56, 189, 248, 0.05) 50%, transparent);
            animation: ar-scan 5s linear infinite;
            pointer-events: none;
          }
          @keyframes ar-scan {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(360%); }
          }
          .ar-orb {
            width: 14px;
            height: 14px;
            border-radius: 9999px;
            background: radial-gradient(circle at 30% 30%, #a5f3fc, #06b6d4 60%, #0e7490);
            box-shadow: 0 0 12px rgba(34, 211, 238, 0.9), 0 0 24px rgba(34, 211, 238, 0.5);
            animation: ar-breathe 2s ease-in-out infinite;
          }
          @keyframes ar-breathe {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.25); opacity: 0.8; }
          }
          .ar-cursor { color: #34d399; animation: ar-blink 1s steps(1) infinite; }
          @keyframes ar-blink { 50% { opacity: 0; } }
          .ar-type {
            background: linear-gradient(90deg, #67e8f9 30%, #e0f2fe 50%, #67e8f9 70%);
            background-size: 200% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            animation: ar-type 3s linear infinite;
          }
          @keyframes ar-type {
            from { background-position: 200% 0; }
            to { background-position: -200% 0; }
          }
          .ar-rail {
            width: 40%;
            background: linear-gradient(90deg, transparent, #22d3ee, #6366f1, #10b981, transparent);
            box-shadow: 0 0 14px rgba(34, 211, 238, 0.7);
            animation: ar-rail 1.6s ease-in-out infinite;
          }
          @keyframes ar-rail {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(360%); }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  )
}

function AgentDot({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div className={`ar-node ${active ? "ar-on" : "ar-idle"}`}>
        <span className="text-xl">{icon}</span>
      </div>
      <span className={`max-w-[96px] truncate text-[10px] font-medium ${active ? "text-cyan-200" : "text-slate-500"}`}>
        {label}
      </span>
      <style jsx>{`
        .ar-node {
          height: 54px;
          width: 54px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(15, 23, 42, 0.6);
          transition: all 0.3s ease;
        }
        .ar-idle { opacity: 0.5; filter: grayscale(0.6); }
        .ar-on {
          border-color: rgba(34, 211, 238, 0.9);
          background: rgba(8, 47, 73, 0.6);
          box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.6), 0 0 18px rgba(34, 211, 238, 0.55), 0 0 36px rgba(34, 211, 238, 0.3);
          animation: ar-pulse 1.3s ease-in-out infinite;
        }
        @keyframes ar-pulse {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-2px) scale(1.07); }
        }
      `}</style>
    </div>
  )
}

function Chip({ icon, label }: { icon: string; label: string; tone?: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 opacity-70">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600/40 bg-slate-900/50 text-base">
        {icon}
      </div>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  )
}

function Wire() {
  return (
    <div className="relative mx-1 h-[28px] w-7 self-center">
      <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded bg-gradient-to-r from-cyan-400/20 via-indigo-400/40 to-emerald-400/20" />
      <div className="ar-flow absolute inset-0 flex items-center gap-2">
        <span /> <span /> <span />
      </div>
      <style jsx>{`
        .ar-flow span {
          width: 5px;
          height: 5px;
          border-radius: 9999px;
          background: #67e8f9;
          box-shadow: 0 0 8px rgba(34, 211, 238, 0.9);
          opacity: 0;
          animation: ar-flow 1.3s linear infinite;
        }
        .ar-flow span:nth-child(2) { animation-delay: 0.43s; }
        .ar-flow span:nth-child(3) { animation-delay: 0.86s; }
        @keyframes ar-flow {
          0% { opacity: 0; transform: translateX(-4px); }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; transform: translateX(24px); }
        }
      `}</style>
    </div>
  )
}
