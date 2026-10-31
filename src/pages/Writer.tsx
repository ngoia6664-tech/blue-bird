import type { Editor } from '@tiptap/react'
import {
  ArrowDown, ArrowUp, BadgeCheck, BookMarked, ChevronDown, ChevronRight, CircleX, Copy, Download, History, Link2, ListPlus, ListTree,
  Plus, RotateCcw, Search, Trash2, Upload, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { lastWorkKey } from '../components/AppLayout'
import { Menu } from '../components/Menu'
import { updateBibleItem } from '../data/bible'
import {
  createChapter, deleteChapterForever, duplicateChapter, reconcileWorkCounts, swapOrder, updateChapter,
} from '../data/chapters'
import { useBible, useChapters, useWork } from '../data/hooks'
import { touchWork } from '../data/works'
import { ExportDialog } from '../doc/ExportDialog'
import { ImportDialog } from '../doc/ImportDialog'
import { ChapterPane } from '../editor/ChapterPane'
import type { FindSeed } from '../editor/FindBar'
import { GlobalSearch, type GlobalPrefill } from '../editor/GlobalSearch'
import { VersionPanel } from '../editor/VersionPanel'
import { estimatePages, formatDate, formatNumber } from '../format'
import { filterChapters } from '../search/find'
import { discardDraft } from '../sync/engine'
import { CHAPTER_STATUS_LABEL, type BibleItem, type Chapter, type ChapterStatus } from '../types'

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
const FOCUS_KEY = 'blue-bird-focus'

type Panel = 'info' | 'history' | 'search' | null

export function Writer() {
  const { workId, chapterId } = useParams()
  const navigate = useNavigate()
  const { data: work, error: workError } = useWork(workId)
  const { data: chapters, error: chaptersError } = useChapters(workId)
  const wide = useWide()
  const [focus, setFocus] = useState(() => localStorage.getItem(FOCUS_KEY) === '1')
  const [sidebarOpen, setSidebarOpen] = useState(wide && !focus)
  const [panel, setPanel] = useState<Panel>(wide && !focus ? 'info' : null)
  const [searchMounted, setSearchMounted] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [find, setFind] = useState<FindSeed>()
  const [prefill, setPrefill] = useState<GlobalPrefill>()
  const [paneNonce, setPaneNonce] = useState(0)
  const [dialog, setDialog] = useState<null | 'import' | 'export-chapter' | 'export-all'>(null)
  const saveNowRef = useRef<(() => Promise<void>) | null>(null)
  useEffect(() => {
    if (focus) return
    setSidebarOpen(wide)
    setPanel((p) => (wide ? p ?? 'info' : null))
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

  async function addChapter(after?: Chapter) {
    const next = after && live[live.indexOf(after) + 1]
    let label = `Chương ${live.length + 1}`
    let order = (live[live.length - 1]?.order ?? 0) + 1
    if (after) {
      const n = prompt('Số/nhãn của chương chèn thêm (ví dụ 7.5, Ngoại truyện):', `${after.label}.5`)
      if (!n?.trim()) return
      label = n.trim()
      // shortcut: fractional order; precision lasts ~50 inserts between the same two chapters.
      order = next ? (after.order + next.order) / 2 : after.order + 1
    }
    const id = await createChapter(workId!, label, order)
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

  const toggleFocus = () => {
    const on = !focus
    setFocus(on)
    localStorage.setItem(FOCUS_KEY, on ? '1' : '0')
    setSidebarOpen(!on && wide)
    setPanel(!on && wide ? 'info' : null)
  }

  const openGlobal = (query = '', replacement = '', opts = { caseSensitive: false, wholeWord: false }) => {
    setSearchMounted(true)
    setPanel('search')
    if (query) setPrefill({ query, replacement, opts, nonce: Date.now() })
  }

  const closeDrawers = () => {
    if (wide) return
    setSidebarOpen(false)
    setPanel(null)
  }
  const drawerOpen = !wide && (sidebarOpen || panel !== null)
  const saveNow = () => saveNowRef.current?.() ?? Promise.resolve()

  return (
    <div className={`writer ${sidebarOpen ? 'with-sidebar' : ''} ${panel ? 'with-panel' : ''} ${focus ? 'focus' : ''}`}>
      {drawerOpen && <div className="scrim" onClick={closeDrawers} aria-hidden="true" />}
      {sidebarOpen && (
        <ChapterSidebar
          title={work.title}
          live={live}
          trashed={trashed}
          currentId={chapterId}
          onOpen={go}
          onAdd={() => addChapter().catch(fail)}
          onInsertAfter={(c) => addChapter(c).catch(fail)}
          onImport={() => setDialog('import')}
          onClose={() => setSidebarOpen(false)}
          onMove={(c, dir) => {
            const i = live.indexOf(c)
            const other = live[i + dir]
            if (other) swapOrder(workId, c, other).catch(fail)
          }}
          onDuplicate={(c) => {
            const next = live[live.indexOf(c) + 1]
            duplicateChapter(workId, c, next ? (c.order + next.order) / 2 : c.order + 1).catch(fail)
          }}
          onTrash={(c) => trash(c).catch(fail)}
          onRestore={(c) => updateChapter(workId, c.id, { deletedAt: null }).catch(fail)}
          onDeleteForever={(c) => deleteForever(c).catch(fail)}
        />
      )}

      {chapter ? (
        <ChapterPane
          key={`${chapter.id}:${paneNonce}`}
          workId={workId}
          chapter={chapter}
          prev={live[index - 1]}
          next={live[index + 1]}
          find={find}
          focus={focus}
          saveNowRef={saveNowRef}
          onEditor={setEditor}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onTogglePanel={() => setPanel((p) => (p === 'info' ? null : 'info'))}
          onOpenHistory={() => setPanel('history')}
          onToggleFocus={toggleFocus}
          onGlobalSearch={openGlobal}
          onImport={() => setDialog('import')}
          onExport={(s) => setDialog(s === 'chapter' ? 'export-chapter' : 'export-all')}
        />
      ) : (
        <div className="chapter-editor">
          <div className="page empty">
            {live.length === 0 ? (
              <>
                <p>Tác phẩm chưa có chương nào.</p>
                <div className="row center">
                  <button className="btn primary" onClick={() => addChapter().catch(fail)}><Plus size={18} /> Thêm chương đầu tiên</button>
                  <button className="btn" onClick={() => setDialog('import')}><Upload size={18} /> Nhập chương từ file</button>
                </div>
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

      {searchMounted && (
        <GlobalSearch
          hidden={panel !== 'search'}
          workId={workId}
          chapters={live}
          currentId={chapter?.id}
          editor={editor}
          prefill={prefill}
          saveNow={saveNow}
          onOpen={(id, i, query, opts) => {
            setFind({ query, opts, index: i, nonce: Date.now() })
            if (id !== chapterId) navigate(`/write/${workId}/${id}`)
            if (!wide) setPanel(null)
          }}
          onReloadCurrent={() => setPaneNonce((n) => n + 1)}
          onClose={() => setPanel(wide && !focus ? 'info' : null)}
        />
      )}
      {panel === 'history' && chapter && (
        <VersionPanel workId={workId} chapter={chapter} editor={editor} onClose={() => setPanel(wide && !focus ? 'info' : null)} />
      )}
      {panel === 'info' && chapter && (
        <InfoPanel
          key={`info-${chapter.id}`}
          workId={workId}
          chapter={chapter}
          live={live}
          onHistory={() => setPanel('history')}
          onExport={() => setDialog('export-all')}
          onClose={() => setPanel(null)}
        />
      )}

      {dialog === 'import' && (
        <ImportDialog
          mode="chapter"
          workId={workId}
          chapters={live}
          current={chapter}
          editor={editor}
          onClose={() => setDialog(null)}
          onDone={(_, id) => {
            setDialog(null)
            if (id && id !== chapterId) navigate(`/write/${workId}/${id}`)
          }}
        />
      )}
      {(dialog === 'export-chapter' || dialog === 'export-all') && (
        <ExportDialog
          workId={workId}
          workTitle={work.title}
          chapters={live}
          currentId={chapter?.id}
          initial={dialog === 'export-chapter' ? 'chapter' : 'all'}
          beforeLoad={saveNow}
          onClose={() => setDialog(null)}
        />
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
  onInsertAfter: (c: Chapter) => void
  onImport: () => void
  onClose: () => void
  onMove: (c: Chapter, dir: -1 | 1) => void
  onDuplicate: (c: Chapter) => void
  onTrash: (c: Chapter) => void
  onRestore: (c: Chapter) => void
  onDeleteForever: (c: Chapter) => void
}

const GROUP = 50

function ChapterSidebar(p: SidebarProps) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<ChapterStatus | ''>('')
  const [showTrash, setShowTrash] = useState(false)
  const filtering = !!q.trim() || !!status
  const shown = filterChapters(p.live, q).filter((c) => !status || c.status === status)
  const currentRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' }) // returns a Promise in new Chrome; keep it out of the cleanup slot
  }, [p.currentId])

  const item = (c: Chapter) => {
    const i = p.live.indexOf(c)
    const current = c.id === p.currentId
    return (
      <li key={c.id} ref={current ? currentRef : undefined} className={current ? 'current' : undefined}>
        <button className="chapter-item" onClick={() => p.onOpen(c)} aria-current={current ? 'page' : undefined}>
          <span className="chapter-label"><span className={`status-dot ${c.status}`} title={CHAPTER_STATUS_LABEL[c.status]} aria-hidden="true" />{c.label}</span>
          <span className="chapter-title">{c.title}</span>
        </button>
        <Menu
          label={`Thao tác cho ${c.label}`}
          items={[
            { label: 'Chuyển lên', icon: <ArrowUp size={16} />, onSelect: () => p.onMove(c, -1), disabled: i === 0 || filtering },
            { label: 'Chuyển xuống', icon: <ArrowDown size={16} />, onSelect: () => p.onMove(c, 1), disabled: i === p.live.length - 1 || filtering },
            { label: 'Chèn chương mới sau', icon: <ListPlus size={16} />, onSelect: () => p.onInsertAfter(c) },
            { label: 'Nhân bản', icon: <Copy size={16} />, onSelect: () => p.onDuplicate(c) },
            { label: 'Đưa vào thùng rác', icon: <Trash2 size={16} />, danger: true, onSelect: () => p.onTrash(c) },
          ]}
        />
      </li>
    )
  }

  // Long works: collapsible groups of 50, the current chapter's group open.
  const groups = !filtering && p.live.length > GROUP + 10
    ? Array.from({ length: Math.ceil(p.live.length / GROUP) }, (_, g) => p.live.slice(g * GROUP, (g + 1) * GROUP))
    : null

  return (
    <aside className="sidebar" aria-label="Danh sách chương">
      <div className="panel-head">
        <h2 className="work-name" title={p.title}>{p.title}</h2>
        <button className="icon-btn" onClick={p.onClose} aria-label="Thu gọn danh sách chương" title="Thu gọn danh sách chương"><X size={18} /></button>
      </div>
      <div className="row nowrap">
        <button className="btn primary grow" onClick={p.onAdd}><Plus size={18} /> Thêm chương</button>
        <button className="btn" onClick={p.onImport} aria-label="Nhập chương từ file" title="Nhập chương từ file"><Upload size={18} /></button>
      </div>
      <label className="search">
        <Search size={16} aria-hidden="true" />
        <input type="search" placeholder="Tìm số hoặc tên chương" aria-label="Tìm chương" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <select aria-label="Lọc theo trạng thái chương" value={status} onChange={(e) => setStatus(e.target.value as ChapterStatus | '')}>
        <option value="">Mọi trạng thái ({p.live.length})</option>
        {Object.entries(CHAPTER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v} ({p.live.filter((c) => c.status === k).length})</option>)}
      </select>
      {filtering && !shown.length && <p className="muted small">Không có chương phù hợp.</p>}
      {groups ? (
        groups.map((g, gi) => (
          <details key={gi} className="chapter-group" open={g.some((c) => c.id === p.currentId) || undefined}>
            <summary>{gi * GROUP + 1}–{gi * GROUP + g.length} <span className="muted small">{g[0].label} → {g[g.length - 1].label}</span></summary>
            <ol className="chapter-list">{g.map(item)}</ol>
          </details>
        ))
      ) : (
        <ol className="chapter-list">{shown.map(item)}</ol>
      )}
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

const KIND_LABEL: Record<string, string> = { character: 'Nhân vật', event: 'Sự kiện', place: 'Địa điểm', note: 'Ghi chú', thread: 'Tình tiết' }

function InfoPanel(p: { workId: string; chapter: Chapter; live: Chapter[]; onHistory: () => void; onExport: () => void; onClose: () => void }) {
  const { chapter } = p
  const [note, setNote] = useState(chapter.note)
  const noteRef = useRef(note)
  noteRef.current = note
  const saveNote = () => noteRef.current !== chapter.note && updateChapter(p.workId, chapter.id, { note: noteRef.current }).catch(fail)
  useEffect(() => () => void saveNote(), []) // switching chapter without blurring the note
  const { data: bible } = useBible(p.workId)
  const entries = (bible ?? []).filter((b) => !b.deletedAt && b.kind !== 'style')
  const linked = entries.filter((b) => b.links?.chapters?.includes(chapter.id))
  const unlinked = entries.filter((b) => !linked.includes(b)).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'vi'))
  const setLink = (b: BibleItem, on: boolean) =>
    updateBibleItem(p.workId, b.id, {
      links: { ...b.links, chapters: on ? [...b.links.chapters, chapter.id] : b.links.chapters.filter((x) => x !== chapter.id) },
    }).catch(fail)
  const words = p.live.reduce((s, c) => s + c.wordCount, 0)
  const count = (s: ChapterStatus) => p.live.filter((c) => c.status === s).length

  return (
    <aside className="side-panel" aria-label="Thông tin chương">
      <div className="panel-head">
        <h2>Thông tin chương</h2>
        <button className="icon-btn" onClick={p.onClose} aria-label="Thu gọn bảng thông tin" title="Thu gọn bảng thông tin"><X size={18} /></button>
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
      <p className="small with-icon">
        <BadgeCheck size={16} /> {chapter.canonVersionId ? 'Đã có bản chính thức.' : 'Chưa đánh dấu bản chính thức.'}{' '}
        <button className="link-btn" onClick={p.onHistory}>{chapter.canonVersionId ? 'Xem' : 'Đánh dấu'}</button>
      </p>
      <label className="field">
        <span>Ghi chú nhanh</span>
        <textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} />
      </label>
      <button className="btn" onClick={p.onHistory}><History size={18} /> Xem lịch sử phiên bản</button>

      <section className="info-section" aria-labelledby="bible-links-h">
        <h3 id="bible-links-h" className="with-icon"><BookMarked size={16} /> Sổ tay liên quan</h3>
        {linked.length ? (
          <ul className="link-chips">
            {linked.map((b) => (
              <li key={b.id}>
                <Link to={`/bible/${p.workId}?item=${b.id}`} title={KIND_LABEL[b.kind]}>{b.name || '(chưa đặt tên)'}</Link>
                <button className="icon-btn tiny" aria-label={`Bỏ liên kết ${b.name}`} title="Bỏ liên kết" onClick={() => setLink(b, false)}><X size={14} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Chưa liên kết nhân vật, sự kiện, địa điểm hay ghi chú nào.</p>
        )}
        {unlinked.length > 0 ? (
          <label className="search">
            <Link2 size={16} aria-hidden="true" />
            <select aria-label="Liên kết mục Sổ tay với chương" value="" onChange={(e) => { const b = unlinked.find((x) => x.id === e.target.value); if (b) setLink(b, true) }}>
              <option value="">Liên kết mục Sổ tay…</option>
              {unlinked.map((b) => <option key={b.id} value={b.id}>{KIND_LABEL[b.kind]}: {b.name || '(chưa đặt tên)'}</option>)}
            </select>
          </label>
        ) : (
          <Link to={`/bible/${p.workId}`} className="link-btn small">Mở Sổ tay truyện</Link>
        )}
      </section>

      <section className="info-section" aria-labelledby="work-stats-h">
        <h3 id="work-stats-h">Tác phẩm</h3>
        <dl className="stats">
          <dt>Số chương</dt><dd>{formatNumber(p.live.length)}</dd>
          <dt>Tổng số từ</dt><dd>{formatNumber(words)}</dd>
          <dt>Trang ước tính</dt><dd>{formatNumber(estimatePages(words))}</dd>
          <dt>Hoàn chỉnh</dt><dd>{count('final')}</dd>
          <dt>Đang sửa</dt><dd>{count('revising')}</dd>
          <dt>Bản nháp</dt><dd>{count('draft')}</dd>
          <dt>Sửa gần nhất</dt><dd>{formatDate(Math.max(0, ...p.live.map((c) => c.updatedAt)))}</dd>
        </dl>
        <button className="btn small" onClick={p.onExport}><Download size={16} /> Xuất tác phẩm</button>
      </section>
    </aside>
  )
}
