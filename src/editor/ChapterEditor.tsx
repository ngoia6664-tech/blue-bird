import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { onSnapshot } from 'firebase/firestore'
import {
  Bold, ChevronLeft, CircleAlert, CloudDownload, Lock, RefreshCw, TriangleAlert, ChevronRight, Heading2, Heading3, History, Italic, ListTree, PanelRight, Quote, Redo2, Underline, Undo2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CHAPTER_SIZE_WARN_BYTES, LOCAL_SAVE_DELAY_MS } from '../config'
import { updateChapter } from '../data/chapters'
import { contentDoc, deviceId } from '../data/refs'
import { countWords, estimatePages, formatDate, formatNumber, utf8Bytes } from '../format'
import { flush, getDraft, onSyncEvent, saveDraft, useSyncStatus } from '../sync/engine'
import type { Chapter, ChapterContent } from '../types'
import { extensions, parseJson } from './extensions'

type SaveState = 'editing' | 'saved-local' | 'syncing' | 'synced' | 'error'

export interface ChapterEditorProps {
  workId: string
  chapter: Chapter
  initialJson: string
  initialRev: number
  restoredDraft: boolean
  prev?: Chapter
  next?: Chapter
  onConflict: () => void
  onReload: () => void
  onEditor: (e: Editor | null) => void
  onToggleSidebar: () => void
  onTogglePanel: () => void
  onOpenHistory: () => void
}

