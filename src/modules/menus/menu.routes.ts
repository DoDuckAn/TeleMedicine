import {Router} from "express";
import {asyncHandler} from "../../common/async-handler.js";
import {requireAuth,requireRole} from "../../middleware/auth.middleware.js";
import {validateBody,validateParams} from "../../middleware/validate.middleware.js";
import * as controller from "./menu.controller.js";
import * as schema from "./menu.schema.js";

export const menuRouter=Router();
menuRouter.get("/me",requireAuth,asyncHandler(controller.mine));

export const adminMenuRouter=Router();
adminMenuRouter.use(requireAuth,requireRole("ADMIN"));
adminMenuRouter.get("/:role",validateParams(schema.menuRoleSchema),asyncHandler(controller.list));
adminMenuRouter.put("/:role",validateParams(schema.menuRoleSchema),validateBody(schema.saveMenuSchema),asyncHandler(controller.save));
adminMenuRouter.post("/:role/items",validateParams(schema.menuRoleSchema),validateBody(schema.createMenuItemSchema),asyncHandler(controller.create));
adminMenuRouter.patch("/:role/items/:id",validateParams(schema.menuItemParamsSchema),validateBody(schema.updateMenuItemSchema),asyncHandler(controller.update));
adminMenuRouter.put("/:role/order",validateParams(schema.menuRoleSchema),validateBody(schema.reorderMenuSchema),asyncHandler(controller.reorder));
adminMenuRouter.delete("/:role/items/:id",validateParams(schema.menuItemParamsSchema),validateBody(schema.deleteMenuItemSchema),asyncHandler(controller.remove));
