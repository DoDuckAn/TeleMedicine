import assert from "node:assert/strict";
import {after,before,test} from "node:test";
import bcrypt from "bcrypt";
import request from "supertest";
import {
    AppointmentNotificationType,
    AppointmentStatus,
    Gender,
    NotificationChannel,
    NotificationDeliveryStatus,
    SpecialtyStatus,
    UserRole,
    UserStatus,
} from "../generated/prisma/enums.js";
import {app} from "../src/app.js";
import {signAccessToken} from "../src/lib/jwt.js";
import {prisma} from "../src/lib/prisma.js";
import {sendDueAppointmentNotifications} from "../src/modules/appointments/appointment.notification.js";

const suffix=`${Date.now()}${Math.floor(Math.random()*1000)}`;
const userIds:string[]=[];
const appointmentIds:string[]=[];
const specialtyIds:string[]=[];

let admin:{id:string;role:UserRole;tokenVersion:number};
let doctor:{id:string;role:UserRole;tokenVersion:number};
let patient:{id:string;role:UserRole;tokenVersion:number};
let secondPatient:{id:string;role:UserRole;tokenVersion:number};
let adminToken="";
let doctorToken="";
let patientToken="";
let specialtyId="";

function token(user:{id:string;role:UserRole;tokenVersion:number}){
    return signAccessToken({sub:user.id,role:user.role,tokenVersion:user.tokenVersion});
}

async function createUserFixtures(){
    const passwordHash=await bcrypt.hash("AdminDoctorPass123",4);
    admin=await prisma.user.create({
        data:{
            role:UserRole.ADMIN,
            email:`admin.m08.${suffix}@example.com`,
            passwordHash,
        },
        select:{id:true,role:true,tokenVersion:true},
    });
    doctor=await prisma.user.create({
        data:{
            role:UserRole.DOCTOR,
            email:`doctor.m08.${suffix}@example.com`,
            passwordHash,
            doctorProfile:{
                create:{
                    fullName:`M08 Doctor ${suffix}`,
                    yearsOfExperience:7,
                    qualifications:["MD"],
                    avatarUrl:"https://example.com/m08-doctor.png",
                    bio:"Doctor fixture for the M08 administration tests.",
                    weeklySchedule:{},
                },
            },
        },
        select:{id:true,role:true,tokenVersion:true},
    });
    patient=await prisma.user.create({
        data:{
            role:UserRole.PATIENT,
            phone:`07${suffix.slice(-8)}`.slice(0,10),
            email:`patient.m08.${suffix}@example.com`,
            patientProfile:{
                create:{
                    fullName:`M08 Patient ${suffix}`,
                    dateOfBirth:new Date("1990-01-01T00:00:00.000Z"),
                    gender:Gender.FEMALE,
                },
            },
        },
        select:{id:true,role:true,tokenVersion:true},
    });
    secondPatient=await prisma.user.create({
        data:{
            role:UserRole.PATIENT,
            phone:`06${suffix.slice(-8)}`.slice(0,10),
            patientProfile:{
                create:{
                    fullName:`M08 Second Patient ${suffix}`,
                    dateOfBirth:new Date("1988-01-01T00:00:00.000Z"),
                    gender:Gender.MALE,
                },
            },
        },
        select:{id:true,role:true,tokenVersion:true},
    });
    userIds.push(admin.id,doctor.id,patient.id,secondPatient.id);
    adminToken=token(admin);
    doctorToken=token(doctor);
    patientToken=token(patient);
}

async function createDomainFixtures(){
    const specialty=await prisma.specialty.create({
        data:{
            code:`M08-${suffix}`,
            name:`M08 Specialty ${suffix}`,
            status:SpecialtyStatus.ACTIVE,
        },
    });
    specialtyId=specialty.id;
    specialtyIds.push(specialty.id);
    await prisma.doctorProfile.update({
        where:{userID:doctor.id},
        data:{specialties:{connect:{id:specialty.id}}},
    });
    const now=Date.now();
    const appointmentData=[
        {patientID:patient.id,status:AppointmentStatus.COMPLETED,startAt:new Date(now-3*24*60*60*1000)},
        {patientID:patient.id,status:AppointmentStatus.CANCELLED,startAt:new Date(now-2*24*60*60*1000)},
        {patientID:secondPatient.id,status:AppointmentStatus.CONFIRMED,startAt:new Date(now-1*24*60*60*1000)},
    ];
    for(const item of appointmentData){
        const appointment=await prisma.appointment.create({
            data:{
                doctorID:doctor.id,
                patientID:item.patientID,
                startAt:item.startAt,
                endAt:new Date(item.startAt.getTime()+30*60*1000),
                visitReason:"M08 administration statistics fixture",
                status:item.status,
                confirmationDueAt:new Date(item.startAt.getTime()-15*60*1000),
                ...(item.status===AppointmentStatus.COMPLETED?{completedAt:new Date(item.startAt.getTime()+30*60*1000)}:{}),
                ...(item.status===AppointmentStatus.CANCELLED?{cancelledAt:new Date(item.startAt.getTime()-60*60*1000)}:{}),
            },
        });
        appointmentIds.push(appointment.id);
    }
}

