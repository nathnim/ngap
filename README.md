# Bản sao số Ngập Đô thị

TS. Đặng Minh Tân · Bộ môn Đường bộ – Sân bay · Trường Đại học Giao thông Vận tải

## Cấu trúc thư mục

| Tệp | Nội dung |
|---|---|
| `index.html` | Khung giao diện (bảng điều khiển, bản đồ) |
| `style.css` | Giao diện, màu, chữ, sáng/tối |
| `core.js` | **Lõi tính toán**, không đọc giao diện: lưới hóa OSM, DEM, biểu đồ mưa thiết kế, mô hình dòng chảy mặt 2D (Manning), thống kê ngập, ngưỡng tác động giao thông |
| `data-lich-su.js` | **Dữ liệu lịch sử ngập** Hà Nội, TP.HCM: điểm ngập, trận ngập, lượng mưa, độ sâu, nguồn tham khảo |
| `app.js` | Giao diện dự báo: tải OSM/DEM, điều khiển mô phỏng, biểu đồ, xuất CSV |
| `lich-su.js` | Giao diện lịch sử ngập: bản đồ theo trận và tần suất, danh mục nguy cơ, tài liệu tham khảo, nhập/xuất |
| `truc-tuyen.js` | Radar mưa (RainViewer), tìm kiếm (Photon), lộ trình tránh ngập (OSRM), báo điểm ngập |

Thứ tự nạp: Leaflet → core.js → data-lich-su.js → app.js → lich-su.js → truc-tuyen.js.

## Bổ sung trận ngập

Mở `data-lich-su.js`:
1. Thêm điểm mới vào `HP` nếu chưa có: `id:["HN","Tên hiển thị","Tuyến chính","Tuyến cắt",vĩ độ,kinh độ]`.
2. Thêm trận vào `HE` với `src` là danh sách `[tên nguồn, url]` và `pts` là `[id điểm, độ sâu cm | [min,max] | null]`.

Nguồn tự được đánh số và liệt kê ở mục *Tài liệu tham khảo* cuối bảng Lịch sử ngập.

## Chạy

Mở `index.html` bằng Chrome/Edge (cần Internet), hoặc đưa cả thư mục lên GitHub Pages.
Không chạy được trong khung artifact của claude.ai vì khung này chặn ảnh nền bản đồ và dữ liệu trực tuyến.

## Kiểm tra nhanh lõi tính toán (Node.js)

```
node -e 'const FC=require("./core.js"); console.log(FC.makeHyeto({P:100,D:1,tail:1,shape:"peak"}).arr.length)'
```
