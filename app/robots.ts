import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin", "/student-portal",
        "/campus",
        "/api/",
        "/portal",
        "/organization",
        "/auth",
      ],
    },
    sitemap: "https://erp.sohansoft.in/sitemap.xml",
  };
}
