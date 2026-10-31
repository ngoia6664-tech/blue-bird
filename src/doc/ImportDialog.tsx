import { generateJSON, type JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, FileUp, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Modal } from '../components/Modal'
import { CHAPTER_SIZE_MAX_BYTES } from '../config'
import { createChapter } from '../data/chapters'
import { addVersion } from '../data/versions'
import { saveWork } from '../data/works'
import { extensions } from '../editor/extensions'
import { formatNumber, utf8Bytes } from '../format'
import type { Chapter } from '../types'
import { mdToNodes, splitChapters, toContent, txtToNodes, type ImportedChapter } from './convert'

type Target = 'new-chapters' | 'replace'

interface Parsed {
  fileName: string
  nodes: JSONContent[]
  split: ImportedChapter[] | null
  warnings: string[]
}

async function parseFile(file: File): Promise<Parsed> {
  const ext = file.name.toLowerCase().split('.').pop()
  const warnings: string[] = []
  let nodes: JSONContent[]
  if (ext === 'docx') {
    const { docxToHtml } = await import('./docx')
    const r = await docxToHtml(await file.arrayBuffer())
    warnings.push(...r.warnings)
    // generateJSON parses in an inert document and keeps only what the editor schema allows:
    // scripts, styles, links and unknown tags are dropped, never inserted into the page.
    nodes = generateJSON(r.html, extensions).content ?? []
  } else if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    const text = await file.text()
    if (text.includes('�')) warnings.push('File có ký tự lỗi: có thể không phải UTF-8. Hãy lưu lại file với mã hóa UTF-8.')
    nodes = ext === 'txt' ? txtToNodes(text) : mdToNodes(text)
  } else {
    throw new Error('Chỉ hỗ trợ file .docx, .txt, .md.')
  }
  if (!nodes.length) throw new Error('File không có nội dung chữ.')
  return { fileName: file.name.replace(/\.[^.]+$/, ''), nodes, split: splitChapters(nodes), warnings }
}

interface Props {
  /** 'work': create a new work (Library). 'chapter': add to / replace in the open work (Writer). */
  mode: 'work' | 'chapter'
  workId?: string
  chapters?: Chapter[]
  current?: Chapter
  editor?: Editor | null
  onDone: (workId: string, chapterId?: string) => void
  onClose: () => void
}

