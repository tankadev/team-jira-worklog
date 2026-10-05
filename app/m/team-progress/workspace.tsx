'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'

import type { ProgressData } from '@/lib/modules/team-progress/jira'
import {
  type DailyMatch,
  type DeployPr,
  type EpicKind,
  NO_EPIC,
  type Phase,
  type ProgressIssue,
  type Selection,
  buildReportData,
  epicKind,
  issuePlatforms,
  lostMarks,
  plainTitle,
  phaseOf as guessPhase,
  supersededKeys,
  taskProgress,
  unbackedFigures,
} from '@/lib/modules/team-progress/model'
import type {
  DailiesPaste,
  DailyMap,
  ProgressTemplate,
  ReportDraft,
  SentReport,
  TeamProgressConfig,
} from '@/lib/modules/team-progress/store'
import { renderTemplate } from '@/lib/modules/team-progress/template'
import { previousWorkday } from '@/lib/time'

import { Icon } from '../../icons'
import { Working } from '../../spinner'
import {
  aiMapDailiesAction,
  aiPolishAction,
  fetchPrsAction,
  recordSentAction,
  saveDailiesAction,
  saveDraftAction,
  saveSelectionAction,
  setPlatformAction,
} from './actions'
import { ConfigPanel } from './config-panel'
import { EpicCard, type EpicGroup, type RowInfo } from './epic-card'
import { TemplatePanel } from './template-panel'

type Scope = 'sprint' | 'all'
type Tab = 'report' | 'template' | 'config'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'report', label: 'Báo cáo' },
  { id: 'template', label: 'Template' },
  { id: 'config', label: 'Cấu hình' },
]
type Note = { ok: boolean; message: string } | null

const KIND_ORDER: Record<EpicKind, number> = { feature: 0, bucket: 1, support: 2 }
const SCOPE_KEY = 'team-progress:scope'
/** The filter entry for issues no tag places on any platform. */
const UNKNOWN = '?'
const filterKey = (platform: string) => `team-progress:filter:${platform}`
const prId = (p: DeployPr) => `${p.repo}#${p.number}@${p.base}`

const BTN = 'rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-body font-medium hover:bg-surface-2 disabled:opacity-60'
const BTN_PRI = 'rounded-lg bg-accent px-3 py-1.5 text-body font-semibold text-on-accent shadow-card hover:bg-accent-2 disabled:opacity-60'
const BTN_AI = 'rounded-lg border border-epic/40 bg-epic-soft px-3 py-1.5 text-body font-medium text-epic-ink hover:border-epic disabled:opacity-60'

