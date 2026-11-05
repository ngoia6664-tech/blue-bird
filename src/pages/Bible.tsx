import { ArrowDown, ArrowLeft, ArrowUp, BookMarked, CalendarClock, ClipboardCopy, GitBranch, MapPin, Plus, RotateCcw, Search, StickyNote, Trash2, TriangleAlert, UserRound, X, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { lastWorkKey } from '../components/AppLayout'
import { Modal } from '../components/Modal'
import { createBibleItem, saveStyleField, STYLE_ID, updateBibleField, updateBibleItem } from '../data/bible'
import { useBible, useChapters, useWork, useWorks } from '../data/hooks'
import { formatDate } from '../format'
import type { BibleItem, BibleKind, Chapter } from '../types'

type ListKind = Exclude<BibleKind, 'style'>
type LinkKey = keyof BibleItem['links']

interface KindDef {
  tab: string
  one: string
  icon: LucideIcon
  nameLabel: string
  fields: [key: string, label: string, multiline: boolean, placeholder?: string][]
  statuses?: [string, string][]
  links: LinkKey[]
  relations?: boolean
  tags?: boolean
  startChapter?: boolean
  subtitle?: (b: BibleItem) => string
}

// What each kind of entry asks for. Every field is optional except the name.
const KINDS: Record<ListKind, KindDef> = {
  character: {
    tab: 'Nhân vật', one: 'nhân vật', icon: UserRound, nameLabel: 'Tên chính',
    fields: [
      ['aliases', 'Bí danh', false], ['role', 'Vai trò', false], ['age', 'Tuổi', false],
      ['appearance', 'Ngoại hình', true], ['personality', 'Tính cách', true], ['bio', 'Tiểu sử', true],
      ['abilities', 'Năng lực', true], ['current', 'Tình trạng hiện tại', true], ['notes', 'Ghi chú tự do', true],
    ],
    links: ['chapters'], relations: true, subtitle: (b) => [b.fields.role, b.fields.aliases].filter(Boolean).join(' · '),
  },
  event: {
    tab: 'Dòng thời gian', one: 'sự kiện', icon: CalendarClock, nameLabel: 'Tên sự kiện',
    fields: [['time', 'Mốc thời gian trong truyện', false, 'VD: Ba ngày sau trận chiến'], ['description', 'Mô tả', true]],
    statuses: [['planned', 'Dự kiến'], ['written', 'Đã viết'], ['revise', 'Cần sửa']],
    links: ['characters', 'places', 'chapters'], subtitle: (b) => b.fields.time ?? '',
  },
  place: {
    tab: 'Địa điểm', one: 'địa điểm', icon: MapPin, nameLabel: 'Tên địa điểm',
    fields: [['description', 'Mô tả', true], ['features', 'Đặc điểm', true], ['notes', 'Ghi chú', true]],
    links: ['characters', 'events', 'chapters'],
  },
  note: {
    tab: 'Ghi chú', one: 'ghi chú', icon: StickyNote, nameLabel: 'Tiêu đề',
    fields: [['body', 'Nội dung', true]], links: ['chapters'], tags: true, subtitle: (b) => b.tags.map((t) => `#${t}`).join(' '),
  },
  thread: {
    tab: 'Tình tiết đang mở', one: 'tình tiết', icon: GitBranch, nameLabel: 'Tên tình tiết',
    fields: [['description', 'Mô tả', true], ['notes', 'Ghi chú', true]],
    statuses: [['open', 'Chưa giải quyết'], ['developing', 'Đang phát triển'], ['resolved', 'Đã giải quyết']],
    links: ['characters', 'chapters'], startChapter: true,
  },
}

const STYLE_FIELDS: [string, string][] = [
  ['pov', 'Ngôi kể'], ['addressing', 'Cách xưng hô'], ['dialogue', 'Quy tắc hội thoại'], ['description', 'Quy tắc miêu tả'],
  ['personality', 'Tính cách phải giữ nhất quán'], ['world', 'Quy tắc thế giới'], ['invariants', 'Những điều không được thay đổi'],
  ['continuity', 'Ghi chú continuity'],
]

const LINK_LABEL: Record<LinkKey, string> = { characters: 'Nhân vật liên quan', places: 'Địa điểm liên quan', events: 'Sự kiện liên quan', chapters: 'Chương liên quan' }
const LINK_KIND: Record<Exclude<LinkKey, 'chapters'>, ListKind> = { characters: 'character', places: 'place', events: 'event' }
const TABS = [...(Object.keys(KINDS) as ListKind[]), 'style'] as const
/** Failures reach the user as a dialog (WorkBible listens for this event), not a browser alert. */
const fail = (e: unknown) => dispatchEvent(new CustomEvent('bible-error', { detail: e instanceof Error ? e.message : String(e) }))
const fold = (s: string) => s.normalize('NFC').toLocaleLowerCase('vi')

export function Bible() {
  const { workId } = useParams()
  const navigate = useNavigate()
  const { data: works } = useWorks()
  useEffect(() => {
    if (workId) localStorage.setItem(lastWorkKey, workId)
    else {
      const last = localStorage.getItem(lastWorkKey)
      if (last) navigate(`/bible/${last}`, { replace: true })
    }
  }, [workId])

  if (!workId) {
    const live = (works ?? []).filter((w) => !w.deletedAt)
    return (
      <div className="page">
        <h1 className="with-icon"><BookMarked size={24} /> Sổ tay truyện</h1>
        <p>Chọn tác phẩm để mở sổ tay của tác phẩm đó.</p>
        <ul className="recent-list">
          {live.map((w) => <li key={w.id}><Link className="recent-item" to={`/bible/${w.id}`}><BookMarked size={16} /><span className="recent-title">{w.title}</span></Link></li>)}
        </ul>
        {works && !live.length && <p className="muted">Chưa có tác phẩm. <Link to="/works/new">Tạo tác phẩm</Link></p>}
      </div>
    )
  }
  return <WorkBible key={workId} workId={workId} works={(works ?? []).filter((w) => !w.deletedAt)} />
}

function WorkBible({ workId, works }: { workId: string; works: { id: string; title: string }[] }) {
  const navigate = useNavigate()
  const { data: work } = useWork(workId)
  const { data: items, error } = useBible(workId)
  const { data: chapters } = useChapters(workId)
  const liveChapters = useMemo(() => chapters?.filter((c) => !c.deletedAt) ?? [], [chapters])
  const [params, setParams] = useSearchParams()
  const itemId = params.get('item')
  const linked = items?.find((b) => b.id === itemId)
  const tab = (params.get('tab') as (typeof TABS)[number]) ?? (linked?.kind as ListKind) ?? 'character'
  const set = (patch: Record<string, string | null>) =>
    setParams((p) => {
      for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v)
      return p
    })
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => {
    const show = (e: Event) => setFailure((e as CustomEvent<string>).detail)
    addEventListener('bible-error', show)
    return () => removeEventListener('bible-error', show)
  }, [])

  if (error) return <p className="page error" role="alert">Không tải được sổ tay: {error.message}</p>
  if (work === null) return <p className="page">Không tìm thấy tác phẩm. <Link to="/bible">Chọn tác phẩm khác</Link></p>

  return (
    <div className="bible">
      <header className="bible-head">
        <h1 className="with-icon"><BookMarked size={22} /> Sổ tay truyện</h1>
        <select aria-label="Tác phẩm" value={workId} onChange={(e) => navigate(`/bible/${e.target.value}`)}>
          {works.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
        </select>
        <Link className="btn small" to={`/write/${workId}`}>Về trang viết</Link>
      </header>
      <nav className="bible-tabs" role="tablist" aria-label="Danh mục sổ tay">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : undefined} onClick={() => set({ tab: t, item: null })}>
            {t === 'style' ? 'Quy tắc văn phong' : KINDS[t].tab}
            {t !== 'style' && items && <span className="badge">{items.filter((b) => b.kind === t && !b.deletedAt).length}</span>}
          </button>
        ))}
      </nav>
      {!items ? (
        <p className="page muted">Đang tải…</p>
      ) : tab === 'style' ? (
        <StyleRules workId={workId} item={items.find((b) => b.id === STYLE_ID)} />
      ) : (
        <KindView
          key={tab}
          workId={workId}
          kind={tab}
          items={items}
          chapters={liveChapters}
          selectedId={itemId}
          onSelect={(id) => set({ tab, item: id })}
        />
      )}
      {failure && (
        <Modal icon={<TriangleAlert size={24} />} danger kicker="Sổ tay truyện" title="Thao tác thất bại" onClose={() => setFailure(null)}>
          <p>{failure}</p>
          <div className="modal-actions"><button className="btn primary" onClick={() => setFailure(null)}>Đã hiểu</button></div>
        </Modal>
      )}
    </div>
  )
}

