import assert from "node:assert/strict";
import {after,before,test} from "node:test";
import request from "supertest";
import {UserRole} from "../generated/prisma/enums.js";
import {app} from "../src/app.js";
import {signAccessToken} from "../src/lib/jwt.js";
import {prisma} from "../src/lib/prisma.js";

let adminId="";
let doctorId="";
let adminToken="";
let doctorToken="";

before(async()=>{
  const suffix=`menu-${Date.now()}`;
  const admin=await prisma.user.create({data:{role:UserRole.ADMIN,email:`${suffix}-admin@example.com`},select:{id:true,role:true,tokenVersion:true}});
  const doctor=await prisma.user.create({data:{role:UserRole.DOCTOR,email:`${suffix}-doctor@example.com`,doctorProfile:{create:{fullName:"Menu Test Doctor",qualifications:[],avatarUrl:"https://example.com/avatar.png",bio:"Menu test",weeklySchedule:{}}}},select:{id:true,role:true,tokenVersion:true}});
  adminId=admin.id;
  doctorId=doctor.id;
  adminToken=signAccessToken({sub:admin.id,role:admin.role,tokenVersion:admin.tokenVersion});
  doctorToken=signAccessToken({sub:doctor.id,role:doctor.role,tokenVersion:doctor.tokenVersion});
});

after(async()=>{
  await prisma.user.deleteMany({where:{id:{in:[adminId,doctorId]}}});
  await prisma.$disconnect();
});

test("authenticated users only receive their enabled role menu",async()=>{
  const response=await request(app).get("/api/v1/menus/me").set("Authorization",`Bearer ${doctorToken}`);
  assert.equal(response.status,200);
  assert.equal(response.body.data.role,"DOCTOR");
  assert.ok(response.body.data.items.every((item:{role:string;enabled:boolean})=>item.role==="DOCTOR"&&item.enabled));
});

test("non-admin cannot manage menus",async()=>{
  const response=await request(app).get("/api/v1/admin/menus/PATIENT").set("Authorization",`Bearer ${doctorToken}`);
  assert.equal(response.status,403);
});

test("admin updates labels and stale versions cannot overwrite changes",async()=>{
  const initial=await request(app).get("/api/v1/admin/menus/PATIENT").set("Authorization",`Bearer ${adminToken}`);
  const item=initial.body.data.items.find((entry:{path:string})=>entry.path==="/patient/dashboard");
  const originalLabel=item.label;
  const changed=await request(app).patch(`/api/v1/admin/menus/PATIENT/items/${item.id}`).set("Authorization",`Bearer ${adminToken}`).send({version:initial.body.data.version,label:"Trang bệnh nhân"});
  assert.equal(changed.status,200);
  assert.equal(changed.body.data.version,initial.body.data.version+1);

  const stale=await request(app).patch(`/api/v1/admin/menus/PATIENT/items/${item.id}`).set("Authorization",`Bearer ${adminToken}`).send({version:initial.body.data.version,label:"Ghi đè"});
  assert.equal(stale.status,409);
  assert.equal(stale.body.error.code,"MENU_VERSION_CONFLICT");

  const restored=await request(app).patch(`/api/v1/admin/menus/PATIENT/items/${item.id}`).set("Authorization",`Bearer ${adminToken}`).send({version:changed.body.data.version,label:originalLabel});
  assert.equal(restored.status,200);
});

test("admin cannot hide protected menu or add an unknown route",async()=>{
  const initial=await request(app).get("/api/v1/admin/menus/ADMIN").set("Authorization",`Bearer ${adminToken}`);
  const protectedItem=initial.body.data.items.find((entry:{path:string})=>entry.path==="/admin/menus");
  const hidden=await request(app).patch(`/api/v1/admin/menus/ADMIN/items/${protectedItem.id}`).set("Authorization",`Bearer ${adminToken}`).send({version:initial.body.data.version,enabled:false});
  assert.equal(hidden.status,400);
  assert.equal(hidden.body.error.code,"MENU_ITEM_PROTECTED");

  const invalid=await request(app).post("/api/v1/admin/menus/ADMIN/items").set("Authorization",`Bearer ${adminToken}`).send({version:initial.body.data.version,label:"Không hợp lệ",path:"https://example.com"});
  assert.equal(invalid.status,400);
  assert.equal(invalid.body.error.code,"MENU_PATH_NOT_ALLOWED");
});

test("admin saves a reordered menu as one versioned batch",async()=>{
  const initial=await request(app).get("/api/v1/admin/menus/PATIENT").set("Authorization",`Bearer ${adminToken}`);
  const original=(initial.body.data.items as Array<{id:string;label:string;path:string;iconKey:string;enabled:boolean}>).map(item=>({id:item.id,label:item.label,path:item.path,iconKey:item.iconKey,enabled:item.enabled}));
  const reversed=[...original].reverse();
  const changed=await request(app).put("/api/v1/admin/menus/PATIENT").set("Authorization",`Bearer ${adminToken}`).send({version:initial.body.data.version,items:reversed});
  assert.equal(changed.status,200);
  assert.deepEqual(changed.body.data.items.map((item:{path:string})=>item.path),reversed.map(item=>item.path));

  const stale=await request(app).put("/api/v1/admin/menus/PATIENT").set("Authorization",`Bearer ${adminToken}`).send({version:initial.body.data.version,items:original});
  assert.equal(stale.status,409);

  const restored=await request(app).put("/api/v1/admin/menus/PATIENT").set("Authorization",`Bearer ${adminToken}`).send({version:changed.body.data.version,items:original});
  assert.equal(restored.status,200);
});
