import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { streamStatus } from '../services/api'
import type { StreamEvent } from '../types'

// ── Step definitions ──────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'completed'

interface Step {
  key: string          // matches SSE agent name
  icon: string
  label: string
  message: string      // status message shown while this step is active
}

const SEQUENTIAL_STEPS: Step[] = [
  { key: 'cloning',   icon: '🔄', label: 'Cloning Repository',   message: 'Cloning repository from GitHub…'              },
  { key: 'parsing',   icon: '📂', label: 'Parsing Files',         message: 'Parsing files and extracting code structure…' },
  { key: 'embedding', icon: '🧠', label: 'Creating Embeddings',   message: 'Generating vector embeddings for all chunks…' },
]

const PARALLEL_STEPS: Step[] = [
  { key: 'architecture',  icon: '🏗️', label: 'Architecture Agent',  message: 'Running 5 AI agents in parallel…' },
  { key: 'documentation', icon: '📄', label: 'Documentation Agent', message: 'Running 5 AI agents in parallel…' },
  { key: 'review',        icon: '🔍', label: 'Code Review Agent',   message: 'Running 5 AI agents in parallel…' },
  { key: 'dependency',    icon: '📦', label: 'Dependency Agent',    message: 'Running 5 AI agents in parallel…' },
  { key: 'onboarding',   icon: '🚀', label: 'Onboarding Agent',    message: 'Running 5 AI agents in parallel…' },
]

const MERGE_STEP: Step = {
  key: 'merge', icon: '🔗', label: 'Merging Reports',
  message: 'Synthesizing all reports into a final intelligence report…',
}

const ALL_STEPS: Step[] = [...SEQUENTIAL_STEPS, ...PARALLEL_STEPS, MERGE_STEP]
const TOTAL = ALL_STEPS.length   // 9

