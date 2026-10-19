import assert from "node:assert/strict";
import {test} from "node:test";
import request from "supertest";
import {app} from "../src/app.js";
import {ApiError} from "../src/common/api-error.js";
import {signAccessToken} from "../src/lib/jwt.js";
import {prisma} from "../src/lib/prisma.js";
import {createDoctor} from "../src/modules/auth/auth.service.js";
import {createDoctorMultipartSchema} from "../src/modules/auth/auth.schema.js";

test("admin doctor creation accepts avatar files and preserves validation and upload cleanup",async()=>{
  const ids:string[]=[];
  let specialtyId="";
  const suffix=Date.now().toString();
  try{
    const admin=await prisma.user.create({data:{role:"ADMIN"}});
    const patient=await prisma.user.create({data:{role:"PATIENT"}});
    ids.push(admin.id,patient.id);
    const specialty=await prisma.specialty.create({data:{code:`AVATAR_${suffix}`,name:`Avatar ${suffix}`}});
    specialtyId=specialty.id;
    const profile={
      email:`avatar-${suffix}@example.com`,fullName:"Upload Doctor",yearsOfExperience:2,
      specialtyIds:[specialty.id],qualifications:["MD"],bio:"Doctor upload regression fixture.",weeklySchedule:{},
    };
    const input=createDoctorMultipartSchema.parse({profile:JSON.stringify(profile)});
    const bearer=(user:typeof admin)=>`Bearer ${signAccessToken({sub:user.id,role:user.role,tokenVersion:user.tokenVersion})}`;
    const endpoint="/api/v1/admin/doctors";
    const file={buffer:Buffer.from("upload-fixture")};
    let uploadCalls=0;
    const created=await createDoctor(input,file,async(buffer,id,role)=>{
      uploadCalls++;
      assert.deepEqual(buffer,file.buffer);
      assert.ok(id);
      assert.equal(role,"doctor");
      return {url:"https://example.com/uploaded.png",publicId:`doctor-${id}`};
    });
    ids.push(created.id);
    assert.equal(created.doctorProfile?.avatarUrl,"https://example.com/uploaded.png");
    await assert.rejects(createDoctor(input,file,async()=>{
      uploadCalls++;
      throw new Error("must not upload duplicate");
    }),(error:unknown)=>error instanceof ApiError&&error.code==="EMAIL_ALREADY_EXISTS");
    assert.equal(uploadCalls,1);

    const failedEmail=`avatar-failure-${suffix}@example.com`;
    await assert.rejects(createDoctor({...input,email:failedEmail},file,async()=>{throw new Error("upstream unavailable");}),
      (error:unknown)=>error instanceof ApiError&&error.code==="AVATAR_UPLOAD_FAILED");
    assert.equal(await prisma.user.count({where:{email:failedEmail}}),0);

    const raceEmail=`avatar-race-${suffix}@example.com`;
    let removed="";
    await assert.rejects(createDoctor({...input,email:raceEmail},file,async()=>{
      const collision=await prisma.user.create({data:{email:raceEmail,role:"DOCTOR"}});
      ids.push(collision.id);
      return {url:"https://example.com/race.png",publicId:"qa-upload-to-clean"};
    },async(publicId)=>{removed=publicId;}));
    assert.equal(removed,"qa-upload-to-clean");

    assert.equal((await request(app).post(endpoint).set("Authorization",bearer(patient)).field("profile",JSON.stringify(profile)).attach("avatar",file.buffer,{filename:"avatar.png",contentType:"image/png"})).status,403);
    assert.equal((await request(app).post(endpoint).set("Authorization",bearer(admin)).field("profile",JSON.stringify(profile))).body.error.code,"AVATAR_REQUIRED");
    assert.equal((await request(app).post(endpoint).set("Authorization",bearer(admin)).field("profile","{broken-json").attach("avatar",file.buffer,{filename:"avatar.png",contentType:"image/png"})).body.error.code,"VALIDATION_ERROR");
    assert.equal((await request(app).post(endpoint).set("Authorization",bearer(admin)).field("profile",JSON.stringify(profile)).attach("avatar",file.buffer,{filename:"avatar.txt",contentType:"text/plain"})).body.error.code,"INVALID_AVATAR_TYPE");
    assert.equal((await request(app).post(endpoint).set("Authorization",bearer(admin)).field("profile",JSON.stringify(profile)).attach("avatar",Buffer.alloc(5*1024*1024+1),{filename:"large.png",contentType:"image/png"})).body.error.code,"AVATAR_TOO_LARGE");
    const duplicate=await request(app).post(endpoint).set("Authorization",bearer(admin)).field("profile",JSON.stringify(profile)).attach("avatar",file.buffer,{filename:"avatar.png",contentType:"image/png"});
    assert.equal(duplicate.status,409);
    assert.equal(duplicate.body.error.code,"EMAIL_ALREADY_EXISTS");

    const legacy=await request(app).post(endpoint).set("Authorization",bearer(admin)).send({...profile,email:`legacy-${suffix}@example.com`,avatarUrl:"https://example.com/legacy.png"});
    assert.equal(legacy.status,201);
    ids.push(legacy.body.data.id);
    assert.equal(legacy.body.data.doctorProfile.avatarUrl,"https://example.com/legacy.png");
  }finally{
    if(specialtyId)await prisma.specialty.delete({where:{id:specialtyId}});
    await prisma.user.deleteMany({where:{id:{in:ids}}});
    await prisma.$disconnect();
  }
});
