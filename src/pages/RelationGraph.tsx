import { ImagePlus, Link2, Maximize, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { compressAvatar } from '../components/Cover'
import { Modal } from '../components/Modal'
import { createBibleItem, updateBibleItem } from '../data/bible'
import type { BibleItem } from '../types'

type Point = { x: number; y: number }
type Relation = BibleItem['relations'][number]
interface Edge { key: string; owner: BibleItem; target: BibleItem; relation: Relation; group: string }

const R = 30
const GROUPS: Record<string, string> = { mentor: 'Sư đồ', family: 'Gia đình', love: 'Tình cảm', friend: 'Bạn bè', enemy: 'Thù địch', other: 'Khác' }
// [name, A is … of B, B is … of A (empty: the same word), group]
const PRESETS: [string, string, string, string][] = [
  ['Thầy – trò', 'học trò', 'thầy', 'mentor'], ['Cha/mẹ – con', 'con', 'cha/mẹ', 'family'], ['Anh/chị – em', 'em', 'anh/chị', 'family'],
  ['Vợ – chồng', 'vợ', 'chồng', 'love'], ['Người yêu', 'người yêu', '', 'love'], ['Chủ – tớ', 'thuộc hạ', 'chủ nhân', 'other'],
  ['Bạn thân', 'bạn thân', '', 'friend'], ['Đồng đội', 'đồng đội', '', 'friend'], ['Kẻ thù', 'kẻ thù', '', 'enemy'], ['Tự đặt…', '', '', 'other'],
]
const CUSTOM = PRESETS.length - 1
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).slice(-2).join('').toUpperCase()
const stroke = (group: string) => `var(--rel-${group})`
const liveCharacters = (items: BibleItem[]) => items.filter((b) => b.kind === 'character' && !b.deletedAt)

/** Relations whose two ends are both live characters; one in the bin hides its relations until it is restored. */
function edgesOf(characters: BibleItem[]): Edge[] {
  const byId = new Map(characters.map((c) => [c.id, c]))
  return characters.flatMap((owner) => owner.relations.flatMap((relation, i) => {
    const target = byId.get(relation.targetId)
    return target && target !== owner ? [{ key: `${owner.id}:${i}`, owner, target, relation, group: GROUPS[relation.group ?? ''] ? relation.group! : 'other' }] : []
  }))
}
export const countRelations = (items: BibleItem[]) => edgesOf(liveCharacters(items)).length

/** "Lan là học trò của Duy Anh", read from either end of the relation. */
function sentence(e: Edge, from: string) {
  return from === e.target.id
    ? { who: e.target.name, word: e.relation.reverse || e.relation.label || '…', of: e.owner.name }
    : { who: e.owner.name, word: e.relation.label || '…', of: e.target.name }
}

/** Dragged spots stay put; anyone never dragged walks a spiral out from the centre to the first free spot. */
function layout(characters: BibleItem[], moved: Record<string, Point>) {
  const at = new Map<string, Point>()
  for (const c of characters) {
    const p = moved[c.id] ?? c.graph
    if (p) at.set(c.id, p)
  }
  for (const c of [...characters].sort((a, b) => a.createdAt - b.createdAt)) {
    if (at.has(c.id)) continue
    let spot = { x: 0, y: 0 }
    for (let t = 0; [...at.values()].some((p) => Math.hypot(p.x - spot.x, p.y - spot.y) < 170); t++) {
      spot = { x: Math.cos(t * 0.7) * (40 + t * 12), y: Math.sin(t * 0.7) * (40 + t * 12) }
    }
    at.set(c.id, spot)
  }
  return at
}

/** One curved arrow on its own side of the pair, so the two directions of a relation never overlap. */
function Arrow({ from, to, text, group }: { from: Point; to: Point; text: string; group: string }) {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
  const ux = (to.x - from.x) / len, uy = (to.y - from.y) / len
  const nx = -uy, ny = ux
  const c = Math.cos(0.38), s = Math.sin(0.38)
  const x1 = from.x + (ux * c + nx * s) * (R + 3), y1 = from.y + (uy * c + ny * s) * (R + 3)
  const x2 = to.x + (-ux * c + nx * s) * (R + 5), y2 = to.y + (-uy * c + ny * s) * (R + 5)
  const cx = (from.x + to.x) / 2 + nx * 30, cy = (from.y + to.y) / 2 + ny * 30
  const d = `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`
  return (
    <>
      <path className="rel-hit" d={d} />
      <path className="rel-line" d={d} stroke={stroke(group)} markerEnd={`url(#rel-arrow-${group})`} />
      <text x={(x1 + 2 * cx + x2) / 4} y={(y1 + 2 * cy + y2) / 4} fill={stroke(group)}>{text}</text>
    </>
  )
}

