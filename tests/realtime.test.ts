import assert from "node:assert/strict";
import {test} from "node:test";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import request from "supertest";
import {io as connect,type Socket} from "socket.io-client";
import jwt from "jsonwebtoken";
import {google} from "googleapis";
import {app} from "../src/app.js";
import {prisma} from "../src/lib/prisma.js";
import {signAccessToken} from "../src/lib/jwt.js";
import {config} from "../src/config/env.js";
import {attachRealtime,publishAppointmentChanged,publishDueNotificationUpdates,publishNotificationsChanged} from "../src/lib/realtime.js";

async function until(condition:()=>boolean){
    for(let i=0;i<100;i++){if(condition())return;await delay(30);}
    assert.fail("Timed out waiting for realtime event");
}

test("authenticated realtime: REST mutations, isolation, reminders, revocation and reconnect",{timeout:90_000},async()=>{
    const server=createServer(app);
    const realtime=attachRealtime(server);
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ids:string[]=[];
    const sockets:Socket[]=[];
    const savedMeet={...config.googleMeet};
    const originalMeet=google.meet;
    const token=(user:{id:string;role:"ADMIN"|"DOCTOR"|"PATIENT";tokenVersion:number})=>signAccessToken({sub:user.id,role:user.role,tokenVersion:user.tokenVersion});
    const client=(accessToken?:string)=>{
        const socket=connect(url,{autoConnect:false,reconnection:false,auth:{token:accessToken},transports:["websocket"]});
        sockets.push(socket);return socket;
    };
    const open=async(socket:Socket)=>{
        const ready=new Promise<void>((resolve,reject)=>{socket.once("connect",()=>resolve());socket.once("connect_error",reject);});
        socket.connect();await ready;return socket;
    };
    const denied=async(accessToken:string|undefined,code:string)=>{
        const socket=client(accessToken);
        const failed=new Promise<Error&{data?:{code:string}}>(resolve=>socket.once("connect_error",resolve));
        socket.connect();assert.equal((await failed).data?.code,code);socket.disconnect();
    };
    try{
        const weeklySchedule=Object.fromEntries(["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"].map(day=>[day,[{startTime:"08:00",endTime:"17:00"}]]));
        const doctor=await prisma.user.create({data:{role:"DOCTOR",doctorProfile:{create:{fullName:"Realtime Doctor",qualifications:["MD"],avatarUrl:"https://example.com/test.png",bio:"Realtime fixture",weeklySchedule}}}});ids.push(doctor.id);
        const patient=await prisma.user.create({data:{role:"PATIENT",patientProfile:{create:{fullName:"Realtime Patient",dateOfBirth:new Date("1990-01-01")}}}});ids.push(patient.id);
        const other=await prisma.user.create({data:{role:"PATIENT"}});ids.push(other.id);
        const admin=await prisma.user.create({data:{role:"ADMIN"}});ids.push(admin.id);
        const disabled=await prisma.user.create({data:{role:"PATIENT",status:"DISABLED"}});ids.push(disabled.id);
        await denied(undefined,"UNAUTHORIZED");
        await denied("not-a-jwt","UNAUTHORIZED");
        await denied(token(disabled),"SESSION_REVOKED");
        await denied(signAccessToken({sub:patient.id,role:"PATIENT",tokenVersion:999}),"SESSION_REVOKED");
        await denied(jwt.sign({sub:patient.id,role:"PATIENT",tokenVersion:0},config.jwt.accessSecret,{expiresIn:-1}),"TOKEN_EXPIRED");
        const d=await open(client(token(doctor))),p=await open(client(token(patient))),p2=await open(client(token(patient))),o=await open(client(token(other))),a=await open(client(token(admin)));
        const counts={d:0,p:0,p2:0,o:0,a:0,read:0,schedule:0};
        d.on("appointments.changed",()=>counts.d++);p.on("appointments.changed",()=>counts.p++);p2.on("appointments.changed",()=>counts.p2++);o.on("appointments.changed",()=>counts.o++);a.on("appointments.changed",()=>counts.a++);
        p2.on("notifications.changed",()=>counts.read++);o.on("schedule.changed",()=>counts.schedule++);
        o.emit("join",`user:${patient.id}`);o.emit("appointments.changed");
        const schedule=await request(app).get(`/api/v1/doctors/${doctor.id}/schedule`);
        const slots=schedule.body.data.days.flatMap((day:{slots:{startAt:string;endAt:string}[]})=>day.slots) as {startAt:string;endAt:string}[];
        const slot=slots.find(item=>new Date(item.startAt).getTime()>Date.now()+3_600_000)!;
        assert.ok(slot);
        const book=()=>request(app).post("/api/v1/appointments").set("Authorization",`Bearer ${token(patient)}`).send({doctorId:doctor.id,startAt:slot.startAt,visitReason:"Realtime booking test"});
        const booked=await book();assert.equal(booked.status,201,JSON.stringify(booked.body));
        const id=booked.body.data.id as string;
        await until(()=>counts.d===1&&counts.p===1&&counts.p2===1&&counts.a===1&&counts.schedule===1);
        assert.equal(counts.o,0);
        const before=counts.d;
        const duplicate=await book();assert.equal(duplicate.status,409);await delay(150);assert.equal(counts.d,before,"Failed mutation emits no update");
        Object.assign(config.googleMeet,{enabled:true,clientId:"test",clientSecret:"test",refreshToken:"test"});
        Reflect.set(google,"meet",()=>({spaces:{create:async()=>({data:{name:"spaces/test",meetingUri:"https://meet.google.com/test-room"}}),patch:async()=>({data:{}}),endActiveConference:async()=>({data:{}})}}));
        const confirmed=await request(app).post(`/api/v1/appointments/${id}/confirm`).set("Authorization",`Bearer ${token(doctor)}`);
        assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));await until(()=>counts.p===2);
        const cancelled=await request(app).post(`/api/v1/appointments/${id}/cancel`).set("Authorization",`Bearer ${token(patient)}`).send({reason:"Realtime cancellation"});
        assert.equal(cancelled.status,200,JSON.stringify(cancelled.body));await until(()=>counts.d===3);
        const second=await book();assert.equal(second.status,201);await until(()=>counts.d===4);
        const rejected=await request(app).post(`/api/v1/appointments/${second.body.data.id}/reject`).set("Authorization",`Bearer ${token(doctor)}`).send({reason:"Realtime rejection"});
        assert.equal(rejected.status,200);await until(()=>counts.p===5);
        const third=await book();assert.equal(third.status,201);await until(()=>counts.p===6);
        const override=await request(app).post("/api/v1/doctor-schedule/overrides").set("Authorization",`Bearer ${token(doctor)}`).send({type:"UNAVAILABLE",reason:"Realtime emergency leave",ranges:[slot]});
        assert.equal(override.status,201,JSON.stringify(override.body));await until(()=>counts.p===7);
        const past=await prisma.appointment.create({data:{doctorID:doctor.id,patientID:patient.id,status:"CONFIRMED",startAt:new Date(Date.now()-1_800_000),endAt:new Date(),visitReason:"Realtime completion",confirmationDueAt:new Date()}});
        const completed=await request(app).post(`/api/v1/appointments/${past.id}/complete`).set("Authorization",`Bearer ${token(doctor)}`);
        assert.equal(completed.status,200,JSON.stringify(completed.body));await until(()=>counts.p===8);
        const readBefore=counts.read;
        const notification=await prisma.userNotification.findFirstOrThrow({where:{recipientID:patient.id}});
        const read=await request(app).patch(`/api/v1/notifications/${notification.id}/read`).set("Authorization",`Bearer ${token(patient)}`);
        assert.equal(read.status,200);await until(()=>counts.read>readBefore);
        const allReadBefore=counts.read;
        assert.equal((await request(app).patch("/api/v1/notifications/read-all").set("Authorization",`Bearer ${token(patient)}`)).status,200);
        await until(()=>counts.read>allReadBefore);
        const reminderBefore=counts.read;
        await prisma.userNotification.create({data:{appointmentID:id,recipientID:patient.id,type:"REMINDER_15_MINUTES",scheduledAt:new Date(Date.now()+100)}});
        await delay(150);await publishDueNotificationUpdates(new Date());await until(()=>counts.read>reminderBefore);
        p.disconnect();await open(p);
        const reconnectBefore=counts.p;await publishAppointmentChanged(id);await until(()=>counts.p>reconnectBefore);
        const shortToken=jwt.sign({sub:patient.id,role:"PATIENT",tokenVersion:patient.tokenVersion},config.jwt.accessSecret,{expiresIn:2});
        const shortClient=await open(client(shortToken));
        const expiredEvent=new Promise<{code:string}>(resolve=>shortClient.once("session.invalid",resolve));
        await delay(2100);await publishNotificationsChanged([patient.id]);
        assert.equal((await expiredEvent).code,"TOKEN_EXPIRED");
        await until(()=>!shortClient.connected);
        const revoked=new Promise<{code:string}>(resolve=>p.once("session.invalid",resolve));
        await prisma.user.update({where:{id:patient.id},data:{tokenVersion:{increment:1}}});
        await publishNotificationsChanged([patient.id]);assert.equal((await revoked).code,"SESSION_REVOKED");await until(()=>!p.connected&&!p2.connected);
        await denied(token(patient),"SESSION_REVOKED");
        const disabledEvent=new Promise<{code:string}>(resolve=>d.once("session.invalid",resolve));
        await prisma.user.update({where:{id:doctor.id},data:{status:"DISABLED"}});
        await publishAppointmentChanged(id);assert.equal((await disabledEvent).code,"SESSION_REVOKED");
        assert.equal(counts.o,0,"Unrelated user never receives appointment events");
    }finally{
        Reflect.set(google,"meet",originalMeet);Object.assign(config.googleMeet,savedMeet);
        for(const socket of sockets)socket.disconnect();
        await new Promise<void>(resolve=>realtime.close(()=>resolve()));
        if(ids.length){
            await prisma.appointment.deleteMany({where:{doctorID:{in:ids}}});
            await prisma.patientProfile.deleteMany({where:{userID:{in:ids}}});
            await prisma.user.deleteMany({where:{id:{in:ids}}});
        }
        await prisma.$disconnect();
    }
});