export function Workspace(props: {
  today: string
  jiraBase: string
  sprints: Array<{ id: number; name: string; current: boolean }>
  sprintId: number
  sprintName: string
  platform: string
  config: TeamProgressConfig
  templates: ProgressTemplate[]
  data: ProgressData
  selection: Selection
  draft: ReportDraft | null
  dailies: DailiesPaste | null
  dailyMap: DailyMap | null
  lastSent: SentReport | null
  githubReady: boolean
  aiReady: boolean
}) {
  const { data, config, platform, today } = props
  const router = useRouter()
  const [navigating, startNav] = useTransition()

  const epicMap = useMemo(() => new Map(data.epics.map((e) => [e.key, e])), [data])
  const superseded = useMemo(() => supersededKeys(data.issues), [data])

  /* ── what is picked ─────────────────────────────────────────────────── */

  const seen0 = useMemo(() => new Set(props.selection.seen), [props.selection])
  // On the very first visit everything is unseen; calling all of it "new"
  // would be noise, so the badge only starts meaning something from day two.
  const firstRun = props.selection.seen.length === 0

  const [picked, setPicked] = useState<Set<string>>(() => {
    const chosen = new Set(props.selection.selected)
    const out = new Set<string>()
    for (const i of data.issues) {
      if (seen0.has(i.key)) {
        if (chosen.has(i.key)) out.add(i.key)
        continue
      }
      if (issuePlatforms(i, epicMap.get(i.epicKey ?? ''), config.platforms).includes(platform)) out.add(i.key)
    }
    return out
  })
  const [phases, setPhases] = useState(props.selection.phases)
  const [notes, setNotes] = useState(props.selection.notes)
  const [names, setNames] = useState(props.selection.names)

  // Persist only after the user does something: merely opening the page must
  // not mark every new task as seen and wipe its "mới" badge.
  const touched = useRef(false)
  const touch = () => {
    touched.current = true
  }
  useEffect(() => {
    if (!touched.current) return
    const t = setTimeout(() => {
      const here = new Set(data.issues.map((i) => i.key))
      // Decisions about issues outside this sprint's view are kept, not lost.
      const keepSelected = props.selection.selected.filter((k) => !here.has(k))
      const seen = [...new Set([...props.selection.seen, ...here])].slice(-4000)
      void saveSelectionAction(platform, {
        selected: [...keepSelected, ...picked].slice(-4000),
        seen,
        phases,
        notes,
        names,
      })
    }, 600)
    return () => clearTimeout(t)
  }, [picked, phases, notes, names, data, platform, props.selection])

  function pick(keys: string[], on: boolean) {
    touch()
    setPicked((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (on) next.add(k)
        else next.delete(k)
      }
      return next
    })
  }

  const phaseOf = (i: ProgressIssue): Phase => phases[i.key] ?? guessPhase(i)

  /* ── what is shown ──────────────────────────────────────────────────── */

  const [scope, setScope] = useState<Scope>('all')
  useEffect(() => {
    try {
      const s = localStorage.getItem(SCOPE_KEY)
      if (s === 'sprint' || s === 'all') setScope(s)
    } catch {}
  }, [])
  function changeScope(s: Scope) {
    setScope(s)
    try {
      localStorage.setItem(SCOPE_KEY, s)
    } catch {}
  }

  /**
   * QC's own tasks — `[Test]`, `[QC]`, `[Verify…]` — are not what a dev report
   * covers, so they are left off the list, the report and the AI's matching.
   * Judged from the title alone (not a hand-set phase), so marking a row "Test"
   * cannot make it vanish with no way back. One toggle brings them back.
   */
  const [showQc, setShowQc] = useState(false)
  const isQc = (i: ProgressIssue) => guessPhase(i) === 'test'
  const inScope = useMemo(
    () => data.issues.filter((i) => !superseded.has(i.key) && (scope === 'all' || i.inSprint)),
    [data, superseded, scope],
  )
  const visible = useMemo(() => (showQc ? inScope : inScope.filter((i) => !isQc(i))), [inScope, showQc])
  const qcHidden = showQc ? 0 : inScope.length - visible.length

  /** The platforms an issue counts under: its own tags, else its epic's. */
  const platformsOf = (i: ProgressIssue): string[] => issuePlatforms(i, epicMap.get(i.epicKey ?? ''), config.platforms)

  // Which platforms' tasks are on screen. Starts at the report's own platform
  // plus the untagged ones, and is remembered per report in this browser.
  const [filter, setFilter] = useState<Set<string>>(() => new Set([platform, UNKNOWN]))
  useEffect(() => {
    try {
      const raw = localStorage.getItem(filterKey(platform))
      if (raw) setFilter(new Set(JSON.parse(raw) as string[]))
    } catch {}
  }, [platform])
  function changeFilter(next: Set<string>) {
    setFilter(next)
    try {
      localStorage.setItem(filterKey(platform), JSON.stringify([...next]))
    } catch {}
  }
  function toggleFilter(p: string) {
    const next = new Set(filter)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    changeFilter(next)
  }

  /**
   * On screen after the platform filter. A task tagged for two platforms
   * stays while either is ticked — `[Web][iOS]` is still Web work. The report
   * is built from these only, so a box hidden by the filter cannot slip in.
   */
  const shownIssues = useMemo(
    () =>
      visible.filter((i) => {
        const ps = platformsOf(i)
        return ps.length ? ps.some((p) => filter.has(p)) : filter.has(UNKNOWN)
      }),
    // platformsOf reads epicMap and config.
    [visible, filter, epicMap, config.platforms],
  )

  const filterCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of visible) {
      const ps = platformsOf(i)
      for (const p of ps.length ? ps : [UNKNOWN]) counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    return counts
  }, [visible, epicMap, config.platforms])

  const groups: EpicGroup[] = useMemo(() => {
    const by = new Map<string, ProgressIssue[]>()
    for (const i of shownIssues) {
      const k = i.epicKey && epicMap.has(i.epicKey) ? i.epicKey : NO_EPIC
      by.set(k, [...(by.get(k) ?? []), i])
    }
    return [...by]
      .map(([key, issues]) => {
        const epic = epicMap.get(key)
        return {
          key,
          epic,
          kind: epic ? epicKind(epic.summary) : ('support' as EpicKind),
          issues,
          relevant: issues.some((i) => issuePlatforms(i, epic, config.platforms).includes(platform)),
        }
      })
      .sort(
        (a, b) =>
          Number(b.key !== NO_EPIC) - Number(a.key !== NO_EPIC) ||
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          Number(b.relevant) - Number(a.relevant) ||
          (Number(b.key.split('-').pop()) || 0) - (Number(a.key.split('-').pop()) || 0),
      )
  }, [shownIssues, epicMap, config.platforms, platform])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const cardProps = (g: EpicGroup) => ({
    group: g,
    picked,
    phases,
    phaseOf,
    info: rowInfo,
    note: notes[g.key] ?? '',
    name: names[g.key] ?? '',
    expanded: expanded.has(g.key),
    jiraBase: props.jiraBase,
    showSprintFlag: scope === 'all',
    onToggleExpand: () =>
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(g.key)) next.delete(g.key)
        else next.add(g.key)
        return next
      }),
    onPick: pick,
    onPhase: (key: string, p: Phase | null) => {
      touch()
      setPhases((prev) => {
        const next = { ...prev }
        if (p) next[key] = p
        else delete next[key]
        return next
      })
    },
    onNote: (v: string) => {
      touch()
      setNotes((prev) => ({ ...prev, [g.key]: v }))
    },
    onName: (v: string) => {
      touch()
      setNames((prev) => ({ ...prev, [g.key]: v }))
    },
  })

  const rowInfo = (i: ProgressIssue): RowInfo => ({
    platforms: platformsOf(i),
    isNew: !firstRun && !seen0.has(i.key),
    daily: matchesByKey.get(i.key),
  })
  const newCount = firstRun ? 0 : shownIssues.filter((i) => !seen0.has(i.key)).length
  /** Ticked, but hidden by the filter — and so left out of the report. */
  const hiddenPicked = visible.filter((i) => picked.has(i.key) && !shownIssues.includes(i)).length

  /* ── deploys ────────────────────────────────────────────────────────── */

  const [range, setRange] = useState({ from: previousWorkday(today), to: today })
  const [prs, setPrs] = useState<DeployPr[]>([])
  const [prOff, setPrOff] = useState<Set<string>>(new Set())
  const [prNote, setPrNote] = useState<Note>(null)
  const [prPending, startPr] = useTransition()

  function loadPrs() {
    startPr(async () => {
      const res = await fetchPrsAction(range.from, range.to)
      setPrNote(res)
      if (res.ok) {
        setPrs(res.data ?? [])
        setPrOff(new Set())
      }
    })
  }
  const pickedPrs = prs.filter((p) => !prOff.has(prId(p)))

  /* ── the report ─────────────────────────────────────────────────────── */

  const [templates, setTemplates] = useState(props.templates)
  const [templateId, setTemplateId] = useState((props.templates.find((t) => t.isDefault) ?? props.templates[0]).id)
  const template = templates.find((t) => t.id === templateId) ?? templates[0]

  const reportData = useMemo(
    () =>
      buildReportData({
        platform,
        date: today,
        sprintName: props.sprintName,
        epics: groups.map((g) => g.epic).filter((e): e is NonNullable<typeof e> => Boolean(e)),
        issues: shownIssues.filter((i) => picked.has(i.key)),
        selection: { selected: [], seen: [], phases, notes, names },
        platforms: config.platforms,
        envs: config.envs,
        prs: prs.filter((p) => !prOff.has(prId(p))),
        subtaskParent: data.subtaskParent,
      }),
    [platform, today, props.sprintName, groups, shownIssues, picked, phases, notes, names, config, prs, prOff, data.subtaskParent],
  )
  const rendered = useMemo(() => {
    try {
      return { text: renderTemplate(template.body, reportData), error: null }
    } catch (e) {
      return { text: '', error: e instanceof Error ? e.message : String(e) }
    }
  }, [template.body, reportData])

  // An empty draft means "following the template" — see the save below.
  const todaysDraft = props.draft && props.draft.date === today && props.draft.text ? props.draft : null
  // Seeded with the template output so the first paint already shows it.
  const [text, setText] = useState(todaysDraft?.text ?? rendered.text)
  const [baseline, setBaseline] = useState(todaysDraft?.baseline ?? rendered.text)
  const [source, setSource] = useState<ReportDraft['source']>(todaysDraft?.source ?? 'template')
  // While following, the box mirrors the template output as boxes are ticked.
  // The first keystroke (or an AI rewrite) stops that, so nothing typed is lost.
  const [follow, setFollow] = useState(!todaysDraft)

  useEffect(() => {
    if (follow && !rendered.error) {
      setText(rendered.text)
      setBaseline(rendered.text)
      setSource('template')
    }
  }, [follow, rendered])

  // Only a report the user has taken over is worth keeping: while the box
  // follows the template, reopening the page should rebuild it live, so an
  // empty draft is stored instead.
  const draftLoaded = useRef(true)
  useEffect(() => {
    // Skip the save the first render would make with what was just loaded.
    if (draftLoaded.current) {
      draftLoaded.current = false
      return
    }
    const t = setTimeout(
      () => void saveDraftAction(platform, { date: today, text: follow ? '' : text, baseline, source }),
      900,
    )
    return () => clearTimeout(t)
  }, [text, baseline, source, follow, platform, today])

  const stale = !follow && !rendered.error && rendered.text !== baseline
  const unbacked = text !== baseline ? unbackedFigures(text, baseline) : []
  const lost = text !== baseline ? lostMarks(text, baseline) : []

  function rebuild() {
    if (!follow && text !== baseline && !confirm('Dựng lại sẽ thay bản đang sửa bằng bản theo template. Tiếp tục?')) return
    setFollow(true)
    if (!rendered.error) {
      setText(rendered.text)
      setBaseline(rendered.text)
      setSource('template')
    }
  }

  /* ── the team's dailies ─────────────────────────────────────────────── */

  // Pasted as they came from chat; only today's paste is shown back.
  const [dailies, setDailies] = useState(props.dailies?.date === today ? props.dailies.text : '')
  const dailiesLoaded = useRef(true)
  useEffect(() => {
    if (dailiesLoaded.current) {
      dailiesLoaded.current = false
      return
    }
    const t = setTimeout(() => void saveDailiesAction(platform, today, dailies), 700)
    return () => clearTimeout(t)
  }, [dailies, platform, today])
  /** What the AI noticed in the dailies that the report does not say. */
  const [insights, setInsights] = useState<string[]>([])

  // Which daily line is about which issue. Only today's, and only while the
  // paste is the one it was made from — `mappedFrom` says which that was.
  const savedMap = props.dailyMap && props.dailyMap.date === today ? props.dailyMap : null
  const [dailyMatches, setDailyMatches] = useState<DailyMatch[]>(savedMap?.matches ?? [])
  const [mappedFrom, setMappedFrom] = useState(savedMap?.source ?? '')
  const mapStale = dailyMatches.length > 0 && mappedFrom !== dailies
  const [mapNote, setMapNote] = useState<Note>(null)
  const [mapPending, startMap] = useTransition()

  const matchesByKey = useMemo(() => {
    const m = new Map<string, DailyMatch[]>()
    for (const d of dailyMatches) if (d.key) m.set(d.key, [...(m.get(d.key) ?? []), d])
    return m
  }, [dailyMatches])
  const issueByKey = useMemo(() => new Map(data.issues.map((i) => [i.key, i])), [data])

  function mapDailiesNow() {
    // The sprint's work, plus anything ticked from outside it — what a daily
    // talks about. Subtasks go in too: dailies name the subtask a worklog went to.
    const candidates = data.issues
      .filter((i) => !superseded.has(i.key) && (showQc || !isQc(i)) && (i.inSprint || picked.has(i.key)))
      .flatMap((i) => {
        const epic = epicMap.get(i.epicKey ?? '')?.summary ?? ''
        return [
          { key: i.key, title: i.summary, epic, status: i.statusName },
          ...i.subtasks.map((st) => ({ key: st.key, title: st.summary ?? '', parentKey: i.key, epic, status: st.statusName })),
        ]
      })
    const source = dailies
    startMap(async () => {
      const res = await aiMapDailiesAction({ platform, date: today, dailies: source, candidates })
      setMapNote(res)
      if (res.ok && res.data) {
        setDailyMatches(res.data)
        setMappedFrom(source)
      }
    })
  }

  /** Issues the dailies name that are not ticked yet. */
  const mentionedUnpicked = [...matchesByKey.keys()].filter((k) => !picked.has(k) && issueByKey.has(k))
  const mentionedHidden = mentionedUnpicked.filter((k) => !shownIssues.some((i) => i.key === k)).length

  /** The matches as one line each, for the report prompt. */
  const dailyMapLines = mapStale
    ? []
    : dailyMatches.map((d) => {
        const who = [d.person || 'Ai đó', d.when === 'yesterday' ? '(hôm qua)' : d.when === 'today' ? '(hôm nay)' : '']
          .filter(Boolean)
          .join(' ')
        const issue = d.key ? issueByKey.get(d.key) : undefined
        if (!issue) return `${who}: ${d.line} → không khớp`
        const epic = epicMap.get(issue.epicKey ?? '')
        const pct = taskProgress(issue).percent
        return `${who}: ${d.line} → ${d.subtaskKey ?? issue.key} ${plainTitle(issue.summary)} [${epic ? plainTitle(epic.summary) : 'không epic'}] (${issue.statusName}${pct !== null ? `, ${pct}%` : ''})`
      })

  const [aiNote, setAiNote] = useState<Note>(null)
  const [aiPending, startAi] = useTransition()

  // Below the two-column width the report sits under the whole epic list;
  // "Xem báo cáo ↓" above the list jumps down to it.
  const reportRef = useRef<HTMLElement>(null)

  function polish() {
    startAi(async () => {
      const res = await aiPolishAction({
        platform,
        date: today,
        // A second rewrite starts again from the template's output rather than
        // compounding the first one's liberties; hand edits are kept.
        draft: source === 'ai' ? baseline : text,
        prTitles: pickedPrs.map((p) => ({ env: props.config.envs.find((e) => e.branch === p.base)?.label ?? p.base, title: p.title })),
        dailies,
        dailyMap: dailyMapLines,
      })
      setAiNote(res)
      if (res.ok && res.data) {
        // The figures are checked against what the template produced, so the
        // baseline stays as it is when the text was still the template's.
        if (follow) setBaseline(rendered.text)
        setFollow(false)
        setText(res.data.text)
        setSource('ai')
        setInsights(res.data.insights)
      }
    })
  }

  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // The async clipboard is refused outside a secure, focused page (an
      // embedded preview, say); the report is already in a textarea, so the
      // old select-and-copy still works there.
      box.current?.select()
      if (!document.execCommand('copy')) {
        setAiNote({ ok: false, message: 'Trình duyệt không cho copy — nội dung đã được bôi đen, nhấn Ctrl/Cmd+C' })
        return
      }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
    touch()
    void recordSentAction(platform, today, text)
  }

  function go(params: { p?: string; sprint?: number }) {
    const q = new URLSearchParams({ p: params.p ?? platform, sprint: String(params.sprint ?? props.sprintId) })
    if (params.p) void setPlatformAction(params.p)
    startNav(() => router.push(`/m/team-progress?${q}`))
  }

  const pickedShown = shownIssues.filter((i) => picked.has(i.key)).length

  /* ── tabs ───────────────────────────────────────────────────────────── */

  // Kept in the hash (#template, #config) so a reload or a shared link opens
  // the same tab. Read after mount — the server cannot see the hash.
  const [tab, setTab] = useState<Tab>('report')
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.replace('#', '')
      setTab(h === 'template' || h === 'config' ? h : 'report')
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  function changeTab(t: Tab) {
    setTab(t)
    const url = `${window.location.pathname}${window.location.search}${t === 'report' ? '' : `#${t}`}`
    window.history.replaceState(window.history.state, '', url)
  }

  /* ── render ─────────────────────────────────────────────────────────── */

  return (
    <div className={navigating ? 'pointer-events-none opacity-60 transition-opacity' : ''}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow text-ink-2">
            {props.sprintName} · {data.epics.length} epic · {data.issues.length} task/bug
          </div>
          <h1 className="text-title font-semibold tracking-tight">Tiến độ team</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={props.sprintId}
            onChange={(e) => go({ sprint: Number(e.target.value) })}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-body"
            aria-label="Sprint"
          >
            {props.sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.current ? ' · đang chạy' : ''}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Phạm vi">
            {(
              [
                ['all', 'Toàn feature'],
                ['sprint', 'Trong sprint'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => changeScope(id)}
                title={id === 'all' ? 'Mọi task của epic, cả sprint trước và backlog' : 'Chỉ task nằm trong sprint đang chọn'}
                className={
                  'rounded-md px-2.5 py-1 text-small ' +
                  (scope === id ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink-2 hover:text-ink')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <nav className="mb-4 flex gap-1 border-b border-line" aria-label="Phần của trang">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => changeTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={
              '-mb-px border-b-2 px-3 py-2 text-body ' +
              (tab === t.id ? 'border-accent font-semibold text-accent-ink' : 'border-transparent text-ink-2 hover:text-ink')
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Hidden rather than unmounted: the report keeps its scroll, open epics
          and focus while another tab is being looked at. */}
      <div hidden={tab !== 'report'}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-small text-ink-3">Báo cáo cho</span>
        {config.platforms.map((p) => (
          <button
            key={p.platform}
            type="button"
            onClick={() => p.platform !== platform && go({ p: p.platform })}
            className={
              'rounded-full border px-3 py-1 text-small ' +
              (p.platform === platform
                ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                : 'border-line text-ink-2 hover:border-line-strong hover:text-ink')
            }
          >
            {p.platform}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-small text-ink-3">Hiện task có tag</span>
        {[...config.platforms.map((p) => p.platform), UNKNOWN].map((p) => {
          const on = filter.has(p)
          const n = filterCounts.get(p) ?? 0
          return (
            <label
              key={p}
              className={
                'flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-small ' +
                (on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-3 hover:border-line-strong hover:text-ink')
              }
              title={p === UNKNOWN ? 'Task mà tiêu đề lẫn epic đều không ghi nền tảng' : `Task gắn tag ${p} (ở task hoặc epic)`}
            >
              <input type="checkbox" checked={on} onChange={() => toggleFilter(p)} className="size-3.5 accent-[var(--color-accent)]" />
              {p === UNKNOWN ? 'Chưa rõ nền tảng' : p}
              <span className="font-mono text-micro opacity-70">{n}</span>
            </label>
          )
        })}
        <span className="flex gap-2 text-small">
          <button
            type="button"
            onClick={() => changeFilter(new Set([...config.platforms.map((p) => p.platform), UNKNOWN]))}
            className="text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => changeFilter(new Set([platform]))}
            className="text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            Chỉ {platform}
          </button>
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
        {/* ── left: epics ── */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small text-ink-2">
              Đã chọn <b className="text-ink">{pickedShown}</b>/{shownIssues.length} task đang hiện
              {newCount > 0 && <span className="text-blue"> · {newCount} task mới từ lần trước</span>}
              {hiddenPicked > 0 && (
                <span className="text-warn" title="Đã tick nhưng bị bộ lọc ẩn — không đưa vào báo cáo">
                  {' '}
                  · {hiddenPicked} task đã chọn đang bị lọc ẩn
                </span>
              )}
              {(qcHidden > 0 || showQc) && (
                <span className="text-ink-3">
                  {' · '}
                  {showQc ? 'đang hiện cả task QC' : `${qcHidden} task QC đã ẩn`}{' '}
                  <button type="button" onClick={() => setShowQc((v) => !v)} className="underline underline-offset-2 hover:text-ink">
                    {showQc ? 'ẩn lại' : 'hiện lại'}
                  </button>
                </span>
              )}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={BTN + ' xl:hidden'}
              >
                Xem báo cáo ↓
              </button>
              <button type="button" onClick={() => pick(shownIssues.map((i) => i.key), true)} className={BTN} title="Tick mọi task đang hiện theo bộ lọc">
                Chọn hết đang hiện
              </button>
              <button
                type="button"
                onClick={() => setExpanded(expanded.size ? new Set() : new Set(groups.map((g) => g.key)))}
                className={BTN}
              >
                {expanded.size ? 'Thu gọn' : 'Mở hết'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Bỏ chọn mọi task đang hiện?')) pick(shownIssues.map((i) => i.key), false)
                }}
                className={BTN}
              >
                Bỏ chọn hết
              </button>
            </span>
          </div>

          {groups.length === 0 && (
            <div className="card p-5 text-body text-ink-2">
              Không có task nào khớp bộ lọc trong {scope === 'sprint' ? 'sprint này' : 'các epic của sprint này'}. Tick thêm tag ở trên để hiện.
            </div>
          )}

          {groups.map((g) => (
            <EpicCard key={g.key} {...cardProps(g)} />
          ))}
        </div>

        {/* ── right: report ── */}
        <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-5">
          <section ref={reportRef} className="card scroll-mt-4 p-4">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <div className="eyebrow mr-auto text-ink-2">Báo cáo {platform}</div>
              <select
                value={template.id}
                onChange={(e) => setTemplateId(e.target.value)}
                className="rounded-md border border-line bg-surface px-2 py-1 text-small"
                aria-label="Template"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? ' ★' : ''}
                  </option>
                ))}
              </select>
              <span
                className={
                  'badge ' +
                  (follow ? 'bg-good-soft text-good' : source === 'ai' ? 'bg-epic-soft text-epic-ink' : 'bg-warn-soft text-warn')
                }
                title={follow ? 'Ô báo cáo tự cập nhật khi bạn tick task' : 'Đã sửa — tick thêm task sẽ không tự đổi ô này'}
              >
                {follow ? 'tự cập nhật' : source === 'ai' ? 'AI đã viết' : 'đã sửa tay'}
              </span>
            </div>

            {rendered.error && <div className="mb-2 text-small text-crit">Template lỗi: {rendered.error}</div>}

            <textarea
              ref={box}
              value={text}
              onChange={(e) => {
                setFollow(false)
                setText(e.target.value)
              }}
              rows={22}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-line bg-ground px-3 py-2 font-mono text-small leading-[1.6]"
              aria-label="Nội dung báo cáo"
              placeholder="Tick epic/task bên trái để dựng báo cáo"
            />

            {stale && (
              <div className="mt-2 rounded-md bg-warn-soft px-3 py-1.5 text-small text-warn">
                Lựa chọn hoặc số liệu đã đổi so với bản đang sửa —{' '}
                <button type="button" onClick={rebuild} className="font-semibold underline underline-offset-2">
                  dựng lại
                </button>
              </div>
            )}
            {unbacked.length > 0 && (
              <div className="mt-2 rounded-md bg-crit-soft px-3 py-1.5 text-small text-crit">
                Số không khớp Jira: <b>{unbacked.join(', ')}</b> — kiểm tra lại nếu không phải bạn cố ý sửa.
              </div>
            )}
            {lost.length > 0 && (
              <div className="mt-2 rounded-md bg-warn-soft px-3 py-1.5 text-small text-warn">
                Bản đang sửa mất ghi chú môi trường: <b>{lost.join(', ')}</b>
              </div>
            )}
            {aiNote && <div className={'mt-2 text-small ' + (aiNote.ok ? 'text-good' : 'text-crit')}>{aiNote.message}</div>}
            {insights.length > 0 && (
              <div className="mt-2 rounded-md border border-epic/30 bg-epic-soft px-3 py-2">
                <div className="mb-1 flex items-center gap-2 text-small font-semibold text-epic-ink">
                  ✦ Daily nói khác Jira / cần xem lại
                  <button type="button" onClick={() => setInsights([])} className="ml-auto text-micro font-normal text-ink-3 hover:text-ink">
                    Ẩn
                  </button>
                </div>
                <ul className="flex list-disc flex-col gap-0.5 pl-4 text-small text-ink-2">
                  {insights.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={rebuild} className={BTN} title="Dựng lại từ template với lựa chọn hiện tại">
                Dựng theo template
              </button>
              <button
                type="button"
                onClick={polish}
                disabled={aiPending || !props.aiReady || !text.trim()}
                className={BTN_AI}
                title={props.aiReady ? 'AI đọc các task đã tick, daily của team và PR, rồi soạn báo cáo theo văn phong mẫu — số liệu giữ theo Jira' : 'Cần Google API key trong Settings'}
              >
                {aiPending ? <Working>AI đang soạn…</Working> : '✦ AI soạn báo cáo'}
              </button>
              <button type="button" onClick={copy} disabled={!text.trim()} className={BTN_PRI + ' ml-auto'}>
                {copied ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="check" className="size-4" /> Đã copy
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="copy" className="size-4" /> Copy
                  </span>
                )}
              </button>
            </div>
            {props.lastSent && (
              <details className="mt-3 rounded-md border border-line bg-ground px-3 py-2">
                <summary className="cursor-pointer text-small text-ink-2">Báo cáo đã gửi gần nhất · {props.lastSent.date}</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-micro text-ink-2">{props.lastSent.text}</pre>
              </details>
            )}
          </section>

          <section className="card p-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <div className="eyebrow mr-auto text-ink-2">Daily report của team · hôm nay</div>
              {dailies.trim() && (
                <>
                  <span className="text-micro text-ink-3">{dailies.length.toLocaleString('vi-VN')} ký tự</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Xoá phần daily đã dán?')) setDailies('')
                    }}
                    className="text-micro text-ink-3 hover:text-crit"
                  >
                    Xoá
                  </button>
                </>
              )}
            </div>
            <p className="mb-2 text-micro text-ink-3">
              Dán nguyên daily “hôm qua làm gì / hôm nay làm gì” của mọi người. Bấm ✦ AI soạn báo cáo (dưới ô báo cáo): AI thêm ghi chú (blocker, đang chờ…) và liệt kê chỗ daily nói khác Jira. Số liệu vẫn giữ theo Jira.
            </p>
            <textarea
              value={dailies}
              onChange={(e) => setDailies(e.target.value)}
              rows={dailies.trim() ? 8 : 4}
              className="w-full resize-y rounded-lg border border-line bg-ground px-3 py-2 text-small leading-[1.55]"
              placeholder={'Daily Report 05-10-2026 — Simon\nPrevious day:\n- ...\nToday:\n- ...\n\nDaily Report 05-10-2026 — Wind\n...'}
              aria-label="Daily report của team"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={mapDailiesNow}
                disabled={mapPending || !props.aiReady || !dailies.trim()}
                className={BTN_AI}
                title={props.aiReady ? 'AI đọc từng dòng daily và tìm task/subtask trên Jira mà dòng đó nói tới' : 'Cần Google API key trong Settings'}
              >
                {mapPending ? <Working>AI đang map…</Working> : '✦ AI map daily với task'}
              </button>
              {mentionedUnpicked.length > 0 && !mapStale && (
                <button
                  type="button"
                  onClick={() => {
                    pick(mentionedUnpicked, true)
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      for (const k of mentionedUnpicked) {
                        const i = issueByKey.get(k)
                        if (i) next.add(i.epicKey && epicMap.has(i.epicKey) ? i.epicKey : NO_EPIC)
                      }
                      return next
                    })
                  }}
                  className={BTN}
                  title={mentionedHidden ? `${mentionedHidden} task đang bị bộ lọc nền tảng ẩn — tick xong vẫn chưa vào báo cáo cho tới khi hiện chúng` : undefined}
                >
                  Tick {mentionedUnpicked.length} task daily nhắc tới mà chưa chọn
                </button>
              )}
              {mapNote && <span className={'text-small ' + (mapNote.ok ? 'text-ink-2' : 'text-crit')}>{mapNote.message}</span>}
            </div>
            {mapStale && (
              <div className="mt-2 rounded-md bg-warn-soft px-3 py-1.5 text-small text-warn">
                Daily đã sửa sau lần map trước — bấm map lại để khớp với nội dung mới.
              </div>
            )}
            {dailyMatches.length > 0 && (
              <details className="mt-2 rounded-md border border-line bg-ground px-3 py-2" open={!mapStale}>
                <summary className="cursor-pointer text-small text-ink-2">
                  Khớp {dailyMatches.filter((d) => d.key).length}/{dailyMatches.length} dòng
                  {dailyMatches.some((d) => !d.key) && (
                    <span className="text-warn"> · {dailyMatches.filter((d) => !d.key).length} dòng không thấy trên Jira</span>
                  )}
                </summary>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {[...dailyMatches]
                    .sort((a, b) => Number(Boolean(a.key)) - Number(Boolean(b.key)))
                    .map((d, idx) => {
                      const issue = d.key ? issueByKey.get(d.key) : undefined
                      return (
                        <li key={idx} className="text-small">
                          <span className="text-ink-3">
                            {[d.person, d.when === 'yesterday' ? 'hôm qua' : d.when === 'today' ? 'hôm nay' : '']
                              .filter(Boolean)
                              .join(' · ')}
                            :
                          </span>{' '}
                          <span className="text-ink">{d.line}</span>
                          <span className="block pl-3 text-micro">
                            {issue ? (
                              <>
                                →{' '}
                                <a
                                  href={`${props.jiraBase}/browse/${d.subtaskKey ?? issue.key}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono text-accent-ink hover:underline"
                                >
                                  {d.subtaskKey ?? issue.key}
                                </a>{' '}
                                <span className="text-ink-2">{plainTitle(issue.summary)}</span>
                                {d.subtaskKey && <span className="text-ink-3"> (subtask của {issue.key})</span>}
                                <span className={picked.has(issue.key) ? 'text-good' : 'text-warn'}>
                                  {picked.has(issue.key) ? ' · đã chọn' : ' · chưa chọn'}
                                </span>
                                {d.reason && <span className="text-ink-3"> — {d.reason}</span>}
                              </>
                            ) : (
                              <span className="text-warn">→ không thấy task nào trên Jira{d.reason ? ` — ${d.reason}` : ''}</span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                </ul>
              </details>
            )}
          </section>

          <section className="card p-4">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <div className="eyebrow mr-auto text-ink-2">Deploy từ GitHub</div>
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className="rounded-md border border-line bg-surface px-2 py-1 text-small"
                aria-label="Từ ngày"
              />
              <span className="text-ink-3">→</span>
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className="rounded-md border border-line bg-surface px-2 py-1 text-small"
                aria-label="Đến ngày"
              />
              <button type="button" onClick={loadPrs} disabled={prPending} className={BTN}>
                {prPending ? <Working>Đang lấy…</Working> : 'Lấy PR đã merge'}
              </button>
            </div>
            <p className="text-micro text-ink-3">
              PR merge vào {config.envs.filter((e) => e.branch).map((e) => e.branch).join(' · ') || '(chưa khai báo nhánh)'} trong{' '}
              {config.repos.length ? (
                config.repos.join(', ')
              ) : (
                <>
                  chưa khai báo repo —{' '}
                  <button type="button" onClick={() => changeTab('config')} className="underline underline-offset-2 hover:text-ink">
                    mở tab Cấu hình
                  </button>
                </>
              )}
              . Bỏ tick PR không muốn đưa vào báo cáo.
            </p>
            {prNote && <div className={'mt-2 text-small ' + (prNote.ok ? 'text-ink-2' : 'text-crit')}>{prNote.message}</div>}
            {prs.length > 0 && (
              <div className="mt-2 flex flex-col gap-2.5">
                {config.envs
                  .filter((e) => e.branch)
                  .map((env) => {
                    const list = prs.filter((p) => p.base === env.branch)
                    return (
                      <div key={env.branch}>
                        <div className="text-small font-semibold">
                          {env.label} <span className="font-mono font-normal text-ink-3">({env.branch})</span> · {list.length}
                        </div>
                        <ul className="mt-1 flex flex-col gap-1">
                          {list.map((p) => {
                            const id = prId(p)
                            const on = !prOff.has(id)
                            return (
                              <li key={id} className="flex items-start gap-2 text-small">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() =>
                                    setPrOff((prev) => {
                                      const next = new Set(prev)
                                      if (on) next.add(id)
                                      else next.delete(id)
                                      return next
                                    })
                                  }
                                  className="mt-0.5 size-4 accent-[var(--color-accent)]"
                                  aria-label={`Đưa PR ${p.number} vào báo cáo`}
                                />
                                <span className={'min-w-0 flex-1 ' + (on ? '' : 'text-ink-3 line-through')}>
                                  <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">
                                    {p.title}
                                  </a>
                                  <span className="block font-mono text-micro text-ink-3">
                                    {p.repo}#{p.number} · {p.author}
                                    {p.keys.length ? ` · ${p.keys.join(', ')}` : ''}
                                  </span>
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
              </div>
            )}
          </section>

        </div>
      </div>
      </div>

      {tab === 'template' && (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="card p-4">
            <div className="eyebrow mb-3 text-ink-2">Template báo cáo</div>
            <TemplatePanel templates={templates} activeId={template.id} onChange={setTemplates} onActive={setTemplateId} />
          </section>
          <section className="card p-4 xl:sticky xl:top-5">
            <div className="eyebrow mb-1 text-ink-2">Xem trước · {template.name}</div>
            <p className="mb-2.5 text-micro text-ink-3">
              Dựng từ các task đang tick ở tab Báo cáo ({platform}). Sửa template bên trái là thấy ngay — nhớ bấm Lưu template.
            </p>
            {rendered.error ? (
              <div className="text-small text-crit">Template lỗi: {rendered.error}</div>
            ) : (
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-ground px-3 py-2 font-mono text-small leading-[1.6]">
                {rendered.text || 'Chưa có task nào được tick.'}
              </pre>
            )}
          </section>
        </div>
      )}

      {/* Hidden, not unmounted: the form holds unsaved edits in its own state. */}
      <section hidden={tab !== 'config'} className="card max-w-3xl p-4">
        <div className="eyebrow mb-3 text-ink-2">Cấu hình: nền tảng · môi trường · repo GitHub · mẫu cho AI</div>
        <ConfigPanel initial={config} githubReady={props.githubReady} />
      </section>
    </div>
  )
}
