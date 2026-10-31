import type { Editor } from '@tiptap/react'
import { CaseSensitive, CircleAlert, CircleCheck, ReplaceAll, RotateCcw, Search, Undo2, WholeWord, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadContents, rewriteChapter, type LoadedChapter } from '../data/contents'
import { docFromJson, docText, replaceInJson } from '../search/doc'
import { findAll, snippet, type FindOptions, type Match } from '../search/find'
import { countWords, formatNumber } from '../format'
import { flush, getDraft } from '../sync/engine'
import type { Chapter } from '../types'

export interface GlobalPrefill {
  query: string
  replacement: string
  opts: FindOptions
  nonce: number
}

interface Props {
  workId: string
  chapters: Chapter[]
  currentId?: string
  editor: Editor | null
  prefill?: GlobalPrefill
  saveNow: () => Promise<void>
  onOpen: (chapterId: string, index: number, query: string, opts: FindOptions) => void
  /** The open chapter was rewritten on the server: reload it in the editor. */
  onReloadCurrent: () => void
  onClose: () => void
  hidden: boolean
}

interface Done {
  chapter: Chapter
  status: 'ok' | 'changed' | 'local' | 'error'
  count: number
  newRev?: number
  oldJson?: string
  error?: string
}

const MAX_SHOWN = 30

