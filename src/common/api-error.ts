import {errorCatalog,type ApiErrorCode} from "./error-catalog.js";

export class ApiError extends Error {
    readonly statusCode:number;
    readonly code:ApiErrorCode;

    constructor(code:ApiErrorCode,public details?:unknown){
        const definition=errorCatalog[code];
        super(definition.message);
        this.name="ApiError";
        this.code=code;
        this.statusCode=definition.statusCode;
    }
}
