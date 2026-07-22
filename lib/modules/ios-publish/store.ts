import 'server-only'

import { desc } from 'drizzle-orm'

import { db } from '@/lib/db'
import { iosPublishLog } from '@/lib/db/schema'

export interface LogEntry {
  id: number
  appName: string
  buildNumber: string
  groupName: string
  state: string
  ok: boolean
  message: string
  createdAt: number
}

export function listIosLog(limit = 20): LogEntry[] {
  return db.select().from(iosPublishLog).orderBy(desc(iosPublishLog.id)).limit(limit).all()
}

export function recordIosLog(entry: {
  appName: string
  buildNumber: string
  groupName: string
  state: string
  ok: boolean
  message: string
}) {
  db.insert(iosPublishLog).values(entry).run()
}
