import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '../db'
import { jiraMetaCache } from '../db/schema'
import { SETTING_KEYS, getSetting, requireProjectKey } from '../settings'
import { jiraFetch } from './client'

export interface IssueTypeMeta {
  id: string
  name: string
  subtask: boolean
  hierarchyLevel: number
  /** Jira's own icon for this type, served through /api/jira/issuetype-icon. */
  iconUrl: string | null
}

export interface ProjectMeta {
  projectId: string
  projectKey: string
  /** 'classic' (company-managed) or 'next-gen' (team-managed). */
  style: string
  simplified: boolean
  issueTypes: IssueTypeMeta[]
  /** Discovered custom field ids — never hardcoded, they differ per instance. */
  sprintFieldId: string | null
  storyPointsFieldId: string | null
  storyPointsFieldName: string | null
}

/**
 * Bump when ProjectMeta gains a field. The cached JSON is a snapshot of this
 * shape, so without a version a new field stays undefined for a whole TTL and
 * looks like Jira simply did not return it.
 */
const CACHE_VERSION = 2
const CACHE_KEY = `project_meta_v${CACHE_VERSION}`
const CACHE_TTL_SECONDS = 60 * 60 * 24

function readCache(scope: string): ProjectMeta | null {
  const row = db
    .select()
    .from(jiraMetaCache)
    .where(and(eq(jiraMetaCache.scope, scope), eq(jiraMetaCache.key, CACHE_KEY)))
    .get()
  if (!row) return null
  if (Date.now() / 1000 - row.fetchedAt > CACHE_TTL_SECONDS) return null
  try {
    return JSON.parse(row.value) as ProjectMeta
  } catch {
    return null
  }
}

function writeCache(scope: string, meta: ProjectMeta) {
  db.insert(jiraMetaCache)
    .values({ scope, key: CACHE_KEY, value: JSON.stringify(meta) })
    .onConflictDoUpdate({
      target: [jiraMetaCache.scope, jiraMetaCache.key],
      set: { value: JSON.stringify(meta), fetchedAt: Math.floor(Date.now() / 1000) },
    })
    .run()
}

export function clearMetaCache(scope?: string) {
  if (scope) {
    db.delete(jiraMetaCache).where(eq(jiraMetaCache.scope, scope)).run()
  } else {
    db.delete(jiraMetaCache).run()
  }
}

interface CreateMetaField {
  key?: string
  fieldId?: string
  name?: string
  schema?: { type?: string; custom?: string; customId?: number }
}

/**
 * Two signals identify the story-point field, tried in order:
 *   1. schema.custom === '…:jsw-story-points'  (what this instance reports)
 *   2. name is 'Story point estimate' or 'Story Points'
 *
 * The name check is the fallback because company-managed projects use a
 * different field whose schema.custom is the generic float type — indistinguishable
 * by schema alone. createmeta only returns fields valid for this project+type,
 * so at most one of the two names can appear.
 */
function findStoryPointsField(fields: CreateMetaField[]) {
  const byCustom = fields.find((f) => f.schema?.custom?.endsWith(':jsw-story-points'))
  if (byCustom) return byCustom

  const NAMES = ['story point estimate', 'story points']
  return fields.find((f) => NAMES.includes((f.name ?? '').toLowerCase())) ?? null
}

function findSprintField(fields: CreateMetaField[]) {
  return fields.find((f) => f.schema?.custom === 'com.pyxis.greenhopper.jira:gh-sprint') ?? null
}

async function fetchProjectMeta(projectKey: string): Promise<ProjectMeta> {
  const project = await jiraFetch<{ id: string; key: string; style?: string; simplified?: boolean }>(
    `/rest/api/3/project/${encodeURIComponent(projectKey)}`,
  )

  const typesPage = await jiraFetch<{ issueTypes?: Array<Record<string, unknown>> }>(
    `/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes?maxResults=100`,
  )

  const issueTypes: IssueTypeMeta[] = (typesPage.issueTypes ?? []).map((t) => ({
    id: String(t.id),
    name: String(t.name ?? ''),
    subtask: Boolean(t.subtask),
    hierarchyLevel: Number(t.hierarchyLevel ?? 0),
    iconUrl: typeof t.iconUrl === 'string' ? t.iconUrl : null,
  }))

  // Field ids come from a subtask type when one exists — that is where work is
  // logged, so it is the type whose fields actually matter here.
  const probeType = issueTypes.find((t) => t.subtask) ?? issueTypes.find((t) => t.hierarchyLevel === 0)

  let sprintFieldId: string | null = null
  let storyPointsFieldId: string | null = null
  let storyPointsFieldName: string | null = null

  if (probeType) {
    const fieldsPage = await jiraFetch<{ fields?: CreateMetaField[] }>(
      `/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${probeType.id}?maxResults=200`,
    )
    const fields = fieldsPage.fields ?? []
    sprintFieldId = findSprintField(fields)?.key ?? findSprintField(fields)?.fieldId ?? null
    const sp = findStoryPointsField(fields)
    storyPointsFieldId = sp?.key ?? sp?.fieldId ?? null
    storyPointsFieldName = sp?.name ?? null
  }

  return {
    projectId: project.id,
    projectKey: project.key,
    style: project.style ?? 'unknown',
    simplified: Boolean(project.simplified),
    issueTypes,
    sprintFieldId,
    storyPointsFieldId,
    storyPointsFieldName,
  }
}

export async function getProjectMeta(opts: { refresh?: boolean } = {}): Promise<ProjectMeta> {
  const projectKey = requireProjectKey()
  if (!opts.refresh) {
    const cached = readCache(projectKey)
    if (cached) return cached
  }
  const meta = await fetchProjectMeta(projectKey)
  writeCache(projectKey, meta)
  return meta
}

export function subtaskTypes(meta: ProjectMeta) {
  return meta.issueTypes.filter((t) => t.subtask)
}

export function standardTypes(meta: ProjectMeta) {
  return meta.issueTypes.filter((t) => !t.subtask && t.hierarchyLevel === 0)
}

export function epicType(meta: ProjectMeta) {
  return meta.issueTypes.find((t) => t.hierarchyLevel === 1) ?? null
}


export function issueTypeByName(meta: ProjectMeta, name: string): IssueTypeMeta | null {
  const wanted = name.trim().toLowerCase()
  return meta.issueTypes.find((t) => t.name.toLowerCase() === wanted) ?? null
}
