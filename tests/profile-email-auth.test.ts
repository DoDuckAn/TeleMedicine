import assert from "node:assert/strict";
import {after,test} from "node:test";
import bcrypt from "bcrypt";
import request from "supertest";
import {
    AppointmentNotificationType,
    AppointmentStatus,
    DoctorPasswordOtpPurpose,
    Gender,
    NotificationChannel,
    NotificationDeliveryStatus,
    UserRole,
} from "../generated/prisma/enums.js";
import {app} from "../src/app.js";
import {ApiError} from "../src/common/api-error.js";
import {signAccessToken} from "../src/lib/jwt.js";
import {prisma} from "../src/lib/prisma.js";
import {sendDueAppointmentNotifications} from "../src/modules/appointments/appointment.notification.js";
import {
    loginPatient,
    registerPatient,
} from "../src/modules/auth/auth.service.js";
import {
    changeDoctorPassword,
    requestDoctorPasswordChangeOtp,
    requestDoctorPasswordResetOtp,
    resetDoctorPassword,
} from "../src/modules/auth/doctor-password.service.js";
import {
    loginPatientSchema,
    registerPatientSchema,
} from "../src/modules/auth/auth.schema.js";
import {
    getNotificationPreference,
    updateNotificationPreference,
} from "../src/modules/notifications/notification.service.js";
import {updateNotificationPreferenceSchema} from "../src/modules/notifications/notification.schema.js";
import {
    updateDoctorProfile,
    updateDoctorAvatar,
    updatePatientAvatar,
    updatePatientProfile,
} from "../src/modules/profiles/profile.service.js";
import {updateDoctorProfileSchema} from "../src/modules/profiles/profile.schema.js";

const suffix=`${Date.now()}${Math.floor(Math.random()*1000)}`;
const userIds:string[]=[];
const appointmentIds:string[]=[];

function fakeToken(){
    return "firebase-token-".padEnd(120,"x");
}

function extractOtp(text:string){
    const otp=text.match(/\b\d{6}\b/)?.[0];
    assert.ok(otp,"Email phai chua OTP 6 chu so");
    return otp;
}

function accessToken(user:{id:string;role:UserRole;tokenVersion:number}){
    return signAccessToken({sub:user.id,role:user.role,tokenVersion:user.tokenVersion});
}

async function createPatient(index:number,email:string|null=null){
    const user=await prisma.user.create({
        data:{
            role:UserRole.PATIENT,
            phone:`09${suffix.slice(-6)}${index.toString().padStart(2,"0")}`.slice(0,10),
            email,
            patientProfile:{
                create:{
                    fullName:`Test Patient ${index}`,
                    dateOfBirth:new Date("1995-01-01T00:00:00.000Z"),
                    gender:Gender.UNSPECIFIED,
                },
            },
        },
        select:{id:true,role:true,tokenVersion:true},
    });
    userIds.push(user.id);
    return user;
}

async function createDoctor(index:number){
    const passwordHash=await bcrypt.hash("DoctorPass123",4);
    const user=await prisma.user.create({
        data:{
            role:UserRole.DOCTOR,
            email:`doctor.${suffix}.${index}@example.com`,
            passwordHash,
            doctorProfile:{
                create:{
                    fullName:`Test Doctor ${index}`,
                    yearsOfExperience:5,
                    qualifications:["MD"],
                    avatarUrl:"https://example.com/doctor.png",
                    bio:"Doctor profile used for integration testing.",
                    weeklySchedule:{},
                },
            },
        },
        select:{id:true,role:true,tokenVersion:true},
    });
    userIds.push(user.id);
    return user;
}

after(async()=>{
    if(appointmentIds.length>0){
        await prisma.appointmentNotification.deleteMany({where:{appointmentID:{in:appointmentIds}}});
        await prisma.userNotification.deleteMany({where:{appointmentID:{in:appointmentIds}}});
        await prisma.appointmentStatusHistory.deleteMany({where:{appointmentID:{in:appointmentIds}}});
        await prisma.appointmentSlotReservation.deleteMany({where:{appointmentID:{in:appointmentIds}}});
        await prisma.appointment.deleteMany({where:{id:{in:appointmentIds}}});
    }
    if(userIds.length>0){
        await prisma.notificationPreference.deleteMany({where:{userID:{in:userIds}}});
        await prisma.pushDeviceToken.deleteMany({where:{userID:{in:userIds}}});
        await prisma.refreshToken.deleteMany({where:{userId:{in:userIds}}});
        await prisma.doctorScheduleOverride.deleteMany({where:{doctorID:{in:userIds}}});
        await prisma.doctorReview.deleteMany({
            where:{OR:[{doctorID:{in:userIds}},{patientID:{in:userIds}}]},
        });
        await prisma.doctorProfile.deleteMany({where:{userID:{in:userIds}}});
        await prisma.patientProfile.deleteMany({where:{userID:{in:userIds}}});
        await prisma.user.deleteMany({where:{id:{in:userIds}}});
    }
    await prisma.$disconnect();
});

