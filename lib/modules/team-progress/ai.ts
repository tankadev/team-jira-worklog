import 'server-only'

import { runPrompt } from '@/lib/ai/gemini'
import { RetryableError } from '@/lib/ai/retry'

import type { DailyMatch } from './model'

/**
 * What the model does here. It never produces a figure: every number in the
 * report is computed from Jira, and the model is told to carry them over
 * untouched — the page then checks that it did.
 *
 * Every call costs tokens, so each one runs only from a button the user
 * pressed — never from an effect, on page load, or because an input changed.
 * When an input goes stale the page says so and waits to be asked again.
 */

/** Long pastes are cut here — a whole team's week fits well within it. */
const DAILIES_MAX = 20_000

/**
 * Rewrites the template's output the way the user writes it by hand.
 *
 * Given the rendered report (the structure to keep), past reports (the voice),
 * and the raw PR list, it shortens names, folds PRs of one feature into one
 * line, and drops what reads as noise — and must leave every figure as it is.
 *
 * The team's daily reports, when pasted, are context and nothing more: they
 * may add a short note to a feature (a blocker, "waiting for design") but
 * never change a number. Where a daily and Jira disagree — "done" in the
 * daily, In Progress on the ticket — that comes back as an insight for the
 * lead to act on, because silently trusting either one is how a report goes
 * wrong.
 */
export async function polishReport(input: {
  platform: string
  draft: string
  examples: string[]
  prTitles: Array<{ env: string; title: string }>
  dailies?: string
  /** Daily lines already matched to issues: "Levi: <line> → VT-1 <title> [epic] (status, 60%)". */
  dailyMap?: string[]
}): Promise<{ text: string; insights: string[]; model: string }> {
  const examples = input.examples.filter((e) => e.trim()).slice(0, 3)
  const dailies = (input.dailies ?? '').trim().slice(0, DAILIES_MAX)
  const prompt = `Bạn là trưởng nhóm ${input.platform}, viết báo cáo tiến độ gửi group chat của công ty.

Dưới đây là BẢN NHÁP được dựng tự động từ Jira và GitHub. Hãy viết lại cho gọn, dễ đọc, đúng văn phong các báo cáo mẫu.

QUY TẮC BẮT BUỘC:
1. GIỮ NGUYÊN mọi con số: phần trăm (90%), phân số (13/13), số đếm, ngày. Không thêm, bớt, làm tròn hay đổi bất kỳ số nào.
2. Giữ thứ tự và cấu trúc của bản nháp: tiêu đề, từng tính năng, các dòng con " + ...", phần 🚀 deploy. Giữ một dòng trống giữa các tính năng như bản nháp.
2b. Giữ nguyên phần môi trường trong ngoặc sau tên tính năng, ví dụ "(Deploy Staging)", và ghi chú sau dấu " - ", ví dụ "- Pending for new design".
3. Rút gọn tên tính năng: bỏ tag như [CTALK], [Web/Desktop], chữ "CLONE -", giữ tên tính năng dễ hiểu.
4. Phần deploy: gộp các PR cùng một tính năng thành MỘT dòng ngắn mô tả tính năng (ví dụ "Media backfill"), bỏ tiền tố feat:/fix:, bỏ mã PR và mã Jira. Môi trường không có PR giữ nguyên "N/A".
5. Không bịa thêm nội dung không có trong bản nháp${dailies ? ' hoặc daily report' : ''}. Không thêm lời chào hay giải thích.
${
    dailies
      ? `6. DAILY REPORT của các thành viên (bên dưới) chỉ dùng làm ngữ cảnh:
   - Được thêm ghi chú NGẮN sau tên tính năng theo dạng " - <ghi chú>" khi daily nêu rõ blocker, đang chờ (design, API, review…), hoặc việc đáng chú ý. Không thêm ghi chú cho việc bình thường.
   - KHÔNG đổi, thêm hay bớt bất kỳ con số nào theo daily, kể cả khi daily ghi % khác.
   - Đi qua TỪNG dòng daily và đối chiếu với số trong bản nháp. Daily nói "xong", "done", "implement xong", "đã fix", "x/x" mà dòng tương ứng trong bản nháp dưới 100% hoặc fix chưa đủ; hoặc daily nói mới bắt đầu mà bản nháp đã 100% → KHÔNG sửa báo cáo, mà ghi vào "insights": một câu tiếng Việt ngắn, nêu tên người, tính năng, daily nói gì và Jira đang ghi gì (thường là do status/subtask trên Jira chưa cập nhật).
   - Daily có tính năng thuộc nền tảng ${input.platform} mà bản nháp không có → ghi vào "insights", không tự thêm vào báo cáo.
`
      : ''
  }${examples.length ? `\nBÁO CÁO MẪU (chỉ để học văn phong, KHÔNG lấy số liệu từ đây):\n${examples.map((e, i) => `--- Mẫu ${i + 1} ---\n${e.trim()}`).join('\n')}\n` : ''}
${input.prTitles.length ? `\nTiêu đề PR gốc theo môi trường:\n${input.prTitles.map((p) => `- [${p.env}] ${p.title}`).join('\n')}\n` : ''}
${dailies ? `\nDAILY REPORT CỦA TEAM (dán nguyên văn, có thể lẫn nhiều người và nhiều nền tảng):\n"""\n${dailies}\n"""\n` : ''}${
    input.dailyMap?.length
      ? `\nĐỐI CHIẾU SẴN từng dòng daily với issue Jira (dùng để biết dòng daily nói về tính năng nào và Jira đang ghi gì; "→ không khớp" là việc không thấy trên Jira):\n${input.dailyMap.join('\n')}\n`
      : ''
  }
BẢN NHÁP:
"""
${input.draft}
"""

Trả về DUY NHẤT một object JSON: {"text": "<báo cáo đã viết lại, xuống dòng bằng \\n>", "insights": ["<điểm lệch hoặc việc cần xem lại>", ...]}
"insights" là mảng rỗng nếu không có gì.`

  const out = await runPrompt(
    prompt,
    (raw) => {
      const text = String(raw.text ?? '').trim()
      if (!text) throw new RetryableError('Gemini trả về báo cáo rỗng')
      const insights = Array.isArray(raw.insights)
        ? raw.insights.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 20)
        : []
      return { text, insights }
    },
    0.3,
  )
  return { text: out.text, insights: out.insights, model: out.model }
}

