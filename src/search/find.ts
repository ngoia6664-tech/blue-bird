// Plain-text matching shared by the in-chapter find bar, global search and replace.
// Text is compared per letter cluster (base + combining marks), folded to NFD, so NFC and NFD
// Vietnamese match each other, and a match never ends inside a letter: "e" does not match "ế".

export interface FindOptions {
  caseSensitive: boolean
  wholeWord: boolean
}

export interface Match {
  from: number
  to: number
}

const CLUSTER = /\P{M}\p{M}*|\p{M}+/gu
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u

function fold(text: string, caseSensitive: boolean) {
  let s = ''
  // bound[i] = offset in `text` where the cluster starting at folded index i begins, else -1.
  const starts: number[] = []
  const offsets: number[] = []
  for (const m of text.matchAll(CLUSTER)) {
    starts.push(s.length)
    offsets.push(m.index)
    s += (caseSensitive ? m[0] : m[0].toLocaleLowerCase('vi')).normalize('NFD')
  }
  const bound = new Int32Array(s.length + 1).fill(-1)
  starts.forEach((f, i) => (bound[f] = offsets[i]))
  bound[s.length] = text.length
  return { s, bound }
}

const lastChar = (s: string) => Array.from(s.slice(-2)).pop() ?? ''
const firstChar = (s: string) => String.fromCodePoint(s.codePointAt(0) ?? 32)

export function findAll(text: string, query: string, opts: FindOptions): Match[] {
  if (!query || !text) return []
  const { s, bound } = fold(text, opts.caseSensitive)
  const q = fold(query, opts.caseSensitive).s
  const out: Match[] = []
  let i = s.indexOf(q)
  while (i !== -1) {
    const from = bound[i]
    const to = bound[i + q.length]
    const ok =
      from >= 0 && to >= 0 &&
      (!opts.wholeWord || (!WORD_CHAR.test(lastChar(text.slice(0, from))) && !WORD_CHAR.test(firstChar(text.slice(to)))))
    if (ok) {
      out.push({ from, to })
      i = s.indexOf(q, i + q.length)
    } else {
      i = s.indexOf(q, i + 1)
    }
  }
  return out
}

/** The paragraph around a match, clipped to `radius` characters on each side. */
export function snippet(text: string, m: Match, radius = 70) {
  const lineStart = text.lastIndexOf('\n', m.from - 1) + 1
  const nl = text.indexOf('\n', m.to)
  const lineEnd = nl === -1 ? text.length : nl
  const start = Math.max(lineStart, m.from - radius)
  const end = Math.min(lineEnd, m.to + radius)
  return {
    before: (start > lineStart ? '…' : '') + text.slice(start, m.from),
    match: text.slice(m.from, m.to),
    after: text.slice(m.to, end) + (end < lineEnd ? '…' : ''),
  }
}

const foldName = (s: string) => s.normalize('NFC').toLocaleLowerCase('vi').trim()
const labelNumber = (label: string) => /(\d+(?:[.,]\d+)?)/.exec(label)?.[1]?.replace(',', '.')

/** Sidebar chapter search: "7" or "chương 7" lists Chương 7 first, then labels/titles containing the text. */
export function filterChapters<T extends { label: string; title: string }>(list: T[], q: string): T[] {
  const needle = foldName(q)
  if (!needle) return list
  const num = /^(?:chương|chapter|ch\.?)?\s*(\d+(?:[.,]\d+)?)$/.exec(needle)?.[1]?.replace(',', '.')
  const exact = num ? list.filter((c) => labelNumber(c.label) === num) : []
  return [...exact, ...list.filter((c) => !exact.includes(c) && foldName(`${c.label} ${c.title}`).includes(needle))]
}
