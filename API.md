# TeleMedicine Backend API Context

Realtime lich hen/thong bao: Socket.IO dung chung cong API, path `/socket.io`,
xac thuc bang `auth: { token: accessToken }`. Contract event, reconnect, cau hinh
va gioi han: [docs/realtime-setup.md](docs/realtime-setup.md).

Tai lieu ban giao contract backend hien tai de lam frontend hoac tiep tuc phat
trien trong session moi. Noi dung lay tu route, Zod schema va service trong `src/`.

## 1. Quy uoc chung

- Base URL local: `http://localhost:4000/api/v1`
- JSON request: `Content-Type: application/json`
- Avatar: `multipart/form-data`, field file `avatar`
- Auth: `Authorization: Bearer <accessToken>`
- Role: `PATIENT`, `DOCTOR`, `ADMIN`
- User status: `ACTIVE`, `DISABLED`
- Timezone: env `APP_TIMEZONE`, mac dinh `Asia/Ho_Chi_Minh`
- Date-time input: ISO 8601 co offset, vi du `2026-09-01T08:00:00+07:00`
- Date-time output: JSON UTC, vi du `2026-09-01T01:00:00.000Z`
- Slot mac dinh 30 phut; availability mac dinh 7 ngay.

Success:

```json
{"success":true,"data":{}}
```

Error:

```json
{
  "success":false,
  "error":{"code":"VALIDATION_ERROR","message":"...","details":[]}
}
```

`details` co the khong ton tai. Status thuong gap: `400`, `401`, `403`, `404`,
`409`, `429`, `500`, `502`, `503`.

Pagination:

```json
{"items":[],"pagination":{"page":1,"limit":20,"total":0,"totalPages":0}}
```

Mac dinh `page=1`, `limit=20`; limit toi da 100.

## 2. Model va enum quan trong

### AppointmentStatus

```text
PENDING_CONFIRMATION -> CONFIRMED -> COMPLETED
PENDING_CONFIRMATION -> REJECTED | EXPIRED
PENDING_CONFIRMATION | CONFIRMED -> CANCELLED
CONFIRMED -> NO_SHOW
```

- Pending giu slot 15 phut.
- Confirmed co reservation `expiresAt=null`.
- Expired khi qua `confirmationDueAt`.
- No-show khi confirmed qua `endAt + 30 phut` ma doctor chua complete.

Enum khac:

- `Gender`: `MALE`, `FEMALE`, `OTHER`, `UNSPECIFIED`.
- `SpecialtyStatus`: `ACTIVE`, `DISABLED`.
- `DoctorScheduleOverrideType`: `AVAILABLE`, `UNAVAILABLE`.
- `DoctorReviewStatus`: `PUBLISHED`, `HIDDEN`.
- `PushDevicePlatform`: `WEB`, `ANDROID`, `IOS`.

### WeeklySchedule

```json
{
  "MONDAY":[
    {"startTime":"08:00","endTime":"12:00"},
    {"startTime":"14:00","endTime":"17:00"}
  ],
  "TUESDAY":[],
  "WEDNESDAY":[],
  "THURSDAY":[],
  "FRIDAY":[],
  "SATURDAY":[],
  "SUNDAY":[]
}
```

Khoang trong cung ngay khong overlap; moc gio phai thang theo slot duration.

### Appointment response

Tuy route co the gom:

```text
id, doctorID, patientID, startAt, endAt, visitReason, status,
confirmationDueAt, rejectionReason, cancellationReason, cancelledBy,
respondedAt, cancelledAt, completedAt, noShowAt, meetingUrl,
meetingSpaceName, meetingCreatedAt, meetingClosedAt,
meetingCleanupPending, meetingCleanupAttempts, meetingCleanupLastError,
createdAt, updatedAt, doctor, patient, slotReservation, statusHistory
```

FE khong nen phu thuoc `meetingSpaceName` va `meetingCleanup*`; day la metadata BE.

