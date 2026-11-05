import { useState } from 'react'

export type Theme = 'dark' | 'light'
const themeKey = 'novel-studio-theme'

/** Stored choice, else the OS preference. Dark is the design default. */
export function initialTheme(): Theme {
  const saved = localStorage.getItem(themeKey)
  if (saved === 'dark' || saved === 'light') return saved
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#070d1c' : '#059669')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) ?? initialTheme())
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(themeKey, next)
    applyTheme(next)
    setTheme(next)
  }
  return [theme, toggle] as const
}

const CARD = '.work-card, .recent, .quick-actions, .card, .stat-chip, .work-form-grid'
const RIPPLE = '.btn, .icon-btn, .tabs a, .menu-list button'

/**
 * Pointer effects for app.css, all via custom properties: the position over the hovered card (--gx/--gy)
 * drives its light, and the click point on a button (--rx/--ry) with [data-ripple] drives the ripple.
 */
export function trackPointer() {
  let frame = 0
  addEventListener('pointermove', (e) => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const root = document.documentElement.style
      root.setProperty('--mx', `${e.clientX}px`)
      root.setProperty('--my', `${e.clientY}px`)
      const card = (e.target as Element).closest?.<HTMLElement>(CARD)
      if (card) {
        const r = card.getBoundingClientRect()
        card.style.setProperty('--gx', `${e.clientX - r.left}px`)
        card.style.setProperty('--gy', `${e.clientY - r.top}px`)
      }
    })
  }, { passive: true })
  addEventListener('pointerdown', (e) => {
    const el = (e.target as Element).closest?.<HTMLElement>(RIPPLE)
    if (!el || el.matches(':disabled, [aria-disabled="true"]')) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--rx', `${e.clientX - r.left}px`)
    el.style.setProperty('--ry', `${e.clientY - r.top}px`)
    el.removeAttribute('data-ripple')
    void el.offsetWidth // restart the animation on a rapid second click
    el.setAttribute('data-ripple', '')
  }, { passive: true })
  addEventListener('animationend', (e) => {
    if (e.animationName === 'ripple') (e.target as Element).removeAttribute('data-ripple')
  })
}