/** Same word both ways: one line with a head at each end. */
function BothWays({ from, to, text, group }: { from: Point; to: Point; text: string; group: string }) {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
  const ux = (to.x - from.x) / len, uy = (to.y - from.y) / len
  const d = `M${from.x + ux * (R + 5)} ${from.y + uy * (R + 5)}L${to.x - ux * (R + 5)} ${to.y - uy * (R + 5)}`
  return (
    <>
      <path className="rel-hit" d={d} />
      <path className="rel-line" d={d} stroke={stroke(group)} markerStart={`url(#rel-arrow-${group})`} markerEnd={`url(#rel-arrow-${group})`} />
      <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2} fill={stroke(group)}>{text}</text>
    </>
  )
}

function Face({ person }: { person: BibleItem }) {
  return person.photo ? <img className="rel-face" alt="" src={person.photo} /> : <span className="rel-face">{initials(person.name)}</span>
}

/** Portrait with choose/remove buttons; also used on the character's own page. */
export function PhotoPicker({ name, value, onChange }: { name: string; value: string | null; onChange: (photo: string | null) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  async function pick(f?: File) {
    if (file.current) file.current.value = ''
    if (!f) return
    setError('')
    try {
      onChange(await compressAvatar(f))
    } catch (e) {
      // createImageBitmap's own message is not useful for a broken file.
      setError(e instanceof DOMException ? 'Không đọc được file này, hãy chọn một ảnh khác.' : message(e))
    }
  }
  return (
    <div className="photo-picker">
      {value ? <img className="photo-big" alt={`Ảnh ${name}`} src={value} /> : <span className="photo-big" aria-hidden="true">{initials(name) || <UserRound size={32} />}</span>}
      <div>
        <div className="row">
          <button type="button" className="btn small" onClick={() => file.current?.click()}><ImagePlus size={16} /> {value ? 'Đổi ảnh' : 'Chọn ảnh'}</button>
          {value && <button type="button" className="btn small" onClick={() => onChange(null)}><X size={16} /> Bỏ ảnh</button>}
        </div>
        {error && <p className="error small" role="alert">{error}</p>}
      </div>
      <input ref={file} type="file" accept="image/*" hidden aria-label="Ảnh nhân vật" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  )
}

function PersonDialog(p: { workId: string; person?: BibleItem; order: number; onClose: () => void; onTrashed: () => void }) {
  const [name, setName] = useState(p.person?.name ?? '')
  const [photo, setPhoto] = useState(p.person?.photo ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [armed, setArmed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // The Modal opens itself in its own effect, which runs before this one.
  useEffect(() => input.current?.focus(), [])
  async function run(task: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await task()
      return true
    } catch (e) {
      setError(message(e))
      setBusy(false)
      return false
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const done = await run(() => (p.person
      ? updateBibleItem(p.workId, p.person.id, { name: name.trim(), photo })
      : createBibleItem(p.workId, 'character', name.trim(), p.order, undefined, photo)))
    if (done) p.onClose()
  }
  async function trash() {
    if (!armed) return setArmed(true)
    if (await run(() => updateBibleItem(p.workId, p.person!.id, { deletedAt: Date.now() }))) p.onTrashed()
  }
  return (
    <Modal icon={<UserRound size={24} />} kicker="Quan hệ nhân vật" title={p.person ? 'Sửa nhân vật' : 'Thêm nhân vật'} onClose={p.onClose} locked={busy}>
      <form onSubmit={submit}>
        <PhotoPicker name={name} value={photo} onChange={setPhoto} />
        <label className="field">
          <span>Tên nhân vật *</span>
          <input ref={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">Thao tác thất bại: {error}</p>}
        <div className="modal-actions">
          {p.person && <button type="button" className="btn danger rel-left" disabled={busy} onClick={trash}><Trash2 size={16} /> {armed ? 'Bấm lần nữa để bỏ vào thùng rác' : 'Thùng rác'}</button>}
          <button type="button" className="btn" disabled={busy} onClick={p.onClose}>Hủy</button>
          <button type="submit" className="btn primary" disabled={!name.trim() || busy}>{p.person ? 'Lưu' : <><Plus size={18} /> Thêm nhân vật</>}</button>
        </div>
      </form>
    </Modal>
  )
}

function RelationDialog(p: { workId: string; characters: BibleItem[]; edges: Edge[]; edge?: Edge; first: string | null; onClose: () => void }) {
  const { edge, characters } = p
  const startA = edge?.owner.id ?? p.first ?? characters[0].id
  const known = edge ? PRESETS.findIndex(([, ab, ba]) => ab === edge.relation.label && ba === (edge.relation.reverse ?? '')) : 0
  const [a, setA] = useState(startA)
  const [b, setB] = useState(edge?.target.id ?? characters.find((c) => c.id !== startA)!.id)
  const [preset, setPreset] = useState(known < 0 ? CUSTOM : known)
  const [label, setLabel] = useState(edge?.relation.label ?? PRESETS[0][1])
  const [reverse, setReverse] = useState(edge ? edge.relation.reverse ?? '' : PRESETS[0][2])
  const [note, setNote] = useState(edge?.relation.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nameOf = (id: string) => characters.find((c) => c.id === id)?.name ?? ''
  const options = characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
  const owner = characters.find((c) => c.id === a)!

  /** Writes the owner's whole list, so it runs against the list as it is now. */
  async function write(relations: Relation[]) {
    setBusy(true)
    setError('')
    try {
      await updateBibleItem(p.workId, owner.id, { relations })
      p.onClose()
    } catch (e) {
      setError(`Thao tác thất bại: ${message(e)}`)
      setBusy(false)
    }
  }
  const same = (r: Relation) => r.targetId === edge?.target.id && r.label === edge?.relation.label
  function submit(e: FormEvent) {
    e.preventDefault()
    if (a === b) return setError('Hãy chọn hai nhân vật khác nhau.')
    if (!label.trim()) return setError('Hãy nhập tên quan hệ.')
    if (!edge && p.edges.some((x) => (x.owner.id === a && x.target.id === b) || (x.owner.id === b && x.target.id === a))) return setError('Hai nhân vật này đã có quan hệ; bấm vào mũi tên để sửa.')
    const group = preset === CUSTOM ? edge?.group ?? 'other' : PRESETS[preset][3]
    const next: Relation = { targetId: b, label: label.trim(), reverse: reverse.trim(), group, note: note.trim() }
    write(edge ? owner.relations.map((r) => (same(r) ? next : r)) : [...owner.relations, next])
  }
  return (
    <Modal icon={<Link2 size={24} />} kicker="Quan hệ nhân vật" title={edge ? 'Sửa quan hệ' : 'Thêm quan hệ'} onClose={p.onClose} locked={busy}>
      <form onSubmit={submit}>
        <label className="field">
          <span>Kiểu quan hệ</span>
          <select value={preset} onChange={(e) => {
            const i = +e.target.value
            setPreset(i)
            if (i !== CUSTOM) { setLabel(PRESETS[i][1]); setReverse(PRESETS[i][2]) }
          }}>
            {PRESETS.map(([name], i) => <option key={name} value={i}>{name}</option>)}
          </select>
        </label>
        <div className="field-row">
          <label className="field"><span>Nhân vật A</span><select value={a} disabled={!!edge} onChange={(e) => setA(e.target.value)}>{options}</select></label>
          <label className="field"><span>Nhân vật B</span><select value={b} disabled={!!edge} onChange={(e) => setB(e.target.value)}>{options}</select></label>
          <label className="field"><span>A là … của B</span><input value={label} placeholder="học trò" onChange={(e) => setLabel(e.target.value)} /></label>
          <label className="field"><span>B là … của A (trống nếu giống nhau)</span><input value={reverse} placeholder="thầy" onChange={(e) => setReverse(e.target.value)} /></label>
        </div>
        <label className="field"><span>Ghi chú</span><input value={note} placeholder="VD: từ chương 3" onChange={(e) => setNote(e.target.value)} /></label>
        {label.trim() && a !== b && (
          <div className="rel-preview" aria-live="polite">
            <span>{nameOf(a)} là <b>{label.trim()}</b> của {nameOf(b)}</span>
            <span>{nameOf(b)} là <b>{reverse.trim() || label.trim()}</b> của {nameOf(a)}</span>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          {edge && <button type="button" className="btn danger rel-left" disabled={busy} onClick={() => write(owner.relations.filter((r) => !same(r)))}><Trash2 size={16} /> Xóa</button>}
          <button type="button" className="btn" disabled={busy} onClick={p.onClose}>Hủy</button>
          <button type="submit" className="btn primary" disabled={busy}>Lưu quan hệ</button>
        </div>
      </form>
    </Modal>
  )
}

/** The "Quan hệ nhân vật" tab: characters as nodes, relations as a pair of labelled arrows. */
export function RelationGraph(p: { workId: string; items: BibleItem[]; onOpen: (id: string) => void; onFail: (e: unknown) => void }) {
  const characters = useMemo(() => liveCharacters(p.items), [p.items])
  const edges = useMemo(() => edgesOf(characters), [characters])
  const [moved, setMoved] = useState<Record<string, Point>>({})
  const at = useMemo(() => layout(characters, moved), [characters, moved])
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [selected, setSelected] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [personDialog, setPersonDialog] = useState<{ person?: BibleItem } | null>(null)
  const [relationDialog, setRelationDialog] = useState<{ edge?: Edge } | null>(null)
  const svg = useRef<SVGSVGElement>(null)

  const chosen = characters.find((c) => c.id === selected)
  const near = chosen && new Set([chosen.id, ...edges.flatMap((e) => (e.owner === chosen ? [e.target.id] : e.target === chosen ? [e.owner.id] : []))])
  const needle = q.trim().toLocaleLowerCase('vi')
  const listed = characters.filter((c) => c.name.toLocaleLowerCase('vi').includes(needle)).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  const shown = chosen ? edges.filter((e) => e.owner === chosen || e.target === chosen) : edges

  function fit() {
    const box = svg.current?.getBoundingClientRect()
    const spots = [...at.values()]
    if (!box || !spots.length) return
    const xs = spots.map((s) => s.x), ys = spots.map((s) => s.y), pad = 100
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad
    const k = Math.max(0.35, Math.min(1.2, box.width / (x1 - x0), box.height / (y1 - y0)))
    setView({ k, x: box.width / 2 - (k * (x0 + x1)) / 2, y: box.height / 2 - (k * (y0 + y1)) / 2 })
  }
  useEffect(fit, [characters.length])

  // React attaches wheel listeners as passive, which cannot stop the page from scrolling.
  useEffect(() => {
    const el = svg.current!
    const zoom = (e: WheelEvent) => {
      e.preventDefault()
      const box = el.getBoundingClientRect(), mx = e.clientX - box.left, my = e.clientY - box.top
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.35, v.k * (e.deltaY < 0 ? 1.1 : 0.9)))
        return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) }
      })
    }
    el.addEventListener('wheel', zoom, { passive: false })
    return () => el.removeEventListener('wheel', zoom)
  }, [])

  /** Follows the pointer until release, wherever it goes; returns true if it barely moved (a click). */
  function track(start: ReactPointerEvent, onMove: (dx: number, dy: number) => void, onEnd: (isClick: boolean) => void) {
    const { clientX: sx, clientY: sy } = start
    let far = false
    const move = (e: PointerEvent) => {
      far ||= Math.hypot(e.clientX - sx, e.clientY - sy) > 3
      if (far) onMove(e.clientX - sx, e.clientY - sy)
    }
    const end = () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', end)
      removeEventListener('pointercancel', end)
      onEnd(!far)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', end)
    addEventListener('pointercancel', end)
  }
  function dragNode(e: ReactPointerEvent, c: BibleItem) {
    e.stopPropagation()
    const from = at.get(c.id)!
    let last = from
    track(e, (dx, dy) => {
      last = { x: from.x + dx / view.k, y: from.y + dy / view.k }
      setMoved((m) => ({ ...m, [c.id]: last }))
    }, (isClick) => {
      if (isClick) setSelected((s) => (s === c.id ? null : c.id))
      else updateBibleItem(p.workId, c.id, { graph: last }).catch(p.onFail)
    })
  }
  function pan(e: ReactPointerEvent) {
    if ((e.target as Element).closest('.rel-edge')) return
    const from = view
    track(e, (dx, dy) => setView({ ...from, x: from.x + dx, y: from.y + dy }), (isClick) => { if (isClick) setSelected(null) })
  }

  return (
    <div className="bible-body rel-body">
      <section className="bible-list" aria-label="Danh sách nhân vật">
        <button className="btn primary" onClick={() => setPersonDialog({})}><UserRound size={18} /> Thêm nhân vật</button>
        <button className="btn primary" disabled={characters.length < 2} title={characters.length < 2 ? 'Cần ít nhất hai nhân vật' : undefined} onClick={() => setRelationDialog({})}><Link2 size={18} /> Thêm quan hệ</button>
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Tìm nhân vật" placeholder="Tìm nhân vật" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <ul className="rel-people">
          {listed.map((c) => (
            <li key={c.id}>
              <button className={c.id === selected ? 'on' : undefined} aria-pressed={c.id === selected} onClick={() => setSelected((s) => (s === c.id ? null : c.id))}>
                <Face person={c} />
                <span className="rel-name">{c.name}</span>
                <span className="muted small">{edges.filter((e) => e.owner === c || e.target === c).length}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="rel-detail">
          <h2>{chosen ? `Quan hệ của ${chosen.name}` : 'Tất cả quan hệ'}</h2>
          {shown.map((e) => {
            const t = sentence(e, chosen?.id ?? e.owner.id)
            return (
              <button key={e.key} className="rel-sentence" onClick={() => setRelationDialog({ edge: e })}>
                <span>{t.who} là <b>{t.word}</b> của {t.of}</span>
                {e.relation.note && <small className="muted">{e.relation.note}</small>}
              </button>
            )
          })}
          {!shown.length && <p className="muted small">Chưa có quan hệ.</p>}
          {chosen && (
            <div className="row">
              <button className="btn small" onClick={() => setPersonDialog({ person: chosen })}><Pencil size={16} /> Sửa / đổi ảnh</button>
              <button className="btn small" onClick={() => p.onOpen(chosen.id)}>Mở hồ sơ</button>
            </div>
          )}
        </div>
      </section>

      <div className="rel-stage">
        <svg ref={svg} className="rel-graph" role="group" aria-label="Đồ thị quan hệ nhân vật" onPointerDown={pan}>
          <defs>
            <clipPath id="rel-avatar"><circle r={R} /></clipPath>
            {Object.keys(GROUPS).map((g) => (
              <marker key={g} id={`rel-arrow-${g}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill={stroke(g)} />
              </marker>
            ))}
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {edges.map((e) => {
              const from = at.get(e.owner.id)!, to = at.get(e.target.id)!
              const open = () => setRelationDialog({ edge: e })
              return (
                <g key={e.key} className={`rel-edge ${chosen && e.owner !== chosen && e.target !== chosen ? 'dim' : ''}`} tabIndex={0} role="button"
                  aria-label={`Sửa quan hệ ${e.owner.name} và ${e.target.name}`} onClick={open} onKeyDown={(k) => { if (k.key === 'Enter') open() }}>
                  {e.relation.reverse ? (
                    <>
                      <Arrow from={from} to={to} text={e.relation.label || '…'} group={e.group} />
                      <Arrow from={to} to={from} text={e.relation.reverse} group={e.group} />
                    </>
                  ) : <BothWays from={from} to={to} text={e.relation.label || '…'} group={e.group} />}
                </g>
              )
            })}
            {characters.map((c) => {
              const s = at.get(c.id)!
              return (
                <g key={c.id} className={`rel-node ${c.id === selected ? 'on' : ''} ${near && !near.has(c.id) ? 'dim' : ''}`} transform={`translate(${s.x} ${s.y})`} tabIndex={0} role="button"
                  aria-label={c.name} aria-pressed={c.id === selected} onPointerDown={(e) => dragNode(e, c)} onKeyDown={(k) => { if (k.key === 'Enter') setSelected((x) => (x === c.id ? null : c.id)) }}>
                  <circle className="rel-disc" r={R} />
                  {c.photo
                    ? <image href={c.photo} x={-R} y={-R} width={2 * R} height={2 * R} preserveAspectRatio="xMidYMid slice" clipPath="url(#rel-avatar)" />
                    : <text className="rel-initials">{initials(c.name)}</text>}
                  <circle className="rel-ring" r={R} />
                  <text className="rel-label" y={R + 17}>{c.name}</text>
                </g>
              )
            })}
          </g>
        </svg>
        {!characters.length && <p className="rel-empty muted">Thêm nhân vật đầu tiên để bắt đầu vẽ quan hệ.</p>}
        <button className="icon-btn rel-fit" aria-label="Xem toàn bộ đồ thị" title="Xem toàn bộ đồ thị" onClick={fit}><Maximize size={18} /></button>
        <div className="rel-legend" aria-hidden="true">
          {Object.entries(GROUPS).map(([g, name]) => <span key={g}><i style={{ background: stroke(g) }} />{name}</span>)}
        </div>
      </div>

      {personDialog && (
        <PersonDialog workId={p.workId} person={personDialog.person} order={Math.max(0, ...characters.map((c) => c.order)) + 1}
          onClose={() => setPersonDialog(null)} onTrashed={() => { setPersonDialog(null); setSelected(null) }} />
      )}
      {relationDialog && <RelationDialog workId={p.workId} characters={characters} edges={edges} edge={relationDialog.edge} first={selected} onClose={() => setRelationDialog(null)} />}
    </div>
  )
}
