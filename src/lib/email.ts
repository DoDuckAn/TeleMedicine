import nodemailer from "nodemailer";
import {config} from "../config/env.js";
import {resolveIntegrationSecrets} from "../modules/system-settings/integration-secret.service.js";

export type EmailMessage={
    to:string;
    subject:string;
    text:string;
};

let transporter:ReturnType<typeof nodemailer.createTransport>|null=null;
let transporterSignature="";

async function getTransporter(){
    const credentials=await resolveIntegrationSecrets([
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_SECURE",
        "SMTP_USER",
        "SMTP_PASSWORD",
    ]);
    if(!config.email.enabled||!credentials.SMTP_HOST||!credentials.SMTP_USER||!credentials.SMTP_PASSWORD){
        throw new Error("Email delivery is not configured");
    }
    const signature=JSON.stringify(credentials);
    if(transporter&&signature===transporterSignature)return transporter;
    transporter=nodemailer.createTransport({
        connectionTimeout:10_000,
        greetingTimeout:10_000,
        socketTimeout:30_000,
        host:credentials.SMTP_HOST,
        port:Number(credentials.SMTP_PORT??587),
        secure:credentials.SMTP_SECURE==="true",
        auth:{
            user:credentials.SMTP_USER,
            pass:credentials.SMTP_PASSWORD,
        },
    });
    transporterSignature=signature;
    return transporter;
}

function escapeHtml(value:string){
    return value
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

export async function sendEmail(message:EmailMessage){
    if(!config.email.enabled){
        console.info("[EMAIL_LOG]",message);
        return;
    }
    const [transport,emailFrom]=await Promise.all([
        getTransporter(),
        resolveIntegrationSecrets(["EMAIL_FROM"]),
    ]);
    await transport.sendMail({
        from:emailFrom.EMAIL_FROM,
        to:message.to,
        subject:message.subject,
        text:message.text,
        html:`<p>${escapeHtml(message.text)}</p>`,
    });
}
