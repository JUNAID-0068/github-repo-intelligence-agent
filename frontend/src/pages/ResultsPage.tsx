import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { getReport } from '../services/api'
import type { Report } from '../types'
import DependencyGraph from '../components/DependencyGraph'

// ── API Endpoint Parser ───────────────────────────────────────────────────────

interface ParsedEndpoint {
  method: string
  path: string
  rawContent: string
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

/**
 * Parses a documentation_report markdown string and extracts individual endpoint
 * sections delimited by `### METHOD /path` headings.
 */
function parseEndpoints(markdown: string): ParsedEndpoint[] {
  if (!markdown) return []
  const endpoints: ParsedEndpoint[] = []
  // Match lines like: ### GET /foo/bar or ## POST /auth/login
  const headingRegex = /^#{2,4}\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/[^\n]*)/gm
  let match: RegExpExecArray | null
  const matches: Array<{ index: number; method: string; path: string }> = []

  while ((match = headingRegex.exec(markdown)) !== null) {
    matches.push({ index: match.index, method: match[1], path: match[2].trim() })
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end   = i + 1 < matches.length ? matches[i + 1].index : markdown.length
    endpoints.push({
      method:     matches[i].method,
      path:       matches[i].path,
      rawContent: markdown.slice(start, end).trim(),
    })
  }

  return endpoints
}

// ── HTTP Method Badge colours ──────────────────────────────────────────────────

const METHOD_STYLE: Record<string, { pill: string; dot: string }> = {
  GET:     { pill: 'bg-green-500/20 text-green-300 border-green-500/40',   dot: '#22c55e' },
  POST:    { pill: 'bg-blue-500/20 text-blue-300 border-blue-500/40',     dot: '#3b82f6' },
  PUT:     { pill: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40', dot: '#eab308' },
  DELETE:  { pill: 'bg-red-500/20 text-red-300 border-red-500/40',       dot: '#ef4444' },
  PATCH:   { pill: 'bg-purple-500/20 text-purple-300 border-purple-500/40', dot: '#a855f7' },
  HEAD:    { pill: 'bg-gray-500/20 text-gray-300 border-gray-500/40',    dot: '#6b7280' },
  OPTIONS: { pill: 'bg-teal-500/20 text-teal-300 border-teal-500/40',   dot: '#14b8a6' },
}

function methodStyle(m: string) {
  return METHOD_STYLE[m] ?? { pill: 'bg-gray-500/20 text-gray-300 border-gray-500/40', dot: '#6b7280' }
}

// ── Endpoint Card ─────────────────────────────────────────────────────────────

function EndpointCard({ ep }: { ep: ParsedEndpoint }) {
  const [open, setOpen] = useState(false)
  const { pill, dot } = methodStyle(ep.method)

  return (
    <div
      className="rounded-xl border border-white/8 overflow-hidden transition-all"
      style={{ background: `${dot}08`, borderColor: `${dot}30` }}
    >
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/4 transition-colors"
      >
        <span className={`px-2.5 py-1 rounded text-[11px] font-black border tracking-widest shrink-0 ${pill}`}>
          {ep.method}
        </span>
        <span className="font-mono text-sm text-gray-200 font-semibold flex-1 truncate">{ep.path}</span>
        <span className="text-gray-600 text-xs shrink-0">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-white/6 px-4 py-4">
          <div className="prose-invert max-w-none text-sm">
            <ReactMarkdown
              components={{
                h2: ({ children }) => <h2 className="text-base font-bold text-white mt-4 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-200 mt-3 mb-1">{children}</h3>,
                h4: ({ children }) => <h4 className="text-xs font-semibold text-gray-300 mt-2 mb-1">{children}</h4>,
                p:  ({ children }) => <p className="text-gray-300 text-sm leading-relaxed mb-3">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3 text-gray-300 text-sm">{children}</ul>,
                li: ({ children }) => <li className="text-gray-300 text-sm">{children}</li>,
                code: ({ children, className }) => {
                  const isBlock = className?.startsWith('language-')
                  return isBlock ? (
                    <code className="block bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre mb-3">
                      {children}
                    </code>
                  ) : (
                    <code className="inline bg-white/8 border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-purple-300">
                      {children}
                    </code>
                  )
                },
                pre: ({ children }) => <pre className="mb-3 rounded-lg overflow-hidden">{children}</pre>,
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-3 rounded-lg border border-white/10">
                    <table className="w-full text-xs text-gray-300">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="bg-white/8 text-gray-200 font-semibold">{children}</thead>,
                tbody: ({ children }) => <tbody className="divide-y divide-white/8">{children}</tbody>,
                tr: ({ children }) => <tr className="even:bg-white/2 hover:bg-white/4 transition-colors">{children}</tr>,
                th: ({ children }) => <th className="px-3 py-2 text-left uppercase tracking-wider text-[10px]">{children}</th>,
                td: ({ children }) => <td className="px-3 py-2">{children}</td>,
                strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-purple-500/60 pl-3 py-1 my-3 text-gray-400 italic text-xs bg-purple-500/5 rounded-r">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {/* Strip the heading line itself so it's not doubled */}
              {ep.rawContent.replace(/^#{2,4}\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+[^\n]+\n/, '')}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

// ── API Docs Tab Panel ────────────────────────────────────────────────────────

function ApiDocsPanel({ content, isProcessing }: { content: string; isProcessing: boolean }) {
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState<string>('ALL')

  const endpoints = useMemo(() => parseEndpoints(content), [content])

  const filtered = useMemo(() => {
    return endpoints.filter(ep => {
      const matchMethod = methodFilter === 'ALL' || ep.method === methodFilter
      const q = search.toLowerCase()
      const matchSearch = !q || ep.path.toLowerCase().includes(q) || ep.rawContent.toLowerCase().includes(q)
      return matchMethod && matchSearch
    })
  }, [endpoints, methodFilter, search])

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        {isProcessing ? (
          <>
            <div className="w-8 h-8 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Analysis in progress… API docs will appear when ready.</p>
          </>
        ) : (
          <p className="text-gray-600 text-sm italic">No API documentation available for this section.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Controls bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input
            id="api-docs-search"
            type="text"
            placeholder="Search endpoints or paths…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 focus:bg-white/8 transition-all"
          />
        </div>
        {/* Method filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['ALL', ...HTTP_METHODS]).map(m => {
            const { pill } = m === 'ALL'
              ? { pill: 'bg-white/8 text-gray-300 border-white/15' }
              : methodStyle(m)
            return (
              <button
                key={m}
                onClick={() => setMethodFilter(m)}
                className={`px-2.5 py-1 rounded text-[10px] font-extrabold border tracking-widest transition-all ${
                  methodFilter === m ? pill : 'bg-transparent text-gray-600 border-white/8 hover:border-white/20'
                }`}
              >
                {m}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Endpoint count ── */}
      {endpoints.length > 0 && (
        <p className="text-xs text-gray-600">
          Showing <span className="text-gray-400 font-semibold">{filtered.length}</span> of{' '}
          <span className="text-gray-400 font-semibold">{endpoints.length}</span> endpoints
        </p>
      )}

      {/* ── Endpoint cards ── */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((ep, i) => (
            <EndpointCard key={i} ep={ep} />
          ))}
        </div>
      ) : endpoints.length > 0 ? (
        <div className="flex flex-col items-center py-12 gap-2">
          <span className="text-3xl">🔎</span>
          <p className="text-gray-500 text-sm">No endpoints match your filter.</p>
          <button
            onClick={() => { setSearch(''); setMethodFilter('ALL') }}
            className="text-xs text-purple-400 hover:text-purple-300 underline"
          >Clear filters</button>
        </div>
      ) : null}

      {/* ── Full markdown fallback (always shown below cards) ── */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-xs text-gray-600 uppercase tracking-widest font-semibold px-2">Full Documentation</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>
        <MarkdownPane
          content={content}
          components={apiComponents}
          isProcessing={isProcessing}
        />
      </div>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'architecture',  label: '🏗️ Architecture'  },
  { id: 'docs',          label: '📄 API Docs'       },
  { id: 'review',        label: '🔍 Code Review'    },
  { id: 'dependencies',  label: '📦 Dependencies'   },
  { id: 'onboarding',    label: '🚀 Onboarding'     },
  { id: 'final',         label: '📋 Full Report'    },
  { id: 'raw',           label: '🗃️ Raw Data'       },
] as const

type TabId = (typeof TABS)[number]['id']

// ── Children Processor Utility ────────────────────────────────────────────────

/**
 * Utility to recursively map string leaf nodes in ReactMarkdown's children
 * array to custom processed components, while preserving active elements.
 */
function processChildren(
  children: React.ReactNode,
  processor: (text: string) => React.ReactNode
): React.ReactNode {
  if (typeof children === 'string') {
    return processor(children)
  }
  if (Array.isArray(children)) {
    return children.map((c, i) => {
      if (typeof c === 'string') {
        return <span key={i}>{processor(c)}</span>
      }
      return c
    })
  }
  return children
}

// ── Pattern Parsers ───────────────────────────────────────────────────────────

/**
 * Parses endpoints like GET /api/users, POST /auth/login, etc.
 * and replaces them with colored HTTP method badges.
 */
function parseTextWithEndpoints(text: string): React.ReactNode {
  const regex = /\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[a-zA-Z0-9_\-\/{}\[\]\:]+)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex))
    }

    const method = match[1].toUpperCase()
    const path = match[2]

    const methodColors: Record<string, string> = {
      GET: 'bg-green-500/20 text-green-300 border-green-500/30',
      POST: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      PUT: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      DELETE: 'bg-red-500/20 text-red-300 border-red-500/30',
      PATCH: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    }
    const badgeColor = methodColors[method] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'

    parts.push(
      <span key={matchIndex} className="inline-flex items-center gap-1.5 mx-1 font-mono align-middle">
        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border leading-none tracking-wide ${badgeColor}`}>
          {method}
        </span>
        <span className="text-gray-200 font-semibold text-xs bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
          {path}
        </span>
      </span>
    )

    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts.length > 0 ? <React.Fragment>{parts}</React.Fragment> : text
}

/**
 * Parses severity levels like [High], Severity: Medium, or **Low**
 * and replaces them with colored severity badges.
 */
function parseTextWithSeverity(text: string): React.ReactNode {
  const regex = /(?:severity:\s*|\[|\*\*)(high|medium|low)(?:\]|\*\*)/gi
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex))
    }

    const severity = match[1].toLowerCase()
    const label = match[1].toUpperCase()

    const severityColors: Record<string, string> = {
      high: 'bg-red-500/20 text-red-300 border-red-500/30',
      medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      low: 'bg-green-500/20 text-green-300 border-green-500/30',
    }
    const badgeColor = severityColors[severity] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'

    parts.push(
      <span key={matchIndex} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border mx-1 align-middle ${badgeColor}`}>
        {label}
      </span>
    )

    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts.length > 0 ? <React.Fragment>{parts}</React.Fragment> : text
}

/**
 * Combines both severity and endpoint parsers for combined report rendering.
 */
function parseTextWithBoth(text: string): React.ReactNode {
  const parsedSeverity = parseTextWithSeverity(text)
  if (typeof parsedSeverity === 'string') {
    return parseTextWithEndpoints(parsedSeverity)
  }
  if (React.isValidElement(parsedSeverity)) {
    const children = (parsedSeverity.props as any).children
    if (Array.isArray(children)) {
      return (
        <React.Fragment>
          {children.map((c, i) => {
            if (typeof c === 'string') {
              return <span key={i}>{parseTextWithEndpoints(c)}</span>
            }
            return c
          })}
        </React.Fragment>
      )
    }
  }
  return parsedSeverity
}

// ── Base styled components mapping ───────────────────────────────────────────

const baseComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-black text-white mt-8 mb-4 border-b border-white/10 pb-3">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold text-white mt-6 mb-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-gray-200 mt-5 mb-2">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold text-gray-300 mt-4 mb-1">{children}</h4>,
  p:  ({ children }) => <p className="text-gray-300 text-sm leading-relaxed mb-4">{children}</p>,
  ul: ({ children }) => <ul className="list-none space-y-1.5 mb-4 pl-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1.5 mb-4 text-gray-300 text-sm">{children}</ol>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-gray-300 text-sm">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
      <span>{children}</span>
    </li>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-')
    return isBlock ? (
      <code className="block bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre">
        {children}
      </code>
    ) : (
      <code className="inline bg-white/8 border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-purple-300">
        {children}
      </code>
    )
  },
  pre: ({ children }) => <pre className="mb-4 rounded-lg overflow-hidden">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-purple-500/60 pl-4 py-1 my-4 text-gray-400 italic text-sm bg-purple-500/5 rounded-r-lg">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4 rounded-lg border border-white/10">
      <table className="w-full text-sm text-gray-300">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/8 text-gray-200 font-semibold">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-white/8">{children}</tbody>,
  tr: ({ children }) => <tr className="even:bg-white/2 hover:bg-white/4 transition-colors">{children}</tr>,
  th: ({ children }) => <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider">{children}</th>,
  td: ({ children }) => <td className="px-4 py-2.5">{children}</td>,
  strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
  em: ({ children }) => <em className="text-gray-300 italic">{children}</em>,
  hr: () => <hr className="border-white/10 my-6" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">
      {children}
    </a>
  ),
}

