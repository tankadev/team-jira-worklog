# Jira Logwork

Công cụ chạy local để log giờ lên Jira và dựng daily report. Thay cho Chrome extension `jira-daily-tool` cũ.

## Cần gì trước khi chạy

- **Node.js 20.9 trở lên** (`node -v`). Bản này phát triển trên Node 23.
- **Jira API token** — tạo tại https://id.atlassian.com/manage-profile/security/api-tokens
- **Google API key** — tạo tại https://aistudio.google.com/apikey (chỉ cần nếu muốn dùng AI sinh nội dung task)

## Chạy lần đầu

```bash
npm install
cp .env.local.example .env.local
```

Mở `.env.local`, điền vào:

```
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=email-cua-ban@congty.com     ← email tài khoản Atlassian của BẠN
JIRA_API_TOKEN=                        ← token của BẠN, không dùng chung
GOOGLE_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
JIRA_PROJECT_KEY=ABC
JIRA_BOARD_ID=1
```

Rồi chạy:

```bash
npm run dev
```

Mở http://localhost:3000 → vào **Settings** → bấm **Test connection**. Ra tên bạn là xong.

> `.env.local` chỉ dùng để nạp lần đầu. Sau đó mọi cấu hình nằm trong SQLite và sửa thẳng
> trong màn Settings, không cần restart. Muốn nạp lại từ file thì xoá `data/app.db`.

## Chạy bản production

```bash
npm run build
npm start
```

## Các màn hình

| Màn | Việc |
|---|---|
| **Task board** | Subtask đang giao cho bạn, nhóm theo task cha. Log giờ, đổi trạng thái. |
| **Tìm & nhận task** | Tìm theo sprint / toàn project / JQL tự do, rồi tự assign về mình. |
| **Task mới** | Mô tả bằng lời, Gemini dựng title + description + DoD, tạo issue thật trên Jira. |
| **Report** | Daily report từ worklog thật, copy được, thống kê tuần và sprint, xuất CSV. |
| **Settings** | Kết nối Jira / Gemini, quy tắc giờ, quy đổi point, tiền tố title, template report. |

## Vài quy ước đã cài sẵn

- **Chỉ log giờ vào Subtask.** Task cha chỉ để gom nhóm.
- **Định mức 8h/ngày thường**, T7 và CN không tính định mức nhưng giờ log vào vẫn cộng tổng.
- **Point 1 = 1–2h, 2 = 4h, 3 = 1–2 ngày.** Tối đa 3 point. App chỉ cảnh báo khi vượt, không bao giờ chặn.
- **Task cha không tự cộng point** — app tính sẵn tổng point các task con để bạn tự điền vào cha.
- **Tiền tố title** `[Mobile]` `[BE]` … chọn được nhiều cái, thứ tự bấm là thứ tự ghép. `[spt 66]` tự suy từ sprint.

Tất cả sửa được trong Settings.

## Cấu trúc

```
app/                 màn hình + route handler (đóng vai trò backend)
  api/               endpoint nội bộ: transitions, csv, health, models
  board/ find/ new/ report/ settings/
lib/
  jira/              client, meta, sprints, issues, worklog, find, create
  ai/gemini.ts       sinh nội dung task
  db/                schema + kết nối SQLite
  settings.ts        cấu hình, seed từ .env.local lần đầu
  time.ts            múi giờ, định dạng timestamp cho Jira
data/app.db          SQLite — settings, draft, template, preset  ⚠ chứa API token
PLAN.md              thiết kế + ghi chép kỹ thuật về Jira API
```

## Chia sẻ cho người khác

```bash
./share.sh
```

Tạo file zip đã loại sẵn `node_modules`, `.next`, `.env.local` và `data/`.

**Đừng bao giờ gửi kèm `data/app.db`** — file đó lưu Jira API token và Google API key
ở dạng chữ thường. Người nhận tự tạo token riêng của họ.

## Xử lý sự cố

**`Test connection` báo 401** — token sai hoặc đã hết hạn. Token Atlassian giờ có hạn tối đa 1 năm.
Kiểm tra ở https://id.atlassian.com/manage-profile/security/api-tokens, và email phải đúng email
đăng nhập Atlassian.

**Gemini báo 404 "no longer available"** — Google khai tử model theo lịch riêng của họ.
Đổi model trong Settings; xem danh sách gọi được tại http://localhost:3000/api/ai/models

**Board trống** — mặc định lọc theo sprint đang chạy. Nếu sprint đó bạn chưa có subtask nào,
board sẽ chỉ ra các Task cấp trên kèm nút **+ Task con**. Hoặc đổi bộ lọc sang *Mọi sprint*.

**Kiểm tra nhanh toàn hệ thống** — http://localhost:3000/api/health trả về trạng thái DB,
cấu hình và kết nối Jira.