export function ImportDialog(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [parts, setParts] = useState<(ImportedChapter & { include: boolean })[]>([])
  const [useSplit, setUseSplit] = useState(true)
  const [target, setTarget] = useState<Target>('new-chapters')
  const [workTitle, setWorkTitle] = useState('')
  const [singleLabel, setSingleLabel] = useState('')
  const [singleTitle, setSingleTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(f: File | undefined) {
    if (!f) return
    setError(null)
    setParsed(null)
    try {
      const r = await parseFile(f)
      setParsed(r)
      setParts((r.split ?? []).map((c) => ({ ...c, include: true })))
      setUseSplit(!!r.split)
      setWorkTitle(r.fileName)
      setSingleLabel(`Chương ${(p.chapters?.length ?? 0) + 1}`)
      setSingleTitle(r.fileName)
    } catch (e) {
      setError(`Không đọc được file: ${(e as Error).message}`)
    }
  }

  const splitting = !!parsed?.split && useSplit
  const list = splitting ? parts.filter((c) => c.include) : parsed ? [{ label: singleLabel.trim() || 'Chương 1', title: singleTitle.trim(), nodes: parsed.nodes }] : []
  const move = (i: number, d: -1 | 1) => setParts((ps) => {
    const n = [...ps]
    ;[n[i], n[i + d]] = [n[i + d], n[i]]
    return n
  })

  async function run() {
    if (!parsed) return
    const contents = list.map((c) => ({ ...c, content: toContent(c.nodes) }))
    const big = contents.find((c) => utf8Bytes(c.content.json) + utf8Bytes(c.content.text) > CHAPTER_SIZE_MAX_BYTES)
    if (big) return setError(`"${big.label}" quá dài cho một chương (giới hạn ~1 MB). Hãy chia thành nhiều chương.`)
    setBusy(true)
    setError(null)
    try {
      if (p.mode === 'chapter' && target === 'replace') {
        const ed = p.editor
        if (!ed?.isEditable || !p.current) throw new Error('Chương hiện tại chưa sẵn sàng để thay nội dung.')
        if (!confirm(`Thay toàn bộ nội dung "${p.current.label}" bằng nội dung file?\nNội dung hiện tại được lưu thành phiên bản "Trước khi nhập file" và có thể hoàn tác (Ctrl+Z).`)) return
        await addVersion(p.workId!, p.current.id, JSON.stringify(ed.getJSON()), 'pre-import', `Trước khi nhập "${parsed.fileName}"`)
        ed.chain().focus().setContent(JSON.parse(contents[0].content.json), { emitUpdate: true }).run()
        return p.onDone(p.workId!, p.current.id)
      }
      const workId = p.mode === 'work'
        ? await saveWork(null, { title: workTitle.trim() || parsed.fileName, aliases: [], genre: '', tags: [], status: 'writing', description: '', privateNote: '' }, undefined)
        : p.workId!
      const base = p.chapters?.length ? p.chapters[p.chapters.length - 1].order : 0
      let first: string | undefined
      for (const [i, c] of contents.entries()) {
        setStatus(`Đang tạo chương ${i + 1}/${contents.length}…`)
        const id = await createChapter(workId, c.label, base + i + 1, c.title, c.content)
        first ??= id
      }
      p.onDone(workId, first)
    } catch (e) {
      setError(`Nhập thất bại: ${(e as Error).message}. Những chương đã tạo trước lỗi vẫn được giữ.`)
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  return (
    <Modal title={p.mode === 'work' ? 'Nhập tác phẩm từ file' : 'Nhập chương từ file'} onClose={p.onClose} locked={busy} wide>
      <input ref={fileRef} type="file" accept=".docx,.txt,.md,.markdown" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}><FileUp size={18} /> {parsed ? 'Chọn file khác' : 'Chọn file (.docx, .txt, .md)'}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {parsed && (
        <>
          <p className="small muted">"{parsed.fileName}": {formatNumber(toContent(parsed.nodes).words)} từ. File gốc không bị thay đổi.</p>
          {parsed.warnings.map((w) => <p key={w} className="notice small">{w}</p>)}

          {p.mode === 'work' && (
            <label className="field"><span>Tên tác phẩm</span><input value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} /></label>
          )}
          {p.mode === 'chapter' && p.current && (
            <fieldset className="field">
              <legend>Nhập vào</legend>
              <label className="choice"><input type="radio" name="target" checked={target === 'new-chapters'} onChange={() => setTarget('new-chapters')} /> Thêm chương mới vào cuối tác phẩm</label>
              <label className="choice"><input type="radio" name="target" checked={target === 'replace'} onChange={() => (setTarget('replace'), setUseSplit(false))} /> Thay nội dung "{p.current.label}" (có lưu bản dự phòng)</label>
            </fieldset>
          )}

          {parsed.split && target !== 'replace' && (
            <fieldset className="field">
              <legend>Chia chương</legend>
              <label className="choice"><input type="radio" name="split" checked={useSplit} onChange={() => setUseSplit(true)} /> Chia thành {parts.length} chương theo tiêu đề tìm thấy</label>
              <label className="choice"><input type="radio" name="split" checked={!useSplit} onChange={() => setUseSplit(false)} /> Nhập thành một chương duy nhất</label>
            </fieldset>
          )}

          {splitting ? (
            <ol className="import-list">
              {parts.map((c, i) => (
                <li key={i} className={c.include ? undefined : 'muted'}>
                  <input type="checkbox" aria-label={`Nhập ${c.label}`} checked={c.include} onChange={(e) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
                  <input aria-label="Số chương" className="import-label" value={c.label} onChange={(e) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input aria-label="Tiêu đề" value={c.title} placeholder="Tiêu đề" onChange={(e) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <span className="muted small nowrap">{formatNumber(toContent(c.nodes).words)} từ</span>
                  <button className="icon-btn" aria-label="Chuyển lên" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
                  <button className="icon-btn" aria-label="Chuyển xuống" disabled={i === parts.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
                </li>
              ))}
            </ol>
          ) : target !== 'replace' && (
            <div className="field-row">
              <label className="field"><span>Số chương</span><input value={singleLabel} onChange={(e) => setSingleLabel(e.target.value)} /></label>
              <label className="field"><span>Tiêu đề</span><input value={singleTitle} onChange={(e) => setSingleTitle(e.target.value)} /></label>
            </div>
          )}
          {status && <p className="small" role="status">{status}</p>}
          <div className="form-actions">
            <button className="btn" onClick={p.onClose} disabled={busy}>Hủy</button>
            <button className="btn primary" disabled={busy || !list.length} onClick={() => void run()}>
              <Upload size={18} /> {target === 'replace' && p.mode === 'chapter' ? 'Thay nội dung' : `Nhập ${list.length} chương`}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