### Meeting URL

- Chi tao Google Meet khi doctor confirm, khong tao luc patient book.
- Patient chi nhan `meetingUrl` khi appointment `CONFIRMED`, tu `startAt - 15 phut`
  den `endAt`; ngoai khoang backend tra `null`.
- Doctor/admin khong bi policy an link nay.
- Complete/cancel/no-show dong va khoa Meet; loi cleanup duoc cron retry.

## 3. Auth va session

### `POST /auth/register/patient` - Public

FE dung Firebase Phone Auth gui OTP, lay Firebase ID token roi gui:

```json
{
  "firebaseIdToken":"firebase-token-min-100-chars",
  "fullName":"Nguyen Van A",
  "dateOfBirth":"1990-01-01",
  "gender":"MALE"
}
```

Phone lay tu Firebase token, khong co phone trong body. Response `201`:

```json
{
  "accessToken":"...",
  "refreshToken":"...",
  "user":{"id":"...","role":"PATIENT","status":"ACTIVE","phone":"090...","email":null}
}
```

### `POST /auth/login/patient` - Public

Body `{ "firebaseIdToken":"..." }`. Response session nhu register. Patient khong
co password noi bo.

### `POST /auth/login/staff` - Public

Body `{ "email":"doctor@example.com", "password":"..." }`. Dung cho doctor/admin.
Response session nhu tren.

### Doctor forgot password - Public

- `POST /auth/doctors/password/forgot/request-otp`
  - Body `{email}`; response `201` message chung, khong tiet lo email co ton tai.
- `POST /auth/doctors/password/forgot/reset`
  - Body `{email,otp,newPassword,confirmPassword}`.
  - OTP 6 so; password 8-72 ky tu.
  - Output `{passwordChanged:true,sessionsRevoked:true}`.

### Session routes

| Method | Route | Auth | Input | Output/tac dung |
|---|---|---|---|---|
| GET | `/auth/me` | Yes | none | User + patientProfile/doctorProfile |
| POST | `/auth/refresh` | Refresh token | `{refreshToken}` | Rotate va tra access/refresh moi |
| POST | `/auth/logout` | Refresh token | `{refreshToken}` | Revoke mot session |
| POST | `/auth/logout-all` | Yes | none | Revoke all, tang tokenVersion |

`GET /auth/me` tra `id,role,status,phone,email,createdAt` va profile theo role.

## 4. Profile patient

Tat ca can role `PATIENT`.

### `GET /patients/me`

Output:

```text
id, phone, email,
patientProfile{fullName,dateOfBirth,gender,address,medicalHistory,drugAllergies,avatar}
```

### `PATCH /patients/me`

Body partial, it nhat mot field:

```json
{
  "email":"patient@example.com",
  "fullName":"Nguyen Van A",
  "dateOfBirth":"1990-01-01",
  "gender":"MALE",
  "address":"TP HCM",
  "medicalHistory":"...",
  "drugAllergies":"..."
}
```

`email`, `address`, `medicalHistory`, `drugAllergies` nhan `null`. Xoa email tu
dong tat email notification. Output `{email,patientProfile}`.

### `POST /patients/me/avatar`

Multipart field `avatar`; JPEG/PNG/WebP, toi da 5 MB. Output `{avatarUrl}`.

## 5. Doctor public va profile

### Public

| Method | Route | Input | Output/tac dung |
|---|---|---|---|
| GET | `/doctors` | Query xem duoi | Doctor ACTIVE co pagination |
| GET | `/doctors/:doctorId` | path ID | Full doctor, 10 review moi, rating summary |
| GET | `/doctors/:doctorId/schedule` | path ID | Chi slot con trong trong 7 ngay |
| GET | `/doctors/:doctorId/reviews` | Query review | Review PUBLISHED + summary |

Doctor list query:

```text
q?: tim ten doctor/ten-ma specialty
specialtyId?: string
sortBy?: name | rating (default name)
order?: asc | desc (default asc)
page?, limit?
```

