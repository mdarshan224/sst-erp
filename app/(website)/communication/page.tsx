import { Communication } from "@/features/website/Pages";
import { websiteConfig } from "@/server/website";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "SMS & WhatsApp communication | Sohan ERP",
  alternates: { canonical: "https://erp.sohansoft.in/communication" },
};
export default async function Page() {
  return <Communication config={await websiteConfig()} />;
}
