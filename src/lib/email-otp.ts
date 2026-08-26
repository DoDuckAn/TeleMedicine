import {createHash,randomInt} from "node:crypto";
import {config} from "../config/env.js";

export function createEmailOtp(){
    return randomInt(0,1000000).toString().padStart(6,"0");
}

export function hashEmailOtp(code:string){
    return createHash("sha256").update(code).digest("hex");
}

export function createEmailOtpExpiresAt(){
    return new Date(Date.now()+config.doctorPasswordOtp.expiresMinutes*60*1000);
}