test("schema Firebase thay OTP cu va notification dung email",()=>{
    assert.equal(registerPatientSchema.safeParse({phone:"0900000000",otp:"123456"}).success,false);
    assert.equal(registerPatientSchema.safeParse({
        firebaseIdToken:fakeToken(),
        fullName:"Nguyen Van A",
        dateOfBirth:"1990-01-01",
        gender:"MALE",
    }).success,true);
    assert.equal(loginPatientSchema.safeParse({firebaseIdToken:fakeToken()}).success,true);
    assert.equal(updateNotificationPreferenceSchema.safeParse({channels:{email:true}}).success,true);
    assert.equal(updateNotificationPreferenceSchema.safeParse({channels:{sms:true}}).success,false);
    assert.equal(updateDoctorProfileSchema.safeParse({email:null}).success,false);
});

test("dang ky va dang nhap patient lay phone tu Firebase token",async()=>{
    const phone=`08${suffix.slice(-8)}`.slice(0,10);
    const verifier=async()=>({uid:`firebase-${suffix}`,phone});
    const session=await registerPatient({
        firebaseIdToken:fakeToken(),
        fullName:"Firebase Patient",
        dateOfBirth:new Date("1992-02-02T00:00:00.000Z"),
        gender:Gender.FEMALE,
    },verifier);
    userIds.push(session.user.id);
    assert.equal(session.user.phone,phone);
    assert.equal(session.user.email,null);
    assert.ok(session.accessToken);
    const loggedIn=await loginPatient({firebaseIdToken:fakeToken()},verifier);
    assert.equal(loggedIn.user.id,session.user.id);
    await assert.rejects(
        loginPatient({firebaseIdToken:fakeToken()},async()=>({uid:"different-firebase-user",phone})),
        (error:unknown)=>error instanceof ApiError&&error.code==="FIREBASE_ACCOUNT_MISMATCH",
    );
    await assert.rejects(
        registerPatient({
            firebaseIdToken:fakeToken(),
            fullName:"Duplicate Patient",
            dateOfBirth:new Date("1992-02-02T00:00:00.000Z"),
            gender:Gender.FEMALE,
        },verifier),
        (error:unknown)=>error instanceof ApiError&&error.code==="PHONE_ALREADY_EXISTS",
    );
    await assert.rejects(
        loginPatient({firebaseIdToken:fakeToken()},async()=>{throw new Error("invalid");}),
        (error:unknown)=>error instanceof ApiError&&error.code==="INVALID_FIREBASE_TOKEN",
    );
});

test("email patient nullable va chi bat notification sau khi co email",async()=>{
    const patient=await createPatient(1);
    const initial=await getNotificationPreference(patient.id);
    assert.deepEqual(initial.channels,{push:true,email:false});
    await assert.rejects(
        updateNotificationPreference(patient.id,{channels:{email:true}}),
        (error:unknown)=>error instanceof ApiError&&error.code==="EMAIL_REQUIRED",
    );
    const email=`patient.${suffix}@example.com`;
    await updatePatientProfile(patient.id,{email});
    const enabled=await updateNotificationPreference(patient.id,{channels:{email:true}});
    assert.equal(enabled.channels.email,true);
    await updatePatientProfile(patient.id,{email:null});
    const cleared=await prisma.user.findUniqueOrThrow({where:{id:patient.id},select:{email:true}});
    const disabled=await getNotificationPreference(patient.id);
    assert.equal(cleared.email,null);
    assert.equal(disabled.channels.email,false);
});

test("patient chi co Firebase OTP, khong co password noi bo",async()=>{
    const patient=await createPatient(2);
    const stored=await prisma.user.findUniqueOrThrow({
        where:{id:patient.id},
        select:{passwordHash:true},
    });
    assert.equal(stored.passwordHash,null);
});

