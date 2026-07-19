#!/usr/bin/env bash
# Đóng gói source để gửi cho người khác.
#
# Loại bỏ hai nhóm:
#   - nặng và tái tạo được: node_modules, .next
#   - CHỨA BÍ MẬT: .env.local, và data/ vì app.db lưu Jira token + Google API key
#     dưới dạng chữ thường trong bảng settings.
set -euo pipefail

cd "$(dirname "$0")"

NAME="jira-logwork-$(date +%Y%m%d).zip"
OUT="../$NAME"

rm -f "$OUT"

zip -r -q "$OUT" . \
  -x '*/node_modules/*' 'node_modules/*' \
  -x '*/.next/*' '.next/*' \
  -x 'data/*' '*/data/*' \
  -x '.env.local' '*/.env.local' \
  -x '.env' '*/.env' \
  -x '.git/*' '*/.git/*' \
  -x '.claude/*' '*/.claude/*' \
  -x '*.DS_Store' \
  -x '*.log' \
  -x '*.zip'

echo "Đã tạo: $(cd .. && pwd)/$NAME  ($(du -h "$OUT" | cut -f1))"
echo
echo "Kiểm tra lại không lọt bí mật:"
if unzip -l "$OUT" | grep -qE '\.env\.local|data/app\.db'; then
  echo "  ✗ CẢNH BÁO: có file bí mật trong zip, đừng gửi đi!"
  exit 1
fi
echo "  ✓ không có .env.local"
echo "  ✓ không có data/app.db"
echo
echo "Người nhận chạy:  npm install && cp .env.local.example .env.local"
echo "rồi tự điền token của họ, xem README.md"
