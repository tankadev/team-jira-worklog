'use client'

import { useRef, useState, useTransition } from 'react'

import type { BuildStatus } from '@/lib/modules/ios-publish/asc'
import type { AppPreset, ProfileView } from '@/lib/modules/ios-publish/config'
import { DEFAULT_MESSAGE_TEMPLATE } from '@/lib/modules/ios-publish/message'

import {
  checkStatusAction,
  deleteAppPresetAction,
  deleteAscProfileAction,
  saveAppPresetAction,
  saveAscProfileAction,
  saveNotifyAction,
  submitBuildAction,
} from './actions'

interface ConfigView {
  profiles: ProfileView[]
  apps: AppPreset[]
  hasWebhook: boolean
  chatTemplate: string
}

interface LogRow {
  id: number
  appName: string
  buildNumber: string
  groupName: string
  state: string
  ok: boolean
  message: string
  when: string
}

const CARD = 'rounded-[9px] border border-line bg-surface p-[17px]'
const CTITLE = 'font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3'
const INPUT = 'w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px]'
const BTN = 'rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[12.5px] hover:bg-surface-2'
const BTN_PRI = 'rounded-md bg-accent px-3 py-1 text-[12.5px] font-medium text-white hover:bg-accent-2 disabled:opacity-50'

type Note = { ok: boolean; message: string } | null

export function IosPublish({
  config,
  log,
}: {
  configured: boolean
  config: ConfigView
  log: LogRow[]
}) {
  const canPublish = config.profiles.length > 0 && config.apps.length > 0
  const [tab, setTab] = useState<'publish' | 'config'>(canPublish ? 'publish' : 'config')

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className={CTITLE}>Module · App Store Connect API</div>
          <h1 className="text-xl font-semibold tracking-tight">iOS publish</h1>
        </div>
        <div className="flex overflow-hidden rounded-md border border-line-strong text-[12.5px]">
          <TabBtn on={tab === 'publish'} onClick={() => setTab('publish')}>
            Publish
          </TabBtn>
          <TabBtn on={tab === 'config'} onClick={() => setTab('config')}>
            Cấu hình{!canPublish && <span className="ml-1 text-warn">•</span>}
          </TabBtn>
        </div>
      </header>

      {tab === 'publish' ? (
        config.apps.length ? (
          <PublishCards apps={config.apps} log={log} />
        ) : (
          <div className={CARD + ' text-[12.5px] text-ink-2'}>
            Chưa có app nào.{' '}
            <button
              type="button"
              onClick={() => setTab('config')}
              className="text-accent-ink underline underline-offset-2"
            >
              Mở tab Cấu hình
            </button>{' '}
            để thêm cấu hình ASC và app.
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <ProfilesManager profiles={config.profiles} />
          <AppsManager apps={config.apps} profiles={config.profiles} />
          <NotifyManager hasWebhook={config.hasWebhook} chatTemplate={config.chatTemplate} />
        </div>
      )}
    </>
  )
}

function TabBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'border-l border-line px-3.5 py-[5px] first:border-l-0 ' +
        (on ? 'bg-accent-soft font-semibold text-accent-ink' : 'bg-surface text-ink-2 hover:bg-surface-2')
      }
    >
      {children}
    </button>
  )
}

// ── publish ──────────────────────────────────────────────────────────────────