test("avatar patient va doctor luu URL tra ve tu Cloudinary uploader",async()=>{
    const patient=await createPatient(3);
    const doctor=await createDoctor(1);
    const file={buffer:Buffer.from("fake-image")} as Express.Multer.File;
    const uploader=async(_buffer:Buffer,userId:string,role:"patient"|"doctor")=>({
        url:`https://res.cloudinary.com/test/${role}-${userId}.webp`,
        publicId:`${role}-${userId}`,
    });
    const patientResult=await updatePatientAvatar(patient.id,file,uploader);
    const doctorResult=await updateDoctorAvatar(doctor.id,file,uploader);
    assert.match(patientResult.avatarUrl,/patient-/);
    assert.match(doctorResult.avatarUrl,/doctor-/);
    await assert.rejects(
        updatePatientAvatar(patient.id,undefined,uploader),
        (error:unknown)=>error instanceof ApiError&&error.code==="AVATAR_REQUIRED",
    );
});

test("doctor cap nhat profile va doi/reset mat khau bang OTP email",async()=>{
    const doctor=await createDoctor(4);
    const patient=await createPatient(6,`used.${suffix}@example.com`);
    const updated=await updateDoctorProfile(doctor.id,{
        email:`updated.doctor.${suffix}@example.com`,
        fullName:"Updated Doctor",
        yearsOfExperience:8,
    });
    assert.equal(updated.email,`updated.doctor.${suffix}@example.com`);
    assert.equal(updated.doctorProfile?.fullName,"Updated Doctor");
    await assert.rejects(
        updateDoctorProfile(doctor.id,{email:`used.${suffix}@example.com`}),
        (error:unknown)=>error instanceof ApiError&&error.code==="EMAIL_ALREADY_EXISTS",
    );
    let changeOtp="";
    await requestDoctorPasswordChangeOtp(doctor.id,async(message)=>{
        assert.equal(message.to,`updated.doctor.${suffix}@example.com`);
        changeOtp=extractOtp(message.text);
    });
    await assert.rejects(
        requestDoctorPasswordChangeOtp(doctor.id,async()=>{}),
        (error:unknown)=>error instanceof ApiError&&error.code==="PASSWORD_OTP_RESEND_TOO_SOON",
    );
    await assert.rejects(
        changeDoctorPassword(doctor.id,{
            currentPassword:"wrong-password",
            otp:changeOtp,
            newPassword:"NewDoctorPass123",
            confirmPassword:"NewDoctorPass123",
        }),
        (error:unknown)=>error instanceof ApiError&&error.code==="INVALID_CURRENT_PASSWORD",
    );
    await assert.rejects(
        changeDoctorPassword(doctor.id,{
            currentPassword:"DoctorPass123",
            otp:"000000"===changeOtp?"111111":"000000",
            newPassword:"NewDoctorPass123",
            confirmPassword:"NewDoctorPass123",
        }),
        (error:unknown)=>error instanceof ApiError&&error.code==="INVALID_PASSWORD_OTP",
    );
    await changeDoctorPassword(doctor.id,{
        currentPassword:"DoctorPass123",
        otp:changeOtp,
        newPassword:"NewDoctorPass123",
        confirmPassword:"NewDoctorPass123",
    });
    const passwordHash=await prisma.user.findUniqueOrThrow({
        where:{id:doctor.id},
        select:{passwordHash:true},
    });
    assert.equal(await bcrypt.compare("NewDoctorPass123",passwordHash.passwordHash!),true);

    let resetOtp="";
    let sentCount=0;
    await requestDoctorPasswordResetOtp(`unknown.${suffix}@example.com`,async()=>{sentCount+=1;});
    assert.equal(sentCount,0);
    await requestDoctorPasswordResetOtp(`updated.doctor.${suffix}@example.com`,async(message)=>{
        sentCount+=1;
        resetOtp=extractOtp(message.text);
    });
    assert.equal(sentCount,1);
    await resetDoctorPassword({
        email:`updated.doctor.${suffix}@example.com`,
        otp:resetOtp,
        newPassword:"ResetDoctorPass123",
        confirmPassword:"ResetDoctorPass123",
    });
    const resetHash=await prisma.user.findUniqueOrThrow({
        where:{id:doctor.id},
        select:{passwordHash:true},
    });
    assert.equal(await bcrypt.compare("ResetDoctorPass123",resetHash.passwordHash!),true);
    await assert.rejects(
        resetDoctorPassword({
            email:`updated.doctor.${suffix}@example.com`,
            otp:resetOtp,
            newPassword:"AnotherDoctorPass123",
            confirmPassword:"AnotherDoctorPass123",
        }),
        (error:unknown)=>error instanceof ApiError&&error.code==="PASSWORD_OTP_NOT_FOUND",
    );
    assert.ok(patient.id);
});