// ── Tab specific custom mappings ──────────────────────────────────────────────

const apiComponents: Components = {
  ...baseComponents,
  h1: ({ children }) => <h1 className="text-2xl font-black text-white mt-8 mb-4 border-b border-white/10 pb-3">{processChildren(children, parseTextWithEndpoints)}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold text-white mt-6 mb-3">{processChildren(children, parseTextWithEndpoints)}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-gray-200 mt-5 mb-2">{processChildren(children, parseTextWithEndpoints)}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold text-gray-300 mt-4 mb-1">{processChildren(children, parseTextWithEndpoints)}</h4>,
  p:  ({ children }) => <p className="text-gray-300 text-sm leading-relaxed mb-4">{processChildren(children, parseTextWithEndpoints)}</p>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-gray-300 text-sm">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
      <span>{processChildren(children, parseTextWithEndpoints)}</span>
    </li>
  ),
  td: ({ children }) => <td className="px-4 py-2.5">{processChildren(children, parseTextWithEndpoints)}</td>,
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-')
    const processed = processChildren(children, parseTextWithEndpoints)
    return isBlock ? (
      <code className="block bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre">
        {processed}
      </code>
    ) : (
      <code className="inline bg-white/8 border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-purple-300">
        {processed}
      </code>
    )
  },
}

