import assert from "node:assert/strict";
import {test} from "node:test";
import request from "supertest";
import {app} from "../src/app.js";
import {prisma} from "../src/lib/prisma.js";
import {signAccessToken} from "../src/lib/jwt.js";
import type {AppointmentStatus} from "../generated/prisma/enums.js";

test("appointment archives include terminal future requests but medical history stays chronological",async()=>{
  const userIds:string[]=[];
  const appointmentIds:string[]=[];
  let specialtyId="";
  try{
    const doctor=await prisma.user.create({data:{role:"DOCTOR",doctorProfile:{create:{fullName:"History Doctor",avatarUrl:"https://example.com/doctor.png",bio:"History fixture",qualifications:["MD"]}}}});
    userIds.push(doctor.id);
    const patient=await prisma.user.create({data:{role:"PATIENT",patientProfile:{create:{fullName:"History Patient",dateOfBirth:new Date("1990-01-01")}}}});
    userIds.push(patient.id);
    const otherDoctor=await prisma.user.create({data:{role:"DOCTOR",doctorProfile:{create:{fullName:"Other Doctor",avatarUrl:"https://example.com/other-doctor.png",bio:"Other history fixture",qualifications:["MD"]}}}});
    userIds.push(otherDoctor.id);
    const otherPatient=await prisma.user.create({data:{role:"PATIENT",patientProfile:{create:{fullName:"Other Patient",dateOfBirth:new Date("1990-01-01")}}}});
    userIds.push(otherPatient.id);
    const specialty=await prisma.specialty.create({data:{code:`HISTORY_${Date.now()}`,name:"Da liễu",doctors:{connect:{userID:doctor.id}}}});
    specialtyId=specialty.id;
    const make=async(status:AppointmentStatus,offset:number,doctorId=doctor.id,patientId=patient.id)=>{
      const startAt=new Date(Date.now()+offset*86400000);
      const appointment=await prisma.appointment.create({data:{
        doctorID:doctorId,patientID:patientId,status,startAt,
        endAt:new Date(startAt.getTime()+1800000),
        confirmationDueAt:new Date(Date.now()+900000),visitReason:"History regression fixture",
      }});
      appointmentIds.push(appointment.id);
      return appointment.id;
    };
    const completed=await make("COMPLETED",-1);
    const cancelled=await make("CANCELLED",1);
    const rejected=await make("REJECTED",2);
    const expired=await make("EXPIRED",3);
    await make("CONFIRMED",4);
    await make("PENDING_CONFIRMATION",5);
    await make("CANCELLED",1,otherDoctor.id,otherPatient.id);
    const bearer=(user:typeof patient)=>`Bearer ${signAccessToken({sub:user.id,role:user.role,tokenVersion:user.tokenVersion})}`;
    for(const actor of [patient,doctor]){
      const response=await request(app).get("/api/v1/appointments/history?limit=20").set("Authorization",bearer(actor));
      assert.equal(response.status,200);
      assert.deepEqual(new Set(response.body.data.items.map((item:{id:string})=>item.id)),new Set([completed,cancelled,rejected,expired]));
      assert.equal(response.body.data.pagination.total,4);
      assert.deepEqual(response.body.data.items[0].doctor.specialties,[{id:specialty.id,code:specialty.code,name:specialty.name}]);
    }
    const filtered=await request(app).get("/api/v1/appointments/history?status=CANCELLED&limit=1").set("Authorization",bearer(patient));
    assert.equal(filtered.status,200);
    assert.equal(filtered.body.data.pagination.total,1);
    assert.equal(filtered.body.data.items[0].id,cancelled);
    const medical=await request(app).get("/api/v1/appointments/patient/history").set("Authorization",bearer(patient));
    assert.equal(medical.status,200);
    assert.deepEqual(medical.body.data.items.map((item:{id:string})=>item.id),[completed]);
  }finally{
    await prisma.appointment.deleteMany({where:{id:{in:appointmentIds}}});
    if(specialtyId)await prisma.specialty.delete({where:{id:specialtyId}});
    await prisma.patientProfile.deleteMany({where:{userID:{in:userIds}}});
    await prisma.user.deleteMany({where:{id:{in:userIds}}});
    await prisma.$disconnect();
  }
});