Doctor item:

```text
userID,fullName,yearsOfExperience,qualifications,avatarUrl,bio,
specialties[{id,code,name}],ratingAverage,reviewCount
```

Availability output:

```json
{
  "doctorId":"...",
  "timezone":"Asia/Ho_Chi_Minh",
  "fromDate":"2026-09-01",
  "toDate":"2026-09-07",
  "slotDurationMinutes":30,
  "days":[{"date":"2026-09-01","slots":[{"startAt":"...","endAt":"..."}]}]
}
```

Availability = weekly + AVAILABLE override - UNAVAILABLE override - reservation
pending con han - reservation confirmed. Slot unavailable khong duoc tra ve.

Review public query: `rating?`, `sortBy=createdAt|rating`, `order`, pagination.
Patient hien thi bang `patientDisplayName` da mask.

### Doctor own profile - role DOCTOR

| Method | Route | Input | Output/tac dung |
|---|---|---|---|
| GET | `/doctors/me` | none | `{id,email,doctorProfile}` |
| PATCH | `/doctors/me` | partial profile | `{email,doctorProfile}` |
| POST | `/doctors/me/avatar` | multipart avatar | `{avatarUrl}` |
| POST | `/doctors/me/password/request-otp` | none | Gui OTP email, response `201` |
| PATCH | `/doctors/me/password` | body password | Doi password, revoke sessions |
| GET | `/doctors/me/statistics` | query statistics | Thong ke doctor |

Patch profile fields: `email`, `fullName`, `yearsOfExperience`,
`qualifications[]`, `bio`; it nhat mot field.

Change password body:

```json
{
  "currentPassword":"old-password",
  "otp":"123456",
  "newPassword":"new-password",
  "confirmPassword":"new-password"
}
```

## 6. Specialty

Specialty response:
`{id,code,name,description,status,deletedAt,createdAt,updatedAt,doctors[]}`.
Doctor item co `userID,fullName,yearsOfExperience,qualifications,avatarUrl,bio`.

### Public

| Method | Route | Output |
|---|---|---|
| GET | `/specialties` | Mang specialty ACTIVE kem doctor ACTIVE |
| GET | `/specialties/:specialtyId` | Specialty ACTIVE kem doctors |
| GET | `/specialties/:specialtyId/doctors` | Mang doctors |

### Admin

| Method | Route | Input/tac dung |
|---|---|---|
| GET | `/specialties/admin/all` | Tat ca ke ca DISABLED |
| POST | `/specialties` | `{code,name,description?}`, tao ACTIVE |
| PATCH | `/specialties/:specialtyId` | Partial `{code,name,description,status}` |
| DELETE | `/specialties/:specialtyId` | Soft delete, khong hard delete |
| POST | `/specialties/:specialtyId/doctors/:doctorId` | Gan doctor |
| DELETE | `/specialties/:specialtyId/doctors/:doctorId` | Go doctor |

`code` uppercase, pattern `[A-Z0-9_-]`, dai 2-32; code va name unique. PATCH
`status=ACTIVE` restore va xoa `deletedAt`; DISABLED gan `deletedAt`.

## 7. Appointment

### `POST /appointments` - PATIENT

```json
{
  "doctorId":"doctor-id",
  "startAt":"2026-09-01T08:00:00+07:00",
  "visitReason":"Mo ta trieu chung toi thieu 10 ky tu"
}
```

`patientId` lay tu token. Output `201` appointment pending. Side effects:

- Check hai user ACTIVE, slot nam trong availability va patient khong trung gio.
- Tao appointment va reservation het han sau 15 phut.
- Ghi status history.
- Tao notification booking cho patient va request cho doctor.

### List/history