/** One Jira issue the AI may match a daily line to. */
export interface MapCandidate {
  key: string
  title: string
  /** Set for a subtask: the task above it, which is what the screen shows. */
  parentKey?: string
  epic: string
  status: string
}

/**
 * Matches each line of the team's dailies to the Jira issue it is about.
 *
 * People write what they did in their own words — a shortened title, the
 * subtask's name rather than the task's, Vietnamese for an English summary —
 * so an exact match finds almost nothing. The model reads both sides; the code
 * then keeps only keys that exist and lifts a subtask match to its task.
 */
export async function mapDailies(
  dailies: string,
  candidates: MapCandidate[],
): Promise<DailyMatch[]> {
  const text = dailies.trim().slice(0, DAILIES_MAX)
  if (!text || !candidates.length) return []
  const byKey = new Map(candidates.map((c) => [c.key, c]))

  const prompt = `Bạn đối chiếu daily report của các thành viên team phần mềm với danh sách issue trên Jira.

Daily thường có dạng: tên người, "Previous day / Hôm qua" (việc đã làm), "Today / Hôm nay" (việc sẽ làm), mỗi việc một dòng gạch đầu dòng. Tên việc trong daily có thể viết tắt, khác chữ, khác ngôn ngữ, hoặc là tên subtask thay vì tên task.

Với MỖI dòng việc trong daily (bỏ qua dòng tiêu đề, lời chào, dòng trống), trả về:
- person: tên người viết daily (lấy từ đầu khối daily; không rõ thì "")
- when: "yesterday" nếu thuộc phần hôm qua/previous day, "today" nếu thuộc phần hôm nay/today, còn lại "other"
- line: nguyên văn dòng việc (bỏ dấu gạch đầu dòng)
- key: mã issue khớp nhất trong danh sách dưới đây; null nếu không có issue nào thực sự nói về việc đó. Ưu tiên subtask nếu dòng daily trùng tên subtask.
- reason: lý do ngắn dưới 10 từ, tiếng Việt

Chỉ chọn key khi chắc chắn cùng một việc. Cùng tính năng nhưng khác việc (ví dụ daily nói test, issue là implement) thì vẫn có thể chọn nếu không có issue nào sát hơn, và ghi rõ ở reason.

DANH SÁCH ISSUE (key | tiêu đề | thuộc task | epic | status):
${candidates
  .map((c) => `${c.key} | ${c.title} | ${c.parentKey ?? '-'} | ${c.epic} | ${c.status}`)
  .join('\n')}

DAILY:
"""
${text}
"""

Trả về DUY NHẤT một object JSON:
{"matches": [{"person": "...", "when": "yesterday", "line": "...", "key": "VT-1" , "reason": "..."}]}`

  const out = await runPrompt(
    prompt,
    (raw) => {
      const list = Array.isArray(raw.matches) ? (raw.matches as Array<Record<string, unknown>>) : null
      if (!list) throw new RetryableError('Gemini trả về thiếu danh sách matches')
      const matches = list
        .map((m) => {
          const named = typeof m.key === 'string' ? byKey.get(m.key.trim()) : undefined
          const when = m.when === 'yesterday' || m.when === 'today' ? m.when : 'other'
          return {
            person: String(m.person ?? '').trim(),
            when: when as 'yesterday' | 'today' | 'other',
            line: String(m.line ?? '').trim(),
            // A subtask is shown under its task, so the task is the match.
            key: named ? (named.parentKey ?? named.key) : null,
            subtaskKey: named?.parentKey ? named.key : null,
            reason: String(m.reason ?? '').trim().slice(0, 120),
          }
        })
        .filter((m) => m.line)
      return { matches }
    },
    0.1,
  )
  return out.matches
}
