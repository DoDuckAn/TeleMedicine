import assert from "node:assert/strict";
import {test} from "node:test";
import request from "supertest";
import {app} from "../src/app.js";
import {prisma} from "../src/lib/prisma.js";
import {signAccessToken} from "../src/lib/jwt.js";

test("admin membership atomicity, protected overrides and live patient profile",async()=>{
  const suffix=Date.now().toString();
  const ids:string[]=[];
  let specialtyId="";
  let appointmentId="";
  try{
    const admin=await prisma.user.create({data:{role:"ADMIN",email:`ui-admin-${suffix}@example.com`}});
    ids.push(admin.id);
    const createDoctor=async(status:"ACTIVE"|"DISABLED")=>{
      const doctor=await prisma.user.create({data:{
        role:"DOCTOR",status,
        doctorProfile:{create:{fullName:`UI ${status} ${suffix}`,qualifications:["MD"],avatarUrl:"https://example.com/test.png",bio:"UI regression fixture"}},
      }});
      ids.push(doctor.id);
      return doctor;
    };
    const doctor=await createDoctor("ACTIVE");
    const disabled=await createDoctor("DISABLED");
    const patient=await prisma.user.create({data:{role:"PATIENT",patientProfile:{create:{
      fullName:"UI Patient",dateOfBirth:new Date("1990-01-01"),drugAllergies:"Old allergy",
    }}}});
    ids.push(patient.id);
    const bearer=(user:typeof admin)=>`Bearer ${signAccessToken({sub:user.id,role:user.role,tokenVersion:user.tokenVersion})}`;
    const specialty=await prisma.specialty.create({data:{code:`UI_${suffix}`,name:`UI ${suffix}`}});
    specialtyId=specialty.id;
    const url=`/api/v1/specialties/${specialty.id}/doctors`;
    const patch=(body:object)=>request(app).patch(url).set("Authorization",bearer(admin)).send(body);
    assert.equal((await request(app).patch(url).set("Authorization",bearer(patient)).send({addDoctorIds:[doctor.id]})).status,403);
    assert.equal((await patch({addDoctorIds:[doctor.id]})).status,200);
    assert.equal((await patch({addDoctorIds:[doctor.id],removeDoctorIds:[doctor.id]})).status,400);
    assert.equal((await patch({addDoctorIds:[disabled.id],removeDoctorIds:[doctor.id]})).status,400);
    const retained=await prisma.specialty.findUniqueOrThrow({where:{id:specialty.id},include:{doctors:true}});
    assert.deepEqual(retained.doctors.map(item=>item.userID),[doctor.id]);
    const list=await request(app).get("/api/v1/specialties/admin/all").set("Authorization",bearer(admin));
    const item=list.body.data.find((entry:{id:string})=>entry.id===specialty.id);
    assert.equal(item._count.doctors,1);
    assert.equal(item.doctors,undefined);
    const overridesUrl=`/api/v1/admin/doctors/${disabled.id}/overrides`;
    assert.equal((await request(app).get(overridesUrl).set("Authorization",bearer(admin))).status,200);
    assert.equal((await request(app).get(overridesUrl).set("Authorization",bearer(doctor))).status,403);
    assert.equal((await request(app).get(overridesUrl+"?from=bad-date").set("Authorization",bearer(admin))).status,400);
    assert.equal((await request(app).get("/api/v1/admin/doctors/missing/overrides").set("Authorization",bearer(admin))).status,404);
    const appointment=await prisma.appointment.create({data:{
      doctorID:doctor.id,patientID:patient.id,startAt:new Date(Date.now()+86400000),
      endAt:new Date(Date.now()+88200000),visitReason:"UI profile test",status:"CONFIRMED",
      confirmationDueAt:new Date(Date.now()+900000),
    }});
    appointmentId=appointment.id;
    await prisma.patientProfile.update({where:{userID:patient.id},data:{drugAllergies:"Updated allergy"}});
    const detail=await request(app).get(`/api/v1/appointments/${appointment.id}`).set("Authorization",bearer(doctor));
    assert.equal(detail.status,200);
    assert.equal(detail.body.data.patient.drugAllergies,"Updated allergy");
    await prisma.specialty.update({where:{id:specialty.id},data:{status:"DISABLED",deletedAt:new Date()}});
    assert.equal((await patch({removeDoctorIds:[doctor.id]})).status,200);
    assert.equal((await patch({addDoctorIds:[doctor.id]})).status,409);
  }finally{
    if(appointmentId)await prisma.appointment.delete({where:{id:appointmentId}});
    if(specialtyId)await prisma.specialty.delete({where:{id:specialtyId}});
    await prisma.patientProfile.deleteMany({where:{userID:{in:ids}}});
    await prisma.user.deleteMany({where:{id:{in:ids}}});
    await prisma.$disconnect();
  }
});
