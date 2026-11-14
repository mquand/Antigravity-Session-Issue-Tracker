# Antigravity Session & Issue Tracker (VS Code Extension)

**Tiếng Việt** | [English](README.md)

[![Visual Studio Code](https://img.shields.io/badge/VS%20Code-Extension-blue.svg)](https://marketplace.visualstudio.com)
[![GitHub Release](https://img.shields.io/github/v/release/mquand/Antigravity-Session-Issue-Tracker?color=brightgreen)](https://github.com/mquand/Antigravity-Session-Issue-Tracker/releases)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> Extension trực quan, siêu nhẹ và thời gian thực (real-time) giúp theo dõi, quản lý, phân loại và chuyển đổi nhanh giữa các session làm việc của **Google Antigravity** trực tiếp ngay trong VS Code & Antigravity IDE. Hỗ trợ toàn diện cả **Issue/Ticket-based workflow (`#xxxx`)** lẫn **Chat tự do hàng ngày**.

<p align="center">
  <img src="resources/preview.png" alt="Antigravity Session Deck Preview" width="460" />
</p>

---

## 💡 Vấn đề giải quyết

Khi sử dụng Google Antigravity (hoặc Antigravity IDE) ở cường độ cao:
- Bạn thường mở nhiều task cùng lúc nhưng không biết task nào **đang chạy**, task nào **đã xong**, task nào **đang dừng chờ duyệt lệnh hoặc câu hỏi (`need accept`/`question`)**.
- Lịch sử chat có nhiều task cùng lúc, khó tìm lại đúng ngữ cảnh cũ.
- Khi cần duyệt code hoặc muốn quay lại cuộc trò chuyện cũ, phải tìm ID thủ công.

**Antigravity Session Manager** quét trực tiếp SQLite Database trung tâm (`conversation_summaries.db`) và nhật ký chi tiết (`transcript.jsonl`) tại `~/.gemini/antigravity/` để tạo thành một bảng Dashboard trực quan 1-chạm ngay trên thanh công cụ của VS Code / Antigravity IDE.

---

## ✨ Tính năng nổi bật

### 1. Giám sát trạng thái chính xác theo Runtime Antigravity
- 🔵 **ĐANG CHẠY (`Running`)**: Nhận diện theo trạng thái `CASCADE_RUN_STATUS_RUNNING` hoặc `not_fully_idle = 1` và process lock `presence/<id>.lock`. Khi Antigravity đang thực sự suy nghĩ, sinh mã hoặc chạy tool thì hiển thị Đang chạy. Khi Antigravity đã hoàn tất turn và chuyển sang trạng thái nghỉ (`idle`), extension sẽ tự động cập nhật sang **Đã hoàn thành**.
- 🟡 **CHỜ DUYỆT / CÂU HỎI (`Need Accept` / `Question`)**: Phát hiện ngay khoảnh khắc Antigravity dừng lại hỏi thêm thông tin (`ask_question`) hoặc chờ phê duyệt thay đổi code.
- 🟢 **ĐÃ HOÀN THÀNH (`Done`)**: Các phiên làm việc đã hoàn tất turn, hiển thị thời gian tương đối (`vừa xong`, `5 phút trước`...).
- 🔴 **LỖI / THẤT BẠI (`Failed`)**: Nhận diện các session bị lỗi hoặc tiến trình bị huỷ.

### 2. Tương thích 100% Antigravity & Gemini CLI
Extension hoạt động bằng cách đọc trực tiếp dữ liệu SQLite và nhật ký local tại `~/.gemini/antigravity/`:
- **Tốc độ cực nhanh**: Đọc dữ liệu từ SQLite DB tập trung kết hợp bộ nhớ cache `mtimeMs` thông minh.
- Bất kể bạn chạy qua Antigravity IDE, VS Code Extension hay Antigravity CLI (`agy`), extension đều nhận diện trơn tru.

### 3. Tự động tương thích 2 chế độ làm việc
- **Làm việc tự do (Không dùng Issue)**: Nếu bạn chỉ chat fix bug, trao đổi thông thường, extension tự động lấy nội dung câu hỏi đầu tiên làm tiêu đề, tuyệt đối **không hiện rác `#0`**.
- **Làm việc theo Issue / Ticket**: Tự động nhận diện cú pháp `#<số>` (ví dụ: `#100`, `#7152`, `#5433`, `#7001`) để gắn **Badge Issue màu xanh** nổi bật và làm sạch các đoạn text trùng lặp.

### 4. Thông báo đa điểm tiện lợi (2 vị trí)
- **Thanh Activity Bar (Sidebar bên trái)**: Icon Antigravity đặc trưng kèm **Badge số** nhảy realtime khi có task đang chạy hoặc chờ duyệt.
- **Thanh Status Bar (Dưới đáy màn hình)**: Hiển thị nhanh số task đang xử lý (ví dụ: `✨ Antigravity: 1 Đang chạy` hoặc `✨ Antigravity: Idle`), 1 click mở ngay panel.

### 5. 1-Click mở đúng cuộc trò chuyện (Instant Session Jump)
Click vào bất kỳ card nào trên giao diện ➔ Kích hoạt lệnh `antigravity.openConversation` để chuyển thẳng đến đúng session đó ngay lập tức trong Antigravity IDE / VS Code.

### 6. Thống kê kỹ thuật rõ ràng & Layout thoáng đãng
Giao diện card được thiết kế hiện đại, dễ đọc cho người quản lý nhiều session:
- 🕒 **Thời gian tương đối**: `vừa xong`, `3 phút trước`, `2 giờ trước`...
- 🌿 **Git Branch & Repo**: Nhận diện đúng repo con và nhánh git đang làm việc.
- ✨ **Model AI**: `Gemini 3.8 Flash`, `Gemini 3.8 Pro`...
- 🗄️ **Tokens In / Out**: Ghi rõ ràng `in: 540K • out: 60K` (phân biệt rõ ràng token đầu vào và token đầu ra).
- 💬 **Số lượt tương tác (Turns)**: Đếm chính xác số lần gửi prompt trao đổi trong phiên.
- 🆔 **Session ID rút gọn**: 8 ký tự đầu để tra cứu nhanh.

### 7. Nút Tạo phiên mới & Làm mới nhanh
- ➕ **Nút Tạo phiên mới (+)**: Mở ngay một phiên chat Antigravity mới tinh chỉ với 1 click.
- 🔄 **Nút Làm mới (Refresh)**: Quét lại toàn bộ danh sách sessions ngay lập tức.
- ⚙️ **Nút Cài đặt (Settings)**: 1 click mở ngay trang cấu hình extension trong VS Code Settings.

### 8. Xoá phiên hội thoại trực tiếp & An toàn
- Di chuột qua bất kỳ card session nào sẽ xuất hiện nút **Thùng rác (Xoá)**.
- Khi bấm xoá, một hộp thoại xác nhận an toàn (`Modal`) sẽ hiện ra.
- Xác nhận xoá sẽ dọn dẹp triệt để trong `conversation_summaries.db`, thư mục `brain/<id>` và file lock tương ứng.

### 9. Thu gọn / Mở rộng nhóm & Hỗ trợ Git Worktrees
- Các nhóm **ĐANG CHẠY**, **CHỜ DUYỆT**, **ĐÃ HOÀN THÀNH** có thể click vào tiêu đề để thu gọn hoặc mở rộng tùy ý.
- Tự động quét và phát hiện các Git worktree liên quan trong workspace. Menu dropdown lọc nhanh theo từng Worktree (`⑂ worktree: <tên nhánh>`).

### 10. Tự động kiểm tra & Cập nhật từ GitHub Releases
- Tích hợp sẵn cơ chế kiểm tra phiên bản mới từ GitHub Releases.
- Khi có bản mới, VS Code sẽ hiển thị thông báo để bạn cập nhật chỉ với 1 cú click chuột.

---

## ⚙️ Cấu hình Extension (Settings)

Bạn có thể tuỳ chỉnh trong `Settings` (`Cmd + ,` trên macOS hoặc `Ctrl + ,` trên Windows/Linux) ➔ tìm `Antigravity Session Manager`:

| Cấu hình | Mặc định | Ý nghĩa |
| :--- | :--- | :--- |
| `antigravitySessionManager.storagePath` | `~/.gemini/antigravity` | Đường dẫn thư mục lưu trữ dữ liệu của Antigravity |
| `antigravitySessionManager.autoRefreshInterval` | `10` | Chu kỳ tự động quét lại (giây) |
| `antigravitySessionManager.language` | `auto` | Ngôn ngữ hiển thị (`auto` / `vi` / `en`) |
| `antigravitySessionManager.showInExplorer` | `true` | Hiển thị bảng Sessions trong thanh Explorer |
| `antigravitySessionManager.showInSourceControl`| `true` | Hiển thị bảng Sessions trong thanh Git Source Control |
| `antigravitySessionManager.workspaceRoot` | `""` | Đường dẫn thư mục gốc chứa các dự án (để trống để tự nhận diện) |
| `antigravitySessionManager.defaultRepo` | `""` | Tên repository mặc định khi session không xác định được repo |

---

## 🛠️ Cài đặt

### Cách 1: Cài đặt từ file đóng gói `.vsix` (Khuyên dùng)
1. Tải file `.vsix` mới nhất từ [GitHub Releases](https://github.com/mquand/Antigravity-Session-Issue-Tracker/releases).
2. Mở VS Code / Antigravity IDE, nhấn `Cmd + Shift + P` (macOS) hoặc `Ctrl + Shift + P` (Windows/Linux).
3. Gõ `Extensions: Install from VSIX...` và chọn file `.vsix` vừa tải.
4. Tải lại cửa sổ (`Developer: Reload Window`) để áp dụng.

### Cách 2: Cài đặt qua dòng lệnh (CLI)
```bash
code --install-extension antigravity-session-deck-0.3.0.vsix
```

---

## 💻 Hướng dẫn phát triển (Development)

Nếu bạn muốn tự chỉnh sửa hoặc đóng góp tính năng mới:

```bash
# 1. Clone repository
git clone https://github.com/mquand/Antigravity-Session-Issue-Tracker.git
cd Antigravity-Session-Issue-Tracker

# 2. Cài đặt các dependencies
npm install

# 3. Biên dịch TypeScript
npm run compile

# 4. Chạy chế độ watch tự động biên dịch khi sửa code
npm run watch

# 5. Đóng gói file .vsix
npx @vscode/vsce package
```

Nhấn phím `F5` trong VS Code để mở cửa sổ Extension Development Host và test trực tiếp extension!

---

## 📄 Bản quyền (License)

Dự án được phát hành theo giấy phép [MIT License](LICENSE).