| Method | Route | Role | Query/output |
|---|---|---|---|
| GET | `/appointments/upcoming` | PATIENT | page/limit; pending con han + confirmed sap toi |
| GET | `/appointments/doctor/pending` | DOCTOR | page/limit; request con confirm duoc |
| GET | `/appointments/doctor/upcoming` | DOCTOR | page/limit; confirmed chua ket thuc |
| GET | `/appointments/history` | PATIENT,DOCTOR | History cua role login |
| GET | `/appointments/patient/history` | PATIENT | Lich su kham, doctor/specialty/review |
| GET | `/appointments/doctor/history` | DOCTOR | Lich su tu van, patient/review |
| GET | `/appointments/admin/all` | ADMIN | Tat ca; them doctorId/patientId filter |

History query:

```text
status?: moi AppointmentStatus
from?, to?: ISO date-time; from <= to
order?: asc | desc (default desc)
page?, limit?
```

### `GET /appointments/:appointmentId` - PATIENT, DOCTOR, ADMIN

Chi owner patient/doctor hoac admin. Output full detail kem doctor, patient va
`statusHistory[]`. Patient nhan meeting URL theo join policy.

### Status actions

| Method | Route | Role | Body/tac dung |
|---|---|---|---|
| POST | `/appointments/:appointmentId/confirm` | DOCTOR owner | Khong body; tao Meet, CONFIRMED, reminders |
| POST | `/appointments/:appointmentId/reject` | DOCTOR owner | `{reason}`; REJECTED, xoa reservation, bao patient |
| POST | `/appointments/:appointmentId/complete` | DOCTOR owner | Khong body; sau startAt, COMPLETED, dong Meet |
| POST | `/appointments/:appointmentId/cancel` | PATIENT/DOCTOR/ADMIN | `{reason}`; CANCELLED va dong Meet |

`reason` dai 1-2000. Cancel chi
cho pending/confirmed va phai truoc startAt it nhat 30 phut. Actor thuong chi bao
ben con lai; admin cancel bao ca doctor va patient.

Confirm tao reminder 1 gio va 15 phut cho ca hai ben neu thoi diem reminder van
nam trong tuong lai.

## 8. Doctor schedule management

Base `/doctor-schedule`; tat ca route can `DOCTOR`, doctorId lay tu token.

| Method | Route | Input/output |
|---|---|---|
| GET | `/weekly` | `{doctorId,timezone,slotDurationMinutes,weeklySchedule}` |
| PUT | `/weekly` | `{weeklySchedule}`; output them `updatedAt` |
| GET | `/overrides` | Query from/to/type; `{from,to,items}` |
| POST | `/overrides` | Tao `ranges[]` atomically |
| POST | `/overrides/restore` | Cat/xoa override trong `ranges[]` |
| DELETE | `/overrides/:overrideId` | Xoa toan bo override; `{removed:true}` |
| GET | `/calendar` | Ma tran lich doctor mot tuan |

Override body:

```json
{
  "type":"UNAVAILABLE",
  "reason":"Nghi dot xuat",
  "ranges":[
    {"startAt":"2026-09-01T08:00:00+07:00","endAt":"2026-09-01T10:00:00+07:00"},
    {"startAt":"2026-09-02T14:00:00+07:00","endAt":"2026-09-02T17:00:00+07:00"}
  ]
}
```

Rules: 1-100 ranges, khong overlap, moi range toi da 31 ngay, moc thang theo slot;
range lien nhau duoc merge. UNAVAILABLE bat buoc reason va se huy atomically moi
appointment pending/confirmed overlap voi ly do doctor nghi dot xuat, xoa
reservation, huy reminder, bao patient va dong Meet.

Create output:
`{overrides,createdOverrideCount,cancelledAppointmentCount,cancelledAppointmentIds}`.

Restore body `{ranges:[{startAt,endAt}]}`. Restore ve weekly schedule goc cho ca
AVAILABLE/UNAVAILABLE. Neu cat giua, BE xoa override cu va tao hai khoang con lai.
Output:
`{restoredRanges,removedOverrideCount,removedOverrideIds,replacementOverrideCount,replacementOverrides}`.

