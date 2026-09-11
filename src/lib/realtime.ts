import type {Server as HttpServer} from "node:http";
import {Server, type Socket} from "socket.io";
import {allowedOrigins} from "../config/cors.js";
import {verifyAccessToken} from "./jwt.js";
import {prisma} from "./prisma.js";

type Session={id:string;role:string;tokenVersion:number;token:string};
type Events={
    "menus.changed":(data:{role:string})=>void;
    "appointments.changed":()=>void;
    "notifications.changed":()=>void;
    "schedule.changed":(data:{doctorId:string})=>void;
    "session.invalid":(data:{code:string})=>void;
};
type RealtimeSocket=Socket<Record<string,never>,Events,Record<string,never>,{session:Session}>;
let io:Server<Record<string,never>,Events,Record<string,never>,{session:Session}>|undefined;

function authError(code:string){
    return Object.assign(new Error("Realtime authentication failed"),{data:{code}});
}

function tokenError(error:unknown){
    return error instanceof Error&&error.name==="TokenExpiredError"?"TOKEN_EXPIRED":"UNAUTHORIZED";
}

export function attachRealtime(server:HttpServer){
    if(io)throw new Error("Realtime server already attached");
    const instance=new Server<Record<string,never>,Events,Record<string,never>,{session:Session}>(server,{
        cors:{origin:allowedOrigins,credentials:true},
        allowRequest:(req,done)=>done(null,!req.headers.origin||allowedOrigins.includes(req.headers.origin)),
        maxHttpBufferSize:16_384,
    });
    io=instance;
    instance.use(async(socket,next)=>{
        const token:unknown=socket.handshake.auth.token;
        if(typeof token!=="string"||token.length>8192)return next(authError("UNAUTHORIZED"));
        let payload;
        try{payload=verifyAccessToken(token);}catch(error){return next(authError(tokenError(error)));}
        try{
            const user=await prisma.user.findUnique({where:{id:payload.sub},select:{id:true,role:true,status:true,tokenVersion:true}});
            if(!user||user.status!=="ACTIVE"||user.tokenVersion!==payload.tokenVersion){
                return next(authError("SESSION_REVOKED"));
            }
            socket.data.session={id:user.id,role:user.role,tokenVersion:user.tokenVersion,token};
            return next();
        }catch{return next(authError("SERVER_UNAVAILABLE"));}
    });
    instance.on("connection",socket=>{
        // Rooms are assigned by the server only; clients cannot subscribe to another user.
        void socket.join(`user:${socket.data.session.id}`);
    });
    let checking=false;
    const timer=setInterval(async()=>{
        if(checking)return;
        checking=true;
        try{await authorizedSockets([...instance.sockets.sockets.values()]);}
        catch{instance.disconnectSockets(true);}
        finally{checking=false;}
    },30_000);
    timer.unref();
    instance.engine.on("close",()=>{
        clearInterval(timer);
        if(io===instance)io=undefined;
    });
    return instance;
}

async function authorizedSockets(sockets:RealtimeSocket[]){
    if(!sockets.length)return [];
    const users=await prisma.user.findMany({
        where:{id:{in:[...new Set(sockets.map(socket=>socket.data.session.id))]}},
        select:{id:true,status:true,role:true,tokenVersion:true},
    });
    const byId=new Map(users.map(user=>[user.id,user]));
    return sockets.filter(socket=>{
        const session=socket.data.session;
        const user=byId.get(session.id);
        let code:string|undefined;
        if(!user||user.status!=="ACTIVE"||user.tokenVersion!==session.tokenVersion||user.role!==session.role)code="SESSION_REVOKED";
        else{try{verifyAccessToken(session.token);}catch(error){code=tokenError(error);}}
        if(code){socket.emit("session.invalid",{code});socket.disconnect(true);return false;}
        return socket.connected;
    });
}

async function recipients(userIds?:string[],includeAdmins=false){
    const sockets=[...(io?.sockets.sockets.values()??[])].filter(socket=>
        !userIds||userIds.includes(socket.data.session.id)||(includeAdmins&&socket.data.session.role==="ADMIN"));
    return authorizedSockets(sockets);
}

export async function publishNotificationsChanged(userIds:string[]){
    if(!io)return;
    try{for(const socket of await recipients(userIds))socket.emit("notifications.changed");}
    catch(error){console.error("Realtime notification update failed",error instanceof Error?error.message:"Unknown error");}
}

export async function publishMenusChanged(role:string){
    if(!io)return;
    try{
        const sockets=[...io.sockets.sockets.values()].filter(socket=>socket.data.session.role===role||socket.data.session.role==="ADMIN");
        for(const socket of await authorizedSockets(sockets))socket.emit("menus.changed",{role});
    }catch(error){console.error("Realtime menu update failed",error instanceof Error?error.message:"Unknown error");}
}

export async function publishScheduleChanged(doctorId:string){
    if(!io)return;
    try{for(const socket of await recipients())socket.emit("schedule.changed",{doctorId});}
    catch(error){console.error("Realtime schedule update failed",error instanceof Error?error.message:"Unknown error");}
}

export async function publishAppointmentChanged(appointmentId:string){
    if(!io)return;
    try{
        const appointment=await prisma.appointment.findUnique({where:{id:appointmentId},select:{doctorID:true,patientID:true}});
        if(!appointment)return;
        for(const socket of await recipients([appointment.patientID,appointment.doctorID],true)){
            socket.emit("appointments.changed");
            socket.emit("notifications.changed");
        }
        await publishScheduleChanged(appointment.doctorID);
    }catch(error){console.error("Realtime appointment update failed",error instanceof Error?error.message:"Unknown error");}
}

let lastNotificationCheck=new Date();
export async function publishDueNotificationUpdates(now:Date){
    if(!io)return;
    try{
        const due=await prisma.userNotification.findMany({
            where:{scheduledAt:{gt:lastNotificationCheck,lte:now}},
            select:{recipientID:true},distinct:["recipientID"],
        });
        await publishNotificationsChanged(due.map(item=>item.recipientID));
        lastNotificationCheck=now;
    }catch(error){console.error("Realtime reminder update failed",error instanceof Error?error.message:"Unknown error");}
}
