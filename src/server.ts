import {app} from "./app.js";
import {createServer} from "node:http";
import {attachRealtime} from "./lib/realtime.js";
import { startAppointmentJobs } from "./modules/appointments/appointment.job.js";

const port= Number(process.env.PORT??4000);

const server=createServer(app);
attachRealtime(server);
server.listen(port,()=>{
    console.log(`API running at http://localhost:${port}`)
    startAppointmentJobs();
})
