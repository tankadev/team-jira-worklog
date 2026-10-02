'use client'

import { createContext, useActionState, useContext, useEffect, useState, useTransition } from 'react'

import { Icon } from '../icons'

import {
  type DetectResult,
  type SaveResult,
  type TestResult,
  detectTeamAction,
  saveSettings,
  testGeminiConnection,
  testJiraConnection,
} from './actions'
import { TabPanel, useActiveTabIsForm } from './tabs'

const K = {
  jiraBaseUrl: 'jira_base_url',
  jiraEmail: 'jira_email',
  jiraApiToken: 'jira_api_token',
  jiraProjectKey: 'jira_project_key',
  jiraBoardId: 'jira_board_id',
  googleApiKey: 'google_api_key',
  githubToken: 'github_token',
  geminiModel: 'gemini_model',
  geminiFallbackModels: 'gemini_fallback_models',
  dailyQuotaHours: 'daily_quota_hours',
  logStepHours: 'log_step_hours',
  logPresets: 'log_presets',
  weekendCountsToQuota: 'weekend_counts_to_quota',
  workDayStart: 'work_day_start',
  workDayEnd: 'work_day_end',
  breakStart: 'break_start',
  breakEnd: 'break_end',
  sprintPrefixPattern: 'sprint_prefix_pattern',
  teamLabel: 'team_label',
  teamPrefix: 'team_prefix',
  teamSprintFilter: 'team_sprint_filter',
  showSprintPoints: 'show_sprint_points',
  pointBudget1: 'point_budget_1',
  pointBudget2: 'point_budget_2',
  pointBudget3: 'point_budget_3',
} as const

const FORM_ID = 'settings-form'

interface SaveState {
  state: SaveResult | null
  formAction: (formData: FormData) => void
  pending: boolean
  /** Something was edited since the last successful save. */
  dirty: boolean
  setDirty: (dirty: boolean) => void
}

const SaveContext = createContext<SaveState | null>(null)

function useSave() {
  const save = useContext(SaveContext)
  if (!save) throw new Error('SettingsForm and SaveSettingsButton need a SettingsSaveProvider')
  return save
}

/**
 * Save state shared by the form and its button.
 *
 * The button sits in the tab bar, outside the <form>, and submits it through
 * the `form` attribute. It used to be a bar under the form, which jumped up
 * and down with every tab switch as the panel above it changed height.
 */
export function SettingsSaveProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false)
  const [state, formAction, pending] = useActionState<SaveResult | null, FormData>(
    async (prev, formData) => {
      const res = await saveSettings(prev, formData)
      if (res.ok) setDirty(false)
      return res
    },
    null,
  )

  return (
    <SaveContext.Provider value={{ state, formAction, pending, dirty, setDirty }}>
      {children}
    </SaveContext.Provider>
  )
}