before(async()=>{
    await createUserFixtures();
    await createDomainFixtures();
});

after(async()=>{
    if(appointmentIds.length>0){
        await prisma.appointmentNotification.deleteMany({where:{appointmentID:{in:appointmentIds}}});
        await prisma.userNotification.deleteMany({where:{appointmentID:{in:appointmentIds}}});
        await prisma.appointmentStatusHistory.deleteMany({where:{appointmentID:{in:appointmentIds}}});
        await prisma.appointmentSlotReservation.deleteMany({where:{appointmentID:{in:appointmentIds}}});
        await prisma.appointment.deleteMany({where:{id:{in:appointmentIds}}});
    }
    if(userIds.length>0){
        await prisma.userStatusHistory.deleteMany({
            where:{OR:[{userID:{in:userIds}},{changedByID:{in:userIds}}]},
        });
        await prisma.notificationPreference.deleteMany({where:{userID:{in:userIds}}});
        await prisma.pushDeviceToken.deleteMany({where:{userID:{in:userIds}}});
        await prisma.refreshToken.deleteMany({where:{userId:{in:userIds}}});
        await prisma.doctorPasswordOtp.deleteMany({where:{userID:{in:userIds}}});
        await prisma.doctorScheduleOverride.deleteMany({where:{doctorID:{in:userIds}}});
        await prisma.doctorReview.deleteMany({
            where:{OR:[{doctorID:{in:userIds}},{patientID:{in:userIds}}]},
        });
        await prisma.doctorProfile.deleteMany({where:{userID:{in:userIds}}});
        await prisma.patientProfile.deleteMany({where:{userID:{in:userIds}}});
        await prisma.user.deleteMany({where:{id:{in:userIds}}});
    }
    if(specialtyIds.length>0){
        await prisma.specialty.deleteMany({where:{id:{in:specialtyIds}}});
    }
    await prisma.$disconnect();
});

test("admin list/detail/update doctor va tao doctor tu admin route",async()=>{
    const list=await request(app)
        .get(`/api/v1/admin/doctors?q=${encodeURIComponent(`M08 Doctor ${suffix}`)}&status=ACTIVE`)
        .set("Authorization",`Bearer ${adminToken}`);
    assert.equal(list.status,200);
    assert.equal(list.body.data.pagination.total,1);
    assert.equal(list.body.data.items[0].userID,doctor.id);

    const updatedEmail=`doctor.updated.m08.${suffix}@example.com`;
    const update=await request(app)
        .patch(`/api/v1/admin/doctors/${doctor.id}`)
        .set("Authorization",`Bearer ${adminToken}`)
        .send({
            email:updatedEmail,
            fullName:`Updated M08 Doctor ${suffix}`,
            yearsOfExperience:9,
            specialtyIds:[specialtyId],
        });
    assert.equal(update.status,200);
    assert.equal(update.body.data.user.email,updatedEmail);
    assert.equal(update.body.data.fullName,`Updated M08 Doctor ${suffix}`);

    const create=await request(app)
        .post("/api/v1/admin/doctors")
        .set("Authorization",`Bearer ${adminToken}`)
        .send({
            email:`created.doctor.m08.${suffix}@example.com`,
            fullName:`Created M08 Doctor ${suffix}`,
            yearsOfExperience:2,
            specialtyIds:[specialtyId],
            qualifications:["MD"],
            avatarUrl:"https://example.com/created-m08-doctor.png",
            bio:"Doctor account created from the M08 admin route.",
            weeklySchedule:{},
        });
    assert.equal(create.status,201);
    userIds.push(create.body.data.id);
});

test("admin list/detail patient va chan role khac truy cap",async()=>{
    const forbidden=await request(app)
        .get("/api/v1/admin/patients")
        .set("Authorization",`Bearer ${patientToken}`);
    assert.equal(forbidden.status,403);

    const list=await request(app)
        .get(`/api/v1/admin/patients?q=${encodeURIComponent(`M08 Patient ${suffix}`)}&gender=FEMALE`)
        .set("Authorization",`Bearer ${adminToken}`);
    assert.equal(list.status,200);
    assert.equal(list.body.data.pagination.total,1);
    assert.equal(list.body.data.items[0].userID,patient.id);

    const detail=await request(app)
        .get(`/api/v1/admin/patients/${patient.id}`)
        .set("Authorization",`Bearer ${adminToken}`);
    assert.equal(detail.status,200);
    assert.equal(detail.body.data.user.email,`patient.m08.${suffix}@example.com`);
});