export function ChapterEditor(p: ChapterEditorProps) {
  const { workId, chapter } = p
  // Rev the editor's text is based on; advances as our saves reach the server.
  const loadedRev = useRef(p.initialRev)
  const dirty = useRef(false)
  const lastSavedAt = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const editorRef = useRef<Editor | null>(null)
  const [saveState, setSaveState] = useState<SaveState>(p.restoredDraft ? 'saved-local' : 'synced')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [words, setWords] = useState(chapter.wordCount)
  const [tooBig, setTooBig] = useState(false)
  const [locked, setLocked] = useState(true)
  const [remoteNewer, setRemoteNewer] = useState(false)
  const { online } = useSyncStatus()

  /** Write the editor's text to the local draft queue (IndexedDB). Never loses text on failure. */
  async function saveLocal() {
    const ed = editorRef.current
    if (!ed || !dirty.current) return
    clearTimeout(timer.current)
    dirty.current = false
    // State stays readable even if the view is being torn down.
    const json = JSON.stringify(ed.getJSON())
    const text = ed.getText({ blockSeparator: '\n' })
    const n = countWords(text)
    const savedAt = Date.now()
    lastSavedAt.current = savedAt
    setWords(n)
    setTooBig(utf8Bytes(json) > CHAPTER_SIZE_WARN_BYTES)
    try {
      await saveDraft({ workId, chapterId: chapter.id, json, text, words: n, savedAt }, loadedRev.current)
      if (!dirty.current) setSaveState('syncing')
    } catch (e) {
      dirty.current = true
      setSaveState('error')
      setSyncError(`Không lưu được trên máy: ${(e as Error).message}`)
    }
  }

  const editor = useEditor({
    extensions,
    content: parseJson(p.initialJson),
    editable: false,
    editorProps: {
      attributes: { class: 'prose', 'aria-label': 'Nội dung chương', spellcheck: 'false' },
      // Word/Google Docs sometimes paste decomposed (NFD) Vietnamese; store composed text.
      transformPastedHTML: (html) => html.normalize('NFC'),
      transformPastedText: (text) => text.normalize('NFC'),
    },
    onUpdate: () => {
      dirty.current = true
      setSaveState('editing')
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void saveLocal(), LOCAL_SAVE_DELAY_MS)
    },
  })
  editorRef.current = editor

  useEffect(() => {
    p.onEditor(editor)
    return () => p.onEditor(null)
  }, [editor])

  // Flush pending edits when leaving the chapter, hiding the tab or closing the page.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void saveLocal()
    const onUnload = (e: BeforeUnloadEvent) => {
      void saveLocal()
      if (dirty.current) e.preventDefault()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', saveLocal)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', saveLocal)
      window.removeEventListener('beforeunload', onUnload)
      void saveLocal()
    }
  }, [])

  // One editable copy per chapter across tabs; another tab gets read-only until it leaves.
  useEffect(() => {
    const ac = new AbortController()
    let release: (() => void) | undefined
    navigator.locks
      .request(`chapter:${workId}:${chapter.id}`, { signal: ac.signal }, () => {
        setLocked(false)
        return new Promise<void>((r) => (release = r))
      })
      .catch(() => {})
    return () => {
      ac.abort()
      release?.()
    }
  }, [workId, chapter.id])
  useEffect(() => {
    editor?.setEditable(!locked, false)
  }, [editor, locked])

  useEffect(() => {
    const off = onSyncEvent((e) => {
      if (e.chapterId !== chapter.id) return
      if (e.type === 'synced') {
        loadedRev.current = Math.max(loadedRev.current, e.rev)
        setSyncError(null)
        // lastSavedAt 0: nothing typed yet this session, so this was the restored draft.
        if (!dirty.current && (lastSavedAt.current === 0 || e.savedAt === lastSavedAt.current)) setSaveState('synced')
      } else if (e.type === 'conflict') {
        void saveLocal().then(p.onConflict)
      } else {
        setSaveState('error')
        setSyncError(e.message)
      }
    })
    // A restored draft may have synced before we subscribed; check, else push it now.
    if (p.restoredDraft) {
      getDraft(workId, chapter.id).then((d) => {
        if (d?.synced && !dirty.current) setSaveState('synced')
        else void flush()
      })
    }
    return off
  }, [chapter.id])

  // Notice saves from other devices. Never swap text under the cursor; offer a reload instead.
  useEffect(
    () =>
      onSnapshot(contentDoc(workId, chapter.id), (s) => {
        const c = s.data() as ChapterContent | undefined
        if (c && c.rev > loadedRev.current && c.deviceId !== deviceId) setRemoteNewer(true)
      }),
    [workId, chapter.id],
  )

  const shownState: SaveState = saveState === 'syncing' && !online ? 'saved-local' : saveState
  const stateLabel: Record<SaveState, string> = {
    editing: 'Đang chỉnh sửa…',
    'saved-local': online ? 'Đã lưu trên máy' : 'Đã lưu trên máy · chờ có mạng',
    syncing: 'Đang đồng bộ…',
    synced: 'Đã đồng bộ',
    error: 'Lỗi',
  }

  return (
    <div className="chapter-editor">
      <div className="editor-head">
        <button className="icon-btn" onClick={p.onToggleSidebar} aria-label="Danh sách chương"><ListTree size={18} /></button>
        <ChapterTitleFields workId={workId} chapter={chapter} />
        <span className={`save-state ${shownState}`} role="status">{stateLabel[shownState]}</span>
        <button className="icon-btn" onClick={p.onTogglePanel} aria-label="Bảng thông tin"><PanelRight size={18} /></button>
      </div>

      {editor && <Toolbar editor={editor} onOpenHistory={p.onOpenHistory} />}

      {locked && <p className="notice"><Lock size={16} aria-hidden="true" /> Chương này đang mở ở tab khác. Đóng tab đó để chỉnh sửa ở đây.</p>}
      {remoteNewer && (
        <p className="notice">
          <CloudDownload size={16} aria-hidden="true" /> Chương vừa được lưu từ thiết bị khác.{' '}
          {dirty.current || saveState !== 'synced'
            ? 'Thay đổi chưa đồng bộ ở máy này sẽ được đối chiếu khi đồng bộ.'
            : <button className="link-btn" onClick={p.onReload}><RefreshCw size={14} /> Tải bản mới</button>}
        </p>
      )}
      {syncError && <p className="notice error" role="alert"><CircleAlert size={16} aria-hidden="true" /> {syncError} Bản nháp vẫn được giữ trên máy này.</p>}
      {tooBig && <p className="notice"><TriangleAlert size={16} aria-hidden="true" /> Chương đang gần giới hạn dung lượng một chương. Nên tách thành chương mới.</p>}

      <div className="editor-scroll">
        <EditorContent editor={editor} className="editor-content" />
      </div>

      <footer className="editor-foot">
        <span>{formatNumber(words)} từ</span>
        <span>~{estimatePages(words)} trang (ước tính)</span>
        <span className="hide-narrow">Sửa: {formatDate(chapter.updatedAt)}</span>
        <span className="spacer" />
        <ChapterLink workId={workId} chapter={p.prev} label="Chương trước"><ChevronLeft size={18} /></ChapterLink>
        <ChapterLink workId={workId} chapter={p.next} label="Chương sau"><ChevronRight size={18} /></ChapterLink>
      </footer>
    </div>
  )
}

