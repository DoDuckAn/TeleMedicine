import {formatInTimeZone} from "date-fns-tz";
import {
    AppointmentStatus,
    UserRole,
    UserStatus,
} from "../../../generated/prisma/enums.js";
import {ApiError} from "../../common/api-error.js";
import {config} from "../../config/env.js";
import {prisma} from "../../lib/prisma.js";
import type {StatisticsQuery} from "./admin.schema.js";

const DAY_MS=24*60*60*1000;
const resolvedStatuses=new Set<AppointmentStatus>([
    AppointmentStatus.COMPLETED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.REJECTED,
    AppointmentStatus.EXPIRED,
    AppointmentStatus.NO_SHOW,
]);

function roundPercent(value:number){
    return Math.round(value*100)/100;
}

function localDateKey(date:Date){
    return formatInTimeZone(date,config.schedule.timezone,"yyyy-MM-dd");
}

function parseLogicalDate(value:string){
    const [year,month,day]=value.split("-").map(Number);
    return new Date(Date.UTC(year!,month!-1,day!));
}

function formatLogicalDate(date:Date){
    return [
        date.getUTCFullYear().toString().padStart(4,"0"),
        (date.getUTCMonth()+1).toString().padStart(2,"0"),
        date.getUTCDate().toString().padStart(2,"0"),
    ].join("-");
}

function periodKey(date:Date,groupBy:StatisticsQuery["groupBy"]){
    const localDate=localDateKey(date);
    if(groupBy==="day")return localDate;
    if(groupBy==="month")return `${localDate.slice(0,7)}-01`;
    const logicalDate=parseLogicalDate(localDate);
    const weekday=logicalDate.getUTCDay();
    const daysFromMonday=(weekday+6)%7;
    logicalDate.setUTCDate(logicalDate.getUTCDate()-daysFromMonday);
    return formatLogicalDate(logicalDate);
}

function nextPeriod(key:string,groupBy:StatisticsQuery["groupBy"]){
    const date=parseLogicalDate(key);
    if(groupBy==="day")date.setUTCDate(date.getUTCDate()+1);
    if(groupBy==="week")date.setUTCDate(date.getUTCDate()+7);
    if(groupBy==="month")date.setUTCMonth(date.getUTCMonth()+1,1);
    return formatLogicalDate(date);
}

function createChart(
    appointments:{startAt:Date;status:AppointmentStatus}[],
    from:Date,
    to:Date,
    groupBy:StatisticsQuery["groupBy"],
){
    const buckets=new Map<string,{total:number;completed:number}>();
    let cursor=periodKey(from,groupBy);
    const last=periodKey(to,groupBy);
    while(cursor<=last){
        buckets.set(cursor,{total:0,completed:0});
        cursor=nextPeriod(cursor,groupBy);
    }
    for(const appointment of appointments){
        const key=periodKey(appointment.startAt,groupBy);
        const bucket=buckets.get(key)??{total:0,completed:0};
        bucket.total+=1;
        if(appointment.status===AppointmentStatus.COMPLETED)bucket.completed+=1;
        buckets.set(key,bucket);
    }
    return [...buckets.entries()].map(([period,value])=>({period,...value}));
}

function resolveRange(query:StatisticsQuery,now:Date){
    const to=query.to??now;
    const from=query.from??new Date(to.getTime()-29*DAY_MS);
    if(from>=to){
        throw new ApiError("INVALID_STATISTICS_RANGE");
    }
    if(to.getTime()-from.getTime()>366*DAY_MS){
        throw new ApiError("STATISTICS_RANGE_TOO_LARGE");
    }
    return {from,to};
}

export async function getAppointmentStatistics(
    query:StatisticsQuery,
    doctorId?:string,
    now=new Date(),
){
    const {from,to}=resolveRange(query,now);
    const doctor=doctorId?await prisma.doctorProfile.findUnique({
        where:{userID:doctorId},
        select:{
            userID:true,
            fullName:true,
            avatarUrl:true,
            user:{select:{status:true}},
        },
    }):null;
    if(doctorId&&!doctor){
        throw new ApiError("DOCTOR_NOT_FOUND");
    }
    const appointments=await prisma.appointment.findMany({
        where:{
            startAt:{gte:from,lte:to},
            ...(doctorId?{doctorID:doctorId}:{}),
        },
        select:{
            doctorID:true,
            patientID:true,
            startAt:true,
            endAt:true,
            status:true,
        },
        orderBy:{startAt:"asc"},
    });
    const statusBreakdown=Object.fromEntries(
        Object.values(AppointmentStatus).map((status)=>[status,0]),
    ) as Record<AppointmentStatus,number>;
    for(const appointment of appointments){
        statusBreakdown[appointment.status]+=1;
    }
    const completedAppointments=statusBreakdown[AppointmentStatus.COMPLETED];
    const resolvedAppointments=appointments.filter((appointment)=>(
        resolvedStatuses.has(appointment.status)
    )).length;
    const base={
        scope:doctor?{
            type:"DOCTOR" as const,
            doctor:{
                id:doctor.userID,
                fullName:doctor.fullName,
                avatarUrl:doctor.avatarUrl,
                status:doctor.user.status,
            },
        }:{type:"SYSTEM" as const},
        range:{from,to,groupBy:query.groupBy,timezone:config.schedule.timezone},
        summary:{
            totalAppointments:appointments.length,
            resolvedAppointments,
            completedAppointments,
            completionRate:resolvedAppointments===0
                ?0
                :roundPercent(completedAppointments/resolvedAppointments*100),
            uniquePatients:new Set(appointments.map((item)=>item.patientID)).size,
        },
        statusBreakdown,
        appointmentsByPeriod:createChart(appointments,from,to,query.groupBy),
    };
    if(doctor)return base;

    const newPatients=await prisma.patientProfile.count({where:{createdAt:{gte:from,lte:to}}});
    const totalPatients=await prisma.user.count({where:{role:UserRole.PATIENT}});
    const activePatients=await prisma.user.count({
        where:{role:UserRole.PATIENT,status:UserStatus.ACTIVE},
    });
    const activeDoctors=await prisma.user.count({
        where:{role:UserRole.DOCTOR,status:UserStatus.ACTIVE},
    });
    const doctorActivity=new Map<string,{total:number;completed:number}>();
    for(const appointment of appointments){
        const activity=doctorActivity.get(appointment.doctorID)??{total:0,completed:0};
        activity.total+=1;
        if(appointment.status===AppointmentStatus.COMPLETED)activity.completed+=1;
        doctorActivity.set(appointment.doctorID,activity);
    }
    const topDoctorIds=[...doctorActivity.entries()]
        .sort((left,right)=>right[1].total-left[1].total||right[1].completed-left[1].completed)
        .slice(0,5)
        .map(([id])=>id);
    const topDoctorProfiles=topDoctorIds.length===0?[]:await prisma.doctorProfile.findMany({
        where:{userID:{in:topDoctorIds}},
        select:{userID:true,fullName:true,avatarUrl:true,user:{select:{status:true}}},
    });
    const profileById=new Map(topDoctorProfiles.map((item)=>[item.userID,item]));
    const topDoctors=topDoctorIds.flatMap((id)=>{
        const profile=profileById.get(id);
        const activity=doctorActivity.get(id);
        if(!profile||!activity)return [];
        return [{
            id,
            fullName:profile.fullName,
            avatarUrl:profile.avatarUrl,
            status:profile.user.status,
            totalAppointments:activity.total,
            completedAppointments:activity.completed,
        }];
    });
    return {
        ...base,
        system:{newPatients,totalPatients,activePatients,activeDoctors,topDoctors},
    };
}
