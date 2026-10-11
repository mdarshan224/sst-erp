export const solutions = [
  {
    slug: "fees-finance",
    title: "Fees & finance",
    eyebrow: "FROM FEE PLAN TO FINAL RECEIPT",
    intro:
      "Bring fee structures, collections, concessions and reporting into one traceable workflow. Give your accounts team the detail it needs without losing sight of the overall balance.",
    benefit:
      "A clear answer to “what is due, what was paid, and what remains?”",
    groups: [
      [
        "Structure fees your way",
        "Assign fees by academic year, class and student. Configure components, instalments and due dates, with student-specific concessions and scholarships.",
      ],
      [
        "Collect with context",
        "Find a student, review pending dues and payment history, and record a partial or full payment. Keep the collection connected to the right institution and academic year.",
      ],
      [
        "Keep the record complete",
        "Generate receipt PDFs, track refund records and maintain immutable financial history. Adjustments preserve the trail instead of silently rewriting earlier transactions.",
      ],
      [
        "Follow up on outstanding dues",
        "Use defaulter lists, outstanding reports and bulk reminders through configured messaging providers. Review daily collections and payment-method breakdowns.",
      ],
    ],
    flow: [
      "Configure fee structure",
      "Assign student dues",
      "Record or verify payment",
      "Issue receipt",
      "Review and reconcile",
    ],
    note: "Gateway processing fees and messaging charges are separate. Online refunds currently require processing through the provider dashboard and recording/reconciling the result in the ERP.",
  },
  {
    slug: "students-admissions",
    title: "Students & admissions",
    eyebrow: "A RECORD THAT GROWS WITH THE STUDENT",
    intro:
      "Keep student identity, guardian contacts, documents and academic placement connected. Make everyday student administration easier to find, review and maintain.",
    benefit:
      "Less searching through separate registers; more context in one place.",
    groups: [
      [
        "Organise the student record",
        "Maintain student details and guardian contacts alongside enrolment information. Give authorised staff a consistent place to review the record.",
      ],
      [
        "Place students correctly",
        "Associate students with the appropriate academic year, class, section and stream. Keep operational views aligned with their current academic placement.",
      ],
      [
        "Bring records in carefully",
        "Use supported import workflows and review validation feedback before committing records. Correct inconsistent source information before it becomes daily administrative work.",
      ],
      [
        "Manage academic transitions",
        "Support academic rollover and student status changes while preserving earlier financial and academic history. Review outstanding obligations as part of the institution’s process.",
      ],
    ],
    flow: [
      "Prepare student data",
      "Validate and import",
      "Assign academic placement",
      "Maintain records",
      "Review year-end transition",
    ],
    note: "Import templates, supported fields and migration scope should be checked during onboarding. Do not include unnecessary sensitive data in enquiry forms.",
  },
  {
    slug: "attendance-timetable",
    title: "Attendance & timetable",
    eyebrow: "GIVE THE SCHOOL DAY A CLEAR STRUCTURE",
    intro:
      "Connect teachers, subjects and sections to a timetable that can be reviewed before it is published. Record attendance with the context of sessions, holidays and early departures.",
    benefit:
      "Fewer avoidable scheduling conflicts and a clearer attendance record.",
    groups: [
      [
        "Check scheduling conflicts",
        "Validate teacher, room and section overlaps before saving a timetable. Review the generated schedule and make manual adjustments in draft.",
      ],
      [
        "Publish when ready",
        "Keep working timetables separate from published schedules. Make the approved timetable the reference for daily operations.",
      ],
      [
        "Handle the whole day",
        "For supported Nursery and PUC day-wise workflows, morning attendance carries through to the afternoon by default. Record early departure or half-day exceptions with a reason.",
      ],
      [
        "Respect non-teaching dates",
        "National holidays, term breaks and local events suppress ordinary attendance and timetable expectations without deleting historical records.",
      ],
    ],
    flow: [
      "Map teachers and subjects",
      "Generate a draft",
      "Resolve conflicts",
      "Publish timetable",
      "Record daily attendance",
    ],
    note: "Absence-triggered SMS or WhatsApp is a custom workflow requiring provider configuration, consent, approved templates and validation before activation.",
  },
  {
    slug: "examinations",
    title: "Examinations & results",
    eyebrow: "ASSESSMENT THAT FITS THE LEARNING STAGE",
    intro:
      "Support different assessment styles across Nursery, school and PUC. Bring exam setup, student registration, grading and admit cards into an organised workspace.",
    benefit:
      "A consistent process from exam preparation to controlled result publication.",
    groups: [
      [
        "Nursery assessments",
        "Use qualitative, activity-based assessment and assignment tracking rather than forcing every learning activity into a numerical mark.",
      ],
      [
        "School grading",
        "Configure formative and summative assessment policies around the institution’s selected requirements. Review grading rules before applying them.",
      ],
      [
        "PUC and competitive practice",
        "Keep board-awarded grades separate from mock-test results. KCET, JEE and NEET practice scoring can show cohort percentiles clearly identified as mock results.",
      ],
      [
        "Prepare exam documents",
        "Generate A4 admit cards with student details, photo, selected subjects, timetable and QR verification. Published results are locked against ordinary editing.",
      ],
    ],
    flow: [
      "Create exam and policy",
      "Register students",
      "Prepare admit cards",
      "Enter and review grades",
      "Publish results",
    ],
    note: "Institutions must confirm their applicable board rules. Mock cohort percentiles are not official competitive-exam percentiles or predictions.",
  },
  {
    slug: "transport-hostel",
    title: "Transport & hostel",
    eyebrow: "CAMPUS LIFE, CONNECTED TO ADMINISTRATION",
    intro:
      "Connect transport routes and hostel allocations to the students who use them—and to the fees those services generate.",
    benefit:
      "See the allocation and the related charge as parts of the same process.",
    groups: [
      [
        "Map the transport network",
        "Organise vehicles, drivers, routes and boarding stops. Link a student to the relevant stop and agreed transport rate.",
      ],
      [
        "Manage hostel capacity",
        "Maintain blocks, rooms and bed capacity. Review availability before allocating students and prevent overlapping bed assignments.",
      ],
      [
        "Generate recurring charges",
        "Use allocations to generate transport, boarding and mess fee invoices through the existing fee workflow. Duplicate monthly billing is guarded against.",
      ],
      [
        "Preserve agreed amounts",
        "Allocation rates are snapshotted so future rate changes do not rewrite invoices already issued. Review the student’s balance through the same financial history.",
      ],
    ],
    flow: [
      "Create routes or rooms",
      "Set capacity and rates",
      "Allocate students",
      "Generate recurring invoices",
      "Collect and review",
    ],
    note: "Facility charges currently use full calendar-month billing. GPS vehicle tracking and live bus-location features are not included in this workflow.",
  },
  {
    slug: "reports-insights",
    title: "Reports & operational visibility",
    eyebrow: "TURN RECORDS INTO A CLEARER NEXT STEP",
    intro:
      "Find the information that helps your teams decide what to collect, follow up, reconcile or review. Keep reports tied to the relevant institution and academic period.",
    benefit:
      "A shared financial picture that can be traced back to its source.",
    groups: [
      [
        "Review collections",
        "Inspect daily and period-based collection summaries, payment methods and receipts. Use the relevant filters before exporting.",
      ],
      [
        "Act on outstanding balances",
        "Review pending and overdue dues, class-level context and defaulter lists. Target reminders to the correct academic year.",
      ],
      [
        "Follow payment status",
        "Inspect successful, failed or pending transactions. Use provider checks to reconcile an existing online order without initiating another charge.",
      ],
      [
        "Export for the next task",
        "Use supported CSV, Excel and PDF outputs for administrative work. Permissions determine which users can view financial and operational reports.",
      ],
    ],
    flow: [
      "Choose scope and period",
      "Apply relevant filters",
      "Review source records",
      "Export or follow up",
      "Reconcile changes",
    ],
    note: "Reports reflect the data recorded and confirmed in the system. They are not a substitute for your institution’s statutory accounting or professional review.",
  },
  {
    slug: "security-control",
    title: "Security & institution control",
    eyebrow: "CLEAR BOUNDARIES. ACCOUNTABLE ACTIONS.",
    intro:
      "Give each team the access it needs while keeping institution data separated. Protect high-impact operations with server-side checks and an audit trail.",
    benefit: "The right access for the right responsibility.",
    groups: [
      [
        "Institution boundaries",
        "Tenant checks apply to server operations, not just navigation. Changing a browser link or institution identifier does not grant access to another institution.",
      ],
      [
        "Granular permissions",
        "Assign roles and functions for administrators, accounts staff and teachers. Platform administrators can use configurable permissions for institutional and operational controls.",
      ],
      [
        "Sensitive operations",
        "OTP authentication and stronger verification protect sensitive workflows. Institution deletion uses previews, fresh verification, a recovery window and resumable cleanup.",
      ],
      [
        "Traceable money and settings",
        "Merchant keys are encrypted server-side. Payment webhooks are verified and duplicate callbacks are guarded against. Financial entries and audit records preserve important history.",
      ],
    ],
    flow: [
      "Define responsibilities",
      "Assign permissions",
      "Configure integrations",
      "Review audit history",
      "Revisit access regularly",
    ],
    note: "Security is shared responsibility. Keep mobile access and provider accounts secure, review users regularly and avoid sharing credentials. No internet service can promise absolute security.",
  },
] as const;
export const benefits = [
  [
    "For institution leaders",
    "See the institution as one connected operation.",
    "Bring academic activity, collections and operational reporting into a shared system with controlled access.",
  ],
  [
    "For accounts teams",
    "Follow every payment with confidence.",
    "Review dues, partial payments, receipts, refunds and reconciliation without losing the financial trail.",
  ],
  [
    "For office administrators",
    "Spend less effort finding the right record.",
    "Keep student information, academic placement, documents and service allocations organised around the institution.",
  ],
  [
    "For teachers",
    "Make daily administration more consistent.",
    "Work with assigned classes, review timetables, record attendance and manage assessments within authorised access.",
  ],
  [
    "For parent communication",
    "Make follow-ups clearer and more relevant.",
    "Use configured providers to share fee reminders and receipts; agree on custom absence and school-update workflows during setup.",
  ],
  [
    "For growing institutions",
    "Build on a structure that can adapt.",
    "Configure academic years, classes, sections, modules, branding and team permissions around the institution’s needs.",
  ],
] as const;
export const faqs = [
  [
    "Which institutions can use Sohan ERP?",
    "Schools, PU colleges, colleges, academies and coaching institutions can configure their academic structure and required modules. The implementation scope is agreed for each institution.",
  ],
  [
    "Can we start with fees and add other modules later?",
    "Enabled modules and limits depend on your plan. Discuss the initial workflow and any later additions before agreeing on the setup.",
  ],
  [
    "Can we use our own branding and domain?",
    "Institution branding supports your name, logo and colour. Custom hostnames need DNS ownership, hosting and SSL verification through the configured Cloudflare setup.",
  ],
  [
    "Where do student fee payments go?",
    "Supported institution-owned Razorpay or Cashfree credentials allow fee payments into that institution’s merchant account. ERP subscription payments use the platform’s separate merchant settings.",
  ],
  [
    "Are SMS and WhatsApp included automatically?",
    "No. Supported providers, credentials, balance, recipient consent and any required template approval must be configured. Provider charges are separate.",
  ],
  [
    "Are absence messages available?",
    "The website shows absence messages as a custom workflow. The attendance trigger, approved template, recipient rules and delivery provider need to be agreed, configured and tested.",
  ],
  [
    "Can we move existing student and fee records?",
    "Supported imports can help bring records into the ERP. Field mapping, validations, historical data scope and opening balances need review before migration.",
  ],
  [
    "How are failed or pending payments handled?",
    "Staff can check the status of an existing provider order. Dues and receipts update only after confirmed settlement, with idempotency protecting repeated callbacks.",
  ],
  [
    "What is included in the quote?",
    "Agree on modules, student and user limits, billing period, taxes, implementation scope, provider charges and support arrangements before purchase.",
  ],
  [
    "Can the ERP guarantee board grading compliance?",
    "No automatic guarantee is made. Institutions configure and review their grading policies; official board grades remain separate from mock-exam results.",
  ],
  [
    "Is a demo or enquiry submission a subscription?",
    "No. A website enquiry creates a request for the administration team. It does not create an account, send a payment or activate a subscription.",
  ],
  [
    "How do we get started?",
    "Submit your institution details and requirements through the contact form. Include your approximate student count, modules, academic structure and import or integration needs.",
  ],
] as const;
