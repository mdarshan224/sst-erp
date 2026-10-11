import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Bus,
  CreditCard,
  BarChart3,
  ShieldCheck,
  MessagesSquare,
} from "lucide-react";
export const modules = [
  {
    icon: CreditCard,
    name: "Fees & finance",
    description:
      "Flexible fee structures, instalments, concessions, scholarships and partial payments. Keep every rupee accounted for.",
    detail: "Collections · Refunds · Reconciliation",
  },
  {
    icon: GraduationCap,
    name: "Student management",
    description:
      "A connected student record, from admission and guardian contacts to academic history and documents.",
    detail: "Profiles · Imports · Academic rollover",
  },
  {
    icon: CalendarDays,
    name: "Attendance & timetable",
    description:
      "Day-wise attendance, half-day tracking and teacher schedules with conflict checks and draft approval.",
    detail: "Attendance · Sections · Holidays",
  },
  {
    icon: BookOpen,
    name: "Academics & exams",
    description:
      "Organise classes, streams and subjects. Manage assessments, results and print-ready admit cards.",
    detail: "Grading · Results · Admit cards",
  },
  {
    icon: MessagesSquare,
    name: "School communication",
    description:
      "Customise SMS and WhatsApp communication with your configured providers, templates and delivery history.",
    detail: "Fee reminders · Receipts · Custom workflows",
  },
  {
    icon: Bus,
    name: "Transport & hostel",
    description:
      "Connect routes, boarding stops, rooms and student allocations to the fees they generate.",
    detail: "Routes · Room allocation · Recurring dues",
  },
  {
    icon: BarChart3,
    name: "Reports & insights",
    description:
      "See collections, outstanding dues, defaulters and payment methods. Export what your accounts team needs.",
    detail: "Dashboards · CSV / Excel · PDF",
  },
  {
    icon: ShieldCheck,
    name: "Access & control",
    description:
      "Give each team member the access they need, with institution-level separation and auditable financial actions.",
    detail: "Roles · Permissions · Audit history",
  },
];
