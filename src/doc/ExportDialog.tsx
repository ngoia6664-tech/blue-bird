import { Download } from 'lucide-react'
import { useState } from 'react'
import { download, Modal } from '../components/Modal'
import { loadContents, type LoadedChapter } from '../data/contents'
import { getDraft } from '../sync/engine'
import type { Chapter } from '../types'
import { chapterHeading, jsonToMd, jsonToTxt, safeName } from './convert'

type Format = 'docx' | 'md' | 'txt'
type Scope = 'chapter' | 'all' | 'range' | 'pick'

const pad = (n: number, width: number) => String(n).padStart(width, '0')

async function build(workTitle: string, items: LoadedChapter[], format: Format, zip: boolean): Promise<{ blob: Blob; name: string }> {
  const one = items.length === 1
  const base = safeName(one ? `${workTitle} - ${chapterHeading(items[0].chapter)}` : workTitle)
  const single = async (list: LoadedChapter[], title?: string): Promise<Blob> => {
    if (format === 'docx') {
      const [{ Packer }, { buildDocx }] = await Promise.all([import('docx'), import('./docx')])
      return Packer.toBlob(buildDocx(list.map((i) => ({ ...i.chapter, json: i.json })), title))
    }
    const head = (h: string) => (format === 'md' ? `# ${h}` : h)
    const body = list.map((i) => `${head(chapterHeading(i.chapter))}\n\n${format === 'md' ? jsonToMd(i.json) : jsonToTxt(i.json)}`.trim())
    const text = (title ? [head(title), ...body] : body).join(format === 'md' ? '\n\n' : '\n\n\n') + '\n'
    return new Blob([text], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' })
  }
  if (!zip || one) return { blob: await single(items, one ? undefined : workTitle), name: `${base}.${format}` }
  const JSZip = (await import('jszip')).default
  const z = new JSZip()
  const w = String(items.length).length
  for (const [i, it] of items.entries()) z.file(`${pad(i + 1, Math.max(w, 2))} - ${safeName(chapterHeading(it.chapter))}.${format}`, await single([it]))
  return { blob: await z.generateAsync({ type: 'blob' }), name: `${base}.zip` }
}

/** Export one chapter, a range, a selection or the whole work, in display order. */
export function ExportDialog(p: { workTitle: string; workId: string; chapters: Chapter[]; currentId?: string; initial: 'chapter' | 'all'; beforeLoad?: () => Promise<void>; onClose: () => void }) {
  const [format, setFormat] = useState<Format>('docx')
  const [scope, setScope] = useState<Scope>(p.initial === 'chapter' && p.currentId ? 'chapter' : 'all')
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(p.chapters.length - 1)
  const [picked, setPicked] = useState<Set<string>>(new Set(p.currentId ? [p.currentId] : []))
  const [zip, setZip] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selected =
    scope === 'chapter' ? p.chapters.filter((c) => c.id === p.currentId)
    : scope === 'range' ? p.chapters.slice(Math.min(from, to), Math.max(from, to) + 1)
    : scope === 'pick' ? p.chapters.filter((c) => picked.has(c.id))
    : p.chapters

  async function run() {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await p.beforeLoad?.()
      const { items, failed } = await loadContents(p.workId, selected, { getDraft, onProgress: (d, t) => setStatus(`Đang tải ${d}/${t} chương…`) })
      if (failed.length) throw new Error(`Chưa tải được ${failed.length} chương (cần có mạng): ${failed.map((c) => c.label).join(', ')}.`)
      if (!items.some((i) => i.text.trim())) throw new Error('Các chương đã chọn chưa có nội dung để xuất.')
      setStatus('Đang tạo file…')
      const { blob, name } = await build(p.workTitle, items, format, zip)
      if (!blob.size) throw new Error('File tạo ra bị rỗng.')
      download(blob, name)
      const local = items.filter((i) => i.local).length
      setStatus(`Đã xuất ${items.length} chương → ${name}${local ? ` (gồm ${local} chương lấy từ bản nháp trên máy, chưa đồng bộ)` : ''}.`)
    } catch (e) {
      setError((e as Error).message)
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const label = (c: Chapter) => chapterHeading(c)
  return (
    <Modal title="Xuất bản thảo" onClose={p.onClose} locked={busy}>
      <fieldset className="field">
        <legend>Định dạng</legend>
        <div className="row">
          {(['docx', 'md', 'txt'] as const).map((f) => (
            <label key={f} className="choice"><input type="radio" name="fmt" checked={format === f} onChange={() => setFormat(f)} /> {f === 'docx' ? 'Word (.docx)' : f === 'md' ? 'Markdown (.md)' : 'Văn bản (.txt)'}</label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>Chương</legend>
        {p.currentId && <label className="choice"><input type="radio" name="scope" checked={scope === 'chapter'} onChange={() => setScope('chapter')} /> Chương đang mở</label>}
        <label className="choice"><input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} /> Toàn bộ ({p.chapters.length} chương)</label>
        <label className="choice"><input type="radio" name="scope" checked={scope === 'range'} onChange={() => setScope('range')} /> Một khoảng chương</label>
        {scope === 'range' && (
          <div className="field-row">
            <select aria-label="Từ chương" value={from} onChange={(e) => setFrom(+e.target.value)}>{p.chapters.map((c, i) => <option key={c.id} value={i}>{label(c)}</option>)}</select>
            <select aria-label="Đến chương" value={to} onChange={(e) => setTo(+e.target.value)}>{p.chapters.map((c, i) => <option key={c.id} value={i}>{label(c)}</option>)}</select>
          </div>
        )}
        <label className="choice"><input type="radio" name="scope" checked={scope === 'pick'} onChange={() => setScope('pick')} /> Chọn từng chương</label>
        {scope === 'pick' && (
          <ul className="pick-list">
            {p.chapters.map((c) => (
              <li key={c.id}>
                <label className="choice">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(c.id) : n.delete(c.id); return n })} /> {label(c)}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {selected.length > 1 && (
        <fieldset className="field">
          <legend>Đóng gói</legend>
          <label className="choice"><input type="radio" name="zip" checked={!zip} onChange={() => setZip(false)} /> Gộp thành một file</label>
          <label className="choice"><input type="radio" name="zip" checked={zip} onChange={() => setZip(true)} /> Mỗi chương một file (ZIP)</label>
        </fieldset>
      )}
      {status && <p className="small" role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn" onClick={p.onClose} disabled={busy}>Đóng</button>
        <button className="btn primary" disabled={busy || !selected.length} onClick={() => void run()}><Download size={18} /> Xuất {selected.length} chương</button>
      </div>
    </Modal>
  )
}