function ChapterLink({ workId, chapter, label, children }: { workId: string; chapter?: Chapter; label: string; children: ReactNode }) {
  if (!chapter) return <span className="icon-btn" aria-disabled="true" aria-label={label}>{children}</span>
  return <Link className="icon-btn" to={`/write/${workId}/${chapter.id}`} aria-label={`${label}: ${chapter.label}`}>{children}</Link>
}

function ChapterTitleFields({ workId, chapter }: { workId: string; chapter: Chapter }) {
  const [label, setLabel] = useState(chapter.label)
  const [title, setTitle] = useState(chapter.title)
  const save = (patch: { label?: string; title?: string }) => updateChapter(workId, chapter.id, patch).catch((e) => alert(e.message))
  return (
    <div className="title-fields">
      <input
        className="chapter-label-input"
        aria-label="Số chương"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== chapter.label ? save({ label: label.trim() }) : setLabel(chapter.label)}
      />
      <input
        className="chapter-title-input"
        aria-label="Tiêu đề chương"
        placeholder="Tiêu đề chương"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== chapter.title && save({ title: title.trim() })}
      />
    </div>
  )
}

function Toolbar({ editor, onOpenHistory }: { editor: Editor; onOpenHistory: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      editable: e.isEditable,
    }),
  })
  const c = () => editor.chain().focus()
  const btn = (label: string, icon: ReactNode, run: () => void, pressed?: boolean, disabled?: boolean) => (
    <button
      type="button"
      className="tool"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled ?? !s.editable}
      onMouseDown={(e) => e.preventDefault()} // keep selection in the editor
      onClick={run}
    >
      {icon}
    </button>
  )
  return (
    <div className="toolbar" role="toolbar" aria-label="Định dạng">
      {btn('Đậm (Ctrl+B)', <Bold size={18} />, () => c().toggleBold().run(), s.bold)}
      {btn('Nghiêng (Ctrl+I)', <Italic size={18} />, () => c().toggleItalic().run(), s.italic)}
      {btn('Gạch chân (Ctrl+U)', <Underline size={18} />, () => c().toggleUnderline().run(), s.underline)}
      <span className="tool-sep" />
      {btn('Tiêu đề lớn', <Heading2 size={18} />, () => c().toggleHeading({ level: 2 }).run(), s.h2)}
      {btn('Tiêu đề nhỏ', <Heading3 size={18} />, () => c().toggleHeading({ level: 3 }).run(), s.h3)}
      {btn('Trích dẫn', <Quote size={18} />, () => c().toggleBlockquote().run(), s.quote)}
      <span className="tool-sep" />
      {btn('Hoàn tác (Ctrl+Z)', <Undo2 size={18} />, () => c().undo().run(), undefined, !s.canUndo || !s.editable)}
      {btn('Làm lại (Ctrl+Shift+Z)', <Redo2 size={18} />, () => c().redo().run(), undefined, !s.canRedo || !s.editable)}
      <span className="tool-sep" />
      {btn('Lịch sử phiên bản', <History size={18} />, onOpenHistory, undefined, false)}
    </div>
  )
}
