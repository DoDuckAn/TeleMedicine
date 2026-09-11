# Realtime lich hen va thong bao

## Cach chay

- BE: `npm run dev` (mac dinh cong 4000).
- FE: `npm run dev` (mac dinh cong 3000).
- Socket.IO dung chung HTTP server voi REST, path `/socket.io`. Khong can API key moi, Redis hay Firebase cho realtime trong web.
- FE lay origin tu `NEXT_PUBLIC_API_BASE_URL`. Vi du `http://localhost:4000/api/v1` thi socket ket noi `http://localhost:4000`.
- Khi truy cap qua LAN, API base URL phai tro toi IP may BE, khong dung localhost cua dien thoai. Danh sach origin duoc phep nam trong `src/config/cors.ts`, dung chung REST va socket.
- Deploy HTTPS: proxy can forward `/socket.io` (HTTP polling va WebSocket upgrade), cung origin voi API. Mo origin FE thuc te trong allowlist.

## Xac thuc

FE gui access token qua `auth: { token }`, khong gui token tren query string.
BE kiem tra JWT, user ACTIVE, tokenVersion; role va user ID lay tu DB.
Client khong co lenh join room cua user khac. Room duoc server gan.
BE kiem tra lai phien truoc khi phat event va moi 30 giay khi ket noi dang rong.
Token het han: FE dung refresh flow hien co de cap nhat token va ket noi lai.
Tai khoan bi khoa/tokenVersion bi thu hoi: socket bi ngat, FE xoa session.
Logout/doi tai khoan/token moi: FE huy listeners va ket noi cu.

## Su kien server gui

| Event | Payload | Nguoi nhan / tac dung |
| --- | --- | --- |
| `appointments.changed` | Khong co | Benh nhan, bac si cua lich hen va admin; tai lai danh sach, chi tiet, lich su, thong ke lien quan |
| `notifications.changed` | Khong co | Chu so huu thong bao; tai lai inbox, so chua doc, preferences |
| `schedule.changed` | `{ doctorId }` | FE doctor/admin invalidate lich lien quan; patient bo qua event nay |
| `session.invalid` | `{ code }` | Client co phien khong hop le; refresh hoac logout |

Socket khong chua ho so benh nhan, ly do kham, noi dung thong bao hay link Meet.
No chi yeu cau FE tai lai API hien co, API van kiem tra quyen nhu truoc.

## Nhung thao tac da noi realtime

- Tao lich, xac nhan, tu choi, huy, hoan tat lich hen.
- Lich het han cho duyet va NO_SHOW do cron xu ly.
- Tao nghi dot xuat huy cac lich lien quan; cap nhat lich tuan, restore/delete override.
- Admin cap nhat lich bac si trong ho so.
- Danh dau mot/tat ca thong bao da doc va cap nhat preferences: dong bo cac tab cua cung tai khoan.
- Reminder den `scheduledAt`: cron hien co phat cap nhat inbox; do cron chay moi phut nen reminder co do tre toi khoang mot phut, chua tinh thoi gian xu ly.

Event chi phat sau khi service/transaction thanh cong. Loi socket khong dao nguoc lich hen da luu.
FE gom invalidation trong 150ms de tranh goi lai API nhieu lan cho cung thay doi.
Khi ket noi lai, quay lai tab hoac co mang tro lai, FE tai lai du lieu.
Neu socket khong ket noi duoc, tab dang mo fallback tai lai moi 60 giay.

## Pham vi va gioi han

- Patient khong tai lai slot qua socket, ke ca khi socket reconnect. Dat slot da bi chiem se bi API tu choi; FE thong bao va tai lai lich trong. Public chua dang nhap cung khong realtime.
- Badge Thong bao cua patient/doctor la so chua doc. Badge Yeu cau kham la so pending con han; Lich tu van la so CONFIRMED co startAt tu hien tai, khong tinh buoi dang kham. Dung API loc/dem hien co (limit=1), khong tao route dem moi.
- Badge lich bac si cap nhat theo event appointments.changed va moi 60 giay khi tab dang mo de loai lich da bat dau/het han. Badge bang 0 thi an; tren 99 hien 99+, hover hien so day du.

- Socket chi hoat dong khi web da dang nhap va dang chay. Chua tich hop FCM nhan push tren FE; khong thay the thong bao he dieu han khi dong web.
- Realtime du lieu khong phu thuoc tuy chon push/email. Tat push khong lam danh sach lich dung cap nhat.
- Trang public chua dang nhap khong ket noi socket.
- Hien tai server realtime va cron chay cung mot process Node. Khi scale nhieu instance hoac tach worker, can adapter/bus dung chung (vi du Redis) va phan cong cron, khong chi tang so process.
- Su kien khong co persistent replay/outbox. Neu process gap loi ngay sau commit, client co the lo event; reconnect/quay lai tab se tai lai tu DB. REST/DB la nguon du lieu chinh.

## Kiem thu

`npm run test:realtime`: HTTP + socket + PostgreSQL that; tao user/lich test rieng va tu xoa, gia lap Google Meet (khong tao phong that).
Kiem tra tao/confirm/reject/cancel/complete, override huy lich, nhieu tab, reminder, reconnect, token het han/sai/thu hoi va user bi khoa, cach ly tai khoan khong lien quan.
`npm run test:typecheck`: kiem tra TypeScript test.

Thu thu cong: mo hai profile trinh duyet, dang nhap patient va doctor. Giu trang yeu cau kham cua doctor; patient dat lich. Doctor se thay yeu cau moi ma khong refresh. Giu trang chi tiet lich cua patient; doctor xac nhan/tu choi thi trang patient tu cap nhat.
