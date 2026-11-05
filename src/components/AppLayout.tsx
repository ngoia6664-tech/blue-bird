import { BookMarked, BookOpen, ChevronLeft, Feather, LogIn, LogOut, Moon, PenLine, RefreshCw, Settings as SettingsIcon, Sun } from 'lucide-react'
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { signInWithGoogle, signOutUser, useAuth } from '../auth/AuthProvider'
import { APP_NAME } from '../config'
import { useSyncStatus } from '../sync/engine'
import { useEffect, useState } from 'react'
import { useTheme } from '../theme'

export const lastWorkKey = 'novel-studio-last-work'
const navCollapsedKey = 'novel-studio-nav-collapsed'

export function AppLayout() {
  const auth = useAuth()
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem(navCollapsedKey) === '1')
  useLocation() // re-render on navigation so the Viết / Sổ tay links follow the last opened work
  if (auth.status === 'loading') return <div className="center-screen">Đang tải…</div>
  if (auth.status === 'signedOut') return <LoginScreen />
  if (auth.status === 'denied') {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h1>Không có quyền truy cập</h1>
          <p>
            Tài khoản <b>{auth.user.email}</b> không nằm trong danh sách được phép dùng {APP_NAME}.
          </p>
          <button className="btn" onClick={signOutUser}><LogOut size={18} /> Đăng xuất</button>
        </div>
      </div>
    )
  }
  const lastWork = localStorage.getItem(lastWorkKey)
  const toggleNav = () => {
    const next = !navCollapsed
    setNavCollapsed(next)
    localStorage.setItem(navCollapsedKey, next ? '1' : '0')
  }
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="logo" aria-hidden="true"><Feather size={18} /></span>
          <span className="brand-name">{APP_NAME}</span>
        </NavLink>
        <nav className={`tabs ${navCollapsed ? 'collapsed' : ''}`} aria-label="Điều hướng chính">
          <NavLink to="/" end title="Thư viện"><BookOpen size={18} /><span>Thư viện</span></NavLink>
          <NavLink to={lastWork ? `/write/${lastWork}` : '/write'} title="Viết"><PenLine size={18} /><span>Viết</span></NavLink>
          <NavLink to={lastWork ? `/bible/${lastWork}` : '/bible'} title="Sổ tay truyện"><BookMarked size={18} /><span>Sổ tay truyện</span></NavLink>
          <NavLink to="/settings" title="Cài đặt"><SettingsIcon size={18} /><span>Cài đặt</span></NavLink>
          <button
            type="button"
            className="nav-collapse-btn"
            onClick={toggleNav}
            aria-label={navCollapsed ? 'Mở rộng điều hướng' : 'Thu gọn điều hướng'}
            title={navCollapsed ? 'Mở rộng điều hướng' : 'Thu gọn điều hướng'}
          >
            <ChevronLeft size={14} />
          </button>
        </nav>
        <SyncBadge />
        <ThemeButton />
        <NavLink to="/settings" className="avatar" aria-label="Tài khoản">
          {auth.user.photoURL ? <img src={auth.user.photoURL} alt="" referrerPolicy="no-referrer" /> : (auth.user.email ?? '?')[0]}
        </NavLink>
      </header>
      <UpdateBar />
      <main className="main">
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  )
}

export function SyncBadge() {
  const s = useSyncStatus()
  const [label, tone] = !s.online
    ? [s.pending ? `Ngoại tuyến · ${s.pending} chưa đồng bộ` : 'Ngoại tuyến', 'warn']
    : s.syncing
      ? ['Đang đồng bộ…', 'busy']
      : s.error
        ? ['Lỗi đồng bộ', 'error']
        : s.pending
          ? [`${s.pending} chưa đồng bộ`, 'warn']
          : ['Đã đồng bộ', 'ok']
  return (
    <span className={`sync-badge ${tone}`} role="status" title={s.error ?? 'Trạng thái đồng bộ bản thảo'}>
      <span className="dot" aria-hidden="true" />
      <span className="sync-text">{label}</span>
    </span>
  )
}

function ThemeButton() {
  const [theme, toggle] = useTheme()
  const label = theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'
  return (
    <button className="icon-btn theme-btn" onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

/** A new app version is installed and waiting: reload when the writer chooses, never by surprise. */
function UpdateBar() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  useEffect(() => {
    const on = (e: Event) => setWaiting((e as CustomEvent<ServiceWorker>).detail)
    window.addEventListener('sw-update', on)
    return () => window.removeEventListener('sw-update', on)
  }, [])
  if (!waiting) return null
  return (
    <div className="notice update-bar" role="status">
      Có phiên bản mới của ứng dụng.{' '}
      <button className="link-btn" onClick={() => waiting.postMessage('skip-waiting')}><RefreshCw size={14} /> Tải lại để cập nhật</button>
    </div>
  )
}

function LoginScreen() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="center-screen">
      <div className="card narrow login">
        <span className="logo big" aria-hidden="true"><Feather size={28} /></span>
        <h1>{APP_NAME}</h1>
        <p className="muted">Không gian viết truyện riêng của bạn.</p>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await signInWithGoogle()
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          <LogIn size={18} /> Đăng nhập bằng Google
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
