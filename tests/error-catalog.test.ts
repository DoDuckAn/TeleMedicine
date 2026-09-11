import assert from "node:assert/strict";
import test from "node:test";
import {ApiError} from "../src/common/api-error.js";
import {errorCatalog} from "../src/common/error-catalog.js";

test("ApiError resolves status and message from the centralized catalog",()=>{
  const error=new ApiError("PHONE_ALREADY_EXISTS",{field:"phone"});
  assert.equal(error.statusCode,409);
  assert.equal(error.message,errorCatalog.PHONE_ALREADY_EXISTS.message);
  assert.equal(error.code,"PHONE_ALREADY_EXISTS");
  assert.deepEqual(error.details,{field:"phone"});
});

test("one HTTP status can represent multiple specific application errors",()=>{
  assert.equal(errorCatalog.EMAIL_ALREADY_EXISTS.statusCode,409);
  assert.equal(errorCatalog.MENU_VERSION_CONFLICT.statusCode,409);
  assert.notEqual(errorCatalog.EMAIL_ALREADY_EXISTS.message,errorCatalog.MENU_VERSION_CONFLICT.message);
});
