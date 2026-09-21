import {app} from "./app.js";
import {createServer} from "node:http";
import {attachRealtime} from "./lib/realtime.js";
import { startAppointmentJobs } from "./modules/appointments/appointment.job.js";
import {prisma} from "./lib/prisma.js";

const port= Number(process.env.PORT??4000);

const server=createServer(app);
const realtime=attachRealtime(server);
server.requestTimeout=60_000;
server.headersTimeout=15_000;
server.keepAliveTimeout=5_000;
let stopJobs:(()=>Promise<void>)|undefined;
await prisma.$connect();
server.listen(port,"0.0.0.0",()=>{
    console.log(`API running at http://localhost:${port}`)
    stopJobs=startAppointmentJobs();
})

let stopping=false;
async function shutdown(){
    if(stopping)return;
    stopping=true;
    app.locals.draining=true;
    const deadline=setTimeout(()=>process.exit(1),25_000);
    deadline.unref();
    try{
        await Promise.all([
            new Promise<void>(resolve=>realtime.close(()=>resolve())),
            stopJobs?.(),
        ]);
        await prisma.$disconnect();
        clearTimeout(deadline);
        process.exitCode=0;
    }catch{
        console.error("Graceful shutdown failed");
        process.exit(1);
    }
}
process.on("SIGTERM",()=>void shutdown());
process.on("SIGINT",()=>void shutdown());
