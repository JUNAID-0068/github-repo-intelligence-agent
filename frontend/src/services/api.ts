import type { Report, StreamEvent } from '../types'

const BASE_URL = 'http://localhost:8000'

// ── 1. analyzeRepo ────────────────────────────────────────────────────────────

/**
 * Submit a GitHub repository URL for analysis.
 * @returns An object containing the newly created `report_id`.
 */
export async function analyzeRepo(repoUrl: string): Promise<{ report_id: number }> {
  const res = await fetch(`${BASE_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_url: repoUrl }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail ?? `POST /analyze failed: ${res.status}`)
  }

  return res.json()
}

// ── 2. getReport ──────────────────────────────────────────────────────────────

/**
 * Fetch the full report row for the given `reportId`.
 */
export async function getReport(reportId: number): Promise<Report> {
  const res = await fetch(`${BASE_URL}/report/${reportId}`)

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail ?? `GET /report/${reportId} failed: ${res.status}`)
  }

  return res.json()
}

// ── 3. getStatus ──────────────────────────────────────────────────────────────

/**
 * Fetch the current processing status and per-agent breakdown for a report.
 */
export async function getStatus(reportId: number): Promise<{
  status: string
  agent_status: Record<string, string>
}> {
  const res = await fetch(`${BASE_URL}/status/${reportId}`)

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail ?? `GET /status/${reportId} failed: ${res.status}`)
  }

  return res.json()
}

// ── 4. listReports ────────────────────────────────────────────────────────────

/**
 * Return a summary list of all reports ordered by creation date (newest first).
 */
export async function listReports(): Promise<
  Pick<Report, 'id' | 'repo_url' | 'repo_name' | 'language' | 'framework' | 'status' | 'created_at'>[]
> {
  const res = await fetch(`${BASE_URL}/reports`)

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail ?? `GET /reports failed: ${res.status}`)
  }

  return res.json()
}

// ── 5. streamStatus ───────────────────────────────────────────────────────────

/**
 * Open a Server-Sent Events connection to `/stream/{reportId}`.
 *
 * @param reportId  - Report to stream events for.
 * @param onEvent   - Called with each parsed {@link StreamEvent}.
 * @param onComplete - Called once when `agent === "all"` is received or the
 *                    stream closes naturally. The underlying EventSource is
 *                    closed automatically at that point.
 * @returns The raw `EventSource` instance so the caller can close it early
 *          (e.g. on component unmount).
 */
export function streamStatus(
  reportId: number,
  onEvent: (event: StreamEvent) => void,
  onComplete: () => void,
): EventSource {
  const source = new EventSource(`${BASE_URL}/stream/${reportId}`)

  source.onmessage = (e: MessageEvent) => {
    let parsed: StreamEvent

    try {
      parsed = JSON.parse(e.data) as StreamEvent
    } catch {
      console.warn('[streamStatus] Could not parse SSE data:', e.data)
      return
    }

    onEvent(parsed)

    // Terminal event — close stream and notify caller
    if (parsed.agent === 'all') {
      source.close()
      onComplete()
    }
  }

  source.onerror = (err) => {
    console.error('[streamStatus] SSE error:', err)
    source.close()
    onComplete()
  }

  return source
}