Overrides GET mac dinh tu now den 28 ngay sau; item:
`{id,type,startAt,endAt,reason,createdAt,updatedAt}`.

Calendar query `weekStart=YYYY-MM-DD` tuy chon, phai la thu Hai. Output:

```text
doctorId,timezone,slotDurationMinutes,weekStart,weekEnd,
days[{date,weekday,overrides[],slots[{
  startAt,endAt,status,isBookable,appointment,override
}]}]
```

## 9. Review doctor

Mot cap patient-doctor chi co toi da **mot review**, khong theo appointment. Can co
it nhat mot appointment `COMPLETED`. Review tuy chon, khong sinh notification.

| Method | Route | Role | Input/output |
|---|---|---|---|
| GET | `/doctor-reviews/:doctorId/eligibility` | PATIENT | hasCompletedAppointment/canReview/reason/review |
| POST | `/doctor-reviews/:doctorId` | PATIENT | `{rating:1..5,comment?}`, output `201` review |
| GET | `/doctors/:doctorId/reviews` | Public | Published reviews + summary |
| GET | `/doctor-reviews/me` | DOCTOR | rating/status/replied/page/limit |
| POST | `/doctor-reviews/:reviewId/reply` | DOCTOR owner | `{content}`; chi reply mot lan |
| GET | `/doctor-reviews/admin` | ADMIN | q/doctorId/patientId/rating/status/sort/page |
| PATCH | `/doctor-reviews/:reviewId/moderation` | ADMIN | `{status,reason?}` |

Eligibility reason: `ALREADY_REVIEWED`, `NO_COMPLETED_APPOINTMENT`, hoac `null`.
Hidden bat buoc reason. Rating summary chi tinh `PUBLISHED`; patient khong review
khong tham gia mau so.

## 10. Notification

Tat ca can authenticated, base `/notifications`.

| Method | Route | Input/output |
|---|---|---|
| POST | `/devices` | `{token,platform}`; upsert FCM, output `201` id/platform/time |
| DELETE | `/devices` | `{token}`; output `{removed:true}` |
| GET | `/` | unreadOnly/page/limit; inbox pagination |
| GET | `/unread-count` | `{count}` |
| PATCH | `/:notificationId/read` | Mark mot item, output row |
| PATCH | `/read-all` | `{updatedCount}` |
| GET | `/preferences` | Channel + event settings |
| PATCH | `/preferences` | Partial channels/events |

Inbox item:

```text
id,type,scheduledAt,readAt,createdAt,title,body,
appointment{id,startAt,status,doctor{userID,fullName},patient{userID,fullName}}
```

Preference:

```json
{
  "channels":{"push":true,"email":false},
  "events":{
    "bookingCreated":true,
    "requestCreated":true,
    "requestConfirmed":true,
    "requestRejected":true,
    "requestExpired":true,
    "appointmentCancelled":true,
    "appointmentCompleted":true,
    "reminder1Hour":true,
    "reminder15Minutes":true,
    "doctorNoShow":true
  }
}
```

Patch phai co it nhat mot field. Chi bat email neu user da cap nhat email.
`doctorNoShow` dang co trong schema nhung BE chu y khong tao event no-show cho
patient; FE nen tam an setting nay.

## 11. Admin

Tat ca base `/admin` can `ADMIN`.

### Doctor account

| Method | Route | Input/output |
|---|---|---|
| POST | `/doctors` | Create doctor body; output `201` user/profile |
| GET | `/doctors` | Filter/search/pagination |
| GET | `/doctors/:doctorId` | Full detail + history/count/rating |
| PATCH | `/doctors/:doctorId` | Partial update, output full detail |
| PATCH | `/doctors/:doctorId/status` | `{status,reason}` |
| GET | `/doctors/:doctorId/statistics` | Statistics query |

Create doctor:

