import type {UserRole} from "../../../generated/prisma/enums.js";
import type {Prisma} from "../../../generated/prisma/client.js";
import type {z} from "zod";
import {ApiError} from "../../common/api-error.js";
import {prisma} from "../../lib/prisma.js";
import {menuCatalog,menuIcons} from "./menu.catalog.js";
import type {createMenuItemSchema,updateMenuItemSchema,reorderMenuSchema,saveMenuSchema} from "./menu.schema.js";

export async function getMenu(role:UserRole,admin=false,db:Prisma.TransactionClient=prisma){
    const menu=await db.roleMenu.findUnique({where:{role},include:{items:{where:admin?{}:{enabled:true},orderBy:[{order:"asc"},{id:"asc"}]}}});
    if(!menu)throw new ApiError("MENU_NOT_INITIALIZED");
    return {...menu,items:menu.items.map(item=>({...item,protected:menuCatalog[role].some(page=>page.path===item.path&&page.protected)})),
        ...(admin?{pages:menuCatalog[role],icons:menuIcons}:{})};
}

async function mutate(role:UserRole,version:number,change:(tx:Prisma.TransactionClient)=>Promise<void>){
    return prisma.$transaction(async tx=>{
        // Locks one role and rejects stale editors; failures roll back the version too.
        const lock=await tx.roleMenu.updateMany({where:{role,version},data:{version:{increment:1}}});
        if(!lock.count)throw new ApiError("MENU_VERSION_CONFLICT");
        await change(tx);
        return getMenu(role,true,tx);
    });
}

async function findItem(tx:Prisma.TransactionClient,role:UserRole,id:string){
    const item=await tx.menuItem.findFirst({where:{id,role}});
    if(!item)throw new ApiError("MENU_ITEM_NOT_FOUND");
    return item;
}

export function createItem(role:UserRole,input:z.infer<typeof createMenuItemSchema>){
    const page=menuCatalog[role].find(page=>page.path===input.path);
    if(!page)throw new ApiError("MENU_PATH_NOT_ALLOWED");
    return mutate(role,input.version,async tx=>{
        if(await tx.menuItem.findUnique({where:{role_path:{role,path:page.path}}}))throw new ApiError("MENU_PATH_EXISTS");
        const last=await tx.menuItem.aggregate({where:{role},_max:{order:true}});
        await tx.menuItem.create({data:{role,path:page.path,label:input.label,iconKey:input.iconKey??page.iconKey,badgeKey:page.badgeKey??null,order:(last._max.order??-1)+1}});
    });
}

export function updateItem(role:UserRole,id:string,input:z.infer<typeof updateMenuItemSchema>){
    return mutate(role,input.version,async tx=>{
        const item=await findItem(tx,role,id);
        if(input.enabled===false&&menuCatalog[role].some(page=>page.path===item.path&&page.protected))throw new ApiError("MENU_ITEM_PROTECTED");
        const data:Prisma.MenuItemUpdateInput={};
        if(input.label!==undefined)data.label=input.label;
        if(input.iconKey!==undefined)data.iconKey=input.iconKey;
        if(input.enabled!==undefined)data.enabled=input.enabled;
        await tx.menuItem.update({where:{id:item.id},data});
    });
}

export function reorder(role:UserRole,input:z.infer<typeof reorderMenuSchema>){
    return mutate(role,input.version,async tx=>{
        const items=await tx.menuItem.findMany({where:{role},select:{id:true}});
        if(items.length!==input.itemIds.length||items.some(item=>!input.itemIds.includes(item.id)))throw new ApiError("MENU_ORDER_INVALID");
        for(const [order,id] of input.itemIds.entries())await tx.menuItem.update({where:{id},data:{order}});
    });
}

export function deleteItem(role:UserRole,id:string,version:number){
    return mutate(role,version,async tx=>{
        const item=await findItem(tx,role,id);
        if(menuCatalog[role].some(page=>page.path===item.path&&page.protected))throw new ApiError("MENU_ITEM_PROTECTED");
        await tx.menuItem.delete({where:{id:item.id}});
    });
}

export function saveMenu(role:UserRole,input:z.infer<typeof saveMenuSchema>){
    return mutate(role,input.version,async tx=>{
        const catalog=menuCatalog[role];
        for(const item of input.items){
            if(!catalog.some(page=>page.path===item.path))throw new ApiError("MENU_PATH_NOT_ALLOWED");
        }
        const protectedPages=catalog.filter(page=>page.protected);
        if(protectedPages.some(page=>!input.items.some(item=>item.path===page.path&&item.enabled))){
            throw new ApiError("MENU_ITEM_PROTECTED");
        }

        const existing=await tx.menuItem.findMany({where:{role}});
        const existingById=new Map(existing.map(item=>[item.id,item]));
        const retainedIds=input.items.flatMap(item=>item.id?[item.id]:[]);
        for(const item of input.items){
            if(!item.id)continue;
            const current=existingById.get(item.id);
            if(!current||current.path!==item.path)throw new ApiError("MENU_ITEM_INVALID");
        }

        await tx.menuItem.deleteMany({where:{role,...(retainedIds.length?{id:{notIn:retainedIds}}:{})}});
        for(const [order,item] of input.items.entries()){
            const page=catalog.find(page=>page.path===item.path)!;
            const data={label:item.label,path:item.path,iconKey:item.iconKey,badgeKey:page.badgeKey??null,enabled:item.enabled,order,role};
            if(item.id)await tx.menuItem.update({where:{id:item.id},data});
            else await tx.menuItem.create({data});
        }
    });
}
