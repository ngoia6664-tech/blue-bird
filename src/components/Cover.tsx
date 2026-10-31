import { BookOpen } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { getCover } from '../data/works'
import type { Work } from '../types'

export function Cover({ work, src }: { work: Pick<Work, 'id' | 'title' | 'hasCover'>; src?: string | null }) {
  const [loaded, setLoaded] = useState<string | null>(null)
  useEffect(() => {
    if (src !== undefined || !work.hasCover) return setLoaded(null)
    let live = true
    getCover(work.id).then((u) => live && setLoaded(u)).catch(console.error)
    return () => void (live = false)
  }, [work.id, work.hasCover, src])

  const url = src !== undefined ? src : loaded
  // Same title, same colour: a stable hue so each placeholder cover is recognisable.
  const hue = [...work.title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <div className="cover">
      {url ? (
        <img src={url} alt={`Bìa ${work.title}`} />
      ) : (
        <div className="cover-placeholder" aria-hidden="true" style={{ '--hue': hue } as CSSProperties}>
          <BookOpen size={26} strokeWidth={1.25} />
          <span>{work.title.trim() || 'Chưa đặt tên'}</span>
        </div>
      )}
    </div>
  )
}

/** Downscale and compress an image file into a small data URL stored in Firestore. */
export async function compressCover(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('File được chọn không phải ảnh.')
  if (file.size > 20_000_000) throw new Error('Ảnh quá lớn (tối đa 20 MB).')
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 600 / bmp.width, 900 / bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    let url = canvas.toDataURL('image/webp', q)
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', q) // Safari can't encode WebP
    if (url.length <= 200_000) return url
  }
  throw new Error('Không nén được ảnh xuống đủ nhỏ. Hãy thử ảnh khác.')
}