```json
{
  "email":"doctor@example.com",
  "fullName":"Bac si A",
  "yearsOfExperience":5,
  "specialtyIds":["specialty-id"],
  "qualifications":["Bac si chuyen khoa I"],
  "avatarUrl":"https://...",
  "bio":"Gioi thieu toi thieu 10 ky tu",
  "weeklySchedule":{}
}
```

Password ban dau lay env `DEFAULT_DOCTOR_PASSWORD`. Specialty phai ACTIVE.

Doctor list query: `q`, `status`, `specialtyId`, `sortBy=fullName|createdAt`,
`order`, pagination. Item co profile, user email/status/lastLogin, specialties,
`_count`, `averageRating`.

Patch doctor fields: `email`, `fullName`, `yearsOfExperience`, `qualifications`,
`avatarUrl`, `bio`, `specialtyIds`, `weeklySchedule`.

### Patient account

| Method | Route | Input/output |
|---|---|---|
| GET | `/patients` | q/status/gender/sort/page/limit |
| GET | `/patients/:userId` | Full profile + statusHistory + counts |
| PATCH | `/patients/:userId/status` | `{status,reason}` |

Patient `q` tim name/phone/email; sortBy `fullName|createdAt`.

### Disable flow

Body: `{ "status":"DISABLED", "reason":"Ly do khoa" }`, reason 3-500 ky tu.

1. Doi status, tang `tokenVersion` neu disable.
2. Ghi `UserStatusHistory` cho ca doctor/patient.
3. Gan `revokedAt` cho refresh token con hieu luc.
4. Tat moi FCM device token.
5. Huy delivery notification dang `PROCESSING`.
6. Access token bi chan boi status; mo lai van sai tokenVersion, phai login lai.

Disable account khong tu dong huy appointment da co.

## 12. Statistics

Routes:

- `GET /admin/dashboard` - ADMIN, system.
- `GET /admin/doctors/:doctorId/statistics` - ADMIN, mot doctor.
- `GET /doctors/me/statistics` - DOCTOR, chinh minh.

Query `from?`, `to?`, `groupBy=day|week|month`; mac dinh 30 ngay, toi da 366 ngay.

Output:

```text
scope:{type:SYSTEM} | {type:DOCTOR,doctor{id,fullName,avatarUrl,status}}
range:{from,to,groupBy,timezone}
summary:{totalAppointments,resolvedAppointments,completedAppointments,
         completionRate,uniquePatients}
statusBreakdown:{moi AppointmentStatus: count}
appointmentsByPeriod:[{period,total,completed}]
```

System them:
`system:{newPatients,totalPatients,activePatients,activeDoctors,topDoctors}`.

`completionRate = COMPLETED / resolved * 100`; resolved gom completed, cancelled,
rejected, expired, no-show.

## 13. Cron, worker va integration

`startAppointmentJobs()` chay trong `src/server.ts`, moi phut va mot lan luc start.

Thu tu maintenance:

1. Expire toi da 20 pending appointment co `confirmationDueAt<=now`.
2. Xoa reservation, ghi system history, huy request delivery va tao
   `REQUEST_EXPIRED` cho patient.
3. Doi confirmed thanh no-show sau `endAt + 30 phut`.
4. Retry dong/khoa Meet dang `meetingCleanupPending`.
5. Gui push/email den han, gom reminder 1 gio va 15 phut.
6. Recover delivery ket PROCESSING, retry loi va cancel delivery qua cu.

Cron co `maintenanceRunning` trong mot process va conditional DB update de tranh
confirm/reject/cancel race. Neu scale nhieu replica, nen tach worker rieng hoac
them distributed lock.

External services:

- Firebase Phone Auth: patient register/login.
- Firebase FCM: push; FE register/go token qua `/notifications/devices`.
- SMTP: notification/reminder va doctor password OTP. `EMAIL_ENABLED=false` thi log.
- Cloudinary: avatar.
- Google Meet API: tao room luc confirm va end/khoa room luc cleanup.

