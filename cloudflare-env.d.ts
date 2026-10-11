declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
declare namespace Cloudflare {
  interface Env {
    PROVIDER_ENCRYPTION_KEY?: string;
    PARENT_PORTAL_SECRET?: string;
    COMMUNICATION_QUEUE?: Queue<{
      institutionId: string;
      kind?: "delivery" | "financial";
    }>;
    JOB_SECRET?: string;
    PLATFORM_OWNER_EMAIL?: string;
    PLATFORM_ORIGIN?: string;
    CLOUDFLARE_API_TOKEN?: string;
    CLOUDFLARE_ZONE_ID?: string;
    CONNECTORS?: any;
  }
}
