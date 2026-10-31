import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { getDoc, onSnapshot } from 'firebase/firestore'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, BookOpen, ChevronLeft, ChevronRight, CircleAlert, CloudDownload, Download,
  FileSearch, Heading2, Heading3, History, Italic, ListTree, Lock, Maximize2, Minimize2, PanelRight, Quote, Redo2, RefreshCw,
  Replace, Search, TriangleAlert, Underline, Undo2, Upload,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router'
import { Menu } from '../components/Menu'
import { CHAPTER_SIZE_WARN_BYTES, LOCAL_SAVE_DELAY_MS } from '../config'
import { updateChapter } from '../data/chapters'
import { contentDoc, deviceId } from '../data/refs'
import { countWords, estimatePages, formatDate, formatNumber, utf8Bytes } from '../format'
import type { FindOptions } from '../search/find'
import { clearEmergency, flush, getDraft, onSyncEvent, saveDraft, useSyncStatus, writeEmergency } from '../sync/engine'
import type { Chapter, ChapterContent } from '../types'
import { extensions, parseJson } from './extensions'
import { FindBar, type FindSeed } from './FindBar'
import { FindExtension } from './findPlugin'

type SaveState = 'editing' | 'saving-local' | 'saved-local' | 'syncing' | 'synced' | 'error-local' | 'error-sync'

export interface ChapterEditorProps {
  workId: string
  chapter: Chapter
  initialJson: string
  initialRev: number
  restoredDraft: boolean
  prev?: Chapter
  next?: Chapter
  /** Open the find bar on a given match (from work-wide search). */
  find?: FindSeed
  focus: boolean
  /** Lets the Writer force the pending local save before work-wide actions. */
  saveNowRef: RefObject<(() => Promise<void>) | null>
  onConflict: () => void
  onReload: () => void
  onEditor: (e: Editor | null) => void
  onToggleSidebar: () => void
  onTogglePanel: () => void
  onOpenHistory: () => void
  onToggleFocus: () => void
  onGlobalSearch: (query?: string, replacement?: string, opts?: FindOptions) => void
  onImport: () => void
  onExport: (scope: 'chapter' | 'all') => void
}

const editorExtensions = [...extensions, FindExtension]

