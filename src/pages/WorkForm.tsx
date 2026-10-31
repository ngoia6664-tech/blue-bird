import { getDoc } from 'firebase/firestore'
import { Check, ImagePlus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { compressCover, Cover } from '../components/Cover'
import { workDoc } from '../data/refs'
import { getCover, saveWork, type WorkInput } from '../data/works'
import { WORK_STATUS_LABEL, type Work, type WorkStatus } from '../types'

const empty: WorkInput = { title: '', aliases: [], genre: '', tags: [], status: 'writing', description: '', privateNote: '' }
const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

export function WorkForm() {
  const { workId } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState<WorkInput>(empty)
  const [aliases, setAliases] = useState('')
  const [tags, setTags] = useState('')
  const [loaded, setLoaded] = useState(!workId)
  const [loadError, setLoadError] = useState<string | null>(null)
  // undefined = unchanged, null = removed, string = new image
  const [cover, setCover] = useState<string | null | undefined>(undefined)
  const [currentCover, setCurrentCover] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!workId) return
    ;(async () => {
      const s = await getDoc(workDoc(workId))
      if (!s.exists()) throw new Error('Không tìm thấy tác phẩm.')
      const w = s.data() as Work
      setForm({ title: w.title, aliases: w.aliases, genre: w.genre, tags: w.tags, status: w.status, description: w.description, privateNote: w.privateNote })
      setAliases(w.aliases.join(', '))
      setTags(w.tags.join(', '))
      if (w.hasCover) setCurrentCover(await getCover(workId))
      setLoaded(true)
    })().catch((e) => setLoadError(e.message))
  }, [workId])

  const set = <K extends keyof WorkInput>(k: K, v: WorkInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function onFile(file: File | undefined) {
    if (!file) return
    try {
      setCover(await compressCover(file))
      setErrors((e) => ({ ...e, cover: '' }))
    } catch (e) {
      setErrors((x) => ({ ...x, cover: (e as Error).message }))
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const input: WorkInput = { ...form, title: form.title.trim(), aliases: splitList(aliases), tags: splitList(tags) }
    const errs: Record<string, string> = {}
    if (!input.title) errs.title = 'Hãy nhập tên tác phẩm.'
    else if (input.title.length > 200) errs.title = 'Tên tối đa 200 ký tự.'
    if (input.description.length > 10_000) errs.description = 'Mô tả tối đa 10.000 ký tự.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const id = await saveWork(workId ?? null, input, cover)
      navigate(workId ? '/' : `/write/${id}`)
    } catch (err) {
      // Form keeps its values; nothing was overwritten on the server.
      setErrors({ form: `Lưu thất bại: ${(err as Error).message}` })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p className="page error" role="alert">{loadError}</p>
  if (!loaded) return <p className="page muted">Đang tải…</p>

  const shownCover = cover === undefined ? currentCover : cover
  return (
    <form className="page work-form" onSubmit={onSubmit} noValidate>
      <h1>{workId ? 'Sửa thông tin tác phẩm' : 'Tạo tác phẩm'}</h1>
      <div className="work-form-grid">
        <div className="cover-col">
          <Cover work={{ id: workId ?? 'new', title: form.title, hasCover: !!shownCover }} src={shownCover} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="row">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={18} /> {shownCover ? 'Đổi ảnh' : 'Tải ảnh bìa'}
            </button>
            {shownCover && (
              <button type="button" className="btn" onClick={() => setCover(null)} aria-label="Xóa ảnh bìa">
                <Trash2 size={18} />
              </button>
            )}
          </div>
          {errors.cover && <p className="error" role="alert">{errors.cover}</p>}
          <p className="muted small">Ảnh được thu nhỏ và nén tự động.</p>
        </div>

        <div className="fields">
          <label className="field">
            <span>Tên tác phẩm *</span>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} aria-invalid={!!errors.title} autoFocus={!workId} />
            {errors.title && <small className="error">{errors.title}</small>}
          </label>
          <label className="field">
            <span>Tên khác (cách nhau bởi dấu phẩy)</span>
            <input value={aliases} onChange={(e) => setAliases(e.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Thể loại</span>
              <input value={form.genre} onChange={(e) => set('genre', e.target.value)} />
            </label>
            <label className="field">
              <span>Trạng thái</span>
              <select value={form.status} onChange={(e) => set('status', e.target.value as WorkStatus)}>
                {Object.entries(WORK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Tags (cách nhau bởi dấu phẩy)</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <label className="field">
            <span>Mô tả</span>
            <textarea rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} aria-invalid={!!errors.description} />
            {errors.description && <small className="error">{errors.description}</small>}
          </label>
          <label className="field">
            <span>Ghi chú riêng</span>
            <textarea rows={3} value={form.privateNote} onChange={(e) => set('privateNote', e.target.value)} />
          </label>
        </div>
      </div>
      {errors.form && <p className="error" role="alert">{errors.form}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}><X size={18} /> Hủy</button>
        <button type="submit" className="btn primary" disabled={saving}><Check size={18} /> {saving ? 'Đang lưu…' : 'Lưu'}</button>
      </div>
    </form>
  )
}
