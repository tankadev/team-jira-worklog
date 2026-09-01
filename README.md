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
- **Tiền tố title** `[Mobile]` `[BE]` … chọn được nhiều cái, thứ tự bấm là thứ tự ghép. `[SPT-69]` tự suy từ sprint.
- **Start date và due date là bắt buộc** khi tạo task — nút *Tạo trên Jira* không bật cho tới khi chọn đủ.

Tất cả sửa được trong Settings.

## Board dùng chung cho nhiều team

Một project Jira có thể chứa nhiều board, mỗi board là một filter theo label — ví dụ project
`VT` có `CTALK-TEAM` (`labels in (ctalk)`) và `HIR-TEAM` cạnh nhau. Khi đó vào
**Settings → Team trên board** bấm **Dò từ board**; app đọc filter của board rồi điền sẵn ba giá trị:

| Giá trị | Tác dụng |
|---|---|
| **Label của team** | Lọc mọi màn hình theo label này, và tự gắn vào mọi task app tạo ra. Thiếu label thì task không hiện trên board của team. |
| **Tiền tố bắt buộc** | Luôn đứng đầu title, không bỏ chọn được — ví dụ `[CTALK]`. |
| **Lọc sprint theo tên** | Danh sách sprint của board chung có cả sprint team khác. Không lọc thì "sprint đang chạy" có thể trỏ nhầm sang sprint của team bạn. |

Task sai quy ước (thiếu label, thiếu tiền tố, thiếu ngày) hiện badge cảnh báo ngay trên board,
và sửa ngày được tại chỗ bằng chip ngày trên mỗi dòng.

Để trống cả ba nếu board chỉ có một team — app chạy y như cũ.

> **Story point khi field không nằm trên screen.** Có project company-managed để Story Points
> ngoài mọi screen và ước lượng qua backlog. Lúc đó `createmeta` không khai báo field, nên app
> lấy field ước lượng từ chính cấu hình board và ghi qua endpoint estimation của board — cần
> **Board id** trong Settings mới ghi được point.

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
Nếu đã đặt **Label của team**, board còn lọc theo label đó — task được giao cho bạn nhưng thiếu
label sẽ không hiện. Xoá ô label trong Settings để xem tất cả.

**Sprint "đang chạy" sai team** — board dùng chung liệt kê cả sprint của team khác, và sprint đó
có thể đang `active` trong khi sprint của bạn còn `future`. Điền **Lọc sprint theo tên** trong
Settings (ví dụ `CTALK`).

**Đổi board mà màn hình vẫn như cũ** — field id và issue type được cache 24h theo project.
Bấm *Lưu settings* sẽ xoá cache đó; nếu vẫn lạ thì bấm **Làm mới** trên board.

**Kiểm tra nhanh toàn hệ thống** — http://localhost:3000/api/health trả về trạng thái DB,
cấu hình và kết nối Jira.