test("OTP password doctor chan het han, brute force va don OTP khi email loi",async()=>{
    const expiredDoctor=await createDoctor(5);
    let expiredOtp="";
    await requestDoctorPasswordChangeOtp(expiredDoctor.id,async(message)=>{
        expiredOtp=extractOtp(message.text);
    });
    await prisma.doctorPasswordOtp.update({
        where:{
            userID_purpose:{
                userID:expiredDoctor.id,
                purpose:DoctorPasswordOtpPurpose.CHANGE_PASSWORD,
            },
        },
        data:{expiresAt:new Date(Date.now()-1000)},
    });
    await assert.rejects(
        changeDoctorPassword(expiredDoctor.id,{
            currentPassword:"DoctorPass123",
            otp:expiredOtp,
            newPassword:"ExpiredDoctorPass123",
            confirmPassword:"ExpiredDoctorPass123",
        }),
        (error:unknown)=>error instanceof ApiError&&error.code==="PASSWORD_OTP_EXPIRED",
    );

    const lockedDoctor=await createDoctor(6);
    let correctOtp="";
    await requestDoctorPasswordChangeOtp(lockedDoctor.id,async(message)=>{
        correctOtp=extractOtp(message.text);
    });
    const wrongOtp=correctOtp==="000000"?"111111":"000000";
    for(let attempt=0;attempt<5;attempt+=1){
        await assert.rejects(
            changeDoctorPassword(lockedDoctor.id,{
                currentPassword:"DoctorPass123",
                otp:wrongOtp,
                newPassword:"LockedDoctorPass123",
                confirmPassword:"LockedDoctorPass123",
            }),
            (error:unknown)=>error instanceof ApiError&&error.code==="INVALID_PASSWORD_OTP",
        );
    }
    await assert.rejects(
        changeDoctorPassword(lockedDoctor.id,{
            currentPassword:"DoctorPass123",
            otp:correctOtp,
            newPassword:"LockedDoctorPass123",
            confirmPassword:"LockedDoctorPass123",
        }),
        (error:unknown)=>error instanceof ApiError&&error.code==="PASSWORD_OTP_MAX_ATTEMPTS",
    );

    const emailFailureDoctor=await createDoctor(7);
    await assert.rejects(
        requestDoctorPasswordChangeOtp(emailFailureDoctor.id,async()=>{
            throw new Error("SMTP unavailable");
        }),
        (error:unknown)=>error instanceof ApiError&&error.code==="EMAIL_SEND_FAILED",
    );
    const remainingOtp=await prisma.doctorPasswordOtp.count({
        where:{
            userID:emailFailureDoctor.id,
            purpose:DoctorPasswordOtpPurpose.CHANGE_PASSWORD,
        },
    });
    assert.equal(remainingOtp,0);
});

test("worker gui EMAIL dung dia chi hien tai va huy khi channel tat",async()=>{
    const patient=await createPatient(4,`notify.${suffix}@example.com`);
    const doctor=await createDoctor(2);
    await updateNotificationPreference(patient.id,{channels:{email:true,push:false}});
    const now=new Date();
    const appointment=await prisma.appointment.create({
        data:{
            doctorID:doctor.id,
            patientID:patient.id,
            startAt:new Date(now.getTime()+60*60*1000),
            endAt:new Date(now.getTime()+90*60*1000),
            visitReason:"Integration test",
            status:AppointmentStatus.CONFIRMED,
            confirmationDueAt:new Date(now.getTime()+15*60*1000),
        },
    });
    appointmentIds.push(appointment.id);
    const notification=await prisma.appointmentNotification.create({
        data:{
            appointmentID:appointment.id,
            recipientID:patient.id,
            type:AppointmentNotificationType.REMINDER_1_HOUR,
            channel:NotificationChannel.EMAIL,
            scheduledAt:new Date(now.getTime()-1000),
        },
    });
    const sentMessages:{to:string;subject:string;text:string}[]=[];
    const result=await sendDueAppointmentNotifications(now,{
        notificationIds:[notification.id],
        emailSender:async(message)=>{sentMessages.push(message);},
    });
    assert.equal(result.sentCount,1);
    assert.equal(sentMessages[0]?.to,`notify.${suffix}@example.com`);
    const stored=await prisma.appointmentNotification.findUniqueOrThrow({where:{id:notification.id}});
    assert.equal(stored.status,NotificationDeliveryStatus.SENT);

    await updateNotificationPreference(patient.id,{channels:{email:false}});
    const disabledNotification=await prisma.appointmentNotification.create({
        data:{
            appointmentID:appointment.id,
            recipientID:patient.id,
            type:AppointmentNotificationType.REMINDER_15_MINUTES,
            channel:NotificationChannel.EMAIL,
            scheduledAt:new Date(now.getTime()-1000),
        },
    });
    await sendDueAppointmentNotifications(now,{
        notificationIds:[disabledNotification.id],
        emailSender:async(message)=>{sentMessages.push(message);},
    });
    const cancelled=await prisma.appointmentNotification.findUniqueOrThrow({where:{id:disabledNotification.id}});
    assert.equal(cancelled.status,NotificationDeliveryStatus.CANCELLED);
    assert.equal(sentMessages.length,1);

    await updateNotificationPreference(patient.id,{channels:{email:true}});
    const retryNotification=await prisma.appointmentNotification.create({
        data:{
            appointmentID:appointment.id,
            recipientID:patient.id,
            type:AppointmentNotificationType.BOOKING_CREATED,
            channel:NotificationChannel.EMAIL,
            scheduledAt:new Date(now.getTime()-1000),
        },
    });
    const failed=await sendDueAppointmentNotifications(now,{
        notificationIds:[retryNotification.id],
        emailSender:async()=>{throw new Error("SMTP unavailable");},
    });
    assert.equal(failed.failedCount,1);
    const retry=await prisma.appointmentNotification.findUniqueOrThrow({where:{id:retryNotification.id}});
    assert.equal(retry.status,NotificationDeliveryStatus.PENDING);
    assert.equal(retry.attempts,1);
    assert.ok(retry.nextAttemptAt&&retry.nextAttemptAt>now);
});

