import {app} from "./app.js";
import { startAppointmentJobs } from "./modules/appointments/appointment.job.js";

const port= Number(process.env.PORT??4000);

app.listen(port,()=>{
    console.log(`API running at http://localhost:${port}`)
    startAppointmentJobs();
})
