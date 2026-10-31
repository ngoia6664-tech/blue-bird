import { DatabaseBackup, FileUp, RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { download } from '../components/Modal'
import { useWorks } from '../data/hooks'
import { formatNumber } from '../format'
import { flush, getDraft, useSyncStatus } from '../sync/engine'
import { createBackup, readBackup, restoreBackup, type BackupFile, type RestoreMode, type RestoreResult } from './backup'

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, (c) => (c === 'T' ? '-' : c === ':' ? 'h' : '-'))
const mb = (n: number) => `${(n / 1_048_576).toFixed(n < 1_048_576 ? 2 : 1)} MB`

/** Settings → Sao lưu & Khôi phục. A backup can be restored to keep writing in the app. */
export function BackupSection() {
  const sync = useSyncStatus()
  const { data: works } = useWorks()
  const [versions, setVersions] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<BackupFile | null>(null)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<RestoreMode>('copy')
  const [result, setResult] = useState<RestoreResult | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const existing = new Set((works ?? []).map((w) => w.id))

  async function backup() {
    if (!navigator.onLine) return setError('Cần có mạng để tạo bản sao lưu đầy đủ (đọc toàn bộ dữ liệu trên cloud).')
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setStatus('Đang đồng bộ thay đổi trên máy…')
      await flush()
      const { data, manifest } = await createBackup({ includeVersions: versions, getDraft, onProgress: setStatus })
      const chapters = manifest.works.reduce((s, w) => s + w.chapters, 0)
      download(new Blob([data as BlobPart], { type: 'application/zip' }), `blue-bird-sao-luu-${stamp()}.zip`)
      setStatus(
        `Đã tạo bản sao lưu: ${manifest.works.length} tác phẩm, ${formatNumber(chapters)} chương, ${mb(data.byteLength)}` +
          (versions ? ', kèm lịch sử phiên bản' : '') + '.' +
          (manifest.localDrafts ? ` Gồm ${manifest.localDrafts} chương lấy từ bản nháp trên máy này (chưa kịp đồng bộ).` : ''),
      )
    } catch (e) {
      setError(`Chưa tạo được bản sao lưu: ${(e as Error).message}`)
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  async function open(f: File | undefined) {
    if (!f) return
    setError(null)
    setResult(null)
    try {
      const b = await readBackup(await f.arrayBuffer())
      setFile(b)
      setPick(new Set(b.manifest.works.map((w) => w.id)))
    } catch (e) {
      setFile(null)
      setError((e as Error).message)
    }
  }

  async function restore() {
    if (!file) return
    if (!navigator.onLine) return setError('Cần có mạng để khôi phục.')
    const n = pick.size
    if (!confirm(`Khôi phục ${n} tác phẩm từ bản sao lưu?\n${mode === 'copy' ? 'Mỗi tác phẩm được thêm thành bản mới; dữ liệu đang có không bị thay đổi.' : 'Chỉ thêm những tác phẩm chưa có trong thư viện; tác phẩm đã có được giữ nguyên.'}`)) return
    setBusy(true)
    setError(null)
    try {
      setResult(await restoreBackup(file, { mode, workIds: [...pick], existingIds: existing, onProgress: setStatus }))
      setFile(null)
    } catch (e) {
      setError(`Khôi phục thất bại: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  return (
    <section className="card" id="backup" aria-labelledby="backup-h">
      <h2 id="backup-h" className="with-icon"><DatabaseBackup size={20} /> Sao lưu & Khôi phục</h2>
      <p className="muted small">
        Bản sao lưu (.zip) chứa toàn bộ tác phẩm, ảnh bìa, chương, nội dung, ghi chú, Sổ tay truyện; dùng để khôi phục và viết tiếp trong app.
        Khác với “Xuất bản thảo” (DOCX/TXT để đọc). Nên sao lưu định kỳ và cất file ở nơi khác.
      </p>
      {sync.pending > 0 && (
        <p className="notice small">
          Máy này còn {sync.pending} chương chưa đồng bộ. Chúng vẫn được đưa vào bản sao lưu từ bản nháp trên máy.
          Thay đổi chưa đồng bộ ở <b>thiết bị khác</b> thì không có trong bản sao lưu này.
        </p>
      )}
      <label className="choice"><input type="checkbox" checked={versions} onChange={(e) => setVersions(e.target.checked)} /> Kèm lịch sử phiên bản (file lớn hơn nhiều)</label>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => void backup()}><DatabaseBackup size={18} /> Tạo bản sao lưu</button>
        <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
        <button className="btn" disabled={busy} onClick={() => input.current?.click()}><FileUp size={18} /> Chọn file để khôi phục</button>
      </div>
      {status && <p className="small" role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {file && (
        <div className="restore-preview">
          <h3>Nội dung bản sao lưu ({new Date(file.manifest.createdAt).toLocaleString('vi-VN')})</h3>
          <div className="row">
            <button className="btn small" onClick={() => setPick(new Set(file.manifest.works.map((w) => w.id)))}>Chọn tất cả</button>
            <button className="btn small" onClick={() => setPick(new Set())}>Bỏ chọn tất cả</button>
          </div>
          <ul className="pick-list">
            {file.manifest.works.map((w) => (
              <li key={w.id}>
                <label className="choice">
                  <input type="checkbox" checked={pick.has(w.id)} onChange={(e) => setPick((s) => { const n = new Set(s); e.target.checked ? n.add(w.id) : n.delete(w.id); return n })} />
                  <span><b>{w.title}</b> · {w.chapters} chương · {w.bible} mục sổ tay{w.deleted ? ' · trong thùng rác' : ''}</span>
                  {existing.has(w.id) && <span className="badge status-paused">Đã có trong thư viện</span>}
                </label>
              </li>
            ))}
          </ul>
          {file.manifest.includesVersions && <p className="muted small">Có kèm lịch sử phiên bản.</p>}
          <fieldset className="field">
            <legend>Cách khôi phục</legend>
            <label className="choice"><input type="radio" name="mode" checked={mode === 'copy'} onChange={() => setMode('copy')} /> Thêm thành bản mới (an toàn nhất; bản trùng được đổi tên “(bản khôi phục)”)</label>
            <label className="choice"><input type="radio" name="mode" checked={mode === 'missing'} onChange={() => setMode('missing')} /> Chỉ thêm tác phẩm chưa có (giữ nguyên mã, bỏ qua tác phẩm đã có)</label>
          </fieldset>
          <p className="muted small">Không có lựa chọn nào ghi đè dữ liệu đang có.</p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => setFile(null)}>Hủy</button>
            <button className="btn primary" disabled={busy || !pick.size} onClick={() => void restore()}><RotateCcw size={18} /> Khôi phục {pick.size} tác phẩm</button>
          </div>
        </div>
      )}

      {result && (
        <div className="restore-preview" role="status">
          <h3>Kết quả khôi phục</h3>
          <ul className="small">
            {result.restored.map((r) => <li key={r.workId}>Đã khôi phục “{r.title}” ({r.chapters} chương)</li>)}
            {result.skipped.map((r) => <li key={r.title} className="muted">Bỏ qua “{r.title}”: {r.reason}</li>)}
            {result.failed.map((r) => <li key={r.title} className="error">Lỗi “{r.title}”: {r.error}. Không có dữ liệu dở dang nào được giữ lại.</li>)}
          </ul>
        </div>
      )}
    </section>
  )
}
