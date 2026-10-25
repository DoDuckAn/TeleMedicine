import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { app } from "../src/app.js";
import { buildWebPushMessages } from "../src/lib/firebase.js";
import { loginStaff, logout, refresh } from "../src/modules/auth/auth.service.js";
import { registerPushDevice } from "../src/modules/notifications/push-device.service.js";
import { resolvePushNotification } from "../src/modules/notifications/notification.service.js";
import { sendDueAppointmentNotifications } from "../src/modules/appointments/appointment.notification.js";

const users:string[]=[];
const appointments:string[]=[];
async function fixture() {
  const doctor=await prisma.user.create({data:{role:"DOCTOR",email:`push-delivery-${randomUUID()}@example.test`,passwordHash:await bcrypt.hash("PushDelivery123!",4),doctorProfile:{create:{fullName:"Private Doctor",qualifications:[],avatarUrl:"https://example.test/avatar.png",bio:"Private profile"}}}});
  users.push(doctor.id);
  const patient=await prisma.user.create({data:{role:"PATIENT",patientProfile:{create:{fullName:"Private Patient",dateOfBirth:new Date("1990-01-01")}}}});
  users.push(patient.id);
  const appointment=await prisma.appointment.create({data:{doctorID:doctor.id,patientID:patient.id,startAt:new Date(Date.now()+86400000),endAt:new Date(Date.now()+88200000),visitReason:"Private medical reason",confirmationDueAt:new Date(Date.now()+900000)}});
  appointments.push(appointment.id);
  const delivery=await prisma.appointmentNotification.create({data:{appointmentID:appointment.id,recipientID:doctor.id,type:"REQUEST_CREATED",channel:"PUSH",status:"PROCESSING",scheduledAt:new Date()}});
  const session=await loginStaff({email:doctor.email!,password:"PushDelivery123!"});
  const secret=randomUUID()+randomUUID();
  const input={token:`web-${randomUUID()}-registration`,platform:"WEB" as const,refreshToken:session.refreshToken,installationId:randomUUID(),receiptSecret:secret};
  const binding=await registerPushDevice(doctor.id,input);
  return {doctor,patient,delivery,session,input,resolve:{bindingId:binding.id,deliveryId:delivery.id,receiptSecret:secret}};
}

after(async()=>{
  await prisma.appointment.deleteMany({where:{id:{in:appointments}}});
  await prisma.pushDeviceToken.deleteMany({where:{userID:{in:users}}});
  await prisma.refreshToken.deleteMany({where:{userId:{in:users}}});
  await prisma.user.deleteMany({where:{id:{in:users},role:"DOCTOR"}});
  await prisma.patientProfile.deleteMany({where:{userID:{in:users}}});
  await prisma.user.deleteMany({where:{id:{in:users}}});
  await prisma.$disconnect();
});

test("receipt resolution requires capability, correct recipient and live linked refresh",async()=>{
  const f=await fixture();
  const response=await request(app).post("/api/v1/notifications/push/resolve").send(f.resolve);
  assert.equal(response.status,200);
  assert.equal(response.body.data.url,"/notifications");
  assert.doesNotMatch(JSON.stringify(response.body),/Private Doctor|Private Patient|medical reason/);
  await assert.rejects(resolvePushNotification({...f.resolve,receiptSecret:"x".repeat(64)}));
  const other=await fixture();
  await assert.rejects(resolvePushNotification({...f.resolve,deliveryId:other.delivery.id}));
  await refresh({refreshToken:f.session.refreshToken});
  assert.equal((await resolvePushNotification(f.resolve)).notificationId,f.delivery.id);
  await logout({refreshToken:f.session.refreshToken});
  await assert.rejects(resolvePushNotification(f.resolve));
});

test("expired refresh, disabled preference and delayed old-account receipts fail closed",async()=>{
  const f=await fixture();
  await prisma.notificationPreference.create({data:{userID:f.doctor.id,pushEnabled:false}});
  await assert.rejects(resolvePushNotification(f.resolve));
  await prisma.notificationPreference.update({where:{userID:f.doctor.id},data:{pushEnabled:true}});
  const other=await fixture();
  await registerPushDevice(other.doctor.id,{...f.input,refreshToken:other.session.refreshToken});
  await assert.rejects(resolvePushNotification(f.resolve));
  const own=await prisma.pushDeviceToken.findFirstOrThrow({where:{token:other.input.token}});
  await prisma.refreshToken.update({where:{id:own.refreshTokenId!},data:{expiresAt:new Date(0)}});
  await assert.rejects(resolvePushNotification(other.resolve));
});

test("web transport uses per-binding data-only envelopes without private content",async()=>{
  const f=await fixture();
  await prisma.appointmentNotification.update({where:{id:f.delivery.id},data:{status:"PENDING"}});
  let captured:Array<{token:string;bindingId:string;deliveryId:string}>=[];
  const result=await sendDueAppointmentNotifications(new Date(),{notificationIds:[f.delivery.id],webPushSender:async messages=>{
    captured=messages;
    return {successCount:messages.length,invalidTokens:[],failureMessages:[]};
  }});
  assert.equal(result.sentCount,1);
  assert.equal(captured[0]!.bindingId,f.resolve.bindingId);
  const packets=buildWebPushMessages(captured);
  assert.deepEqual(Object.keys(packets[0]!.data).sort(),["bindingId","deliveryId"]);
  assert.equal("notification" in packets[0]!,false);
  assert.doesNotMatch(JSON.stringify(packets),/Private|medical|receiptSecret/);
  assert.equal(packets[0]!.webpush.headers.TTL,"120");
});