function PublishCards({ apps, log }: { apps: AppPreset[]; log: LogRow[] }) {
  const [appId, setAppId] = useState(apps[0]?.id ?? '')
  const [version, setVersion] = useState(apps[0]?.version ?? '')
  const [groupName, setGroupName] = useState(apps[0]?.groups[0] ?? '')
  const [buildNumber, setBuildNumber] = useState('')
  const [content, setContent] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string; status?: BuildStatus } | null>(null)
  const [checking, startCheck] = useTransition()
  const [submitting, startSubmit] = useTransition()

  const app = apps.find((a) => a.id === appId)
  const groups = app?.groups ?? []
  const busy = checking || submitting

  function pickApp(id: string) {
    const a = apps.find((x) => x.id === id)
    setAppId(id)
    setVersion(a?.version ?? '')
    setGroupName(a?.groups[0] ?? '')
    setResult(null)
  }

  const payload = () => ({ appId, version, groupName, buildNumber, content })
  function check() {
    startCheck(async () => setResult(await checkStatusAction(payload())))
  }
  function submit() {
    startSubmit(async () => setResult(await submitBuildAction(payload())))
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className={CARD}>
        <div className={'mb-3 ' + CTITLE}>Submit build lên TestFlight external</div>

        <label className="mb-3 flex flex-col gap-[5px]">
          <span className="text-xs font-medium text-ink-2">App</span>
          <select value={appId} onChange={(e) => pickApp(e.target.value)} className={INPUT}>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-3 flex gap-3">
          <label className="flex flex-1 flex-col gap-[5px]">
            <span className="text-xs font-medium text-ink-2">Version</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} className={INPUT} />
          </label>
          <label className="flex w-[150px] flex-col gap-[5px]">
            <span className="text-xs font-medium text-ink-2">Build number</span>
            <input
              value={buildNumber}
              onChange={(e) => setBuildNumber(e.target.value)}
              placeholder="2381"
              className={INPUT + ' font-mono'}
            />
          </label>
        </div>

        <label className="mb-3 flex flex-col gap-[5px]">
          <span className="text-xs font-medium text-ink-2">Nhóm external</span>
          <select value={groupName} onChange={(e) => setGroupName(e.target.value)} className={INPUT}>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 flex flex-col gap-[5px]">
          <span className="text-xs font-medium text-ink-2">What to Test</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="- Mô tả bản build cho tester"
            className={INPUT + ' resize-y text-[12.5px] leading-relaxed'}
          />
        </label>

        <div className="flex items-center gap-2">
          <button type="button" onClick={check} disabled={busy} className={BTN + ' py-1.5 disabled:opacity-50'}>
            {checking ? 'Đang kiểm tra…' : 'Kiểm tra trạng thái'}
          </button>
          <button type="button" onClick={submit} disabled={busy} className={BTN_PRI + ' flex-1 py-1.5'}>
            {submitting ? 'Đang submit…' : 'Submit lên TestFlight'}
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        {result && (
          <section className={CARD}>
            <div className={'mb-2.5 ' + CTITLE}>Trạng thái build {buildNumber}</div>
            {result.status && (
              <div className="flex flex-col gap-2">
                <Kv label="External state">
                  <Pill value={result.status.externalBuildState} />
                </Kv>
                <Kv label="Processing">
                  <Pill value={result.status.processingState} />
                </Kv>
              </div>
            )}
            <p className={'mt-2.5 text-[12.5px] ' + (result.ok ? 'text-good' : 'text-crit')}>{result.message}</p>
          </section>
        )}

        <section className={CARD}>
          <div className={'mb-2.5 ' + CTITLE}>Lịch sử submit</div>
          {log.length === 0 ? (
            <p className="text-[12px] text-ink-3">Chưa có lần submit nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left font-mono text-[9.5px] uppercase tracking-[0.06em] text-ink-3">
                    <th className="border-b border-line py-1.5 pr-2">Build</th>
                    <th className="border-b border-line py-1.5 pr-2">App</th>
                    <th className="border-b border-line py-1.5 pr-2">Lúc</th>
                    <th className="border-b border-line py-1.5">KQ</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((e) => (
                    <tr key={e.id}>
                      <td className="border-b border-line py-1.5 pr-2 font-mono">{e.buildNumber}</td>
                      <td className="border-b border-line py-1.5 pr-2">{e.appName}</td>
                      <td className="border-b border-line py-1.5 pr-2 font-mono text-ink-3">{e.when}</td>
                      <td className="border-b border-line py-1.5">
                        <span
                          title={e.message}
                          className={
                            'rounded-full px-2 py-px font-mono text-[10px] ' +
                            (e.ok ? 'bg-good-soft text-good' : 'bg-crit-soft text-crit')
                          }
                        >
                          {e.ok ? 'ok' : 'lỗi'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12.5px]">
      <span className="text-ink-2">{label}</span>
      {children}
    </div>
  )
}

function Pill({ value }: { value: string }) {
  const v = value.toUpperCase()
  const tone = ['VALID', 'READY_FOR_BETA_SUBMISSION', 'IN_BETA_TESTING', 'APPROVED'].includes(v)
    ? 'bg-good-soft text-good'
    : v.includes('REJECT') || v.includes('FAIL') || v.includes('INVALID') || v === 'ERROR'
      ? 'bg-crit-soft text-crit'
      : v.includes('PROCESSING') || v.includes('WAITING') || v.includes('REVIEW')
        ? 'bg-warn-soft text-warn'
        : 'bg-blue-soft text-blue'
  return <span className={'rounded-full px-2 py-px font-mono text-[10.5px] font-semibold ' + tone}>{value}</span>
}

// ── config: ASC profiles ─────────────────────────────────────────────────────

function ProfilesManager({ profiles }: { profiles: ProfileView[] }) {
  const nextKey = useRef(1)
  const [slots, setSlots] = useState(() =>
    profiles.map((p) => ({ key: `p${nextKey.current++}`, view: p })),
  )

  const blank: ProfileView = { id: '', name: '', issuerId: '', keyId: '', hasP8: false }

  return (
    <section className={CARD}>
      <div className={'mb-3 ' + CTITLE}>Tài khoản App Store Connect</div>
      <div className="flex flex-col gap-3">
        {slots.map((sl) => (
          <ProfileEditor
            key={sl.key}
            view={sl.view}
            onSaved={(v) => setSlots((s) => s.map((x) => (x.key === sl.key ? { ...x, view: v } : x)))}
            onRemove={() => setSlots((s) => s.filter((x) => x.key !== sl.key))}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setSlots((s) => [...s, { key: `p${nextKey.current++}`, view: blank }])}
        className={'mt-3 ' + BTN}
      >
        + Thêm tài khoản
      </button>
    </section>
  )
}

function ProfileEditor({
  view,
  onSaved,
  onRemove,
}: {
  view: ProfileView
  onSaved: (v: ProfileView) => void
  onRemove: () => void
}) {
  const [name, setName] = useState(view.name)
  const [issuerId, setIssuerId] = useState(view.issuerId)
  const [keyId, setKeyId] = useState(view.keyId)
  const [p8Key, setP8Key] = useState('')
  const [note, setNote] = useState<Note>(null)
  const [saving, startSaving] = useTransition()
  const [removing, startRemoving] = useTransition()

  function save() {
    startSaving(async () => {
      const res = await saveAscProfileAction({ id: view.id || undefined, name, issuerId, keyId, p8Key })
      setNote(res)
      if (res.ok && res.profile) {
        onSaved(res.profile)
        setP8Key('')
      }
    })
  }
  function remove() {
    if (!view.id) return onRemove()
    startRemoving(async () => {
      const res = await deleteAscProfileAction(view.id)
      if (res.ok) onRemove()
      else setNote(res)
    })
  }

  return (
    <div className="rounded-[8px] border border-line bg-ground p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên cấu hình, vd TAKAI"
          className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1 text-[13px] font-medium"
        />
        <button type="button" onClick={remove} disabled={removing} className="text-[12px] text-ink-3 hover:text-crit disabled:opacity-50">
          {removing ? '…' : 'Xoá'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={issuerId}
          onChange={(e) => setIssuerId(e.target.value)}
          placeholder="Issuer ID"
          className="min-w-[200px] flex-1 rounded-md border border-line bg-surface px-2.5 py-1 font-mono text-[11.5px]"
        />
        <input
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
          placeholder="Key ID"
          className="w-[150px] rounded-md border border-line bg-surface px-2.5 py-1 font-mono text-[11.5px]"
        />
      </div>
      <textarea
        value={p8Key}
        onChange={(e) => setP8Key(e.target.value)}
        rows={3}
        placeholder={view.hasP8 ? '••••••••••  (.p8 đã lưu, để trống nếu giữ nguyên)' : '-----BEGIN PRIVATE KEY-----\n…'}
        className="mt-2 w-full resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] leading-relaxed"
      />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className={BTN_PRI}>
          {saving ? 'Đang lưu…' : 'Lưu'}
        </button>
        {note && <span className={'text-[12px] ' + (note.ok ? 'text-good' : 'text-crit')}>{note.message}</span>}
      </div>
    </div>
  )
}

// ── config: app presets ──────────────────────────────────────────────────────

function AppsManager({ apps, profiles }: { apps: AppPreset[]; profiles: ProfileView[] }) {
  const nextKey = useRef(1)
  const [slots, setSlots] = useState(() => apps.map((a) => ({ key: `a${nextKey.current++}`, view: a })))

  const blank: AppPreset = { id: '', name: '', profileId: '', version: '', groups: [''], roomIds: '' }

  return (
    <section className={CARD}>
      <div className={'mb-1 ' + CTITLE}>App</div>
      <p className="mb-3 text-[11.5px] text-ink-3">
        Lưu sẵn app + version + external group + room, gắn với 1 cấu hình ASC. Publish chỉ đổi build number và What
        to Test.
      </p>
      {profiles.length === 0 ? (
        <p className="text-[12px] text-warn">Tạo ít nhất 1 cấu hình ASC ở trên trước đã.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {slots.map((sl) => (
              <AppEditor
                key={sl.key}
                view={sl.view}
                profiles={profiles}
                onSaved={(a) => setSlots((s) => s.map((x) => (x.key === sl.key ? { ...x, view: a } : x)))}
                onRemove={() => setSlots((s) => s.filter((x) => x.key !== sl.key))}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSlots((s) => [...s, { key: `a${nextKey.current++}`, view: blank }])}
            className={'mt-3 ' + BTN}
          >
            + Thêm app
          </button>
        </>
      )}
    </section>
  )
}

function AppEditor({
  view,
  profiles,
  onSaved,
  onRemove,
}: {
  view: AppPreset
  profiles: ProfileView[]
  onSaved: (a: AppPreset) => void
  onRemove: () => void
}) {
  const [name, setName] = useState(view.name)
  const [profileId, setProfileId] = useState(view.profileId || profiles[0]?.id || '')
  const [version, setVersion] = useState(view.version)
  const [groups, setGroups] = useState<string[]>(view.groups.length ? view.groups : [''])
  const [roomIds, setRoomIds] = useState(view.roomIds)
  const [note, setNote] = useState<Note>(null)
  const [saving, startSaving] = useTransition()
  const [removing, startRemoving] = useTransition()

  function save() {
    startSaving(async () => {
      const res = await saveAppPresetAction({ id: view.id || undefined, name, profileId, version, groups, roomIds })
      setNote(res)
      if (res.ok && res.app) onSaved(res.app)
    })
  }
  function remove() {
    if (!view.id) return onRemove()
    startRemoving(async () => {
      const res = await deleteAppPresetAction(view.id)
      if (res.ok) onRemove()
      else setNote(res)
    })
  }

  return (
    <div className="rounded-[8px] border border-line bg-ground p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên app đúng như trên ASC, vd CTalk"
          className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1 text-[13px] font-medium"
        />
        <button type="button" onClick={remove} disabled={removing} className="text-[12px] text-ink-3 hover:text-crit disabled:opacity-50">
          {removing ? '…' : 'Xoá'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] text-ink-3">Cấu hình ASC</span>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="rounded-md border border-line bg-surface px-2.5 py-1 text-[12.5px]">
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[130px] flex-col gap-1">
          <span className="text-[11px] text-ink-3">Version mặc định</span>
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="4.12.0" className="rounded-md border border-line bg-surface px-2.5 py-1 text-[12.5px]" />
        </label>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <span className="text-[11px] text-ink-3">External group (nhiều dòng được)</span>
        {groups.map((g, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={g}
              onChange={(e) => setGroups((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="Public Testers"
              className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1 text-[12.5px]"
            />
            <button
              type="button"
              onClick={() => setGroups((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : ['']))}
              aria-label="Xoá group"
              className="grid size-6 place-items-center rounded-md text-[15px] leading-none text-ink-3 hover:bg-surface-2 hover:text-crit"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setGroups((list) => [...list, ''])} className={'self-start ' + BTN}>
          + Group
        </button>
      </div>

      <label className="mt-2 flex flex-col gap-1">
        <span className="text-[11px] text-ink-3">Room notify (bỏ trống nếu không gửi bot)</span>
        <input
          value={roomIds}
          onChange={(e) => setRoomIds(e.target.value)}
          placeholder="!room1:chatchit.org, !room2:chatchit.org"
          className="rounded-md border border-line bg-surface px-2.5 py-1 font-mono text-[11.5px]"
        />
      </label>

      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className={BTN_PRI}>
          {saving ? 'Đang lưu…' : 'Lưu'}
        </button>
        {note && <span className={'text-[12px] ' + (note.ok ? 'text-good' : 'text-crit')}>{note.message}</span>}
      </div>
    </div>
  )
}

// ── config: notify ───────────────────────────────────────────────────────────

function NotifyManager({ hasWebhook, chatTemplate }: { hasWebhook: boolean; chatTemplate: string }) {
  const [webhook, setWebhook] = useState('')
  const [template, setTemplate] = useState(chatTemplate)
  const [note, setNote] = useState<Note>(null)
  const [saving, startSaving] = useTransition()

  function save() {
    startSaving(async () => {
      const res = await saveNotifyAction({ chatWebhook: webhook, chatTemplate: template })
      setNote(res)
      if (res.ok) setWebhook('')
    })
  }

  return (
    <section className={CARD}>
      <div className={'mb-3 ' + CTITLE}>Bot notify</div>
      <label className="flex flex-col gap-[5px]">
        <span className="text-xs font-medium text-ink-2">
          Webhook{' '}
          {hasWebhook && <span className="font-normal text-ink-3">· đã lưu, để trống nếu giữ nguyên</span>}
        </span>
        <input
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder={hasWebhook ? '••••••••••  (đã lưu)' : 'https://api.chatchit.org/v1/bot/…/sendMessage?encryption=try'}
          className={INPUT + ' font-mono text-[11.5px]'}
        />
      </label>

      <label className="mt-3 flex flex-col gap-[5px]">
        <span className="text-xs font-medium text-ink-2">
          Nội dung notify{' '}
          <span className="font-normal text-ink-3">· chèn {'{app}'} {'{version}'} {'{build}'} {'{content}'}</span>
        </span>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={5}
          placeholder={DEFAULT_MESSAGE_TEMPLATE}
          className={INPUT + ' resize-y font-mono text-[11.5px] leading-relaxed'}
        />
        <span className="text-[11px] text-ink-3">Để trống = dùng mẫu mặc định. Room notify khai theo từng app ở trên.</span>
      </label>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className={BTN_PRI}>
          {saving ? 'Đang lưu…' : 'Lưu notify'}
        </button>
        {note && <span className={'text-[12px] ' + (note.ok ? 'text-good' : 'text-crit')}>{note.message}</span>}
      </div>
    </section>
  )
}
