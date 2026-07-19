'use client'

import { useActionState, useState, useTransition } from 'react'

import {
  type SaveResult,
  type TestResult,
  saveSettings,
  testGeminiConnection,
  testJiraConnection,
} from './actions'

const K = {
  jiraBaseUrl: 'jira_base_url',
  jiraEmail: 'jira_email',
  jiraApiToken: 'jira_api_token',
  jiraProjectKey: 'jira_project_key',
  jiraBoardId: 'jira_board_id',
  googleApiKey: 'google_api_key',
  geminiModel: 'gemini_model',
  dailyQuotaHours: 'daily_quota_hours',
  logStepHours: 'log_step_hours',
  logPresets: 'log_presets',
  weekendCountsToQuota: 'weekend_counts_to_quota',
  sprintPrefixPattern: 'sprint_prefix_pattern',
  pointBudget1: 'point_budget_1',
  pointBudget2: 'point_budget_2',
  pointBudget3: 'point_budget_3',
} as const

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<SaveResult | null, FormData>(
    saveSettings,
    null,
  )

  return (
    <form action={formAction} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <Card title="Kết nối Jira">
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

        <Card title="Google Gemini">
          <Field
            label="API key"
            name={K.googleApiKey}
            defaultValue={initial[K.googleApiKey]}
            type="password"
            hint="Tạo tại aistudio.google.com/apikey"
          />
          <Field label="Model" name={K.geminiModel} defaultValue={initial[K.geminiModel]} mono />
          <ConnectionTest label="Test Gemini" run={testGeminiConnection} />
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card title="Quy tắc giờ">
          <Field label="Định mức ngày thường" name={K.dailyQuotaHours} defaultValue={initial[K.dailyQuotaHours]} mono />
          <Field label="Bước nhảy nút +/−" name={K.logStepHours} defaultValue={initial[K.logStepHours]} mono />
          <Field label="Preset chọn nhanh" name={K.logPresets} defaultValue={initial[K.logPresets]} mono />
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              name={K.weekendCountsToQuota}
              defaultChecked={initial[K.weekendCountsToQuota] === 'true'}
              className="accent-accent"
            />
            Cuối tuần cũng tính định mức
          </label>
          <p className="text-[11.5px] leading-relaxed text-ink-3">
            Mặc định T7 và CN không có định mức — giờ log vào vẫn cộng tổng nhưng không bị cảnh báo thiếu.
          </p>
        </Card>

        <Card title="Quy đổi point → giờ">
          <div className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
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
                  className="w-full rounded-md border border-line bg-ground px-[9px] py-[6px] font-mono text-[13px]"
                />
              </div>
            ))}
          </div>
          <p className="text-[11.5px] leading-relaxed text-ink-3">
            Chỉ để hiện cảnh báo mềm khi giờ log vượt mốc trên. Không bao giờ chặn thao tác log.
          </p>
        </Card>

        <Card title="Tiền tố sprint">
          <Field
            label="Mẫu"
            name={K.sprintPrefixPattern}
            defaultValue={initial[K.sprintPrefixPattern]}
            mono
            hint="{n} lấy số cuối trong tên sprint — VT Sprint 66 → [spt 66]. Để trống nếu không dùng."
          />
        </Card>

        <div className="flex items-center justify-end gap-3">
          {state && (
            <span className={'text-[13px] ' + (state.ok ? 'text-good' : 'text-crit')}>
              {state.message}
            </span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-3 py-[6px] text-sm font-medium text-white hover:bg-accent-2 disabled:opacity-60"
          >
            {pending ? 'Đang lưu…' : 'Lưu settings'}
          </button>
        </div>
      </div>
    </form>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[9px] border border-line bg-surface p-[17px]">
      <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
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
          'w-full rounded-md border border-line bg-ground px-[10px] py-[7px] text-[13.5px] ' +
          (mono ? 'font-mono' : '')
        }
      />
      {hint && <span className="text-[11.5px] leading-relaxed text-ink-3">{hint}</span>}
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
        className="rounded-md border border-line-strong bg-surface px-[9px] py-1 text-[12.5px] hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? 'Đang thử…' : label}
      </button>

      {result && (
        <span className="flex items-center gap-2 font-mono text-[11px]">
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
