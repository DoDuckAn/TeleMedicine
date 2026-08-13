import { ApiError } from "../common/api-error.js";
import { config } from "../config/env.js";

type SpeedSmsResponse = {
  status: "success" | "error";
  code: string;
  message?: string;
  data?: unknown;
};

export async function sendSms(to: string, content: string) {
  const auth = Buffer.from(`${config.speedsms.accessToken}:x`).toString("base64");

  const response = await fetch("https://api.speedsms.vn/index.php/sms/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: [to],
      content,
      sms_type: config.speedsms.smsType,
      sender: config.speedsms.sender,
    }),
  });

  const data = (await response.json()) as SpeedSmsResponse;

  if (!response.ok || data.status !== "success") {
    throw new ApiError(
      502,
      "SMS_SEND_FAILED",
      data.message ?? "Khong gui duoc SMS",
      data,
    );
  }

  return data;
}
