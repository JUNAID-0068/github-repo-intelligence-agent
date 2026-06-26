import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeRepo, listReports } from '../services/api'
import type { Report } from '../types'

// ── Feature pills ──────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '🏗️', label: 'Architecture' },
  { icon: '📄', label: 'API Docs' },
  { icon: '🔍', label: 'Code Review' },
  { icon: '📦', label: 'Dependencies' },
  { icon: '🚀', label: 'Onboarding' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function isValidGitHubUrl(url: string): boolean {
  return url.startsWith('https://github.com/') && url.length > 'https://github.com/'.length
}

function StatusBadge({ status }: { status: string }) {
  const isCompleted = status === 'completed'
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
        isCompleted
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
      }`}
    >
      {isCompleted ? '✓ Completed' : '⏳ Pending'}
    </span>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 shadow-2xl backdrop-blur-sm animate-fade-in">
      <span className="text-lg">⚠️</span>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 text-red-400 hover:text-red-200 text-lg leading-none">×</button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function InputPage() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [recentReports, setRecentReports] = useState<Report[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const urlError = touched && url.length > 0 && !isValidGitHubUrl(url)
  const canSubmit = isValidGitHubUrl(url) && !loading

  // Load recent reports on mount
  useEffect(() => {
    listReports()
      .then((rows) => setRecentReports((rows as Report[]).slice(0, 5)))
      .catch(() => {/* backend may not be running yet */})
      .finally(() => setReportsLoading(false))
  }, [])

  // Auto-focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setErrorMsg('')
    try {
      const { report_id } = await analyzeRepo(url.trim())
      navigate(`/loading/${report_id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">

      {/* ── Ambient glow blobs ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-xl flex flex-col items-center gap-10">

        {/* ── Header ── */}
        <header className="flex flex-col items-center gap-4 text-center">
          {/* Logo */}
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-purple-500/25">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9 text-white">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </div>

          <div>
            <h1 className="text-5xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-violet-400 to-purple-500 bg-clip-text text-transparent">
              GitHub Intelligence
            </h1>
            <p className="mt-3 text-gray-400 text-base leading-relaxed max-w-md">
              Analyze any GitHub repository in under 2 minutes using AI agents
            </p>
          </div>
        </header>

        {/* ── Input card ── */}
        <form
          onSubmit={handleSubmit}
          className="w-full rounded-2xl border border-purple-500/20 bg-[#1a1a1a] p-6 shadow-2xl shadow-purple-500/5 flex flex-col gap-5"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="repo-url" className="text-sm font-semibold text-gray-300 tracking-wide">
              GitHub Repository URL
            </label>

            <div className={`flex items-center rounded-xl border transition-colors duration-200 ${
              urlError
                ? 'border-red-500/60 bg-red-500/5'
                : 'border-white/10 bg-white/5 focus-within:border-purple-500/50 focus-within:bg-purple-500/5'
            }`}>
              <span className="pl-4 text-gray-500 text-sm select-none">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </span>
              <input
                id="repo-url"
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="https://github.com/fastapi/fastapi"
                className="flex-1 bg-transparent px-3 py-3.5 text-sm text-white placeholder-gray-600 outline-none"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {urlError && (
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <span>⚠</span> URL must start with <code className="font-mono text-red-300">https://github.com/</code>
              </p>
            )}
          </div>

          <button
            id="analyze-btn"
            type="submit"
            disabled={!canSubmit}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2.5
              ${canSubmit
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/35 hover:-translate-y-0.5 cursor-pointer'
                : 'bg-white/5 text-gray-600 cursor-not-allowed'
              }`}
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white/80" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                </svg>
                <span>Initializing analysis…</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <circle cx="11" cy="11" r="8" />
                  <path strokeLinecap="round" d="m21 21-4.35-4.35" />
                </svg>
                Analyze Repository
              </>
            )}
          </button>
        </form>

        {/* ── Feature pills ── */}
        <div className="flex flex-wrap justify-center gap-2.5">
          {FEATURES.map(({ icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-gray-400"
            >
              <span>{icon}</span>
              {label}
            </span>
          ))}
        </div>

        {/* ── Recent analyses ── */}
        <section className="w-full">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Recent Analyses
          </h2>

          {reportsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : recentReports.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">
              No analyses yet — submit your first repository above.
            </p>
          ) : (
            <div className="space-y-2">
              {recentReports.map((report) => (
                <button
                  key={report.id}
                  id={`recent-report-${report.id}`}
                  onClick={() => navigate(`/results/${report.id}`)}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-white/8 bg-[#1a1a1a] hover:border-purple-500/30 hover:bg-purple-500/5 transition-all duration-150 group text-left"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-semibold text-white truncate group-hover:text-purple-300 transition-colors">
                      {report.repo_name || report.repo_url.replace('https://github.com/', '')}
                    </span>
                    <span className="text-xs text-gray-500">
                      {[report.language, report.framework].filter(Boolean).join(' · ') || 'Detecting…'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <StatusBadge status={report.status} />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-gray-600 group-hover:text-purple-400 transition-colors">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Error toast ── */}
      {errorMsg && <Toast message={errorMsg} onClose={() => setErrorMsg('')} />}
    </div>
  )
}
