import type { Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleX, Copy, History, ListTree, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { lastWorkKey } from '../components/AppLayout'
import { Menu } from '../components/Menu'
import {
  createChapter, deleteChapterForever, duplicateChapter, reconcileWorkCounts, swapOrder, updateChapter,
} from '../data/chapters'
import { useChapters, useWork } from '../data/hooks'
import { touchWork } from '../data/works'
import { ChapterPane } from '../editor/ChapterPane'
import { VersionPanel } from '../editor/VersionPanel'
import { estimatePages, formatDate, formatNumber } from '../format'
import { discardDraft } from '../sync/engine'
import { CHAPTER_STATUS_LABEL, type Chapter, type ChapterStatus } from '../types'

function useWide() {
  const mq = '(min-width: 1000px)'
  const [wide, setWide] = useState(() => matchMedia(mq).matches)
  useEffect(() => {
    const m = matchMedia(mq)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

const fail = (e: unknown) => alert(`Thao tác thất bại: ${e instanceof Error ? e.message : e}`)

export function Writer() {
  const { workId, chapterId } = useParams()
  const navigate = useNavigate()
  const { data: work, error: workError } = useWork(workId)
  const { data: chapters, error: chaptersError } = useChapters(workId)
  const wide = useWide()
  const [sidebarOpen, setSidebarOpen] = useState(wide)
  const [panel, setPanel] = useState<'info' | 'history' | null>(wide ? 'info' : null)
  const [editor, setEditor] = useState<Editor | null>(null)
  useEffect(() => {
    setSidebarOpen(wide)
    setPanel(wide ? 'info' : null)
  }, [wide])

  const live = useMemo(() => chapters?.filter((c) => !c.deletedAt) ?? [], [chapters])
  const trashed = useMemo(() => chapters?.filter((c) => c.deletedAt) ?? [], [chapters])
  const index = live.findIndex((c) => c.id === chapterId)
  const chapter = live[index]

  useEffect(() => {
    if (workId) localStorage.setItem(lastWorkKey, workId)
  }, [workId])

  // Open the last chapter (or the first) when the URL names only the work.
  useEffect(() => {
    if (!work || !chapters || chapterId) return
    const target = live.find((c) => c.id === work.lastChapterId) ?? live[0]
    if (target) navigate(`/write/${work.id}/${target.id}`, { replace: true })
  }, [work, chapters, chapterId, live, navigate])

  useEffect(() => {
    if (workId && chapter) touchWork(workId, chapter.id)
  }, [workId, chapter?.id])

  // Keep the work's chapter/word totals equal to the chapter list (the source of truth).
  const workRef = useRef(work)
  workRef.current = work
  useEffect(() => {
    const w = workRef.current
    if (!w || !chapters) return
    const words = live.reduce((s, c) => s + c.wordCount, 0)
    if (w.chapterCount !== live.length || w.wordCount !== words) reconcileWorkCounts(w.id, live.length, words)
  }, [chapters, live, work?.id])

  if (!workId) {
    return (
      <div className="page empty">
        <p>Hãy chọn một tác phẩm trong Thư viện để bắt đầu viết.</p>
        <Link to="/" className="btn primary">Mở Thư viện</Link>
      </div>
    )
  }
  if (workError || chaptersError) return <p className="page error" role="alert">Không tải được tác phẩm: {(workError ?? chaptersError)!.message}</p>
  if (work === undefined || !chapters) return <p className="page muted">Đang tải…</p>
  if (work === null || work.deletedAt) {
    return (
      <div className="page empty">
        <p>{work ? 'Tác phẩm này đang ở thùng rác.' : 'Không tìm thấy tác phẩm.'}</p>
        <Link to="/" className="btn">Về Thư viện</Link>
      </div>
    )
  }

  const go = (c: Chapter) => {
    navigate(`/write/${workId}/${c.id}`)
    if (!wide) setSidebarOpen(false)
  }

  async function addChapter() {
    const last = live[live.length - 1]
    const id = await createChapter(workId!, `Chương ${live.length + 1}`, (last?.order ?? 0) + 1)
    navigate(`/write/${workId}/${id}`)
    if (!wide) setSidebarOpen(false)
  }

  async function trash(c: Chapter) {
    if (!confirm(`Đưa "${c.label}" vào thùng rác?`)) return
    if (c.id === chapterId) {
      const neighbor = live[index + 1] ?? live[index - 1]
      navigate(neighbor ? `/write/${workId}/${neighbor.id}` : `/write/${workId}`, { replace: true })
    }
    await updateChapter(workId!, c.id, { deletedAt: Date.now() })
  }

  async function deleteForever(c: Chapter) {
    if (!confirm(`Xóa VĨNH VIỄN "${c.label}${c.title ? ` – ${c.title}` : ''}" cùng lịch sử phiên bản? Không thể hoàn tác.`)) return
    await deleteChapterForever(workId!, c.id)
    await discardDraft(workId!, c.id)
  }

  const closeDrawers = () => {
    if (wide) return
    setSidebarOpen(false)
    setPanel(null)
  }
  const drawerOpen = !wide && (sidebarOpen || panel !== null)

  return (
    <div className={`writer ${sidebarOpen ? 'with-sidebar' : ''} ${panel ? 'with-panel' : ''}`}>
      {drawerOpen && <div className="scrim" onClick={closeDrawers} aria-hidden="true" />}
      {sidebarOpen && (
        <ChapterSidebar
          title={work.title}
          live={live}
          trashed={trashed}
          currentId={chapterId}
          onOpen={go}
          onAdd={() => addChapter().catch(fail)}
          onClose={() => setSidebarOpen(false)}
          onMove={(c, dir) => {
            const i = live.indexOf(c)
            const other = live[i + dir]
            if (other) swapOrder(workId, c, other).catch(fail)
          }}
          onDuplicate={(c) => {
            const next = live[live.indexOf(c) + 1]
            // shortcut: fractional order; precision lasts ~50 inserts between the same two chapters.
            duplicateChapter(workId, c, next ? (c.order + next.order) / 2 : c.order + 1).catch(fail)
          }}
          onTrash={(c) => trash(c).catch(fail)}
          onRestore={(c) => updateChapter(workId, c.id, { deletedAt: null }).catch(fail)}
          onDeleteForever={(c) => deleteForever(c).catch(fail)}
        />
      )}

      {chapter ? (
        <ChapterPane
          key={chapter.id}
          workId={workId}
          chapter={chapter}
          prev={live[index - 1]}
          next={live[index + 1]}
          onEditor={setEditor}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onTogglePanel={() => setPanel((p) => (p ? null : 'info'))}
          onOpenHistory={() => setPanel('history')}
        />
      ) : (
        <div className="chapter-editor">
          <div className="page empty">
            {live.length === 0 ? (
              <>
                <p>Tác phẩm chưa có chương nào.</p>
                <button className="btn primary" onClick={() => addChapter().catch(fail)}><Plus size={18} /> Thêm chương đầu tiên</button>
              </>
            ) : chapterId ? (
              <p>Không tìm thấy chương này (có thể đã bị xóa).</p>
            ) : (
              <p className="muted">Đang mở chương…</p>
            )}
            {!sidebarOpen && live.length > 0 && <button className="btn" onClick={() => setSidebarOpen(true)}><ListTree size={18} /> Danh sách chương</button>}
          </div>
        </div>
      )}

      {panel === 'history' && chapter && (
        <VersionPanel workId={workId} chapterId={chapter.id} editor={editor} onClose={() => setPanel(wide ? 'info' : null)} />
      )}
      {panel === 'info' && chapter && (
        <InfoPanel key={`info-${chapter.id}`} workId={workId} chapter={chapter} onHistory={() => setPanel('history')} onClose={() => setPanel(null)} />
      )}
    </div>
  )
}

interface SidebarProps {
  title: string
  live: Chapter[]
  trashed: Chapter[]
  currentId?: string
  onOpen: (c: Chapter) => void
  onAdd: () => void
  onClose: () => void
  onMove: (c: Chapter, dir: -1 | 1) => void
  onDuplicate: (c: Chapter) => void
  onTrash: (c: Chapter) => void
  onRestore: (c: Chapter) => void
  onDeleteForever: (c: Chapter) => void
}

function ChapterSidebar(p: SidebarProps) {
  const [q, setQ] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const needle = q.trim().toLocaleLowerCase('vi')
  const shown = needle ? p.live.filter((c) => `${c.label} ${c.title}`.toLocaleLowerCase('vi').includes(needle)) : p.live
  const currentRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' }) // returns a Promise in new Chrome; keep it out of the cleanup slot
  }, [p.currentId])

  return (
    <aside className="sidebar" aria-label="Danh sách chương">
      <div className="panel-head">
        <h2 className="work-name" title={p.title}>{p.title}</h2>
        <button className="icon-btn" onClick={p.onClose} aria-label="Thu gọn danh sách chương"><X size={18} /></button>
      </div>
      <button className="btn primary" onClick={p.onAdd}><Plus size={18} /> Thêm chương</button>
      <label className="search">
        <Search size={16} aria-hidden="true" />
        <input type="search" placeholder="Tìm số hoặc tên chương" aria-label="Tìm chương" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ol className="chapter-list">
        {shown.map((c) => {
          const i = p.live.indexOf(c)
          const current = c.id === p.currentId
          return (
            <li key={c.id} ref={current ? currentRef : undefined} className={current ? 'current' : undefined}>
              <button className="chapter-item" onClick={() => p.onOpen(c)} aria-current={current ? 'page' : undefined}>
                <span className="chapter-label">{c.label}</span>
                <span className="chapter-title">{c.title}</span>
              </button>
              <Menu
                label={`Thao tác cho ${c.label}`}
                items={[
                  { label: 'Chuyển lên', icon: <ArrowUp size={16} />, onSelect: () => p.onMove(c, -1), disabled: i === 0 || !!needle },
                  { label: 'Chuyển xuống', icon: <ArrowDown size={16} />, onSelect: () => p.onMove(c, 1), disabled: i === p.live.length - 1 || !!needle },
                  { label: 'Nhân bản', icon: <Copy size={16} />, onSelect: () => p.onDuplicate(c) },
                  { label: 'Đưa vào thùng rác', icon: <Trash2 size={16} />, danger: true, onSelect: () => p.onTrash(c) },
                ]}
              />
            </li>
          )
        })}
      </ol>
      {p.trashed.length > 0 && (
        <div className="trash-section">
          <button className="link-btn" aria-expanded={showTrash} onClick={() => setShowTrash((s) => !s)}>
            {showTrash ? <ChevronDown size={16} /> : <ChevronRight size={16} />} <Trash2 size={16} /> Thùng rác ({p.trashed.length})
          </button>
          {showTrash && (
            <ul className="chapter-list">
              {p.trashed.map((c) => (
                <li key={c.id}>
                  <span className="chapter-item muted">
                    <span className="chapter-label">{c.label}</span>
                    <span className="chapter-title">{c.title}</span>
                  </span>
                  <Menu
                    label={`Thao tác cho ${c.label} trong thùng rác`}
                    items={[
                      { label: 'Khôi phục', icon: <RotateCcw size={16} />, onSelect: () => p.onRestore(c) },
                      { label: 'Xóa vĩnh viễn', icon: <CircleX size={16} />, danger: true, onSelect: () => p.onDeleteForever(c) },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}

function InfoPanel(p: { workId: string; chapter: Chapter; onHistory: () => void; onClose: () => void }) {
  const { chapter } = p
  const [note, setNote] = useState(chapter.note)
  const noteRef = useRef(note)
  noteRef.current = note
  const saveNote = () => noteRef.current !== chapter.note && updateChapter(p.workId, chapter.id, { note: noteRef.current }).catch(fail)
  useEffect(() => () => void saveNote(), []) // switching chapter without blurring the note
  return (
    <aside className="side-panel" aria-label="Thông tin chương">
      <div className="panel-head">
        <h2>Thông tin chương</h2>
        <button className="icon-btn" onClick={p.onClose} aria-label="Thu gọn bảng thông tin"><X size={18} /></button>
      </div>
      <dl className="stats">
        <dt>Số từ (đã đồng bộ)</dt><dd>{formatNumber(chapter.wordCount)}</dd>
        <dt>Số trang ước tính</dt><dd>{estimatePages(chapter.wordCount)}</dd>
        <dt>Tạo lúc</dt><dd>{formatDate(chapter.createdAt)}</dd>
        <dt>Sửa lúc</dt><dd>{formatDate(chapter.updatedAt)}</dd>
      </dl>
      <label className="field">
        <span>Trạng thái</span>
        <select value={chapter.status} onChange={(e) => updateChapter(p.workId, chapter.id, { status: e.target.value as ChapterStatus }).catch(fail)}>
          {Object.entries(CHAPTER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Ghi chú nhanh</span>
        <textarea rows={6} value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} />
      </label>
      <button className="btn" onClick={p.onHistory}><History size={18} /> Xem lịch sử phiên bản</button>
    </aside>
  )
}
