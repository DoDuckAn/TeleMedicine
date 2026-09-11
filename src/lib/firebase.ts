import { cert, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { config } from "../config/env.js";
import { resolveIntegrationSecrets } from "../modules/system-settings/integration-secret.service.js";

export type PushMessage = {
    title: string;
    body: string;
    data: Record<string, string>;
};

const APP_NAME="database-configured-firebase";
let currentCredentialSignature="";
let firebaseAppUpdate:Promise<void>=Promise.resolve();

async function getFirebaseApp() {
    const credentials=await resolveIntegrationSecrets([
        "FIREBASE_PROJECT_ID",
        "FIREBASE_CLIENT_EMAIL",
        "FIREBASE_PRIVATE_KEY",
    ]);
    const projectId=credentials.FIREBASE_PROJECT_ID;
    const clientEmail=credentials.FIREBASE_CLIENT_EMAIL;
    const privateKey=credentials.FIREBASE_PRIVATE_KEY;
    if (
        !projectId ||
        !clientEmail ||
        !privateKey
    ) {
        throw new Error("Firebase is not configured");
    }

    const signature=[
        projectId,
        clientEmail,
        privateKey,
    ].join("\u0000");
    const existing=getApps().find((app)=>app.name===APP_NAME);
    if(existing&&signature===currentCredentialSignature)return existing;

    firebaseAppUpdate=firebaseAppUpdate.catch(()=>undefined).then(async()=>{
        const current=getApps().find((app)=>app.name===APP_NAME);
        if(current&&signature===currentCredentialSignature)return;
        if(current)await deleteApp(current);
        initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey: privateKey.replace(/\\n/g, "\n"),
            }),
            projectId,
        },APP_NAME);
        currentCredentialSignature=signature;
    });
    await firebaseAppUpdate;
    return getApps().find((app)=>app.name===APP_NAME)!;
}

async function getFirebaseMessaging() {
    if(!config.firebase.pushEnabled){
        throw new Error("Firebase push is not enabled");
    }
    return getMessaging(await getFirebaseApp());
}

function normalizeFirebasePhone(phone:string){
    if(phone.startsWith("+84"))return `0${phone.slice(3)}`;
    return phone;
}

export async function verifyFirebasePhoneIdToken(idToken:string){
    if(!config.firebase.phoneAuthEnabled){
        throw new Error("Firebase phone auth is not enabled");
    }
    const decoded=await getAuth(await getFirebaseApp()).verifyIdToken(idToken,true);
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

    const response = await (await getFirebaseMessaging()).sendEachForMulticast({
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