test("HTTP profile routes kiem tra role, validation va multipart",async()=>{
    const patient=await createPatient(5);
    const doctor=await createDoctor(3);
    const patientToken=accessToken(patient);
    const doctorToken=accessToken(doctor);

    const patientUpdate=await request(app)
        .patch("/api/v1/patients/me")
        .set("Authorization",`Bearer ${patientToken}`)
        .send({fullName:"Updated Patient",email:`http.${suffix}@example.com`});
    assert.equal(patientUpdate.status,200);
    assert.equal(patientUpdate.body.data.email,`http.${suffix}@example.com`);

    const wrongRole=await request(app)
        .get("/api/v1/patients/me")
        .set("Authorization",`Bearer ${doctorToken}`);
    assert.equal(wrongRole.status,403);

    const doctorNullEmail=await request(app)
        .patch("/api/v1/doctors/me")
        .set("Authorization",`Bearer ${doctorToken}`)
        .send({email:null});
    assert.equal(doctorNullEmail.status,400);

    const doctorUpdate=await request(app)
        .patch("/api/v1/doctors/me")
        .set("Authorization",`Bearer ${doctorToken}`)
        .send({fullName:"HTTP Doctor",bio:"Updated doctor biography from HTTP test."});
    assert.equal(doctorUpdate.status,200);
    assert.equal(doctorUpdate.body.data.doctorProfile.fullName,"HTTP Doctor");

    const removedPatientPassword=await request(app)
        .patch("/api/v1/patients/me/password")
        .set("Authorization",`Bearer ${patientToken}`)
        .send({newPassword:"PatientPass123",confirmPassword:"PatientPass456"});
    assert.equal(removedPatientPassword.status,404);

    const doctorPasswordWithoutOtp=await request(app)
        .patch("/api/v1/doctors/me/password")
        .set("Authorization",`Bearer ${doctorToken}`)
        .send({
            currentPassword:"DoctorPass123",
            newPassword:"NewDoctorPass123",
            confirmPassword:"NewDoctorPass123",
        });
    assert.equal(doctorPasswordWithoutOtp.status,400);

    const removedPatientPasswordLogin=await request(app)
        .post("/api/v1/auth/login/patient/password")
        .send({phone:"0900000000",password:"PatientPass123"});
    assert.equal(removedPatientPasswordLogin.status,404);

    const missingAvatar=await request(app)
        .post("/api/v1/patients/me/avatar")
        .set("Authorization",`Bearer ${patientToken}`);
    assert.equal(missingAvatar.status,400);
    assert.equal(missingAvatar.body.error.code,"AVATAR_REQUIRED");

    const invalidAvatar=await request(app)
        .post("/api/v1/patients/me/avatar")
        .set("Authorization",`Bearer ${patientToken}`)
        .attach("avatar",Buffer.from("not-image"),{
            filename:"avatar.txt",
            contentType:"text/plain",
        });
    assert.equal(invalidAvatar.status,400);
    assert.equal(invalidAvatar.body.error.code,"INVALID_AVATAR_TYPE");

    const oldOtpRoute=await request(app)
        .post("/api/v1/auth/register/request-otp")
        .send({phone:"0900000000"});
    assert.equal(oldOtpRoute.status,404);
});