/** One save for every form tab; hidden on the tabs that save themselves (modules, templates). */
export function SaveSettingsButton() {
  const { state, pending, dirty } = useSave()
  const show = useActiveTabIsForm()

  // ⌘S / Ctrl+S saves, rather than the browser offering to download the page.
  useEffect(() => {
    if (!show) return
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        ;(document.getElementById(FORM_ID) as HTMLFormElement | null)?.requestSubmit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  if (!show) return null

  // An edit makes the last result stale, so "Đã lưu" gives way to "Chưa lưu".
  // A failure is shown at every width — it is the one status that cannot wait.
  const status = dirty
    ? { tone: 'text-warn', dot: 'bg-warn', text: 'Chưa lưu', always: false }
    : state
      ? state.ok
        ? null // the button itself turns into "Đã lưu"
        : { tone: 'text-crit', dot: 'bg-crit', text: state.message, always: true }
      : null
  const saved = !!state?.ok && !dirty && !pending

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-l border-line pl-2.5">
      {status && (
        <span
          role="status"
          title={status.text}
          className={
            'max-w-48 items-center gap-1.5 text-small ' +
            (status.always ? 'flex ' : 'hidden xl:flex ') +
            status.tone
          }
        >
          <i className={'inline-block size-1.5 shrink-0 rounded-full ' + status.dot} />
          <span className="truncate">{status.text}</span>
        </span>
      )}
      <button
        type="submit"
        form={FORM_ID}
        disabled={pending}
        title="Lưu mọi tab (⌘S)"
        className={
          'relative flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-small font-semibold transition-colors disabled:opacity-60 ' +
          (saved
            ? 'bg-accent-soft text-accent-ink hover:bg-accent hover:text-on-accent'
            : 'bg-accent text-on-accent shadow-card hover:bg-accent-2')
        }
      >
        {saved && <Icon name="check" className="size-3.5" />}
        {pending ? (
          'Đang lưu…'
        ) : saved ? (
          'Đã lưu'
        ) : (
          <>
            Lưu<span className="hidden sm:inline"> settings</span>
          </>
        )}
        {/* Below xl the status text makes way for the tabs; the dot still says "unsaved". */}
        {dirty && !pending && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-warn ring-2 ring-surface xl:hidden" />
        )}
      </button>
    </div>
  )
}

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const { formAction, setDirty } = useSave()
  const showForm = useActiveTabIsForm()

  return (
    <form
      id={FORM_ID}
      action={formAction}
      onChange={() => setDirty(true)}
      hidden={!showForm}
      className="flex flex-col gap-5"
    >
      <TabPanel id="connection" className={PANEL}>
        <Card id="jira" title="Kết nối Jira">
          <Field label="Jira base URL" name={K.jiraBaseUrl} defaultValue={initial[K.jiraBaseUrl]} mono />
          <Field label="Email" name={K.jiraEmail} defaultValue={initial[K.jiraEmail]} />
          <Field
            label="API token"
            name={K.jiraApiToken}
            defaultValue={initial[K.jiraApiToken]}
            type="password"
            hint="Để nguyên dấu chấm nếu không đổi. Tạo mới tại id.atlassian.com"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project key" name={K.jiraProjectKey} defaultValue={initial[K.jiraProjectKey]} mono />
            <Field label="Board id" name={K.jiraBoardId} defaultValue={initial[K.jiraBoardId]} mono />
          </div>
          <ConnectionTest label="Test connection" run={testJiraConnection} />
        </Card>

        <TeamCard initial={initial} />
      </TabPanel>

      <TabPanel id="integrations" className={PANEL}>
        <Card id="gemini" title="Google Gemini">
          <Field
            label="API key"
            name={K.googleApiKey}
            defaultValue={initial[K.googleApiKey]}
            type="password"
            hint="Tạo tại aistudio.google.com/apikey"
          />
          <Field label="Model" name={K.geminiModel} defaultValue={initial[K.geminiModel]} mono />
          <Field
            label="Model dự phòng"
            name={K.geminiFallbackModels}
            defaultValue={initial[K.geminiFallbackModels]}
            mono
            hint="Dùng lần lượt khi model chính hết quota. Cách nhau bằng dấu phẩy."
          />
          <ConnectionTest label="Test Gemini" run={testGeminiConnection} />
        </Card>

        {/* Used only by the "Nhánh & ghi chú" module, but kept here with the
            other credentials: a token filed somewhere else is a token nobody
            remembers to rotate. */}
        <Card id="github" title="GitHub">
          <Field
            label="Personal access token"
            name={K.githubToken}
            defaultValue={initial[K.githubToken]}
            type="password"
            hint="Scope repo. Seed lần đầu từ GITHUB_TOKEN trong .env.local. Dùng để quét nhánh trong module Nhánh & ghi chú."
          />
        </Card>
      </TabPanel>

      <TabPanel id="hours" className={PANEL}>
        <Card id="hours" title="Quy tắc giờ">
          <Field label="Định mức ngày thường" name={K.dailyQuotaHours} defaultValue={initial[K.dailyQuotaHours]} mono />
          <Field label="Bước nhảy nút +/−" name={K.logStepHours} defaultValue={initial[K.logStepHours]} mono />
          <Field label="Preset chọn nhanh" name={K.logPresets} defaultValue={initial[K.logPresets]} mono />
          <label className="flex items-center gap-2 text-body text-ink-2">
            <input
              type="checkbox"
              name={K.weekendCountsToQuota}
              defaultChecked={initial[K.weekendCountsToQuota] === 'true'}
              className="accent-accent"
            />
            Cuối tuần cũng tính định mức
          </label>
          <p className="text-small leading-relaxed text-ink-3">
            Mặc định T7 và CN không có định mức — giờ log vào vẫn cộng tổng nhưng không bị cảnh báo thiếu.
          </p>
        </Card>

        <Card id="schedule" title="Giờ làm việc">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bắt đầu" name={K.workDayStart} defaultValue={initial[K.workDayStart]} mono />
            <Field label="Kết thúc" name={K.workDayEnd} defaultValue={initial[K.workDayEnd]} mono />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nghỉ trưa từ" name={K.breakStart} defaultValue={initial[K.breakStart]} mono />
            <Field label="Đến" name={K.breakEnd} defaultValue={initial[K.breakEnd]} mono />
          </div>
          <p className="text-small leading-relaxed text-ink-3">
            Định dạng <code className="font-mono">HH:MM</code>. Worklog xếp nối tiếp nhau từ giờ bắt
            đầu và nhảy qua giờ nghỉ: log 1h rồi 1h rồi 6h sẽ thành 09:00–10:00, 10:00–11:00,
            11:00–18:00. Để trống hai ô nghỉ trưa nếu ngày làm liền mạch.
          </p>
        </Card>
      </TabPanel>

      <TabPanel id="points" className={PANEL}>
        <Card id="points" title="Quy đổi point → giờ">
          <label className="flex items-center gap-2 text-body text-ink-2">
            <input
              type="checkbox"
              name={K.showSprintPoints}
              defaultChecked={initial[K.showSprintPoints] === 'true'}
              className="accent-accent"
            />
            Hiện bảng tổng hợp point của sprint
          </label>
          <p className="text-small leading-relaxed text-ink-3">
            Mặc định tắt. Panel bên phải task board: bao nhiêu point đã xong,
            chia theo trạng thái, và giờ mỗi point. Tắt thì bỏ hẳn — không vẽ
            panel và cũng không chạy truy vấn Jira nào cho nó.
          </p>
          <div className="mt-1 grid grid-cols-[34px_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            {[
              [K.pointBudget1, '1'],
              [K.pointBudget2, '2'],
              [K.pointBudget3, '3'],
            ].map(([name, point]) => (
              <div key={name} className="contents">
                <span className="rounded bg-surface-2 py-[3px] text-center font-mono text-sm font-semibold">
                  {point}
                </span>
                <input
                  name={name}
                  defaultValue={initial[name] ?? ''}
                  className="w-full rounded-lg border border-line bg-ground px-3 py-[7px] font-mono text-body"
                />
              </div>
            ))}
          </div>
          <p className="text-small leading-relaxed text-ink-3">
            Chỉ để hiện cảnh báo mềm khi giờ log vượt mốc trên. Không bao giờ chặn thao tác log.
          </p>
        </Card>

        <Card id="sprint-prefix" title="Tiền tố sprint">
          <Field
            label="Mẫu"
            name={K.sprintPrefixPattern}
            defaultValue={initial[K.sprintPrefixPattern]}
            mono
            hint="{n} lấy số cuối trong tên sprint — CTALK-TEAM Sprint 69 → [SPT-69] nếu mẫu là [SPT-{n}]. Để trống nếu không dùng."
          />
        </Card>
      </TabPanel>

    </form>
  )
}

