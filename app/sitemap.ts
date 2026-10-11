import { solutions } from "@/features/website/details";
import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/features",
    "/benefits",
    "/implementation",
    "/faq",
    ...solutions.map((x) => "/solutions/" + x.slug),
    "/communication",
    "/pricing",
    "/about",
    "/contact",
    "/policies/privacy",
    "/policies/terms",
    "/policies/refunds",
    "/policies/delivery",
  ].map((path) => ({ url: "https://erp.sohansoft.in" + path }));
}
