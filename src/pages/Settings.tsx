import { LogOut, RefreshCw } from 'lucide-react'
import { signOutUser, useAuth } from '../auth/AuthProvider'
import { APP_NAME } from '../config'
import { flush, useSyncStatus } from '../sync/engine'

export function Settings() {
  const auth = useAuth()
  const sync = useSyncStatus()
  const user = auth.status === 'ready' ? auth.user : null

  function signOut() {
    if (sync.pending && !confirm(`Còn ${sync.pending} chương chưa đồng bộ. Chúng vẫn nằm trên máy này và sẽ đồng bộ khi bạn đăng nhập lại. Đăng xuất?`)) return
    void signOutUser()
  }

  return (
    <div className="page settings">
      <h1>Cài đặt</h1>
      <section className="card">
        <h2>Tài khoản</h2>
        <p>{user?.displayName}</p>
        <p className="muted">{user?.email}</p>
        <button className="btn" onClick={signOut}><LogOut size={18} /> Đăng xuất</button>
      </section>
      <section className="card">
        <h2>Đồng bộ</h2>
        <p>
          {sync.online ? 'Đang có mạng.' : 'Đang ngoại tuyến.'}{' '}
          {sync.pending ? `${sync.pending} chương có thay đổi chỉ nằm trên máy này.` : 'Mọi thay đổi đã lên máy chủ.'}
        </p>
        {sync.error && <p className="error">Lỗi gần nhất: {sync.error}</p>}
        <button className="btn" disabled={!sync.online || sync.syncing} onClick={() => void flush()}><RefreshCw size={18} /> Đồng bộ ngay</button>
        <p className="muted small">
          Bản nháp được lưu trên máy trước, rồi mới gửi lên máy chủ. Đừng xóa dữ liệu trình duyệt khi còn thay đổi chưa đồng bộ.
        </p>
      </section>
      <p className="muted small">{APP_NAME} · phiên bản {__APP_VERSION__}</p>
    </div>
  )
}
