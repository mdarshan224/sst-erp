import { z } from "zod";
export const policyNames = {
  privacy: "Privacy policy",
  terms: "Terms & conditions",
  refunds: "Cancellation & refunds",
  delivery: "Digital delivery policy",
} as const;
export const defaultPolicies = {
  privacy:
    "Information we collect\nWe collect the contact and institution details you submit when requesting a demonstration or support. The ERP processes student, guardian, staff, academic and financial records on behalf of subscribing institutions.\n\nHow information is used\nEnquiries are used to respond to your request and arrange relevant services. Institution records support authorised education administration, payments, receipts and communication. Institutions are responsible for appropriate notices, consent and lawful use of student data.\n\nService providers\nHosting, payment and messaging providers process information required to deliver their services. Payment credentials are entered with the selected payment provider. We do not sell enquiry information.\n\nRetention and security\nAccess is restricted by role and institution. Records are retained for service delivery and applicable financial, audit and legal obligations. No internet service can guarantee absolute security.\n\nYour choices\nUse our contact form to request access, correction or deletion of your enquiry information. For institution-managed student records, contact the institution first. Essential session storage supports authenticated ERP operations; this public website does not add advertising trackers.",
  terms:
    "About the service\nSohan Soft Tech ERP is an education administration software service for institutions. The scope, enabled modules, limits, price, taxes, subscription period and implementation requirements are agreed in the applicable order before payment.\n\nAuthorised use\nCustomers must provide accurate information, protect account access and use the service only for lawful, authorised purposes. Institutions control their users, academic rules and student records.\n\nPayments\nSubscription payments purchase ERP access; student fee payments belong to the institution’s separate merchant account. Payment confirmation requires server verification. A pending bank debit does not by itself confirm activation. Do not repeat payment without checking its status.\n\nThird-party services\nMessaging, custom domains and online payments require appropriate provider configuration, approvals and any applicable provider charges. Delivery and availability may depend on those providers.\n\nService changes and disputes\nAgreed subscription terms govern access and renewal. Contact us about service problems, payment discrepancies or cancellation. Nothing in these terms excludes rights that cannot be excluded under applicable law.",
  refunds:
    "Scope\nThis policy covers ERP subscriptions and implementation services purchased from us. Refunds of student fees are governed by the collecting institution and must be requested from that institution.\n\nCancellation\nSubmit a cancellation request through our contact form with your institution name and order reference. Do not include card details, passwords or OTPs. Cancellation and any refund eligibility depend on the accepted order terms and applicable law. Manual renewal does not authorise automatic recurring debits.\n\nIncorrect or duplicate charges\nReport a duplicate charge, incorrect amount or unsuccessful activation for investigation. We reconcile the payment with the provider before deciding the adjustment.\n\nRefund processing\nApproved refunds are returned through the original payment channel wherever supported. Eligibility, request deadlines and processing timelines must be disclosed in the accepted order before payment; bank posting time may be additional. You may request the refund reference and status through our contact form.",
  delivery:
    "A digital service\nWe supply ERP software access and related configuration services. No physical goods are shipped and no courier or shipping charge applies.\n\nActivation\nAccess is provisioned following verified payment, institution verification and any setup dependencies agreed in your order. The activation schedule and scope are confirmed before purchase. A payment acknowledgement is not confirmation that all onboarding tasks are complete.\n\nImplementation\nData import, branding, academic configuration and training follow the agreed implementation scope. Custom domains require DNS and SSL verification. Payment and messaging integrations require merchant or provider approval.\n\nDelivery issues\nIf access is not available within your agreed schedule, submit a support request with the institution and order reference. We will investigate access, configuration and payment status. See our cancellation and refund policy for payment-related requests.",
};
export const websiteSchema = z.object({
  brand: z.string().trim().min(2).max(70).default("Sohan ERP"),
  headline: z
    .string()
    .trim()
    .min(5)
    .max(120)
    .default("A brighter day. A connected campus."),
  description: z
    .string()
    .trim()
    .min(10)
    .max(400)
    .default(
      "From the first attendance mark to the final fee receipt. Bring your people, processes and possibilities together in one thoughtfully connected education ERP.",
    ),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#b88624"),
  legalName: z
    .string()
    .trim()
    .max(150)
    .default("SohanSoft Technologies Private Limited"),
  email: z.string().email().or(z.literal("")).default(""),
  phone: z.string().trim().max(30).default(""),
  address: z.string().trim().max(500).default(""),
  hours: z.string().trim().max(120).default(""),
  pricingNote: z
    .string()
    .trim()
    .max(1000)
    .default(
      "A plan shaped around your institution. Request a written quote with your modules, student count and implementation needs. Pricing, taxes, billing period and any provider charges are confirmed before purchase.",
    ),
  policies: z
    .object({
      privacy: z.string().min(100).max(16000),
      terms: z.string().min(100).max(16000),
      refunds: z.string().min(100).max(16000),
      delivery: z.string().min(100).max(16000),
    })
    .default(defaultPolicies),
});
export type WebsiteConfig = z.infer<typeof websiteSchema>;
export const websiteDefaults = websiteSchema.parse({});
export const enquirySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(180),
  phone: z.string().trim().max(30).default(""),
  institution: z.string().trim().min(2).max(160),
  topic: z.enum([
    "Demo request",
    "Customisation",
    "Billing & refunds",
    "Support",
    "Privacy request",
  ]),
  message: z.string().trim().min(10).max(3000),
  consent: z.literal(true),
  website: z.string().max(0).default(""),
});
