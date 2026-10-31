import StarterKit from '@tiptap/starter-kit'

// Prose-only toolset. Links and code blocks are off: not needed for novels, and they keep pasted
// documents from importing junk structure.
export const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: false,
    code: false,
    codeBlock: false,
  }),
]

export const parseJson = (json: string) => (json ? JSON.parse(json) : '')