/** Asks for the name of a new entry; the badge icon is the one for that kind of entry. */
function AddDialog(p: { def: KindDef; onClose: () => void; onAdd: (name: string) => Promise<void> }) {
  const Icon = p.def.icon
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  // The Modal opens itself in its own effect, which runs before this one.
  useEffect(() => input.current?.focus(), [])
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      await p.onAdd(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }
  return (
    <Modal icon={<Icon size={24} />} kicker="Sổ tay truyện" title={`Thêm ${p.def.one}`} onClose={p.onClose} locked={busy}>
      <form onSubmit={submit}>
        <label className="field">
          <span>{p.def.nameLabel} *</span>
          <input ref={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">Thao tác thất bại: {error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" disabled={busy} onClick={p.onClose}>Hủy</button>
          <button type="submit" className="btn primary" disabled={!name.trim() || busy}><Plus size={18} /> Thêm {p.def.one}</button>
        </div>
      </form>
    </Modal>
  )
}

function KindView(p: { workId: string; kind: ListKind; items: BibleItem[]; chapters: Chapter[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const def = KINDS[p.kind]
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'order' | 'name' | 'updated'>(p.kind === 'event' ? 'order' : 'name')
  const [trash, setTrash] = useState(false)
  const [adding, setAdding] = useState(false)
  const ofKind = p.items.filter((b) => b.kind === p.kind)
  const needle = fold(q.trim())
  const list = ofKind
    .filter((b) => !!b.deletedAt === trash)
    .filter((b) => !needle || fold([b.name, ...Object.values(b.fields), ...b.tags].join(' ')).includes(needle))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'vi') : sort === 'updated' ? b.updatedAt - a.updatedAt : a.order - b.order))
  const selected = ofKind.find((b) => b.id === p.selectedId)
  const trashed = ofKind.filter((b) => b.deletedAt).length

  async function add(name: string) {
    const id = await createBibleItem(p.workId, p.kind, name, Math.max(0, ...ofKind.map((b) => b.order)) + 1)
    setAdding(false)
    setTrash(false)
    p.onSelect(id)
  }
  const move = (b: BibleItem, dir: -1 | 1) => {
    const other = list[list.indexOf(b) + dir]
    if (!other) return
    updateBibleItem(p.workId, b.id, { order: other.order }).catch(fail)
    updateBibleItem(p.workId, other.id, { order: b.order }).catch(fail)
  }

  return (
    <div className={`bible-body ${selected ? 'has-detail' : ''}`}>
      <section className="bible-list" aria-label={`Danh sách ${def.one}`}>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={18} /> Thêm {def.one}</button>
        {adding && <AddDialog def={def} onClose={() => setAdding(false)} onAdd={add} />}
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label={`Tìm ${def.one}`} placeholder={`Tìm ${def.one}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select aria-label="Sắp xếp" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="order">Theo thứ tự</option>
          <option value="name">Tên A–Z</option>
          <option value="updated">Sửa gần nhất</option>
        </select>
        <ul className="bible-items">
          {list.map((b, i) => (
            <li key={b.id} className={b.id === p.selectedId ? 'current' : undefined}>
              <button className="chapter-item" onClick={() => p.onSelect(b.id)} aria-current={b.id === p.selectedId || undefined}>
                <span className="chapter-label">{b.name || '(chưa đặt tên)'}</span>
                <span className="chapter-title">{def.subtitle?.(b) || (def.statuses?.find(([k]) => k === b.status)?.[1] ?? '')}</span>
              </button>
              {sort === 'order' && !trash && !needle && (
                <span className="reorder">
                  <button className="icon-btn tiny" aria-label={`Chuyển ${b.name} lên`} disabled={i === 0} onClick={() => move(b, -1)}><ArrowUp size={14} /></button>
                  <button className="icon-btn tiny" aria-label={`Chuyển ${b.name} xuống`} disabled={i === list.length - 1} onClick={() => move(b, 1)}><ArrowDown size={14} /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {!list.length && <p className="muted small">{trash ? 'Thùng rác trống.' : needle ? 'Không có kết quả.' : `Chưa có ${def.one} nào.`}</p>}
        {(trashed > 0 || trash) && (
          <button className="link-btn small" onClick={() => setTrash((t) => !t)}><Trash2 size={14} /> {trash ? 'Về danh sách' : `Thùng rác (${trashed})`}</button>
        )}
      </section>
      {selected ? (
        <ItemEditor key={selected.id} workId={p.workId} item={selected} def={def} items={p.items} chapters={p.chapters} onBack={() => p.onSelect(null)} onOpen={p.onSelect} />
      ) : (
        <p className="bible-detail muted empty">Chọn một mục để xem và sửa, hoặc bấm “Thêm {def.one}”.</p>
      )}
    </div>
  )
}

/** Text that saves on blur, only when changed. */
function Field(p: { label: string; value: string; multiline?: boolean; placeholder?: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(p.value)
  const save = () => v !== p.value && p.onSave(v)
  return (
    <label className="field">
      <span>{p.label}</span>
      {p.multiline
        ? <textarea rows={3} value={v} placeholder={p.placeholder} onChange={(e) => setV(e.target.value)} onBlur={save} />
        : <input value={v} placeholder={p.placeholder} onChange={(e) => setV(e.target.value)} onBlur={save} />}
    </label>
  )
}

function ItemEditor(p: { workId: string; item: BibleItem; def: KindDef; items: BibleItem[]; chapters: Chapter[]; onBack: () => void; onOpen: (id: string) => void }) {
  const { item, def } = p
  const save = (patch: Parameters<typeof updateBibleItem>[2]) => updateBibleItem(p.workId, item.id, patch).catch(fail)
  const saveField = (k: string, v: string) => updateBibleField(p.workId, item.id, k, v).catch(fail)
  const byId = new Map(p.items.map((b) => [b.id, b]))
  const characters = p.items.filter((b) => b.kind === 'character' && !b.deletedAt && b.id !== item.id)
  const [relLabel, setRelLabel] = useState('')
  const [relTarget, setRelTarget] = useState('')
  const [confirming, setConfirming] = useState(false)

  return (
    <section className="bible-detail" aria-label={`Hồ sơ ${item.name}`}>
      <div className="panel-head">
        <button className="link-btn bible-back" onClick={p.onBack}><ArrowLeft size={16} /> Danh sách</button>
        <span className="muted small">Sửa: {formatDate(item.updatedAt)}</span>
        {item.deletedAt
          ? <button className="btn small" onClick={() => save({ deletedAt: null })}><RotateCcw size={16} /> Khôi phục</button>
          : <button className="btn small" onClick={() => setConfirming(true)}><Trash2 size={16} /> Thùng rác</button>}
      </div>
      <Field label={`${def.nameLabel} *`} value={item.name} onSave={(v) => v.trim() && save({ name: v.trim() })} />
      {def.statuses && (
        <label className="field">
          <span>Trạng thái</span>
          <select value={item.status} onChange={(e) => save({ status: e.target.value })}>
            <option value="">—</option>
            {def.statuses.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      )}
      {def.startChapter && (
        <label className="field">
          <span>Chương bắt đầu</span>
          <select value={item.fields.startChapter ?? ''} onChange={(e) => saveField('startChapter', e.target.value)}>
            <option value="">—</option>
            {p.chapters.map((c) => <option key={c.id} value={c.id}>{c.label}{c.title ? ` – ${c.title}` : ''}</option>)}
          </select>
        </label>
      )}
      {def.fields.map(([k, label, multi, ph]) => <Field key={k} label={label} value={item.fields[k] ?? ''} multiline={multi} placeholder={ph} onSave={(v) => saveField(k, v)} />)}
      {def.tags && <Field label="Tags (cách nhau bởi dấu phẩy)" value={item.tags.join(', ')} onSave={(v) => save({ tags: v.split(',').map((t) => t.trim()).filter(Boolean) })} />}

      {def.relations && (
        <fieldset className="field">
          <legend>Quan hệ</legend>
          <ul className="relations">
            {item.relations.map((r, i) => (
              <li key={i}>
                <span>{item.name} → <b>{r.label || '…'}</b> → </span>
                <button className="link-btn" onClick={() => p.onOpen(r.targetId)}>{byId.get(r.targetId)?.name ?? '(đã xóa)'}</button>
                <button className="icon-btn tiny" aria-label="Xóa quan hệ" onClick={() => save({ relations: item.relations.filter((_, j) => j !== i) })}><X size={14} /></button>
              </li>
            ))}
          </ul>
          {characters.length ? (
            <div className="relation-add">
              <input aria-label="Quan hệ (VD: Bạn học)" placeholder="Quan hệ, VD: Bạn học" value={relLabel} onChange={(e) => setRelLabel(e.target.value)} />
              <select aria-label="Với nhân vật" value={relTarget} onChange={(e) => setRelTarget(e.target.value)}>
                <option value="">Với nhân vật…</option>
                {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn small" disabled={!relTarget} onClick={() => { save({ relations: [...item.relations, { targetId: relTarget, label: relLabel.trim() }] }); setRelLabel(''); setRelTarget('') }}>
                <Plus size={16} /> Thêm
              </button>
            </div>
          ) : <p className="muted small">Thêm nhân vật khác để tạo quan hệ.</p>}
        </fieldset>
      )}

      {def.links.map((key) => {
        const options: { id: string; name: string }[] = key === 'chapters'
          ? p.chapters.map((c) => ({ id: c.id, name: `${c.label}${c.title ? ` – ${c.title}` : ''}` }))
          : p.items.filter((b) => b.kind === LINK_KIND[key] && !b.deletedAt && b.id !== item.id).map((b) => ({ id: b.id, name: b.name }))
        const ids = item.links?.[key] ?? []
        const name = (id: string) => options.find((o) => o.id === id)?.name ?? '(đã xóa)'
        const setIds = (next: string[]) => save({ links: { ...item.links, [key]: next } })
        return (
          <fieldset key={key} className="field">
            <legend>{LINK_LABEL[key]}</legend>
            <ul className="link-chips">
              {ids.map((id) => (
                <li key={id}>
                  {key === 'chapters'
                    ? <Link to={`/write/${p.workId}/${id}`}>{name(id)}</Link>
                    : <button className="link-btn" onClick={() => p.onOpen(id)}>{name(id)}</button>}
                  <button className="icon-btn tiny" aria-label={`Bỏ ${name(id)}`} onClick={() => setIds(ids.filter((x) => x !== id))}><X size={14} /></button>
                </li>
              ))}
            </ul>
            <select aria-label={`Thêm ${LINK_LABEL[key].toLowerCase()}`} value="" onChange={(e) => e.target.value && setIds([...ids, e.target.value])}>
              <option value="">+ Thêm…</option>
              {options.filter((o) => !ids.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </fieldset>
        )
      })}
      {confirming && (
        <Modal icon={<Trash2 size={24} />} danger kicker="Sổ tay truyện" title="Đưa vào thùng rác?" onClose={() => setConfirming(false)}>
          <p>“{item.name}” sẽ được chuyển vào thùng rác. Bạn có thể khôi phục lại bất cứ lúc nào.</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setConfirming(false)}>Hủy</button>
            <button className="btn danger" onClick={() => { setConfirming(false); save({ deletedAt: Date.now() }) }}><Trash2 size={18} /> Đưa vào thùng rác</button>
          </div>
        </Modal>
      )}
    </section>
  )
}

function StyleRules({ workId, item }: { workId: string; item?: BibleItem }) {
  // Local copy: the fields being typed in are never reset by the save of another field.
  const [fields, setFields] = useState<Record<string, string>>(() => item?.fields ?? {})
  const [copied, setCopied] = useState(false)
  const text = STYLE_FIELDS.filter(([k]) => fields[k]?.trim()).map(([k, label]) => `## ${label}\n${fields[k].trim()}`).join('\n\n')
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <section className="bible-style page">
      <div className="panel-head">
        <p className="muted small">Lưu tự động khi rời khỏi ô. Dùng nút sao chép để dán vào công cụ viết khác.</p>
        <button className="btn" disabled={!text} onClick={() => copy().catch(fail)}><ClipboardCopy size={18} /> {copied ? 'Đã sao chép' : 'Sao chép quy tắc'}</button>
      </div>
      {STYLE_FIELDS.map(([k, label]) => (
        <Field key={k} label={label} value={item?.fields[k] ?? ''} multiline onSave={(v) => {
          setFields((f) => ({ ...f, [k]: v }))
          saveStyleField(workId, !!item, k, v).catch(fail)
        }} />
      ))}
    </section>
  )
}
