import { EditorContent, useEditor } from '@tiptap/react'
import { getDoc } from 'firebase/firestore'
import { ChevronLeft, ChevronRight, Minus, PenLine, Plus, Type, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useChapters, useWork } from '../data/hooks'
import { contentDoc } from '../data/refs'
import { chapterHeading, jsonToTxt } from '../doc/convert'
import { extensions, parseJson } from '../editor/extensions'
import { countWords, estimatePages, formatNumber } from '../format'
import { getDraft } from '../sync/engine'
import type { ChapterContent } from '../types'

interface Prefs {
  size: number
  line: number
  font: 'serif' | 'sans'
  width: 'narrow' | 'medium' | 'wide'
  theme: 'light' | 'sepia' | 'dark'
}
const PREFS_KEY = 'blue-bird-reader'
const defaults: Prefs = { size: 19, line: 1.8, font: 'serif', width: 'medium', theme: 'light' }
const readKey = (workId: string) => `blue-bird-last-read:${workId}`
const WIDTH = { narrow: '34rem', medium: '42rem', wide: '54rem' }

function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }))
  useEffect(() => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)), [prefs])
  return [prefs, (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }))] as const
}

/** Reading mode: one chapter per page, scrolling, nothing editable. */
export function Reader() {
  const { workId, chapterId } = useParams()
  const navigate = useNavigate()
  const { data: work } = useWork(workId)
  const { data: chapters } = useChapters(workId)
  const live = chapters?.filter((c) => !c.deletedAt) ?? []
  const index = live.findIndex((c) => c.id === chapterId)
  const chapter = live[index]
  const [prefs, setPref] = usePrefs()
  const [showPrefs, setShowPrefs] = useState(false)
  const [content, setContent] = useState<{ json: string; local: boolean } | null | 'error'>(null)
  const top = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!workId || !chapters || chapterId) return
    const last = localStorage.getItem(readKey(workId))
    const target = live.find((c) => c.id === last) ?? live[0]
    if (target) navigate(`/read/${workId}/${target.id}`, { replace: true })
  }, [workId, chapters, chapterId])

  useEffect(() => {
    if (!workId || !chapterId) return
    localStorage.setItem(readKey(workId), chapterId)
    let live = true
    setContent(null)
    ;(async () => {
      // This device's unsynced draft is the newest text; show it rather than an older cloud copy.
      const d = await getDraft(workId, chapterId)
      if (d && !d.synced) return { json: d.json, local: true }
      const s = await getDoc(contentDoc(workId, chapterId))
      return { json: (s.data() as ChapterContent | undefined)?.json ?? '', local: false }
    })()
      .then((c) => live && setContent(c))
      .catch(() => live && setContent('error'))
    top.current?.scrollIntoView({ block: 'start' })
    return () => void (live = false)
  }, [workId, chapterId])

  const editor = useEditor({ extensions, content: '', editable: false, editorProps: { attributes: { class: 'reader-prose', 'aria-label': 'Nội dung chương' } } })
  useEffect(() => {
    if (editor && content && content !== 'error') editor.commands.setContent(parseJson(content.json), { emitUpdate: false })
  }, [editor, content])

  if (!workId) return <p className="page">Hãy mở một tác phẩm trong <Link to="/">Thư viện</Link>.</p>
  if (!work || !chapters) return <p className="page muted">Đang tải…</p>

  const prev = live[index - 1]
  const next = live[index + 1]
  const words = content && content !== 'error' ? countWords(jsonToTxt(content.json)) : chapter?.wordCount ?? 0
  const style = {
    '--reader-size': `${prefs.size}px`,
    '--reader-line': prefs.line,
    '--reader-width': WIDTH[prefs.width],
  } as CSSProperties
  const nav = (
    <nav className="reader-nav" aria-label="Chuyển chương">
      {prev ? <Link className="btn small" to={`/read/${workId}/${prev.id}`}><ChevronLeft size={16} /> Chương trước</Link> : <span />}
      {next ? <Link className="btn small" to={`/read/${workId}/${next.id}`}>Chương sau <ChevronRight size={16} /></Link> : <span />}
    </nav>
  )

  return (
    <div className={`reader theme-${prefs.theme} font-${prefs.font}`} style={style}>
      <header className="reader-bar">
        <Link className="icon-btn" to={`/write/${workId}${chapter ? `/${chapter.id}` : ''}`} aria-label="Trở lại chỉnh sửa" title="Trở lại chỉnh sửa"><PenLine size={18} /></Link>
        <select aria-label="Chọn chương" value={chapterId ?? ''} onChange={(e) => navigate(`/read/${workId}/${e.target.value}`)}>
          {live.map((c) => <option key={c.id} value={c.id}>{chapterHeading(c)}</option>)}
        </select>
        <button className="icon-btn" aria-label="Tùy chỉnh đọc" title="Tùy chỉnh đọc" aria-expanded={showPrefs} onClick={() => setShowPrefs((s) => !s)}><Type size={18} /></button>
      </header>
      {showPrefs && (
        <div className="reader-prefs" role="group" aria-label="Tùy chỉnh đọc">
          <div className="pref"><span>Cỡ chữ</span>
            <button className="icon-btn" aria-label="Giảm cỡ chữ" onClick={() => setPref({ size: Math.max(14, prefs.size - 1) })}><Minus size={16} /></button>
            <b>{prefs.size}</b>
            <button className="icon-btn" aria-label="Tăng cỡ chữ" onClick={() => setPref({ size: Math.min(30, prefs.size + 1) })}><Plus size={16} /></button>
          </div>
          <div className="pref"><span>Giãn dòng</span>
            <button className="icon-btn" aria-label="Giảm giãn dòng" onClick={() => setPref({ line: Math.max(1.3, +(prefs.line - 0.1).toFixed(1)) })}><Minus size={16} /></button>
            <b>{prefs.line.toFixed(1)}</b>
            <button className="icon-btn" aria-label="Tăng giãn dòng" onClick={() => setPref({ line: Math.min(2.6, +(prefs.line + 0.1).toFixed(1)) })}><Plus size={16} /></button>
          </div>
          <label className="pref"><span>Font</span>
            <select value={prefs.font} onChange={(e) => setPref({ font: e.target.value as Prefs['font'] })}><option value="serif">Có chân (Literata)</option><option value="sans">Không chân (Be Vietnam Pro)</option></select>
          </label>
          <label className="pref"><span>Chiều rộng</span>
            <select value={prefs.width} onChange={(e) => setPref({ width: e.target.value as Prefs['width'] })}><option value="narrow">Hẹp</option><option value="medium">Vừa</option><option value="wide">Rộng</option></select>
          </label>
          <label className="pref"><span>Nền</span>
            <select value={prefs.theme} onChange={(e) => setPref({ theme: e.target.value as Prefs['theme'] })}><option value="light">Sáng</option><option value="sepia">Giấy cũ</option><option value="dark">Tối</option></select>
          </label>
          <button className="icon-btn" aria-label="Đóng tùy chỉnh" onClick={() => setShowPrefs(false)}><X size={16} /></button>
        </div>
      )}
      <article className="reader-page" ref={top}>
        <p className="reader-work">{work?.title}</p>
        {chapter ? (
          <>
            <h1 className="reader-title">{chapter.label}{chapter.title && <small>{chapter.title}</small>}</h1>
            <p className="reader-meta">{formatNumber(words)} từ · ~{estimatePages(words)} trang (ước tính) · chương {index + 1}/{live.length}</p>
            {content && content !== 'error' && content.local && <p className="notice small">Đang hiển thị bản trên máy này (chưa đồng bộ lên cloud).</p>}
            {content === 'error' && <p className="error" role="alert">Chưa tải được nội dung chương (có thể đang ngoại tuyến).</p>}
            {content === null && <p className="muted">Đang tải…</p>}
            <EditorContent editor={editor} hidden={!content || content === 'error'} />
            {nav}
          </>
        ) : (
          <p className="muted">Tác phẩm chưa có chương nào.</p>
        )}
      </article>
    </div>
  )
}
