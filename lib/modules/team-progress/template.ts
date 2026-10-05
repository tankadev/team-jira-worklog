/**
 * The progress report's template language — a small, safe subset of mustache.
 *
 * The daily report gets by with one flat loop (lib/report.ts); this report is a
 * tree — epics, the tasks inside them, the PRs per environment — so it needs
 * real nested sections. Still nothing that evaluates an expression: the body
 * is typed by hand in a text box, and a template must never be able to run
 * code.
 *
 *   {{name}}               value, looked up from the innermost section outward
 *   {{#name}}…{{/name}}    list → once per item; truthy value → once; else skipped
 *   {{^name}}…{{/name}}    rendered only when `name` is empty / false / 0 / []
 *
 * A section tag alone on its line takes the whole line with it, so a template
 * can put every tag on a line of its own and the output carries no blank lines
 * where a section rendered nothing. Pure — no server import.
 */

type Scope = Record<string, unknown>

interface TextNode {
  kind: 'text'
  value: string
}
interface VarNode {
  kind: 'var'
  name: string
}
interface SectionNode {
  kind: 'section'
  name: string
  inverted: boolean
  children: Node[]
}
type Node = TextNode | VarNode | SectionNode

const TAG = /\{\{\s*([#^/]?)\s*([\w.]+)\s*\}\}/g

export class TemplateError extends Error {}

/**
 * Splits the template into tokens, removing the line a standalone section tag
 * sits on (leading indentation, the tag, trailing spaces and the newline).
 */
function tokenize(src: string): Array<{ type: '' | '#' | '^' | '/'; name: string } | string> {
  const out: Array<{ type: '' | '#' | '^' | '/'; name: string } | string> = []
  let last = 0

  for (const m of src.matchAll(TAG)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    const type = m[1] as '' | '#' | '^' | '/'
    let text = src.slice(last, start)
    let next = end

    if (type) {
      const lineStart = src.lastIndexOf('\n', start - 1) + 1
      const before = src.slice(lineStart, start)
      const nl = src.indexOf('\n', end)
      const after = src.slice(end, nl === -1 ? src.length : nl)
      // Standalone only when nothing else shares the line: no earlier tag on it
      // (`lineStart >= last`), only whitespace before the tag and after it.
      // Another tag later on the same line makes `after` non-blank.
      if (lineStart >= last && /^[ \t]*$/.test(before) && /^[ \t\r]*$/.test(after)) {
        text = text.slice(0, text.length - before.length)
        next = nl === -1 ? src.length : nl + 1
      }
    }

    if (text) out.push(text)
    out.push({ type, name: m[2] })
    last = next
  }
  if (last < src.length) out.push(src.slice(last))
  return out
}

function parse(src: string): Node[] {
  const root: Node[] = []
  const stack: SectionNode[] = []
  const current = () => (stack.length ? stack[stack.length - 1].children : root)

  for (const t of tokenize(src)) {
    if (typeof t === 'string') {
      current().push({ kind: 'text', value: t })
    } else if (t.type === '') {
      current().push({ kind: 'var', name: t.name })
    } else if (t.type === '#' || t.type === '^') {
      const node: SectionNode = { kind: 'section', name: t.name, inverted: t.type === '^', children: [] }
      current().push(node)
      stack.push(node)
    } else {
      const open = stack.pop()
      if (!open || open.name !== t.name) {
        throw new TemplateError(
          open ? `Khối {{#${open.name}}} đóng nhầm bằng {{/${t.name}}}` : `{{/${t.name}}} không có khối mở`,
        )
      }
    }
  }
  if (stack.length) throw new TemplateError(`Thiếu {{/${stack[stack.length - 1].name}}}`)
  return root
}

function lookup(scopes: unknown[], name: string): unknown {
  const path = name.split('.')
  for (let i = scopes.length - 1; i >= 0; i--) {
    const s = scopes[i]
    if (s && typeof s === 'object' && path[0] in (s as Scope)) {
      let v: unknown = s
      for (const p of path) v = v && typeof v === 'object' ? (v as Scope)[p] : undefined
      return v
    }
  }
  return undefined
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === false || v === '' || v === 0 || (Array.isArray(v) && v.length === 0)
}

function renderNodes(nodes: Node[], scopes: unknown[]): string {
  let out = ''
  for (const n of nodes) {
    if (n.kind === 'text') out += n.value
    else if (n.kind === 'var') {
      const v = lookup(scopes, n.name)
      out += v === undefined || v === null || typeof v === 'object' ? '' : String(v)
    } else {
      const v = lookup(scopes, n.name)
      if (n.inverted) {
        if (isEmpty(v)) out += renderNodes(n.children, scopes)
      } else if (Array.isArray(v)) {
        for (const item of v) out += renderNodes(n.children, [...scopes, item])
      } else if (!isEmpty(v)) {
        out += renderNodes(n.children, typeof v === 'object' ? [...scopes, v] : scopes)
      }
    }
  }
  return out
}

/** Renders a template against a data tree. Throws TemplateError on unbalanced sections. */
export function renderTemplate(src: string, data: Scope): string {
  return renderNodes(parse(src), [data])
}

/** Null when the template parses, otherwise the reason it does not. */
export function templateProblem(src: string): string | null {
  try {
    parse(src)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
