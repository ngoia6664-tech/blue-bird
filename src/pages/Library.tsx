import { BookOpen, CircleX, Clock, DatabaseBackup, Download, PenLine, Pencil, Plus, RotateCcw, Search, Trash2, Upload } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Cover } from '../components/Cover'
import { Menu } from '../components/Menu'
import { useChapters, useWorks } from '../data/hooks'
import { deleteWorkForever, restoreWork, trashWork } from '../data/works'
import { ExportDialog } from '../doc/ExportDialog'
import { ImportDialog } from '../doc/ImportDialog'
import { formatDate, formatNumber } from '../format'
import { WORK_STATUS_LABEL, type Work, type WorkStatus } from '../types'

type Filter = 'all' | WorkStatus | 'trash'
type Sort = 'updated' | 'title' | 'created'

const writeUrl = (w: Work) => `/write/${w.id}${w.lastChapterId ? `/${w.lastChapterId}` : ''}`

export function Library() {
  const { data: works, error } = useWorks()
  const auth = useAuth()
  const navigate = useNavigate()
  // Filters live in the URL so "back" from a work returns to the same view.
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const filter = (params.get('filter') ?? 'all') as Filter
  const sort = (params.get('sort') ?? 'updated') as Sort
  const setParam = (k: string, v: string, def: string) =>
    setParams((p) => (v === def ? p.delete(k) : p.set(k, v), p), { replace: true })

  const live = useMemo(() => (works ?? []).filter((w) => !w.deletedAt), [works])
  const recent = useMemo(() => [...live].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 4), [live])

  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('vi')
    return (works ?? [])
      .filter((w) => (filter === 'trash' ? !!w.deletedAt : !w.deletedAt && (filter === 'all' || w.status === filter)))
      .filter((w) => !needle || [w.title, ...w.aliases].some((s) => s.toLocaleLowerCase('vi').includes(needle)))
      .sort((a, b) =>
        sort === 'title' ? a.title.localeCompare(b.title, 'vi') : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt,
      )
  }, [works, q, filter, sort])

  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState<Work | null>(null)
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
    } catch (e) {
      alert(`Thao tác thất bại: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="page error" role="alert">Không tải được thư viện: {error.message}</p>
  if (!works) return <p className="page muted">Đang tải thư viện…</p>

  const hour = new Date().getHours()
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
  const name = auth.status === 'ready' ? auth.user.displayName?.split(' ').pop() : undefined

  return (
    <div className="page library">
      <header className="library-hero">
        <div>
          <p className="muted small">{greeting}{name ? `, ${name}` : ''}</p>
          <h1>Hôm nay viết gì nào?</h1>
        </div>
        {live.length > 0 && (
          <div className="hero-stats">
            <div className="stat-chip"><b>{formatNumber(live.length)}</b><span>tác phẩm</span></div>
            <div className="stat-chip"><b>{formatNumber(live.reduce((s, w) => s + w.chapterCount, 0))}</b><span>chương</span></div>
            <div className="stat-chip"><b>{formatNumber(live.reduce((s, w) => s + w.wordCount, 0))}</b><span>từ đã viết</span></div>
          </div>
        )}
      </header>
      {live.length > 0 && (
        <div className="library-top">
          <section aria-labelledby="recent-h" className="recent">
            <h2 id="recent-h">Tác phẩm gần đây</h2>
            <ul className="recent-list">
              {recent.map((w) => (
                <li key={w.id}>
                  <Link to={writeUrl(w)} className="recent-item">
                    <Clock size={16} aria-hidden="true" />
                    <span className="recent-title">{w.title}</span>
                    <span className="muted small">{formatDate(w.lastOpenedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="actions-h" className="quick-actions">
            <h2 id="actions-h">Hành động nhanh</h2>
            <Link to="/works/new" className="btn primary"><Plus size={18} /> Tạo tác phẩm</Link>
            {recent[0] && (
              <Link to={writeUrl(recent[0])} className="btn"><PenLine size={18} /> Mở bản nháp gần nhất</Link>
            )}
            <button className="btn" onClick={() => setImporting(true)}><Upload size={18} /> Nhập tác phẩm</button>
            <Link to="/settings#backup" className="btn"><DatabaseBackup size={18} /> Sao lưu dữ liệu</Link>
          </section>
        </div>
      )}

      <section aria-labelledby="all-h">
        <div className="section-head">
          <h2 id="all-h">{filter === 'trash' ? 'Thùng rác' : 'Tất cả tác phẩm'}</h2>
          <Link to="/works/new" className="btn primary small-screen-only" aria-label="Tạo tác phẩm"><Plus size={18} /></Link>
        </div>
        <div className="filters">
          <label className="search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Tìm theo tên hoặc tên khác"
              aria-label="Tìm tác phẩm"
              value={q}
              onChange={(e) => setParam('q', e.target.value, '')}
            />
          </label>
          <select aria-label="Lọc theo trạng thái" value={filter} onChange={(e) => setParam('filter', e.target.value, 'all')}>
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(WORK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="trash">Thùng rác</option>
          </select>
          <select aria-label="Sắp xếp" value={sort} onChange={(e) => setParam('sort', e.target.value, 'updated')}>
            <option value="updated">Sửa gần nhất</option>
            <option value="title">Tên A–Z</option>
            <option value="created">Ngày tạo</option>
          </select>
        </div>

        {works.length === 0 ? (
          <div className="empty">
            <p>Thư viện đang trống.</p>
            <div className="row center">
              <Link to="/works/new" className="btn primary"><Plus size={18} /> Tạo tác phẩm đầu tiên</Link>
              <button className="btn" onClick={() => setImporting(true)}><Upload size={18} /> Nhập từ file</button>
              <Link to="/settings#backup" className="btn"><DatabaseBackup size={18} /> Khôi phục bản sao lưu</Link>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <p className="empty muted">Không có tác phẩm phù hợp.</p>
        ) : (
          <ul className="work-grid">
            {shown.map((w, i) => (
              <li key={w.id} className="work-card" style={{ '--i': i } as CSSProperties}>
                <Link to={writeUrl(w)} className="work-cover-link" tabIndex={-1} aria-hidden="true">
                  <Cover work={w} />
                </Link>
                <div className="work-info">
                  <div className="work-title-row">
                    <h3 className="work-title" title={w.title}>{w.title}</h3>
                    <Menu
                      label={`Thao tác cho ${w.title}`}
                      items={
                        w.deletedAt
                          ? [
                              { label: 'Khôi phục', icon: <RotateCcw size={16} />, onSelect: () => run(() => restoreWork(w.id)), disabled: busy },
                              {
                                label: 'Xóa vĩnh viễn',
                                icon: <CircleX size={16} />,
                                danger: true,
                                disabled: busy,
                                onSelect: () =>
                                  confirm(`Xóa VĨNH VIỄN "${w.title}" cùng toàn bộ chương và lịch sử? Không thể hoàn tác.`) &&
                                  run(() => deleteWorkForever(w.id)),
                              },
                            ]
                          : [
                              { label: 'Viết tiếp', icon: <PenLine size={16} />, onSelect: () => navigate(writeUrl(w)) },
                              { label: 'Đọc thử', icon: <BookOpen size={16} />, onSelect: () => navigate(`/read/${w.id}`) },
                              { label: 'Sửa thông tin', icon: <Pencil size={16} />, onSelect: () => navigate(`/works/${w.id}/edit`) },
                              { label: 'Xuất bản thảo', icon: <Download size={16} />, onSelect: () => setExporting(w) },
                              {
                                label: 'Đưa vào thùng rác',
                                icon: <Trash2 size={16} />,
                                danger: true,
                                onSelect: () => confirm(`Đưa "${w.title}" vào thùng rác?`) && run(() => trashWork(w.id)),
                              },
                            ]
                      }
                    />
                  </div>
                  <p className="work-meta">
                    <span className={`badge status-${w.status}`}>{WORK_STATUS_LABEL[w.status]}</span>
                    <span>{formatNumber(w.chapterCount)} chương</span>
                    <span>{formatNumber(w.wordCount)} từ</span>
                  </p>
                  <p className="muted small">Sửa: {formatDate(w.updatedAt)}</p>
                  {!w.deletedAt && <Link to={writeUrl(w)} className="btn small"><PenLine size={16} /> Viết tiếp</Link>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {importing && (
        <ImportDialog mode="work" onClose={() => setImporting(false)} onDone={(id, ch) => navigate(`/write/${id}${ch ? `/${ch}` : ''}`)} />
      )}
      {exporting && <WorkExport work={exporting} onClose={() => setExporting(null)} />}
    </div>
  )
}

function WorkExport({ work, onClose }: { work: Work; onClose: () => void }) {
  const { data } = useChapters(work.id)
  if (!data) return null
  return <ExportDialog workId={work.id} workTitle={work.title} chapters={data.filter((c) => !c.deletedAt)} initial="all" onClose={onClose} />
}