/** Search (and replace) the text of every chapter of the work, not only open ones. */
export function GlobalSearch(p: Props) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [opts, setOpts] = useState<FindOptions>({ caseSensitive: false, wholeWord: false })
  const [showReplace, setShowReplace] = useState(false)
  const [loaded, setLoaded] = useState<{ items: LoadedChapter[]; failed: Chapter[]; at: number } | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<{ query: string; replacement: string; done: Done[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!p.prefill) return
    setQuery(p.prefill.query)
    setReplacement(p.prefill.replacement)
    setOpts(p.prefill.opts)
    if (p.prefill.replacement) setShowReplace(true)
    input.current?.focus()
    if (p.prefill.query) void load()
  }, [p.prefill?.nonce])

  async function load() {
    abort.current?.abort()
    const ac = (abort.current = new AbortController())
    setError(null)
    setProgress('Đang chuẩn bị…')
    try {
      await p.saveNow() // the open chapter's last keystrokes go into its draft first
      const r = await loadContents(p.workId, p.chapters, {
        getDraft,
        signal: ac.signal,
        onProgress: (d, t) => setProgress(`Đang quét ${d}/${t} chương…`),
      })
      setLoaded({ ...r, at: Date.now() })
      return r
    } catch (e) {
      if (!ac.signal.aborted) setError(`Không tải được nội dung: ${(e as Error).message}`)
    } finally {
      if (abort.current === ac) setProgress(null)
    }
  }
  useEffect(() => () => abort.current?.abort(), [])

  // Matching runs on the texts of the last scan (its time is shown), so typing filters instantly;
  // "Tìm lại" re-reads everything, including the open chapter's latest keystrokes.
  const results = useMemo(() => {
    if (!loaded || !query) return []
    return loaded.items.map((it) => ({ ...it, matches: findAll(it.text, query, opts) })).filter((r) => r.matches.length)
  }, [loaded, query, opts.caseSensitive, opts.wholeWord])
  const total = results.reduce((s, r) => s + r.matches.length, 0)

  async function replaceAllInWork() {
    if (!navigator.onLine) return setError('Cần có mạng để thay thế trong toàn tác phẩm.')
    if (!confirm(`Bạn sắp thay thế ${formatNumber(total)} kết quả trong ${results.length} chương.\n\n"${query}" → "${replacement}"\n\nMỗi chương bị ảnh hưởng sẽ có một phiên bản dự phòng "Trước khi thay thế" trong Lịch sử phiên bản.`)) return
    setBusy(true)
    setError(null)
    p.editor?.setEditable(false, false) // read-only while rewritten; no update event (that would mark it dirty)
    const done: Done[] = []
    try {
      await p.saveNow()
      await flush()
      // Fresh scan: exact revisions and drafts as of now, not as of the preview.
      const fresh = await load()
      if (!fresh) return
      const targets = fresh.items.filter((it) => findAll(it.text, query, opts).length)
      const label = `Trước khi thay "${query}" → "${replacement}"`
      for (const [i, it] of targets.entries()) {
        setProgress(`Đang thay chương ${i + 1}/${targets.length}…`)
        if (it.local) {
          done.push({ chapter: it.chapter, status: 'local', count: 0 })
          continue
        }
        let count = 0
        try {
          const r = await rewriteChapter(p.workId, it.chapter.id, it.rev, (json) => {
            const out = replaceInJson(json, query, replacement, opts)
            count = out.count
            return out.count ? out : null
          }, { kind: 'pre-replace', label })
          done.push(r.ok ? { chapter: it.chapter, status: 'ok', count, newRev: r.rev, oldJson: r.oldJson } : { chapter: it.chapter, status: 'changed', count: 0 })
        } catch (e) {
          // Stop at the first failure (offline, permissions): every chapter is all-or-nothing.
          done.push({ chapter: it.chapter, status: 'error', count: 0, error: (e as Error).message })
          break
        }
      }
      setLog({ query, replacement, done })
      await load()
    } catch (e) {
      setError(`Thay thế bị dừng: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      setProgress(null)
      if (done.some((d) => d.status === 'ok' && d.chapter.id === p.currentId)) p.onReloadCurrent()
      else p.editor?.setEditable(true, false)
    }
  }

  /** Put back the text from before the replace, only where nothing was edited since. */
  async function undoReplace() {
    if (!log) return
    const ok = log.done.filter((d) => d.status === 'ok')
    if (!confirm(`Hoàn tác lần thay thế "${log.query}" → "${log.replacement}" trên ${ok.length} chương?\nChương nào đã được sửa sau đó sẽ được giữ nguyên.`)) return
    setBusy(true)
    p.editor?.setEditable(false, false)
    const after: Done[] = []
    try {
      await p.saveNow()
      await flush()
      for (const d of ok) {
        try {
          const r = await rewriteChapter(p.workId, d.chapter.id, d.newRev!, (cur) => {
            if (!d.oldJson && !cur) return null
            const text = docText(docFromJson(d.oldJson!))
            return { json: d.oldJson!, text, words: countWords(text) }
          }, { kind: 'pre-restore', label: 'Trước khi hoàn tác thay thế' })
          after.push({ ...d, status: r.ok ? 'ok' : 'changed' })
        } catch (e) {
          after.push({ ...d, status: 'error', error: (e as Error).message })
        }
      }
      const kept = after.filter((d) => d.status !== 'ok')
      alert(kept.length
        ? `Đã hoàn tác ${after.length - kept.length} chương. ${kept.length} chương đã thay đổi sau khi thay thế nên được giữ nguyên; hãy khôi phục chúng từ Lịch sử phiên bản ("Trước khi thay thế").`
        : `Đã hoàn tác cả ${after.length} chương.`)
      setLog(null)
      await load()
    } finally {
      setBusy(false)
      if (after.some((d) => d.status === 'ok' && d.chapter.id === p.currentId)) p.onReloadCurrent()
      else p.editor?.setEditable(true, false)
    }
  }

  const toggle = (k: keyof FindOptions, label: string, icon: React.ReactNode) => (
    <button type="button" className="tool" aria-label={label} title={label} aria-pressed={opts[k]} onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))}>{icon}</button>
  )

  return (
    <aside className="side-panel global-search" aria-label="Tìm trong tác phẩm" hidden={p.hidden}>
      {busy && <div className="busy-overlay" role="alert">{progress ?? 'Đang xử lý…'}</div>}
      <div className="panel-head">
        <h2>Tìm trong tác phẩm</h2>
        <button className="icon-btn" onClick={p.onClose} aria-label="Đóng tìm trong tác phẩm"><X size={18} /></button>
      </div>
      <form className="global-form" onSubmit={(e) => (e.preventDefault(), void load())}>
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <input ref={input} type="search" aria-label="Từ khóa trong toàn tác phẩm" placeholder="Từ hoặc cụm từ" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="row">
          <button type="submit" className="btn small primary" disabled={!query || !!progress}>
            <Search size={16} /> {loaded ? 'Tìm lại' : 'Tìm'}
          </button>
          {toggle('caseSensitive', 'Phân biệt hoa/thường', <CaseSensitive size={18} />)}
          {toggle('wholeWord', 'Khớp nguyên từ', <WholeWord size={18} />)}
          <button type="button" className="btn small" aria-expanded={showReplace} onClick={() => setShowReplace((s) => !s)}><ReplaceAll size={16} /> Thay thế</button>
        </div>
        {showReplace && (
          <>
            <input type="text" aria-label="Thay bằng (toàn tác phẩm)" placeholder="Thay bằng (để trống = xóa)" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
            <button type="button" className="btn small danger-outline" disabled={!total || busy || !!progress} onClick={() => void replaceAllInWork()}>
              <ReplaceAll size={16} /> Thay tất cả trong tác phẩm…
            </button>
          </>
        )}
      </form>

      {progress && !busy && <p className="muted small" role="status">{progress} <button className="link-btn" onClick={() => abort.current?.abort()}>Hủy</button></p>}
      {error && <p className="error small" role="alert"><CircleAlert size={14} /> {error}</p>}
      {loaded && loaded.failed.length > 0 && (
        <p className="notice error small" role="alert">
          Chưa tải được {loaded.failed.length} chương (ngoại tuyến, chưa từng mở trên máy này): {loaded.failed.map((c) => c.label).join(', ')}. Kết quả chưa đầy đủ.
        </p>
      )}

      {log && <ReplaceReport log={log} busy={busy} onUndo={() => void undoReplace()} onDismiss={() => setLog(null)} />}

      {loaded && query && !progress && (
        <p className="small" role="status">
          {total ? <>Tìm thấy <b>{formatNumber(total)}</b> kết quả trong <b>{results.length}</b> chương.</> : 'Không tìm thấy.'}
          <span className="muted"> Đã quét {loaded.items.length} chương lúc {new Date(loaded.at).toLocaleTimeString('vi-VN')}.</span>
        </p>
      )}
      {!loaded && !progress && <p className="muted small">Nhập từ khóa rồi bấm Tìm (hoặc Enter). Tìm cả những chương chưa mở, kể cả bản nháp chưa đồng bộ trên máy này.</p>}

      <ol className="result-list">
        {results.map((r) => (
          <li key={r.chapter.id}>
            <h3 className="result-chapter">
              {r.chapter.label}{r.chapter.title ? ` — ${r.chapter.title}` : ''} <span className="badge">{r.matches.length}</span>
              {r.local && <span className="badge status-paused" title="Kết quả từ bản nháp trên máy này, chưa đồng bộ">trên máy</span>}
            </h3>
            <ul>
              {r.matches.slice(0, MAX_SHOWN).map((m: Match, i) => {
                const s = snippet(r.text, m)
                return (
                  <li key={i}>
                    <button className="result-item" onClick={() => p.onOpen(r.chapter.id, i, query, opts)}>
                      {s.before}<mark>{s.match}</mark>{s.after}
                    </button>
                  </li>
                )
              })}
              {r.matches.length > MAX_SHOWN && (
                <li className="muted small">
                  … và {r.matches.length - MAX_SHOWN} kết quả khác. <button className="link-btn" onClick={() => p.onOpen(r.chapter.id, MAX_SHOWN, query, opts)}>Mở chương để xem tiếp</button>
                </li>
              )}
            </ul>
          </li>
        ))}
      </ol>
    </aside>
  )
}

function ReplaceReport({ log, busy, onUndo, onDismiss }: { log: { query: string; replacement: string; done: Done[] }; busy: boolean; onUndo: () => void; onDismiss: () => void }) {
  const ok = log.done.filter((d) => d.status === 'ok')
  const label = { ok: 'đã thay', changed: 'bỏ qua: chương vừa thay đổi', local: 'bỏ qua: còn bản nháp chưa đồng bộ', error: 'lỗi' }
  return (
    <section className="replace-report" aria-label="Kết quả thay thế">
      <p className="with-icon"><CircleCheck size={16} /> Đã thay {formatNumber(ok.reduce((s, d) => s + d.count, 0))} kết quả trong {ok.length} chương.</p>
      <ul className="small">
        {log.done.map((d) => (
          <li key={d.chapter.id} className={d.status === 'ok' ? undefined : 'error'}>
            {d.chapter.label}: {label[d.status]}{d.status === 'ok' ? ` ${d.count}` : ''}{d.error ? ` (${d.error})` : ''}
          </li>
        ))}
      </ul>
      {log.done.some((d) => d.status === 'error') && <p className="error small">Thao tác dừng ở chương lỗi; các chương sau đó chưa bị thay đổi.</p>}
      <div className="row">
        {ok.length > 0 && <button className="btn small" disabled={busy} onClick={onUndo}><Undo2 size={16} /> Hoàn tác lần thay thế này</button>}
        <button className="btn small" onClick={onDismiss}><RotateCcw size={16} /> Đóng báo cáo</button>
      </div>
    </section>
  )
}