// Active status message: first running step wins, fallback to last completed
function getStatusMessage(statuses: Record<string, StepStatus>): string {
  for (const step of ALL_STEPS) {
    if (statuses[step.key] === 'running') return step.message
  }
  for (const step of [...ALL_STEPS].reverse()) {
    if (statuses[step.key] === 'completed') return step.message
  }
  return 'Initializing analysis pipeline…'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepCard({ step, status }: { step: Step; status: StepStatus }) {
  const isCompleted = status === 'completed'
  const isRunning   = status === 'running'

  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-500 ${
      isCompleted ? 'border-emerald-500/30 bg-emerald-500/8'
      : isRunning ? 'border-blue-500/40 bg-blue-500/8'
      : 'border-white/8 bg-white/3'
    }`}>
      {/* Status indicator */}
      <div className="shrink-0 w-7 h-7 flex items-center justify-center">
        {isCompleted ? (
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : isRunning ? (
          <div className="relative w-6 h-6 flex items-center justify-center">
            <span className="absolute inline-flex w-full h-full rounded-full bg-blue-400 opacity-60 animate-ping" />
            <span className="relative inline-flex w-3 h-3 rounded-full bg-blue-500" />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full border-2 border-white/15 bg-white/5" />
        )}
      </div>

      {/* Icon + label */}
      <span className="text-lg leading-none select-none">{step.icon}</span>
      <span className={`text-sm font-medium flex-1 ${
        isCompleted ? 'text-emerald-300'
        : isRunning  ? 'text-blue-300'
        : 'text-gray-500'
      }`}>
        {step.label}
      </span>

      {/* Right-side state label */}
      <span className={`text-xs font-semibold shrink-0 ${
        isCompleted ? 'text-emerald-500'
        : isRunning  ? 'text-blue-400'
        : 'text-gray-600'
      }`}>
        {isCompleted ? 'Complete' : isRunning ? 'Running…' : 'Waiting'}
      </span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LoadingPage() {
  const { report_id } = useParams<{ report_id: string }>()
  const navigate     = useNavigate()
  const sourceRef    = useRef<EventSource | null>(null)

  const initialStatuses = () =>
    Object.fromEntries(ALL_STEPS.map(s => [s.key, 'pending' as StepStatus]))

  const [statuses, setStatuses]   = useState<Record<string, StepStatus>>(initialStatuses)
  const [completed, setCompleted] = useState(false)

  const completedCount = Object.values(statuses).filter(s => s === 'completed').length
  const percentage     = Math.round((completedCount / TOTAL) * 100)

  // ── Start SSE on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (!report_id) return

    const id = parseInt(report_id, 10)

    // Mark the current top-most pending step as "running" as a visual hint
    // while waiting for the first SSE event
    setStatuses(prev => {
      const next = { ...prev }
      const firstPending = ALL_STEPS.find(s => next[s.key] === 'pending')
      if (firstPending) next[firstPending.key] = 'running'
      return next
    })

    const source = streamStatus(
      id,
      (event: StreamEvent) => {
        const { agent, status: evtStatus } = event

        if (agent === 'all') return  // handled in onComplete

        setStatuses(prev => {
          const next = { ...prev }

          if (evtStatus === 'completed') {
            next[agent] = 'completed'

            // Advance "running" marker to the next pending step
            // For parallel steps, mark all parallel steps as running simultaneously
            const completedKeys = new Set(
              Object.entries(next).filter(([, v]) => v === 'completed').map(([k]) => k)
            )

            // If we just completed embedding, kick off all parallel steps
            if (agent === 'embedding') {
              PARALLEL_STEPS.forEach(s => {
                if (next[s.key] === 'pending') next[s.key] = 'running'
              })
            }

            // If all parallel done, mark merge as running
            const allParallelDone = PARALLEL_STEPS.every(s => completedKeys.has(s.key) || s.key === agent)
            if (allParallelDone && next['merge'] === 'pending') {
              next['merge'] = 'running'
            }

            // Sequential advance: cloning→parsing, parsing→embedding
            if (agent === 'cloning'   && next['parsing']   === 'pending') next['parsing']   = 'running'
            if (agent === 'parsing'   && next['embedding'] === 'pending') next['embedding'] = 'running'
          }

          return next
        })
      },
      () => {
        // onComplete — mark all as completed and navigate
        setStatuses(prev =>
          Object.fromEntries(Object.keys(prev).map(k => [k, 'completed' as StepStatus]))
        )
        setCompleted(true)
        setTimeout(() => navigate(`/results/${report_id}`), 1500)
      },
    )

    sourceRef.current = source

    return () => {
      source.close()
      sourceRef.current = null
    }
  }, [report_id, navigate])

  const statusMessage = completed ? '✓ Analysis Complete!' : getStatusMessage(statuses)

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full blur-[140px] transition-colors duration-1000 ${
          completed ? 'bg-emerald-600/15' : 'bg-blue-600/10'
        }`} />
        <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full bg-purple-600/8 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-2xl flex flex-col gap-8">

        {/* ── Header ── */}
        <div className="text-center flex flex-col items-center gap-3">
          {completed ? (
            <div className="flex flex-col items-center gap-3 animate-scale-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-8 h-8 text-emerald-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-3xl font-black text-emerald-400">Analysis Complete!</h1>
              <p className="text-gray-400 text-sm">Redirecting to your report…</p>
            </div>
          ) : (
            <>
              {/* Spinning ring */}
              <div className="relative w-14 h-14 mb-1">
                <svg className="w-14 h-14 animate-spin" style={{ animationDuration: '2s' }} viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="white" strokeOpacity="0.08" strokeWidth="4" />
                  <circle cx="28" cy="28" r="24" fill="none" stroke="url(#grad)" strokeWidth="4"
                    strokeLinecap="round" strokeDasharray="40 111" />
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Analyzing Repository…
              </h1>
            </>
          )}
        </div>

        {/* ── Progress bar ── */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs font-medium">
            <span className="text-gray-500">{completedCount} / {TOTAL} steps complete</span>
            <span className={`font-bold tabular-nums ${completed ? 'text-emerald-400' : 'text-blue-400'}`}>
              {percentage}% Complete
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                completed
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-blue-500 to-purple-600'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className={`text-xs text-center transition-colors duration-300 ${
            completed ? 'text-emerald-400 font-semibold' : 'text-gray-500'
          }`}>
            {statusMessage}
          </p>
        </div>

        {/* ── Sequential steps (3 cards) ── */}
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-1">
            Pipeline
          </h2>
          {SEQUENTIAL_STEPS.map(step => (
            <StepCard key={step.key} step={step} status={statuses[step.key] ?? 'pending'} />
          ))}
        </div>

        {/* ── Parallel agents (2×3 grid, last one centred if odd) ── */}
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-1">
            AI Agents (parallel)
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {PARALLEL_STEPS.map(step => (
              <StepCard key={step.key} step={step} status={statuses[step.key] ?? 'pending'} />
            ))}
          </div>
        </div>

        {/* ── Merge step ── */}
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-1">
            Synthesis
          </h2>
          <StepCard step={MERGE_STEP} status={statuses['merge'] ?? 'pending'} />
        </div>

        {/* ── Report ID watermark ── */}
        <p className="text-center text-xs text-gray-700 font-mono">
          Report #{report_id}
        </p>
      </div>

      {/* Keyframes injected via style tag (no Tailwind plugin needed) */}
      <style>{`
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in { animation: scale-in 0.4s cubic-bezier(.34,1.56,.64,1) both; }
      `}</style>
    </div>
  )
}