Setup env xem `docs/external-services-setup.md` va `docs/firebase-push-setup.md`.

## 14. Health va source map

`GET /health` public, output `{status:"ok"}`; chi check Express, khong ping DB/service.

```text
/api/v1/auth             src/modules/auth
/api/v1/admin            src/modules/admin
/api/v1/specialties      src/modules/specialties
/api/v1/doctors          src/modules/doctors
/api/v1/patients         src/modules/profiles
/api/v1/appointments     src/modules/appointments
/api/v1/notifications    src/modules/notifications
/api/v1/doctor-schedule  src/modules/schedule-overrides
/api/v1/doctor-reviews   src/modules/doctor-reviews
```

## 15. FE flow de xuat

Patient:

1. Firebase OTP -> ID token -> register/login.
2. Luu access/refresh; rotate bang `/auth/refresh`.
3. GET specialty/doctor/detail/review/schedule.
4. POST appointment bang dung slot server tra.
5. Refetch upcoming hoac dung FCM/inbox de biet confirm/reject/expire.
6. Chi hien nut Meet khi backend tra `meetingUrl` khac null.
7. Sau complete, GET eligibility va review neu `canReview=true`.

Doctor:

1. Login staff.
2. Cau hinh weekly schedule/override.
3. Xem calendar, pending va upcoming.
4. Confirm/reject; confirm tao Meet.
5. Complete sau startAt; xem/reply review va statistics.

Admin:

1. CRUD/disable specialty va gan/go doctor.
2. Tao/sua/disable doctor; list/detail/disable patient.
3. Filter appointment, moderate review, dashboard/statistics.

## 16. Luu y hien tai

- Latest patch them cron expire appointment; theo yeu cau chua chay lai test.
- `doctorNoShow` preference ton tai nhung khong sinh event cho patient.
- File nay la hand-written contract; chua co OpenAPI generator.
- Test trong repo hien chu yeu bao phu profile/auth/email va admin; can bo sung
  regression appointment/schedule/review/notification khi FE contract on dinh.
- Rate limit staff login va mot so public auth route chua mount; can bo sung truoc production.

## 17. Cap nhat quan ly FE va contract API

- `GET /api/v1/admin/doctors/:doctorId/overrides`: requireAuth + ADMIN,
  validate doctorId va query `from`, `to` (ISO datetime), `type` (AVAILABLE/UNAVAILABLE).
  Tra `{from,to,items:[{id,type,startAt,endAt,reason,createdAt,updatedAt}]}`.
  Mac dinh tu hien tai den 28 ngay sau; admin xem duoc ca bac si da khoa.
- `PATCH /api/v1/specialties/:specialtyId/doctors`: requireAuth + ADMIN,
  body `{addDoctorIds:string[],removeDoctorIds:string[]}`, moi mang toi da 500 ID.
  Validate khong co ID nam trong ca hai mang. Them/go trong mot transaction.
  Chi them doctor ACTIVE vao specialty ACTIVE; van cho go khoi specialty da an.
  Tra `{id,_count:{doctors:number}}`. Loi 400 neu doctor khong hop le,
  409 neu them vao specialty DISABLED; khong luu mot phan khi co loi.
- `GET /api/v1/specialties/admin/all`: tra cac field id, code, name,
  description, status, deletedAt va `_count.doctors`; khong con kem mang doctors.
  Lay danh sach theo trang bang `GET /api/v1/admin/doctors?specialtyId=...&q=...&page=1&limit=10`.
- Appointment detail tra ho so hien tai trong `data.patient` (flat), gom
  medicalHistory, drugAllergies, address, email, phone. Khong phai snapshot luc xac nhan.
- FE cho hydration session tu localStorage truoc khi mount cac trang; khi API 401
  se dung refresh token tai `POST /api/v1/auth/refresh` va thu lai request mot lan.
  Refresh tra cap token moi, khong tra user; FE giu user cua session hien tai.