const reviewComponents: Components = {
  ...baseComponents,
  h1: ({ children }) => <h1 className="text-2xl font-black text-white mt-8 mb-4 border-b border-white/10 pb-3">{processChildren(children, parseTextWithSeverity)}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold text-white mt-6 mb-3">{processChildren(children, parseTextWithSeverity)}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-gray-200 mt-5 mb-2">{processChildren(children, parseTextWithSeverity)}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold text-gray-300 mt-4 mb-1">{processChildren(children, parseTextWithSeverity)}</h4>,
  p:  ({ children }) => <p className="text-gray-300 text-sm leading-relaxed mb-4">{processChildren(children, parseTextWithSeverity)}</p>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-gray-300 text-sm">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
      <span>{processChildren(children, parseTextWithSeverity)}</span>
    </li>
  ),
  td: ({ children }) => <td className="px-4 py-2.5">{processChildren(children, parseTextWithSeverity)}</td>,
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-')
    const processed = processChildren(children, parseTextWithSeverity)
    return isBlock ? (
      <code className="block bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre">
        {processed}
      </code>
    ) : (
      <code className="inline bg-white/8 border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-purple-300">
        {processed}
      </code>
    )
  },
}

const combinedComponents: Components = {
  ...baseComponents,
  h1: ({ children }) => <h1 className="text-2xl font-black text-white mt-8 mb-4 border-b border-white/10 pb-3">{processChildren(children, parseTextWithBoth)}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold text-white mt-6 mb-3">{processChildren(children, parseTextWithBoth)}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-gray-200 mt-5 mb-2">{processChildren(children, parseTextWithBoth)}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold text-gray-300 mt-4 mb-1">{processChildren(children, parseTextWithBoth)}</h4>,
  p:  ({ children }) => <p className="text-gray-300 text-sm leading-relaxed mb-4">{processChildren(children, parseTextWithBoth)}</p>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-gray-300 text-sm">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
      <span>{processChildren(children, parseTextWithBoth)}</span>
    </li>
  ),
  td: ({ children }) => <td className="px-4 py-2.5">{processChildren(children, parseTextWithBoth)}</td>,
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-')
    const processed = processChildren(children, parseTextWithBoth)
    return isBlock ? (
      <code className="block bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre">
        {processed}
      </code>
    ) : (
      <code className="inline bg-white/8 border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-purple-300">
        {processed}
      </code>
    )
  },
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-white/6 animate-pulse rounded-lg ${className}`} />
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] px-6 py-8 max-w-6xl mx-auto space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-12 w-96" />
      <div className="flex gap-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-7 w-24" />)}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

// ── Info Badge ────────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: 'blue' | 'green' | 'emerald' | 'gray' }) {
  const cls = {
    blue:    'bg-blue-500/15 border-blue-500/30 text-blue-300',
    green:   'bg-green-500/15 border-green-500/30 text-green-300',
    emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    gray:    'bg-white/8 border-white/15 text-gray-400',
  }[color]
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  )
}

// ── Overview stat card ────────────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-xl border border-white/8 bg-[#1a1a1a]">
      <span className="text-2xl">{icon}</span>
      <span className="text-xl font-black text-white">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 transition-all">
      {copied ? '✓ Copied!' : `📋 ${label}`}
    </button>
  )
}

// ── Markdown pane ─────────────────────────────────────────────────────────────

function MarkdownPane({
  content,
  actions,
  components = baseComponents,
  isProcessing = false,
}: {
  content: string
  actions?: React.ReactNode
  components?: Components
  isProcessing?: boolean
}) {
  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        {isProcessing ? (
          <>
            <div className="w-8 h-8 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Analysis in progress… content will appear when ready.</p>
          </>
        ) : (
          <p className="text-gray-600 text-sm italic">No content available for this section.</p>
        )}
      </div>
    )
  }
  return (
    <div>
      {actions && <div className="flex items-center gap-2 mb-4 no-print">{actions}</div>}
      <div className="prose-invert max-w-none">
        <ReactMarkdown components={components}>{content}</ReactMarkdown>
      </div>
    </div>
  )
}

// ── Metrics Parsers ───────────────────────────────────────────────────────────

/**
 * Searches onboarding_report, architecture_report, and other markdown files
 * to find the total files count using common text patterns.
 */
function parseTotalFiles(report: Report): string {
  const fields = [
    report.onboarding_report,
    report.architecture_report,
    report.final_report,
    report.dependency_report,
    report.documentation_report,
    report.review_report
  ]
  for (const field of fields) {
    if (!field) continue
    let m = field.match(/total\s*files:\s*(\d+)/i)
    if (m) return m[1]
    m = field.match(/(\d+)\s*total\s*files/i)
    if (m) return m[1]
    m = field.match(/(\d+)\s*files/i)
    if (m) return m[1]
  }
  return '—'
}

/**
 * Extract dependency counts from raw text inside dependency_report.
 */
function parseDepsCount(report: string): string {
  if (!report) return '—'
  let m = report.match(/(\d+)\s*(packages|dependencies|direct|libraries|modules)/i)
  if (m) return m[1]
  m = report.match(/(?:found|total|contains)\s*(\d+)\s*(?:dependencies|packages)/i)
  if (m) return m[1]
  
  const lines = report.split('\n')
  for (const line of lines) {
    if (/dependency|package|library/i.test(line)) {
      const match = line.match(/(\d+)/)
      if (match) return match[1]
    }
  }
  return '—'
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { report_id } = useParams<{ report_id: string }>()
  const navigate = useNavigate()
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('architecture')
  const [refreshing, setRefreshing] = useState(false)

  const fetchReport = useCallback(() => {
    if (!report_id) return
    return getReport(parseInt(report_id, 10))
      .then(setReport)
      .catch(err => setError(err.message))
  }, [report_id])

  // Initial load
  useEffect(() => {
    fetchReport()?.finally(() => setLoading(false))
  }, [fetchReport])

  // Auto-poll every 5s while the report is not yet completed
  useEffect(() => {
    if (!report || report.status === 'completed' || report.status === 'error') return
    const timer = setInterval(() => fetchReport(), 5000)
    return () => clearInterval(timer)
  }, [report, fetchReport])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchReport()?.finally(() => setRefreshing(false))
  }

  const formattedDate = useCallback((dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {
      return dateStr
    }
  }, [])

  if (loading) return <LoadingSkeleton />

  if (error || !report) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-400 font-semibold">Failed to load report</p>
          <p className="text-gray-500 text-sm">{error}</p>
          <button onClick={() => navigate('/')}
            className="px-4 py-2 rounded-lg bg-white/8 text-gray-300 text-sm hover:bg-white/12 transition-colors">
            ← Back to Home
          </button>
        </div>
      </div>
    )
  }

  const repoDisplayName = report.repo_name || report.repo_url.replace('https://github.com/', '')
  const rawJson = JSON.stringify(report, null, 2)

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0 no-print">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-600/8 blur-[130px]" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-blue-600/8 blur-[130px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* ── Header ── */}
        <header className="space-y-4">
          <button
            id="back-btn"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors group no-print"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </button>

          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-black text-white truncate">{repoDisplayName}</h1>
              <a
                href={report.repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-blue-400 transition-colors mt-0.5 inline-block truncate max-w-full"
              >
                {report.repo_url}
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {report.language  && <Badge label={report.language}  color="blue"  />}
            {report.framework && <Badge label={report.framework} color="green" />}
            <Badge
              label={report.status === 'completed' ? '✓ Completed' : '⏳ ' + report.status}
              color={report.status === 'completed' ? 'green' : 'gray'}
            />
            {report.created_at && (
              <span className="text-xs text-gray-600 ml-1">
                Analyzed on {formattedDate(report.created_at)}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-white/15 bg-white/5 hover:bg-white/10 text-gray-400 transition-all disabled:opacity-50"
            >
              {refreshing ? (
                <span className="w-3 h-3 border border-gray-400 border-t-white rounded-full animate-spin inline-block" />
              ) : '↻'} Refresh
            </button>
          </div>
        </header>

        {/* ── Overview stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
          <StatCard icon="📁" label="Total Files"   value={parseTotalFiles(report)} />
          <StatCard icon="🔤" label="Language"      value={report.language || '—'} />
          <StatCard icon="⚙️" label="Framework"     value={report.framework || '—'} />
          <StatCard icon="📦" label="Dependencies"  value={parseDepsCount(report.dependency_report)} />
        </div>

        {/* ── Tab navigation ── */}
        <div className="border-b border-white/10 overflow-x-auto no-print">
          <nav className="flex gap-1 min-w-max pb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-white border-b-2 border-purple-500 bg-purple-500/10'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/4'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Tab content ── */}
        <div className="rounded-2xl border border-white/8 bg-[#111111] p-6 min-h-[400px]">

          {/* TAB 1 — Architecture */}
          {activeTab === 'architecture' && (
            <MarkdownPane
              content={report.architecture_report ?? ''}
              isProcessing={report.status !== 'completed' && report.status !== 'error'}
            />
          )}

          {/* TAB 2 — API Docs */}
          {activeTab === 'docs' && (
            <ApiDocsPanel
              content={report.documentation_report ?? ''}
              isProcessing={report.status !== 'completed' && report.status !== 'error'}
            />
          )}

          {/* TAB 3 — Code Review */}
          {activeTab === 'review' && (
            <div>
              {/* Severity legend */}
              <div className="flex flex-wrap gap-2 mb-5 pb-4 border-b border-white/8 no-print">
                {[
                  { label: '🔴 High',   c: 'bg-red-500/20 text-red-300 border-red-500/30'       },
                  { label: '🟡 Medium', c: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
                  { label: '🟢 Low',    c: 'bg-green-500/20 text-green-300 border-green-500/30' },
                ].map(({ label, c }) => (
                  <span key={label} className={`px-3 py-1 rounded-full text-xs font-semibold border ${c}`}>{label}</span>
                ))}
                <span className="text-xs text-gray-600 self-center ml-1">Severity</span>
              </div>
              <MarkdownPane
                content={report.review_report ?? ''}
                components={reviewComponents}
                isProcessing={report.status !== 'completed' && report.status !== 'error'}
              />
            </div>
          )}

          {/* TAB 4 — Dependencies */}
          {activeTab === 'dependencies' && (
            <div className="space-y-6">
              <div className="no-print">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  Dependency Graph
                </h2>
                <DependencyGraph graphJson={report.dependency_graph_json} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  Analysis Report
                </h2>
                <MarkdownPane
                  content={report.dependency_report ?? ''}
                  isProcessing={report.status !== 'completed' && report.status !== 'error'}
                />
              </div>
            </div>
          )}

          {/* TAB 5 — Onboarding */}
          {activeTab === 'onboarding' && (
            <div className="relative">
              <MarkdownPane
                content={report.onboarding_report ?? ''}
                actions={report.onboarding_report ? <CopyButton text={report.onboarding_report} label="Copy Guide" /> : undefined}
                isProcessing={report.status !== 'completed' && report.status !== 'error'}
              />
            </div>
          )}

          {/* TAB 6 — Full Report */}
          {activeTab === 'final' && (
            <MarkdownPane
              content={report.final_report ?? ''}
              components={combinedComponents}
              isProcessing={report.status !== 'completed' && report.status !== 'error'}
              actions={
                report.final_report ? (
                  <>
                    <CopyButton text={report.final_report} label="Copy to Clipboard" />
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 transition-all"
                    >
                      🖨️ Download as PDF
                    </button>
                  </>
                ) : undefined
              }
            />
          )}

          {/* TAB 7 — Raw Data */}
          {activeTab === 'raw' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between no-print">
                <h2 className="text-sm font-semibold text-gray-400">Raw Report JSON</h2>
                <CopyButton text={rawJson} label="Copy JSON" />
              </div>
              <pre className="bg-black/50 border border-white/10 rounded-xl p-5 text-xs font-mono text-green-300 overflow-x-auto overflow-y-auto max-h-[600px] leading-relaxed">
                {rawJson}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print, .pointer-events-none { display: none !important; }
          body { background: white !important; color: black !important; }
          .min-h-screen { min-height: unset; }
          .prose-invert h1, .prose-invert h2, .prose-invert h3, .prose-invert strong { color: black !important; }
          .prose-invert p, .prose-invert li, .prose-invert td { color: #374151 !important; }
          .prose-invert blockquote { border-left-color: #6b7280 !important; background: #f3f4f6 !important; color: #4b5563 !important; }
          .prose-invert code { background: #f3f4f6 !important; color: #111827 !important; border-color: #e5e7eb !important; }
          .prose-invert table { border-color: #e5e7eb !important; }
          .prose-invert tr { background: white !important; border-bottom: 1px solid #e5e7eb !important; }
          .prose-invert tr:nth-child(even) { background: #f9fafb !important; }
          .prose-invert th, .prose-invert td { border-color: #e5e7eb !important; color: #111827 !important; }
          .prose-invert thead { background: #f3f4f6 !important; }
          .bg-\[\#111111\] { background: transparent !important; border: none !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  )
}
