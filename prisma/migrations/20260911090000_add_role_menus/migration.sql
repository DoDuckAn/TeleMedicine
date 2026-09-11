CREATE TABLE "RoleMenu" (
    "role" "UserRole" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RoleMenu_pkey" PRIMARY KEY ("role")
);

CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "label" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL,
    "badgeKey" TEXT,
    "order" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuItem_role_path_key" ON "MenuItem"("role", "path");
CREATE INDEX "MenuItem_role_enabled_order_idx" ON "MenuItem"("role", "enabled", "order");
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_role_fkey" FOREIGN KEY ("role") REFERENCES "RoleMenu"("role") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "RoleMenu" ("role") VALUES ('PATIENT'), ('DOCTOR'), ('ADMIN');

INSERT INTO "MenuItem" ("id", "role", "label", "path", "iconKey", "badgeKey", "order", "updatedAt") VALUES
('menu_patient_dashboard', 'PATIENT', 'Tổng quan', '/patient/dashboard', 'Home', NULL, 0, CURRENT_TIMESTAMP),
('menu_patient_doctors', 'PATIENT', 'Đặt lịch hẹn', '/patient/doctors', 'Calendar', NULL, 1, CURRENT_TIMESTAMP),
('menu_patient_appointments', 'PATIENT', 'Lịch hẹn', '/patient/appointments', 'CalendarClock', NULL, 2, CURRENT_TIMESTAMP),
('menu_patient_history', 'PATIENT', 'Lịch sử khám', '/patient/history', 'ClipboardList', NULL, 3, CURRENT_TIMESTAMP),
('menu_patient_notifications', 'PATIENT', 'Thông báo', '/notifications', 'Bell', 'UNREAD_NOTIFICATIONS', 4, CURRENT_TIMESTAMP),
('menu_patient_profile', 'PATIENT', 'Hồ sơ', '/patient/profile', 'UserRound', NULL, 5, CURRENT_TIMESTAMP),
('menu_doctor_notifications', 'DOCTOR', 'Thông báo', '/doctor/notifications', 'Bell', 'UNREAD_NOTIFICATIONS', 0, CURRENT_TIMESTAMP),
('menu_doctor_dashboard', 'DOCTOR', 'Tổng quan', '/doctor/dashboard', 'Home', NULL, 1, CURRENT_TIMESTAMP),
('menu_doctor_requests', 'DOCTOR', 'Yêu cầu khám', '/doctor/requests', 'ClipboardList', 'PENDING_REQUESTS', 2, CURRENT_TIMESTAMP),
('menu_doctor_appointments', 'DOCTOR', 'Lịch tư vấn', '/doctor/appointments', 'CalendarClock', 'UPCOMING_APPOINTMENTS', 3, CURRENT_TIMESTAMP),
('menu_doctor_schedule', 'DOCTOR', 'Lịch làm việc', '/doctor/schedule', 'Settings', NULL, 4, CURRENT_TIMESTAMP),
('menu_doctor_reviews', 'DOCTOR', 'Đánh giá', '/doctor/reviews', 'MessageSquareText', NULL, 5, CURRENT_TIMESTAMP),
('menu_doctor_statistics', 'DOCTOR', 'Thống kê', '/doctor/statistics', 'BarChart3', NULL, 6, CURRENT_TIMESTAMP),
('menu_doctor_profile', 'DOCTOR', 'Hồ sơ', '/doctor/profile', 'UserRound', NULL, 7, CURRENT_TIMESTAMP),
('menu_admin_dashboard', 'ADMIN', 'Tổng quan', '/admin/dashboard', 'LayoutDashboard', NULL, 0, CURRENT_TIMESTAMP),
('menu_admin_doctors', 'ADMIN', 'Bác sĩ', '/admin/doctors', 'Stethoscope', NULL, 1, CURRENT_TIMESTAMP),
('menu_admin_patients', 'ADMIN', 'Bệnh nhân', '/admin/patients', 'UsersRound', NULL, 2, CURRENT_TIMESTAMP),
('menu_admin_specialties', 'ADMIN', 'Chuyên khoa', '/admin/specialties', 'Tags', NULL, 3, CURRENT_TIMESTAMP),
('menu_admin_appointments', 'ADMIN', 'Lịch hẹn', '/admin/appointments', 'CalendarClock', NULL, 4, CURRENT_TIMESTAMP),
('menu_admin_reviews', 'ADMIN', 'Đánh giá', '/admin/reviews', 'MessageSquareText', NULL, 5, CURRENT_TIMESTAMP),
('menu_admin_menus', 'ADMIN', 'Quản lý menu', '/admin/menus', 'ListTree', NULL, 6, CURRENT_TIMESTAMP);