/**
 * The team's slice of a shared board.
 *
 * One Jira project can host several teams whose boards differ only by a label —
 * VipTalk splits CTALK-TEAM from HIR-TEAM that way. These three values are what
 * the app needs to stay inside one team's lane: what to filter reads by, what
 * to stamp on every issue it creates, and which sprints are actually this
 * team's. Leave them empty on a single-team board and nothing changes.
 *
 * Controlled inputs rather than defaultValue, because "Dò từ board" fills them
 * in — the user then reads what was found and saves it, or does not.
 */
function TeamCard({ initial }: { initial: Record<string, string> }) {
  const [label, setLabel] = useState(initial[K.teamLabel] ?? '')
  const [prefix, setPrefix] = useState(initial[K.teamPrefix] ?? '')
  const [sprintFilter, setSprintFilter] = useState(initial[K.teamSprintFilter] ?? '')
  const [result, setResult] = useState<DetectResult | null>(null)
  const [pending, startTransition] = useTransition()
  const { setDirty } = useSave()

  function detect() {
    startTransition(async () => {
      const res = await detectTeamAction()
      setResult(res)
      if (res.ok && res.scope) {
        setLabel(res.scope.label ?? '')
        setPrefix(res.scope.prefix ?? '')
        setSprintFilter(res.scope.sprintFilter ?? '')
        setDirty(true)
      }
    })
  }

  return (
    <Card id="team" title="Team trên board">
      <ControlledField
        label="Label của team"
        name={K.teamLabel}
        value={label}
        onChange={setLabel}
        mono
        hint="Board của team là một filter theo label này. Mọi task app tạo ra đều được gắn — thiếu nó task sẽ không hiện trên board."
      />
      <ControlledField
        label="Tiền tố bắt buộc"
        name={K.teamPrefix}
        value={prefix}
        onChange={setPrefix}
        mono
        hint="Luôn đứng đầu title, không bỏ chọn được. Ví dụ [CTALK]."
      />
      <ControlledField
        label="Lọc sprint theo tên"
        name={K.teamSprintFilter}
        value={sprintFilter}
        onChange={setSprintFilter}
        mono
        hint="Board chung liệt kê cả sprint của team khác. Chuỗi này giữ lại đúng sprint của bạn — ví dụ CTALK."
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={detect}
          className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-medium text-body hover:bg-surface-2 disabled:opacity-60"
        >
          {pending ? 'Đang dò…' : 'Dò từ board'}
        </button>
        {result && (
          <span className="flex min-w-0 items-center gap-2 font-mono text-caption">
            <i
              className={
                'inline-block size-[6px] shrink-0 rounded-full ' +
                (result.ok ? 'bg-good' : 'bg-crit')
              }
            />
            <span className={result.ok ? 'text-ink-2' : 'text-crit'}>{result.message}</span>
          </span>
        )}
      </div>
      {result?.detail && (
        <code className="block overflow-x-auto rounded-md bg-surface-2 px-2 py-1.5 font-mono text-caption text-ink-3">
          {result.detail}
        </code>
      )}
      {result?.ok && (
        <p className="text-small leading-relaxed text-ink-3">
          Đã điền sẵn — kiểm tra lại rồi bấm <b className="text-ink-2">Lưu settings</b>.
        </p>
      )}
    </Card>
  )
}

