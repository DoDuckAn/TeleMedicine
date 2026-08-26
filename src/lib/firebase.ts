import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { config } from "../config/env.js";

export type PushMessage = {
    title: string;
    body: string;
    data: Record<string, string>;
};

function getFirebaseApp() {
    if (
        !config.firebase.projectId ||
        !config.firebase.clientEmail ||
        !config.firebase.privateKey
    ) {
        throw new Error("Firebase is not configured");
    }

    const app = getApps()[0] ?? initializeApp({
        credential: cert({
            projectId: config.firebase.projectId,
            clientEmail: config.firebase.clientEmail,
            privateKey: config.firebase.privateKey.replace(/\\n/g, "\n"),
        }),
        projectId: config.firebase.projectId,
    });

    return app;
}

function getFirebaseMessaging() {
    if(!config.firebase.pushEnabled){
        throw new Error("Firebase push is not enabled");
    }
    return getMessaging(getFirebaseApp());
}

function normalizeFirebasePhone(phone:string){
    if(phone.startsWith("+84"))return `0${phone.slice(3)}`;
    return phone;
}

export async function verifyFirebasePhoneIdToken(idToken:string){
    if(!config.firebase.phoneAuthEnabled){
        throw new Error("Firebase phone auth is not enabled");
    }
    const decoded=await getAuth(getFirebaseApp()).verifyIdToken(idToken,true);
    if(!decoded.phone_number){
        throw new Error("Firebase token does not contain a phone number");
    }
    return {
        uid:decoded.uid,
        phone:normalizeFirebasePhone(decoded.phone_number),
    };
}

export async function sendFirebasePush(
    tokens: string[],
    message: PushMessage,
) {
    if (tokens.length === 0) {
        throw new Error("Recipient has no active push device");
    }

    const response = await getFirebaseMessaging().sendEachForMulticast({
        tokens,
        notification: {
            title: message.title,
            body: message.body,
        },
        data: message.data,
        android: {
            priority: "high",
            notification: { channelId: "appointments" },
        },
        apns: {
            payload: { aps: { sound: "default" } },
        },
    });

    const invalidTokens: string[] = [];
    const failureMessages: string[] = [];

    response.responses.forEach((result, index) => {
        if (result.success) {
            return;
        }

        const code = result.error?.code;
        if (
            code === "messaging/invalid-registration-token" ||
            code === "messaging/registration-token-not-registered"
        ) {
            invalidTokens.push(tokens[index]!);
        }

        failureMessages.push(
            code ?? result.error?.message ?? "Unknown Firebase error",
        );
    });

    return {
        successCount: response.successCount,
        invalidTokens,
        failureMessages,
    };
}
