import { getDoc } from 'firebase/firestore'
import { CloudDownload, Monitor, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { contentDoc } from '../data/refs'
import { addVersion } from '../data/versions'
import { countWords, formatDate, formatNumber } from '../format'
import { decideOnOpen, type Draft } from '../sync/drafts'
import { discardDraft, getDraft, keepDraftOver } from '../sync/engine'
import type { ChapterContent } from '../types'
import { ChapterEditor, type ChapterEditorProps } from './ChapterEditor'

type Load =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; json: string; rev: number; restoredDraft: boolean }
  | { state: 'conflict'; mine: Draft; theirs: ChapterContent | null }

type PaneProps = Omit<ChapterEditorProps, 'initialJson' | 'initialRev' | 'restoredDraft' | 'onConflict' | 'onReload'>

/** Loads one chapter: server text vs. a local draft that never reached the server. */
export function ChapterPane(props: PaneProps) {
  const { workId, chapter } = props
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [nonce, setNonce] = useState(0)
  const reload = () => setNonce((n) => n + 1)

  useEffect(() => {
    let live = true
    setLoad({ state: 'loading' })
    ;(async (): Promise<Load> => {
      const draft = await getDraft(workId, chapter.id)
      let server: ChapterContent | null
      try {
        const s = await getDoc(contentDoc(workId, chapter.id))
        server = s.exists() ? (s.data() as ChapterContent) : null
      } catch {
        if (draft && !draft.synced) return { state: 'ready', json: draft.json, rev: draft.baseRev, restoredDraft: true }
        throw new Error('Chưa tải được nội dung chương: đang ngoại tuyến và chương chưa từng mở trên máy này.')
      }
      const serverRev = server?.rev ?? 0
      switch (decideOnOpen(draft, serverRev)) {
        case 'conflict':
          return { state: 'conflict', mine: draft!, theirs: server }
        case 'draft':
          return { state: 'ready', json: draft!.json, rev: serverRev, restoredDraft: true }
        default:
          return { state: 'ready', json: server?.json ?? '', rev: serverRev, restoredDraft: false }
      }
    })()
      .then((l) => live && setLoad(l))
      .catch((e) => live && setLoad({ state: 'error', message: e.message }))
    return () => void (live = false)
  }, [workId, chapter.id, nonce])

  if (load.state === 'loading') return <div className="chapter-editor"><p className="page muted">Đang mở chương…</p></div>
  if (load.state === 'error') return <div className="chapter-editor"><p className="page error" role="alert">{load.message}</p></div>
  if (load.state === 'conflict') {
    return <ConflictView workId={workId} chapterId={chapter.id} mine={load.mine} theirs={load.theirs} onResolved={reload} />
  }
  return (
    <ChapterEditor
      key={nonce}
      {...props}
      initialJson={load.json}
      initialRev={load.rev}
      restoredDraft={load.restoredDraft}
      onConflict={reload}
      onReload={reload}
    />
  )
}

function ConflictView(p: { workId: string; chapterId: string; mine: Draft; theirs: ChapterContent | null; onResolved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Whichever side the user drops is saved as a "conflict" version first, so nothing is lost.
  async function resolve(keepMine: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (keepMine) {
        if (p.theirs) await addVersion(p.workId, p.chapterId, p.theirs.json, 'conflict', 'Bản từ thiết bị khác')
        await keepDraftOver(p.workId, p.chapterId, p.theirs?.rev ?? 0)
      } else {
        const latest = (await getDraft(p.workId, p.chapterId)) ?? p.mine
        await addVersion(p.workId, p.chapterId, latest.json, 'conflict', 'Bản trên máy này')
        await discardDraft(p.workId, p.chapterId)
      }
      p.onResolved()
    } catch (e) {
      setError(`Chưa xử lý được (cần có mạng): ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div className="chapter-editor conflict">
      <div className="page">
        <h2 className="with-icon"><TriangleAlert size={22} aria-hidden="true" /> Chương này đã được sửa ở thiết bị khác</h2>
        <p>
          Máy này có thay đổi chưa đồng bộ, trong khi máy chủ đã nhận một bản mới hơn. Hãy chọn bản muốn tiếp tục.
          Bản không được chọn vẫn được lưu trong <b>Lịch sử phiên bản</b>.
        </p>
        <div className="conflict-grid">
          <section>
            <h3>Bản trên máy này</h3>
            <p className="muted small">Lưu lúc {formatDate(p.mine.savedAt)} · {formatNumber(p.mine.words)} từ</p>
            <pre className="conflict-text">{p.mine.text}</pre>
            <button className="btn primary" disabled={busy} onClick={() => resolve(true)}><Monitor size={18} /> Giữ bản trên máy này</button>
          </section>
          <section>
            <h3>Bản trên thiết bị khác</h3>
            <p className="muted small">
              {p.theirs ? `Lưu lúc ${formatDate(p.theirs.updatedAt)} · ${formatNumber(countWords(p.theirs.text))} từ` : 'Không có nội dung'}
            </p>
            <pre className="conflict-text">{p.theirs?.text ?? ''}</pre>
            <button className="btn" disabled={busy} onClick={() => resolve(false)}><CloudDownload size={18} /> Dùng bản từ thiết bị khác</button>
          </section>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