/** Two cards side by side on a wide screen, stacked otherwise. */
const PANEL = 'grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2'

function Card({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20 p-5">
      <div className="mb-3 eyebrow text-ink-2">
        {title}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  mono,
  hint,
}: {
  label: string
  name: string
  defaultValue?: string
  type?: string
  mono?: boolean
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        className={
          'w-full rounded-lg border border-line bg-ground px-3 py-2 text-emph ' +
          (mono ? 'font-mono' : '')
        }
      />
      {hint && <span className="text-small leading-relaxed text-ink-3">{hint}</span>}
    </label>
  )
}

function ControlledField({
  label,
  name,
  value,
  onChange,
  mono,
  hint,
}: {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  mono?: boolean
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          'w-full rounded-lg border border-line bg-ground px-3 py-2 text-emph ' +
          (mono ? 'font-mono' : '')
        }
      />
      {hint && <span className="text-small leading-relaxed text-ink-3">{hint}</span>}
    </label>
  )
}

/**
 * Runs against what is already saved, not the current form values — so a green
 * result means the stored config genuinely works.
 */
function ConnectionTest({ label, run }: { label: string; run: () => Promise<TestResult> }) {
  const [result, setResult] = useState<TestResult | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await run()))}
        className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-medium text-body hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? 'Đang thử…' : label}
      </button>

      {result && (
        <span className="flex items-center gap-2 font-mono text-caption">
          <i
            className={
              'inline-block size-[6px] shrink-0 rounded-full ' +
              (result.ok ? 'bg-good' : 'bg-crit')
            }
          />
          <span className={result.ok ? 'text-ink-2' : 'text-crit'}>{result.message}</span>
          {result.detail && <span className="text-ink-3">{result.detail}</span>}
        </span>
      )}
    </div>
  )
}
