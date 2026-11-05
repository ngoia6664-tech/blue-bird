import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * Native modal dialog: focus trap and Esc come from the browser. `locked` blocks closing while busy.
 * `icon` (with `kicker`, the small line above the title) shows the logo-style badge for the dialog's function; `danger` tints it red.
 */
export function Modal(p: { title: string; onClose: () => void; children: ReactNode; locked?: boolean; wide?: boolean; icon?: ReactNode; kicker?: string; danger?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const d = ref.current!
    if (!d.open) d.showModal()
    return () => d.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${p.wide ? 'wide' : ''}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault()
        if (!p.locked) p.onClose()
      }}
    >
      <div className="panel-head">
        {p.icon && <span className={`modal-badge ${p.danger ? 'danger' : ''}`} aria-hidden="true">{p.icon}</span>}
        <div className="modal-titles">
          {p.kicker && <span className="modal-kicker">{p.kicker}</span>}
          <h2 id={id}>{p.title}</h2>
        </div>
        <button type="button" className="icon-btn" aria-label="Đóng" title="Đóng" disabled={p.locked} onClick={p.onClose}><X size={18} /></button>
      </div>
      {p.children}
    </dialog>
  )
}

export function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
