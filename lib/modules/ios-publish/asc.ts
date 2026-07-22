import 'server-only'

import crypto from 'node:crypto'

import type { AscCredentials } from './config'
import { renderMessage } from './message'

const BASE = 'https://api.appstoreconnect.apple.com/v1'

/**
 * A short-lived ES256 JWT for App Store Connect.
 *
 * Signed with `node:crypto` rather than a JWT library: `dsaEncoding: 'ieee-p1363'`
 * emits the raw r‖s signature JOSE wants, so no dependency is needed. Apple caps
 * the lifetime at 20 minutes.
 */
function ascToken(cred: AscCredentials): string {
  const nowSec = Math.floor(Date.now() / 1000)
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

  const signingInput =
    `${b64({ alg: 'ES256', kid: cred.keyId, typ: 'JWT' })}.` +
    `${b64({ iss: cred.issuerId, iat: nowSec, exp: nowSec + 1200, aud: 'appstoreconnect-v1' })}`

  const signature = crypto
    .sign('sha256', Buffer.from(signingInput), { key: cred.p8Key, dsaEncoding: 'ieee-p1363' })
    .toString('base64url')

  return `${signingInput}.${signature}`
}

async function ascFetch<T>(
  cred: AscCredentials,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${ascToken(cred)}`,
      'Content-Type': 'application/json',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })

  const text = await res.text()
  const body = text ? JSON.parse(text) : null

  if (!res.ok) {
    const err = body?.errors?.[0]
    throw new Error(err?.detail || err?.title || `App Store Connect HTTP ${res.status}`)
  }
  return body as T
}

interface Listed {
  data?: Array<{ id: string; attributes?: Record<string, unknown> }>
}

async function findAppId(cred: AscCredentials, appName: string): Promise<string> {
  const res = await ascFetch<Listed>(cred, 'apps?limit=200')
  const app = res.data?.find((a) => a.attributes?.name === appName)
  if (!app) throw new Error(`Không thấy app "${appName}" trong tài khoản ASC`)
  return app.id
}

async function findGroupId(cred: AscCredentials, appId: string, groupName: string): Promise<string> {
  const res = await ascFetch<Listed>(cred, `apps/${appId}/betaGroups?limit=200`)
  const group = res.data?.find((g) => g.attributes?.name === groupName)
  if (!group) throw new Error(`Không thấy nhóm external "${groupName}" của app này`)
  return group.id
}

export interface BuildStatus {
  buildId: string
  processingState: string
  externalBuildState: string
}

async function findBuild(cred: AscCredentials, appId: string, buildNumber: string): Promise<BuildStatus> {
  const res = await ascFetch<Listed>(
    cred,
    `builds?filter[app]=${appId}&filter[version]=${encodeURIComponent(buildNumber)}&limit=1`,
  )
  const build = res.data?.[0]
  if (!build) throw new Error(`Không thấy build ${buildNumber} của app`)

  const detail = await ascFetch<Listed>(cred, `buildBetaDetails?filter[build]=${build.id}`)
  return {
    buildId: build.id,
    processingState: String(build.attributes?.processingState ?? 'UNKNOWN'),
    externalBuildState: String(detail.data?.[0]?.attributes?.externalBuildState ?? 'UNKNOWN'),
  }
}

async function addBuildToGroup(cred: AscCredentials, groupId: string, buildId: string) {
  await ascFetch(cred, `betaGroups/${groupId}/relationships/builds`, {
    method: 'POST',
    body: { data: [{ type: 'builds', id: buildId }] },
  })
}

async function submitForBetaReview(cred: AscCredentials, buildId: string) {
  await ascFetch(cred, 'betaAppReviewSubmissions', {
    method: 'POST',
    body: {
      data: {
        type: 'betaAppReviewSubmissions',
        relationships: { build: { data: { type: 'builds', id: buildId } } },
      },
    },
  })
}

async function setWhatToTest(cred: AscCredentials, buildId: string, whatsNew: string) {
  const locs = await ascFetch<Listed>(cred, `builds/${buildId}/betaBuildLocalizations`)
  const locId = locs.data?.[0]?.id
  if (!locId) return
  await ascFetch(cred, `betaBuildLocalizations/${locId}`, {
    method: 'PATCH',
    body: {
      data: { type: 'betaBuildLocalizations', id: locId, attributes: { whatsNew } },
    },
  })
}

export interface ResolvedStatus extends BuildStatus {
  appId: string
  groupId: string
}

/** Looks up app, group and build without changing anything. */
export async function resolveStatus(
  cred: AscCredentials,
  input: { appName: string; groupName: string; buildNumber: string },
): Promise<ResolvedStatus> {
  const appId = await findAppId(cred, input.appName)
  const groupId = await findGroupId(cred, appId, input.groupName)
  const build = await findBuild(cred, appId, input.buildNumber)
  return { appId, groupId, ...build }
}

export interface NotifyConfig {
  webhook: string
  roomIds: string
  /** Message template with {app} {version} {build} {content} placeholders. */
  template: string
}

/**
 * Announces the new build to a chat bot. Same shape as the original notifyBot —
 * POST `{ text, roomIds }` to the webhook. Best-effort: a failed notify never
 * fails the publish, so a bad webhook can't block a build that already shipped.
 */
async function notifyBot(notify: NotifyConfig, text: string) {
  try {
    await fetch(notify.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, roomIds: notify.roomIds.trim() }),
      cache: 'no-store',
    })
  } catch {
    // swallowed on purpose — see doc comment
  }
}

export interface SubmitOutcome {
  done: boolean
  /** True only when this call actually pushed the build (not already testing). */
  submitted: boolean
  message: string
  status: BuildStatus
}

/**
 * Submits a ready build to external testing. Mirrors the original service:
 * add to the group, create the beta-review submission, attach the "What to
 * Test" notes, then notify the bot. A build still processing on Apple's side is
 * reported back rather than polled — the user re-runs once it is VALID.
 */
export async function submitToExternalTesting(
  cred: AscCredentials,
  input: { appName: string; version: string; groupName: string; buildNumber: string; whatsNew: string },
  notify?: NotifyConfig,
): Promise<SubmitOutcome> {
  const st = await resolveStatus(cred, input)
  const status: BuildStatus = {
    buildId: st.buildId,
    processingState: st.processingState,
    externalBuildState: st.externalBuildState,
  }

  if (st.processingState === 'PROCESSING') {
    return { done: false, submitted: false, message: 'Apple đang xử lý build — thử lại sau ít phút.', status }
  }
  if (st.externalBuildState === 'IN_BETA_TESTING') {
    return { done: true, submitted: false, message: 'Build đã đang external testing rồi.', status }
  }
  if (st.externalBuildState === 'READY_FOR_BETA_SUBMISSION' && st.processingState === 'VALID') {
    await addBuildToGroup(cred, st.groupId, st.buildId)
    await submitForBetaReview(cred, st.buildId)
    if (input.whatsNew.trim()) await setWhatToTest(cred, st.buildId, input.whatsNew.trim())
    if (notify?.webhook.trim()) await notifyBot(notify, renderMessage(notify.template, input))
    return { done: true, submitted: true, message: 'Đã submit build lên external testing.', status }
  }

  return {
    done: false,
    submitted: false,
    message: `Chưa submit được — trạng thái: ${st.externalBuildState} / ${st.processingState}.`,
    status,
  }
}
