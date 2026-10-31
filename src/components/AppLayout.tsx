import { BookOpen, Feather, LogIn, LogOut, PenLine, Settings as SettingsIcon } from 'lucide-react'
import { NavLink, Outlet, ScrollRestoration } from 'react-router'
import { signInWithGoogle, signOutUser, useAuth } from '../auth/AuthProvider'
import { APP_NAME } from '../config'
import { useSyncStatus } from '../sync/engine'
import { useState } from 'react'

export const lastWorkKey = 'novel-studio-last-work'

export function AppLayout() {
  const auth = useAuth()
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
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="logo" aria-hidden="true"><Feather size={18} /></span>
          <span className="brand-name">{APP_NAME}</span>
        </NavLink>
        <nav className="tabs" aria-label="Điều hướng chính">
          <NavLink to="/" end><BookOpen size={18} /><span>Thư viện</span></NavLink>
          <NavLink to={lastWork ? `/write/${lastWork}` : '/write'}><PenLine size={18} /><span>Viết</span></NavLink>
          <NavLink to="/settings"><SettingsIcon size={18} /><span>Cài đặt</span></NavLink>
        </nav>
        <SyncBadge />
        <NavLink to="/settings" className="avatar" aria-label="Tài khoản">
          {auth.user.photoURL ? <img src={auth.user.photoURL} alt="" referrerPolicy="no-referrer" /> : (auth.user.email ?? '?')[0]}
        </NavLink>
      </header>
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
