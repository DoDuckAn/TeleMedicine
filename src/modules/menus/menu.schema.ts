import {z} from "zod";
import {menuIcons} from "./menu.catalog.js";

export const menuRoleSchema=z.object({role:z.enum(["PATIENT","DOCTOR","ADMIN"])});
export const menuItemParamsSchema=menuRoleSchema.extend({id:z.string().min(1).max(100)});
const version=z.number().int().nonnegative();
const label=z.string().trim().min(1).max(60);
export const createMenuItemSchema=z.object({version,label,path:z.string().max(120),iconKey:z.enum(menuIcons).optional()}).strict();
export const updateMenuItemSchema=z.object({version,label:label.optional(),iconKey:z.enum(menuIcons).optional(),enabled:z.boolean().optional()}).strict()
    .refine(data=>data.label!==undefined||data.iconKey!==undefined||data.enabled!==undefined,{message:"Can cung cap truong cap nhat"});
export const reorderMenuSchema=z.object({version,itemIds:z.array(z.string().min(1).max(100)).min(1).max(100)}).strict()
    .refine(data=>new Set(data.itemIds).size===data.itemIds.length,{message:"Danh sach ID bi trung"});
export const deleteMenuItemSchema=z.object({version}).strict();
export const saveMenuSchema=z.object({
    version,
    items:z.array(z.object({
        id:z.string().min(1).max(100).optional(),
        label,
        path:z.string().min(1).max(120),
        iconKey:z.enum(menuIcons),
        enabled:z.boolean(),
    }).strict()).max(100),
}).strict().refine(data=>new Set(data.items.map(item=>item.path)).size===data.items.length,{message:"Duong dan menu bi trung"});
