import type {Request,Response} from "express";
import {ok} from "../../common/response.js";
import {publishMenusChanged} from "../../lib/realtime.js";
import * as service from "./menu.service.js";
import {menuRoleSchema,menuItemParamsSchema} from "./menu.schema.js";

export async function mine(req:Request,res:Response){
    return ok(res,await service.getMenu(req.user!.role));
}
export async function list(req:Request,res:Response){
    return ok(res,await service.getMenu(menuRoleSchema.parse(req.params).role,true));
}
export async function create(req:Request,res:Response){
    const {role}=menuRoleSchema.parse(req.params);
    const data=await service.createItem(role,req.body);
    await publishMenusChanged(role);
    return ok(res,data,201);
}
export async function update(req:Request,res:Response){
    const {role,id}=menuItemParamsSchema.parse(req.params);
    const data=await service.updateItem(role,id,req.body);
    await publishMenusChanged(role);
    return ok(res,data);
}
export async function reorder(req:Request,res:Response){
    const {role}=menuRoleSchema.parse(req.params);
    const data=await service.reorder(role,req.body);
    await publishMenusChanged(role);
    return ok(res,data);
}
export async function remove(req:Request,res:Response){
    const {role,id}=menuItemParamsSchema.parse(req.params);
    const data=await service.deleteItem(role,id,req.body.version);
    await publishMenusChanged(role);
    return ok(res,data);
}
export async function save(req:Request,res:Response){
    const {role}=menuRoleSchema.parse(req.params);
    const data=await service.saveMenu(role,req.body);
    await publishMenusChanged(role);
    return ok(res,data);
}