test("dashboard admin va statistics doctor dung chung cong thuc",async()=>{
    const from=new Date(Date.now()-7*24*60*60*1000).toISOString();
    const to=new Date(Date.now()+24*60*60*1000).toISOString();
    const query=`from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&groupBy=day`;
    const adminDoctorStats=await request(app)
        .get(`/api/v1/admin/doctors/${doctor.id}/statistics?${query}`)
        .set("Authorization",`Bearer ${adminToken}`);
    const ownDoctorStats=await request(app)
        .get(`/api/v1/doctors/me/statistics?${query}`)
        .set("Authorization",`Bearer ${doctorToken}`);
    assert.equal(adminDoctorStats.status,200);
    assert.equal(ownDoctorStats.status,200);
    assert.deepEqual(adminDoctorStats.body.data.summary,ownDoctorStats.body.data.summary);
    assert.equal(adminDoctorStats.body.data.summary.totalAppointments,3);
    assert.equal(adminDoctorStats.body.data.summary.resolvedAppointments,2);
    assert.equal(adminDoctorStats.body.data.summary.completedAppointments,1);
    assert.equal(adminDoctorStats.body.data.summary.completionRate,50);
    assert.equal(adminDoctorStats.body.data.summary.uniquePatients,2);

    for(const groupBy of ["week","month"]){
        const grouped=await request(app)
            .get(`/api/v1/admin/doctors/${doctor.id}/statistics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&groupBy=${groupBy}`)
            .set("Authorization",`Bearer ${adminToken}`);
        assert.equal(grouped.status,200);
        assert.equal(
            grouped.body.data.appointmentsByPeriod.reduce(
                (total:number,item:{total:number})=>total+item.total,
                0,
            ),
            3,
        );
    }

    const invalidRange=await request(app)
        .get(`/api/v1/admin/dashboard?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`)
        .set("Authorization",`Bearer ${adminToken}`);
    assert.equal(invalidRange.status,400);

    const dashboard=await request(app)
        .get(`/api/v1/admin/dashboard?${query}`)
        .set("Authorization",`Bearer ${adminToken}`);
    assert.equal(dashboard.status,200);
    assert.ok(dashboard.body.data.summary.totalAppointments>=3);
    assert.ok(dashboard.body.data.system.newPatients>=2);
    assert.ok(Array.isArray(dashboard.body.data.system.topDoctors));

    const appointments=await request(app)
        .get(`/api/v1/appointments/admin/all?doctorId=${doctor.id}&${query}`)
        .set("Authorization",`Bearer ${adminToken}`);
    assert.equal(appointments.status,200);
    assert.equal(appointments.body.data.pagination.total,3);
});

test("admin khoa/mo doctor ghi audit va thu hoi session",async()=>{
    await prisma.pushDeviceToken.create({
        data:{
            userID:doctor.id,
            token:`m08-device-${suffix}`.padEnd(30,"x"),
            platform:"WEB",
        },
    });
    const disabled=await request(app)
        .patch(`/api/v1/admin/doctors/${doctor.id}/status`)
        .set("Authorization",`Bearer ${adminToken}`)
        .send({status:UserStatus.DISABLED,reason:"Tam khoa de kiem tra M08"});
    assert.equal(disabled.status,200);
    assert.equal(disabled.body.data.user.status,UserStatus.DISABLED);
    assert.equal(disabled.body.data.user.statusHistory[0].toStatus,UserStatus.DISABLED);

    const oldTokenResult=await request(app)
        .get("/api/v1/doctors/me")
        .set("Authorization",`Bearer ${doctorToken}`);
    assert.equal(oldTokenResult.status,403);
    const device=await prisma.pushDeviceToken.findFirstOrThrow({where:{userID:doctor.id}});
    assert.equal(device.enabled,false);

    const enabled=await request(app)
        .patch(`/api/v1/admin/doctors/${doctor.id}/status`)
        .set("Authorization",`Bearer ${adminToken}`)
        .send({status:UserStatus.ACTIVE,reason:"Da hoan tat kiem tra M08"});
    assert.equal(enabled.status,200);
    const staleTokenResult=await request(app)
        .get("/api/v1/doctors/me")
        .set("Authorization",`Bearer ${doctorToken}`);
    assert.equal(staleTokenResult.status,401);
});

test("account patient bi khoa khong duoc nhan notification den han",async()=>{
    const notification=await prisma.appointmentNotification.create({
        data:{
            appointmentID:appointmentIds[0]!,
            recipientID:patient.id,
            type:AppointmentNotificationType.REMINDER_1_HOUR,
            channel:NotificationChannel.EMAIL,
            scheduledAt:new Date(Date.now()-1000),
        },
    });
    const disabled=await request(app)
        .patch(`/api/v1/admin/patients/${patient.id}/status`)
        .set("Authorization",`Bearer ${adminToken}`)
        .send({status:UserStatus.DISABLED,reason:"Patient vi pham quy dinh test"});
    assert.equal(disabled.status,200);

    let emailSent=false;
    await sendDueAppointmentNotifications(new Date(),{
        notificationIds:[notification.id],
        emailSender:async()=>{emailSent=true;},
    });
    const stored=await prisma.appointmentNotification.findUniqueOrThrow({where:{id:notification.id}});
    assert.equal(emailSent,false);
    assert.equal(stored.status,NotificationDeliveryStatus.CANCELLED);
    assert.equal(stored.failureReason,"Recipient account disabled");
});
