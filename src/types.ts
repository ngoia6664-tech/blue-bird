// Timestamps are client milliseconds (Date.now()): sortable, no pending-serverTimestamp nulls.

export type WorkStatus = 'writing' | 'paused' | 'done'
export type ChapterStatus = 'draft' | 'revising' | 'final'
export type VersionKind = 'auto' | 'manual' | 'pre-replace' | 'pre-restore' | 'conflict'

export interface Work {
  id: string
  title: string
  aliases: string[]
  genre: string
  tags: string[]
  status: WorkStatus
  description: string
  privateNote: string
  hasCover: boolean
  chapterCount: number
  wordCount: number
  lastChapterId: string | null
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  deletedAt: number | null
}

/** Light per-chapter metadata (sidebar). The text lives in `contents/{chapterId}`. */
export interface Chapter {
  id: string
  label: string
  title: string
  order: number
  status: ChapterStatus
  note: string
  wordCount: number
  createdAt: number
  updatedAt: number
  lastSnapshotAt: number
  deletedAt: number | null
}

export interface ChapterContent {
  /** Tiptap JSON, stringified: avoids Firestore nesting/undefined limits. */
  json: string
  text: string
  rev: number
  updatedAt: number
  deviceId: string
}

export interface Version {
  id: string
  json: string
  kind: VersionKind
  label: string
  createdAt: number
}

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  writing: 'Đang viết',
  paused: 'Tạm dừng',
  done: 'Hoàn thành',
}

export const CHAPTER_STATUS_LABEL: Record<ChapterStatus, string> = {
  draft: 'Bản nháp',
  revising: 'Đang sửa',
  final: 'Hoàn chỉnh',
}

export const VERSION_KIND_LABEL: Record<VersionKind, string> = {
  auto: 'Tự động',
  manual: 'Lưu thủ công',
  'pre-replace': 'Trước khi thay thế',
  'pre-restore': 'Trước khi khôi phục',
  conflict: 'Xung đột',
}