export function ChapterEditor(p: ChapterEditorProps) {
  const { workId, chapter } = p
  const navigate = useNavigate()
  // Rev the editor's text is based on; advances as our saves reach the server.
  const loadedRev = useRef(p.initialRev)
  const dirty = useRef(false)
  const saving = useRef(0)
  const lastSavedAt = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const editorRef = useRef<Editor | null>(null)
  const [saveState, setSaveState] = useState<SaveState>(p.restoredDraft ? 'saved-local' : 'synced')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [words, setWords] = useState(chapter.wordCount)
  const [chars, setChars] = useState<number | null>(null)
  const [tooBig, setTooBig] = useState(false)
  const [locked, setLocked] = useState(true)
  const [remoteNewer, setRemoteNewer] = useState(false)
  const [findMode, setFindMode] = useState<null | 'find' | 'replace'>(p.find ? 'find' : null)
  const [findFocus, setFindFocus] = useState(0)
  const { online } = useSyncStatus()

  const input = () => {
    const ed = editorRef.current!
    const json = JSON.stringify(ed.getJSON())
    const text = ed.getText({ blockSeparator: '\n' })
    return { workId, chapterId: chapter.id, json, text, words: countWords(text), savedAt: Date.now() }
  }

  /** Write the editor's text to the local draft queue (IndexedDB). Never loses text on failure. */
  async function saveLocal() {
    const ed = editorRef.current
    if (!ed || !dirty.current) return
    clearTimeout(timer.current)
    dirty.current = false
    // State stays readable even if the view is being torn down.
    const d = input()
    lastSavedAt.current = d.savedAt
    setWords(d.words)
    setChars(d.text.replace(/\n/g, '').length)
    setTooBig(utf8Bytes(d.json) > CHAPTER_SIZE_WARN_BYTES)
    setSaveState('saving-local')
    saving.current++
    try {
      await saveDraft(d, loadedRev.current)
      if (!dirty.current) {
        clearEmergency(workId, chapter.id)
        setSaveState('syncing')
      }
    } catch (e) {
      dirty.current = true
      setSaveState('error-local')
      setSyncError(`Không lưu được trên máy: ${(e as Error).message}`)
    } finally {
      saving.current--
    }
  }
  p.saveNowRef.current = saveLocal

  const editor = useEditor({
    extensions: editorExtensions,
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
    const unsaved = () => dirty.current || saving.current > 0
    // The async IndexedDB write may not finish before the page dies; keep a synchronous copy too.
    const emergency = () => unsaved() && editorRef.current && writeEmergency(input(), loadedRev.current)
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      emergency()
      void saveLocal()
    }
    const onPageHide = () => {
      emergency()
      void saveLocal()
    }
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!unsaved()) return
      emergency()
      void saveLocal()
      e.preventDefault() // asks "Leave site?", which also gives the save time to finish
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onUnload)
      void saveLocal()
    }
  }, [])

  // One editable copy per chapter across tabs; another tab gets read-only until it leaves.
  useEffect(() => {
    const ac = new AbortController()
    let release: (() => void) | undefined
    const name = `chapter:${workId}:${chapter.id}`
    // The tab we waited on may have saved newer text than we loaded; reload before allowing edits.
    const stale = async () => {
      const [d, s] = await Promise.all([getDraft(workId, chapter.id), getDoc(contentDoc(workId, chapter.id)).catch(() => null)])
      const serverRev = (s?.data() as ChapterContent | undefined)?.rev ?? 0
      return serverRev > loadedRev.current || (!!d && !d.synced && d.json !== p.initialJson)
    }
    const hold = async (waited: boolean) => {
      if (ac.signal.aborted) return
      if (waited && (await stale())) return p.onReload()
      if (ac.signal.aborted) return
      setLocked(false)
      await new Promise<void>((r) => (release = r))
    }
    navigator.locks
      .request(name, { ifAvailable: true }, (lock) =>
        lock ? hold(false) : navigator.locks.request(name, { signal: ac.signal }, () => hold(true)))
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
        setSaveState('error-sync')
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

  const openFind = (mode: 'find' | 'replace') => {
    setFindMode(mode)
    setFindFocus((n) => n + 1)
  }

  // Ctrl+F find, Ctrl+H (Cmd+Alt+F on Mac) replace, Ctrl+Shift+F whole work. Buttons do the same.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && e.shiftKey && k === 'f') p.onGlobalSearch()
      else if (mod && !e.altKey && !e.shiftKey && k === 'f') openFind('find')
      else if ((e.ctrlKey && !e.metaKey && k === 'h') || (e.metaKey && e.altKey && e.code === 'KeyF') || (e.metaKey && e.shiftKey && k === 'h')) openFind('replace')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const shownState: SaveState = saveState === 'syncing' && !online ? 'saved-local' : saveState
  const stateLabel: Record<SaveState, string> = {
    editing: 'Đang chỉnh sửa…',
    'saving-local': 'Đang lưu trên máy…',
    'saved-local': online ? 'Đã lưu trên máy' : 'Đã lưu trên máy · chờ có mạng',
    syncing: 'Đang đồng bộ…',
    synced: 'Đã đồng bộ lên cloud',
    'error-local': 'Lỗi lưu trên máy',
    'error-sync': 'Lỗi đồng bộ',
  }
  const preview = () => navigate(`/read/${workId}/${chapter.id}`)

  return (
    <div className="chapter-editor">
      <div className="editor-head">
        {!p.focus && <IconBtn label="Danh sách chương" onClick={p.onToggleSidebar}><ListTree size={18} /></IconBtn>}
        <ChapterTitleFields key={`${chapter.label}|${chapter.title}`} workId={workId} chapter={chapter} />
        <span className={`save-state ${shownState.startsWith('error') ? 'error' : shownState}`} role="status" title={syncError ?? undefined}>{stateLabel[shownState]}</span>
        <IconBtn label="Tìm trong chương (Ctrl+F)" onClick={() => openFind('find')}><Search size={18} /></IconBtn>
        <IconBtn label="Xem trước / Chế độ đọc" onClick={preview} className="hide-narrow"><BookOpen size={18} /></IconBtn>
        <IconBtn label={p.focus ? 'Thoát chế độ tập trung' : 'Tập trung viết'} onClick={p.onToggleFocus} pressed={p.focus}>
          {p.focus ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </IconBtn>
        <Menu
          label="Thêm thao tác cho chương"
          items={[
            { label: 'Tìm trong tác phẩm (Ctrl+Shift+F)', icon: <FileSearch size={16} />, onSelect: () => p.onGlobalSearch() },
            { label: 'Thay thế (Ctrl+H)', icon: <Replace size={16} />, onSelect: () => openFind('replace') },
            { label: 'Xem trước / Chế độ đọc', icon: <BookOpen size={16} />, onSelect: preview },
            { label: 'Lịch sử phiên bản', icon: <History size={16} />, onSelect: p.onOpenHistory },
            { label: 'Nhập chương từ file', icon: <Upload size={16} />, onSelect: p.onImport },
            { label: 'Xuất chương này', icon: <Download size={16} />, onSelect: () => p.onExport('chapter') },
            { label: 'Xuất toàn tác phẩm', icon: <Download size={16} />, onSelect: () => p.onExport('all') },
          ]}
        />
        {!p.focus && <IconBtn label="Thông tin chương" onClick={p.onTogglePanel}><PanelRight size={18} /></IconBtn>}
      </div>

      {editor && (
        <Toolbar editor={editor} onOpenHistory={p.onOpenHistory} onFind={openFind} onGlobal={() => p.onGlobalSearch()} />
      )}
      {editor && findMode && (
        <FindBar
          editor={editor}
          workId={workId}
          chapterId={chapter.id}
          replace={findMode === 'replace'}
          seed={p.find}
          focusNonce={findFocus}
          onReplaceMode={(on) => setFindMode(on ? 'replace' : 'find')}
          onClose={() => setFindMode(null)}
          onGlobal={(q, r, o) => p.onGlobalSearch(q, r, o)}
        />
      )}

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
        {chars !== null && <span className="hide-narrow">{formatNumber(chars)} ký tự</span>}
        <span>~{estimatePages(words)} trang (ước tính)</span>
        <span className="hide-narrow">Sửa: {formatDate(chapter.updatedAt)}</span>
        <span className="spacer" />
        <ChapterLink workId={workId} chapter={p.prev} label="Chương trước"><ChevronLeft size={18} /></ChapterLink>
        <ChapterLink workId={workId} chapter={p.next} label="Chương sau"><ChevronRight size={18} /></ChapterLink>
      </footer>
    </div>
  )
}

function IconBtn(p: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean; className?: string }) {
  return (
    <button type="button" className={`icon-btn ${p.className ?? ''}`} aria-label={p.label} title={p.label} aria-pressed={p.pressed} onClick={p.onClick}>
      {p.children}
    </button>
  )
}

function ChapterLink({ workId, chapter, label, children }: { workId: string; chapter?: Chapter; label: string; children: ReactNode }) {
  if (!chapter) return <span className="icon-btn" aria-disabled="true" aria-label={label}>{children}</span>
  return <Link className="icon-btn" to={`/write/${workId}/${chapter.id}`} aria-label={`${label}: ${chapter.label}`} title={`${label}: ${chapter.label}`}>{children}</Link>
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

function Toolbar({ editor, onOpenHistory, onFind, onGlobal }: { editor: Editor; onOpenHistory: () => void; onFind: (m: 'find' | 'replace') => void; onGlobal: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      quote: e.isActive('blockquote'),
      align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
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
    <div className="toolbar" role="toolbar" aria-label="Công cụ biên tập">
      <div className="tool-group" role="group" aria-label="Định dạng chữ">
        {btn('Đậm (Ctrl+B)', <Bold size={18} />, () => c().toggleBold().run(), s.bold)}
        {btn('Nghiêng (Ctrl+I)', <Italic size={18} />, () => c().toggleItalic().run(), s.italic)}
        {btn('Gạch chân (Ctrl+U)', <Underline size={18} />, () => c().toggleUnderline().run(), s.underline)}
      </div>
      <div className="tool-group" role="group" aria-label="Đoạn văn">
        {btn('Tiêu đề lớn', <Heading2 size={18} />, () => c().toggleHeading({ level: 2 }).run(), s.h2)}
        {btn('Tiêu đề nhỏ', <Heading3 size={18} />, () => c().toggleHeading({ level: 3 }).run(), s.h3)}
        {btn('Trích dẫn', <Quote size={18} />, () => c().toggleBlockquote().run(), s.quote)}
      </div>
      <div className="tool-group" role="group" aria-label="Căn lề">
        {btn('Căn trái (Ctrl+Shift+L)', <AlignLeft size={18} />, () => c().setTextAlign('left').run(), s.align === 'left')}
        {btn('Căn giữa (Ctrl+Shift+E)', <AlignCenter size={18} />, () => c().setTextAlign('center').run(), s.align === 'center')}
        {btn('Căn phải (Ctrl+Shift+R)', <AlignRight size={18} />, () => c().setTextAlign('right').run(), s.align === 'right')}
        {btn('Căn đều hai bên (Ctrl+Shift+J)', <AlignJustify size={18} />, () => c().setTextAlign('justify').run(), s.align === 'justify')}
      </div>
      <div className="tool-group" role="group" aria-label="Hoàn tác">
        {btn('Hoàn tác (Ctrl+Z)', <Undo2 size={18} />, () => c().undo().run(), undefined, !s.canUndo || !s.editable)}
        {btn('Làm lại (Ctrl+Shift+Z)', <Redo2 size={18} />, () => c().redo().run(), undefined, !s.canRedo || !s.editable)}
      </div>
      <div className="tool-group" role="group" aria-label="Tìm kiếm">
        {btn('Tìm trong chương (Ctrl+F)', <Search size={18} />, () => onFind('find'), undefined, false)}
        {btn('Tìm và thay thế (Ctrl+H)', <Replace size={18} />, () => onFind('replace'), undefined, false)}
        {btn('Tìm trong tác phẩm (Ctrl+Shift+F)', <FileSearch size={18} />, onGlobal, undefined, false)}
        {btn('Lịch sử phiên bản', <History size={18} />, onOpenHistory, undefined, false)}
      </div>
    </div>
  )
}
