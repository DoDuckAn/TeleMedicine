import nodemailer from "nodemailer";
import {config} from "../config/env.js";

export type EmailMessage={
    to:string;
    subject:string;
    text:string;
};

let transporter:ReturnType<typeof nodemailer.createTransport>|null=null;

function getTransporter(){
    if(!config.email.enabled||!config.email.host||!config.email.user||!config.email.password){
        throw new Error("Email delivery is not configured");
    }
    transporter??=nodemailer.createTransport({
        host:config.email.host,
        port:config.email.port,
        secure:config.email.secure,
        auth:{
            user:config.email.user,
            pass:config.email.password,
        },
    });
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
    await getTransporter().sendMail({
        from:config.email.from,
        to:message.to,
        subject:message.subject,
        text:message.text,
        html:`<p>${escapeHtml(message.text)}</p>`,
    });
}
