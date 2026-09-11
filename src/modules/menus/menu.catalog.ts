import type {UserRole} from "../../../generated/prisma/enums.js";

type Page={path:string;label:string;iconKey:string;badgeKey?:string;protected?:boolean};

// Only implemented, role-scoped pages can become navigation entries.
export const menuCatalog:Record<UserRole,Page[]>={
    PATIENT:[
        {path:"/patient/dashboard",label:"Tổng quan",iconKey:"Home"},
        {path:"/patient/doctors",label:"Đặt lịch hẹn",iconKey:"Calendar"},
        {path:"/patient/appointments",label:"Lịch hẹn",iconKey:"CalendarClock"},
        {path:"/patient/history",label:"Lịch sử khám",iconKey:"ClipboardList"},
        {path:"/notifications",label:"Thông báo",iconKey:"Bell",badgeKey:"UNREAD_NOTIFICATIONS"},
        {path:"/patient/profile",label:"Hồ sơ",iconKey:"UserRound"},
    ],
    DOCTOR:[
        {path:"/doctor/notifications",label:"Thông báo",iconKey:"Bell",badgeKey:"UNREAD_NOTIFICATIONS"},
        {path:"/doctor/dashboard",label:"Tổng quan",iconKey:"Home"},
        {path:"/doctor/requests",label:"Yêu cầu khám",iconKey:"ClipboardList",badgeKey:"PENDING_REQUESTS"},
        {path:"/doctor/appointments",label:"Lịch tư vấn",iconKey:"CalendarClock",badgeKey:"UPCOMING_APPOINTMENTS"},
        {path:"/doctor/schedule",label:"Lịch làm việc",iconKey:"Settings"},
        {path:"/doctor/reviews",label:"Đánh giá",iconKey:"MessageSquareText"},
        {path:"/doctor/statistics",label:"Thống kê",iconKey:"BarChart3"},
        {path:"/doctor/profile",label:"Hồ sơ",iconKey:"UserRound"},
    ],
    ADMIN:[
        {path:"/admin/dashboard",label:"Tổng quan",iconKey:"LayoutDashboard"},
        {path:"/admin/doctors",label:"Bác sĩ",iconKey:"Stethoscope"},
        {path:"/admin/patients",label:"Bệnh nhân",iconKey:"UsersRound"},
        {path:"/admin/specialties",label:"Chuyên khoa",iconKey:"Tags"},
        {path:"/admin/appointments",label:"Lịch hẹn",iconKey:"CalendarClock"},
        {path:"/admin/reviews",label:"Đánh giá",iconKey:"MessageSquareText"},
        {path:"/admin/menus",label:"Quản lý menu",iconKey:"ListTree",protected:true},
    ],
};

export const menuIcons=["Home","Calendar","CalendarClock","ClipboardList","Bell","UserRound","Settings","MessageSquareText","BarChart3","LayoutDashboard","Stethoscope","UsersRound","Tags","ListTree"] as const;
