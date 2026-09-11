# Cau hinh dich vu ngoai

Tai lieu nay tong hop cac key va cau hinh can them cho Firebase Phone Auth,
Firebase Cloud Messaging, SMTP email va Cloudinary.

Khong commit file `.env`, service-account JSON, SMTP password hoac Cloudinary
API secret len Git.

## 1. Firebase

Backend dung cung mot Firebase project cho hai chuc nang doc lap:

- `FIREBASE_PHONE_AUTH_ENABLED`: xac minh Firebase ID token khi patient dang ky/dang nhap.
- `FIREBASE_PUSH_ENABLED`: gui push notification qua FCM.

### Firebase Admin cho backend

Trong Firebase Console, mo **Project settings > Service accounts**, tao private
key va tai service-account JSON. Gan cac gia tri sau vao `.env`:

```env
FIREBASE_PHONE_AUTH_ENABLED=true
FIREBASE_PUSH_ENABLED=true
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

`FIREBASE_PRIVATE_KEY` phai nam tren mot dong va giu cac ky tu `\n`. Hai flag
co the bat/tat rieng, nhung khi mot trong hai flag la `true` thi ba credential
Firebase Admin ben tren deu bat buoc.

Tai lieu chinh thuc: <https://firebase.google.com/docs/admin/setup>

### Phone Auth cho frontend

1. Trong Firebase Console, mo **Authentication > Sign-in method** va bat
   provider **Phone**.
2. Tao Web/Android/iOS app trong Firebase project tuy nen tang frontend.
3. Gan Firebase client config (`apiKey`, `authDomain`, `appId`, ...) vao env
   cua frontend. Cac gia tri client nay khong gan vao backend `.env`.
4. Frontend dung Firebase SDK gui/xac minh OTP dien thoai.
5. Sau khi xac minh thanh cong, frontend lay Firebase ID token va gui token do
   cho backend.

Dang ky patient:

```http
POST /api/v1/auth/register/patient
Content-Type: application/json

{
  "firebaseIdToken": "<firebase-id-token>",
  "fullName": "Nguyen Van A",
  "dateOfBirth": "1990-01-01",
  "gender": "MALE"
}
```

Dang nhap patient:

```http
POST /api/v1/auth/login/patient
Content-Type: application/json

{
  "firebaseIdToken": "<firebase-id-token>"
}
```

Backend lay so dien thoai tu token da verify, khong tin so dien thoai do client
tu gui. `firebaseUid` duoc link voi patient de ngan token cua Firebase account
khac truy cap tai khoan da lien ket.

Tai lieu chinh thuc: <https://firebase.google.com/docs/auth/web/phone-auth>

## 2. SMTP email

Email duoc dung cho appointment notification/reminder va OTP password cua
doctor. Vi du cau hinh Gmail SMTP:

```env
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=clinic@example.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM="TeleMedicine <clinic@example.com>"
```

Neu dung Gmail:

1. Bat 2-Step Verification cho tai khoan gui mail.
2. Tao App Password va gan App Password vao `SMTP_PASSWORD`.
3. Khong dung mat khau dang nhap Gmail thong thuong.

Voi SMTP port `465`, thuong can dat `SMTP_SECURE=true`. Voi port `587`, dat
`SMTP_SECURE=false` de Nodemailer nang ket noi len TLS.

Khi `EMAIL_ENABLED=false`, backend chi ghi `[EMAIL_LOG]` ra terminal. Trang thai
nay phu hop local development, nhung khong gui email that.

Tai lieu Nodemailer: <https://nodemailer.com/usage/using-gmail>

### OTP password doctor

```env
DOCTOR_PASSWORD_OTP_EXPIRES_MINUTES=10
DOCTOR_PASSWORD_OTP_MAX_ATTEMPTS=5
DOCTOR_PASSWORD_OTP_RESEND_SECONDS=60
```

- OTP doi password: `POST /api/v1/doctors/me/password/request-otp`.
- Xac nhan doi password: `PATCH /api/v1/doctors/me/password`.
- OTP quen password: `POST /api/v1/auth/doctors/password/forgot/request-otp`.
- Xac nhan reset password: `POST /api/v1/auth/doctors/password/forgot/reset`.

## 3. Cloudinary

Tao Cloudinary account/product environment, sau do lay cac credential trong
Cloudinary Console va gan vao backend `.env`:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

`CLOUDINARY_API_SECRET` chi nam o backend. Khong dua secret nay vao frontend.

Frontend gui avatar bang `multipart/form-data`, field name la `avatar`:

- Patient: `POST /api/v1/patients/me/avatar`.
- Doctor: `POST /api/v1/doctors/me/avatar`.

Backend chap nhan JPEG, PNG hoac WebP, toi da 5 MB. Anh duoc upload vao folder
`telemedicine/avatars` va crop ve kich thuoc `800x800`.

Tai lieu Cloudinary Node SDK: <https://cloudinary.com/documentation/node_integration>

## 4. Apply va kiem tra

Sau khi cap nhat `.env`:

```bash
npx prisma migrate deploy
npx prisma generate
npm run typecheck
npm run test:typecheck
npm test
npm run dev
```

Can restart backend sau moi lan thay doi `.env`.
