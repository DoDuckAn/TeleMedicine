import "dotenv/config";

const configured = (process.env.CORS_ORIGINS ?? "")
  .split(",").map(value => value.trim()).filter(Boolean);
for (const origin of configured) {
  const url = new URL(origin);
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("CORS_ORIGINS must contain exact HTTP(S) origins without paths");
  }
}
if (process.env.NODE_ENV === "production" && configured.length === 0) {
  throw new Error("CORS_ORIGINS is required in production");
}
export const allowedOrigins=configured.length ? configured : [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://192.168.1.7:3000",
];
