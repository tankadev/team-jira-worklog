/**
 * Atlassian Document Format → simple blocks for display.
 *
 * Handles only what this project actually uses. A survey of the descriptions in
 * VT found six node types — doc, paragraph, text, bulletList, listItem, heading
 * — and no marks at all, so a full ADF renderer would be dead weight. Anything
 * unrecognised falls back to its text content rather than disappearing.
 *
 * No server import: the detail panel renders these on the client.
 */

export type AdfBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }

interface AdfNode {
  type?: string
  text?: string
  attrs?: { level?: number }
  content?: AdfNode[]
}

/** Concatenates every text leaf under a node. */
function textOf(node: AdfNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(textOf).join('')
}

export function adfToBlocks(doc: unknown): AdfBlock[] {
  const root = doc as AdfNode | null
  if (!root || typeof root !== 'object' || !Array.isArray(root.content)) return []

  const out: AdfBlock[] = []

  for (const node of root.content) {
    switch (node.type) {
      case 'heading': {
        const text = textOf(node).trim()
        if (text) out.push({ kind: 'heading', level: node.attrs?.level ?? 3, text })
        break
      }
      case 'bulletList':
      case 'orderedList': {
        const items = (node.content ?? [])
          .map((li) => textOf(li).trim())
          .filter(Boolean)
        if (items.length) out.push({ kind: 'bullets', items })
        break
      }
      default: {
        const text = textOf(node).trim()
        if (text) out.push({ kind: 'paragraph', text })
      }
    }
  }

  return out
}

/** Flattens back to plain text, for tooltips and copying. */
export function adfToText(doc: unknown): string {
  return adfToBlocks(doc)
    .map((b) =>
      b.kind === 'bullets' ? b.items.map((i) => `- ${i}`).join('\n') : b.text,
    )
    .join('\n\n')
}
