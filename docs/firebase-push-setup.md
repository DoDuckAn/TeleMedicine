# Firebase Cloud Messaging setup

Backend uses Firebase Admin SDK to send appointment push notifications. Email
notification, Firebase Phone Auth and Cloudinary setup are documented in
[`external-services-setup.md`](./external-services-setup.md).

## 1. Create Firebase credentials

1. Open Firebase Console and create or select the Telemedicine project.
2. Open **Project settings > Service accounts**.
3. Select **Generate new private key** and download the JSON file.
4. Keep that JSON file private. Do not commit it to Git.

Copy these JSON values to `.env`:

```env
FIREBASE_PUSH_ENABLED=true
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Keep the private key on one line with literal `\n` characters. Restart the
backend after changing `.env`.

## 2. Register a client device

The frontend obtains an FCM registration token from the Firebase client SDK,
then calls this API with the current access token:

```http
POST /api/v1/notifications/devices
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "token": "<fcm-registration-token>",
  "platform": "WEB"
}
```

`platform` accepts `WEB`, `ANDROID`, or `IOS`. Call this endpoint after login
and whenever Firebase refreshes the token.

Remove the token on logout:

```http
DELETE /api/v1/notifications/devices
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "token": "<fcm-registration-token>"
}
```

For web push, the frontend Firebase project also needs a Web app and a Web Push
certificate/VAPID key. Those public client values belong in the frontend, not
in this backend `.env`.

## 3. Worker behavior

The appointment maintenance job runs every minute and:

- sends due push notifications when Firebase is enabled;
- sends due email notifications when SMTP email is enabled;
- retries failed deliveries using the configured delay;
- marks a delivery `FAILED` after the maximum attempt count;
- disables FCM tokens reported as invalid or unregistered by Firebase;
- recovers notification records left in `PROCESSING` after a worker crash.
- cancels notifications that remain undelivered past the configured maximum age.

Push records remain `PENDING` while `FIREBASE_PUSH_ENABLED=false`, so enabling
Firebase later does not silently discard them.
