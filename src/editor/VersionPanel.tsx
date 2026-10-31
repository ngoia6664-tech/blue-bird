import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { ArrowLeft, RotateCcw, Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addVersion, listVersions } from '../data/versions'
import { formatDate } from '../format'
import { VERSION_KIND_LABEL, type Version } from '../types'
import { extensions, parseJson } from './extensions'

export function VersionPanel(p: { workId: string; chapterId: string; editor: Editor | null; onClose: () => void }) {
  const [versions, setVersions] = useState<Version[]>()
  const [selected, setSelected] = useState<Version | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () =>
    listVersions(p.workId, p.chapterId)
      .then(setVersions)
      .catch((e) => setError(`Không tải được lịch sử: ${e.message}`))
  useEffect(() => {
    setSelected(null)
    void load()
  }, [p.chapterId])

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(`Thao tác thất bại: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const current = () => JSON.stringify(p.editor!.getJSON())

  const saveManual = () => {
    const label = prompt('Tên phiên bản (có thể để trống):')
    if (label !== null) void act(() => addVersion(p.workId, p.chapterId, current(), 'manual', label.trim()))
  }

  const restore = (v: Version) => {
    if (!confirm('Khôi phục phiên bản này? Nội dung hiện tại sẽ được lưu thành một phiên bản trước khi thay.')) return
    void act(async () => {
      await addVersion(p.workId, p.chapterId, current(), 'pre-restore', `Trước khi khôi phục bản ${formatDate(v.createdAt)}`)
      // Goes through the normal autosave path (local draft, then sync), and is undoable.
      p.editor!.chain().focus().setContent(parseJson(v.json), { emitUpdate: true }).run()
      setSelected(null)
    })
  }

  const canEdit = !!p.editor?.isEditable
  return (
    <aside className="side-panel" aria-label="Lịch sử phiên bản">
      <div className="panel-head">
        <h2>Lịch sử phiên bản</h2>
        <button className="icon-btn" onClick={p.onClose} aria-label="Đóng lịch sử"><X size={18} /></button>
      </div>
      <button className="btn" disabled={busy || !p.editor} onClick={saveManual}><Save size={18} /> Lưu phiên bản hiện tại</button>
      {error && <p className="error" role="alert">{error}</p>}
      {selected ? (
        <div className="version-preview">
          <button className="link-btn" onClick={() => setSelected(null)}><ArrowLeft size={16} /> Danh sách</button>
          <p className="small">
            <b>{selected.label || VERSION_KIND_LABEL[selected.kind]}</b> · {formatDate(selected.createdAt)}
          </p>
          <ReadOnlyDoc json={selected.json} />
          <button className="btn primary" disabled={busy || !canEdit} onClick={() => restore(selected)}><RotateCcw size={18} /> Khôi phục bản này</button>
        </div>
      ) : !versions ? (
        <p className="muted">Đang tải…</p>
      ) : versions.length === 0 ? (
        <p className="muted small">Chưa có phiên bản nào. Bản tự động được tạo khoảng 10 phút một lần khi bạn viết.</p>
      ) : (
        <ul className="version-list">
          {versions.map((v) => (
            <li key={v.id}>
              <button onClick={() => setSelected(v)}>
                <span>{formatDate(v.createdAt)}</span>
                <span className="muted small">{v.label ? `${v.label} · ` : ''}{VERSION_KIND_LABEL[v.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function ReadOnlyDoc({ json }: { json: string }) {
  const editor = useEditor(
    { extensions, content: parseJson(json), editable: false, editorProps: { attributes: { class: 'prose', 'aria-label': 'Xem trước phiên bản' } } },
    [json],
  )
  return <EditorContent editor={editor} className="editor-content preview" />
}
