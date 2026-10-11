import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  all,
  batch,
  insert,
  now,
  one,
  run,
  stamps,
  stmt,
  uuid,
  Row,
} from "./db";
import { Actor, ApiError, permitPlatform, rateLimit, sha256 } from "./security";
import { platformAudit } from "./tenancy";
import { sendSecurityOtp } from "./sms-auth";
import { cloudflareHostname } from "./cloudflare-hostnames";
const identifier = (value: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
    throw new Error("Invalid schema identifier");
  return '"' + value + '"';
};
const excluded = new Set([
  "institution_deletion_jobs",
  "institution_deletion_challenges",
]);
const financial = new Set([
  "institution_domains",
  "invoices",
  "invoice_items",
  "payments",
  "payment_allocations",
  "refunds",
  "refund_allocations",
  "receipts",
  "journal_events",
  "ledger_entries",
  "fee_adjustments",
  "cash_entries",
  "cash_closings",
  "reconciliation_records",
  "bank_posted_rows",
  "subscription_payments",
  "billing_orders",
  "billing_events",
  "billing_postings",
  "audit_logs",
  "platform_audit_logs",
  "document_artifacts",
  "donation_certificates",
]);
export async function deletionInventory(id: string) {
  // Read schema metadata in two statements, then count only this tenant in
  // bounded scalar-subquery batches. Never cache tenant counts or interpolate tenant IDs.
  const tables = await all<{ name: string; immutable: number }>(
    `WITH user_tables AS MATERIALIZED (SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND lower(substr(name,1,4))<>'_cf_')
     SELECT m.name, EXISTS(SELECT 1 FROM sqlite_master t WHERE t.type='trigger'
       AND t.tbl_name=m.name AND upper(t.sql) LIKE '%BEFORE DELETE%') immutable
     FROM user_tables m WHERE 1=1
       AND EXISTS(SELECT 1 FROM pragma_table_info(m.name) c WHERE c.name='institution_id')
     ORDER BY m.name`,
  );
  const foreignKeys = await all<{ name: string; parent: string }>(
    `WITH user_tables AS MATERIALIZED (SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND lower(substr(name,1,4))<>'_cf_')
     SELECT m.name, f."table" parent FROM user_tables m JOIN pragma_foreign_key_list(m.name) f`,
  );
  const selected = tables.filter(
    ({ name }) => !excluded.has(name) && !name.toLowerCase().startsWith("_cf_"),
  );
  const counts = new Map<string, number>();
  for (let offset = 0; offset < selected.length; offset += 10) {
    const group = selected.slice(offset, offset + 10);
    const countsRow = await one<Record<string, number>>(
      "SELECT " +
        group
          .map(
            ({ name }) =>
              `(SELECT COUNT(*) FROM ${identifier(name)} WHERE institution_id=?) AS ${identifier(name)}`,
          )
          .join(", "),
      group.map(() => id),
    );
    for (const { name } of group) counts.set(name, countsRow?.[name] || 0);
  }
  const entries = selected.map(({ name, immutable }) => {
    const count = counts.get(name) || 0;
    return {
      table: name,
      count,
      retained:
        name === "institution_domains" ||
        (count > 0 && (financial.has(name) || !!immutable)),
      reason:
        name === "institution_domains"
          ? "Disconnect remote hostname before final purge"
          : financial.has(name)
            ? "Financial / audit retention"
            : immutable
              ? "Immutable history"
              : "Operational data",
      parents: foreignKeys
        .filter((key) => key.name === name)
        .map((key) => key.parent),
    };
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of entries.filter((e) => e.retained))
      for (const p of e.parents) {
        const parent = entries.find((x) => x.table === p);
        if (parent && !parent.retained) {
          parent.retained = true;
          parent.reason = "Required reference for retained history";
          changed = true;
        }
      }
  }
  // Children first. Cycles or unknown dependencies are retained, never guessed away.
  const pending = entries.filter((e) => !e.retained),
    ordered: typeof entries = [];
  while (pending.length) {
    const leaf = pending.find(
      (e) =>
        !pending.some(
          (child) => child !== e && child.parents.includes(e.table),
        ),
    );
    if (!leaf) {
      for (const e of pending) {
        e.retained = true;
        e.reason = "Dependency cycle requires review";
      }
      break;
    }
    ordered.push(leaf);
    pending.splice(pending.indexOf(leaf), 1);
  }
  return {
    entries,
    purgeOrder: ordered.map((e) => e.table),
    policy:
      "Immutable financial, academic and audit history and required references remain locked in a deleted-tenant tombstone. Shared user identities are preserved. Operational records are purged only after a seven-day recovery window; each batch is encrypted and verified in recovery storage first.",
  };
}
export async function cleanupPreview(actor: Actor) {
  permitPlatform(actor, "institutions.delete");
  const rows = await all(
    "SELECT id,name,institution_code,status,slug,created_at FROM institutions ORDER BY name LIMIT 500",
  );
  return {
    rows: rows.map((i) => ({
      ...i,
      classification:
        i.id === "70a45679-cbbd-48aa-a126-34c73d631853" &&
        i.institution_code === "CL-TEST"
          ? "Confirmed test — keep"
          : i.institution_code === "GV-TEST" &&
              i.slug === "green-valley-test-school"
            ? "Known validation tenant — keep"
            : i.id === "csa-email55295bd5aa15fb7f9c5a1c57b15"
              ? "Seed provenance — review current use"
              : "Unconfirmed — review required",
    })),
    automaticDeletion: false,
  };
}
async function recoveryKey() {
  if (!env.BUCKET || !/^[a-f0-9]{64}$/.test(env.PROVIDER_ENCRYPTION_KEY || ""))
    throw new ApiError(
      503,
      "RECOVERY_UNAVAILABLE",
      "Encrypted recovery storage must be configured before deletion.",
    );
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(env.PROVIDER_ENCRYPTION_KEY!.match(/../g)!, (v) =>
      parseInt(v, 16),
    ),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
async function archive(job: Row, key: string, content: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(job.id) },
    await recoveryKey(),
    new TextEncoder().encode(content),
  );
  const value = JSON.stringify({
    iv: btoa(String.fromCharCode(...iv)),
    cipher: btoa(
      Array.from(new Uint8Array(cipher), (x) => String.fromCharCode(x)).join(
        "",
      ),
    ),
  });
  await env.BUCKET!.put(key, value);
  const persisted = await env.BUCKET!.get(key);
  if (!persisted || (await persisted.text()) !== value)
    throw new ApiError(
      503,
      "SNAPSHOT_FAILED",
      "Recovery snapshot could not be verified. No batch was deleted.",
    );
}
async function sessionHash(actor: Actor) {
  return sha256(
    actor.userId + ":" + (actor.request.headers.get("cookie") || ""),
  );
}
async function challenge(actor: Actor, id: string, action: string) {
  await recoveryKey();
  await rateLimit(actor.request, "delete-otp:" + actor.userId, 3);
  const mobile = await one("SELECT mobile FROM sms_accounts WHERE user_id=?", [
    actor.userId,
  ]);
  if (!mobile)
    throw new ApiError(
      422,
      "VERIFIED_MOBILE_REQUIRED",
      "Configure your own administrator SMS login before deletion.",
    );
  const latest = await one(
    "SELECT created_at FROM institution_deletion_challenges WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
    [actor.userId],
  );
  if (latest && Date.now() - Date.parse(latest.created_at) < 60000)
    throw new ApiError(
      429,
      "OTP_COOLDOWN",
      "Wait one minute before requesting another security code.",
    );
  const random = new Uint32Array(1);
  let number: number;
  do {
    crypto.getRandomValues(random);
    number = random[0];
  } while (number >= 4294000000);
  const otp = String(number % 1000000).padStart(6, "0"),
    challengeId = uuid(),
    expires = new Date(Date.now() + 300000).toISOString();
  await batch([
    stmt(
      "UPDATE institution_deletion_challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL",
      [now(), actor.userId],
    ),
    insert("institution_deletion_challenges", {
      id: challengeId,
      institution_id: id,
      user_id: actor.userId,
      session_hash: await sessionHash(actor),
      action,
      otp_hash: await sha256(challengeId + ":" + otp),
      expires_at: expires,
      attempts: 0,
      created_at: now(),
    }),
  ]);
  try {
    await sendSecurityOtp(mobile.mobile, otp);
  } catch (error) {
    await run(
      "UPDATE institution_deletion_challenges SET consumed_at=? WHERE id=?",
      [now(), challengeId],
    );
    throw error;
  }
  await batch([
    platformAudit(
      actor,
      "Issued fresh deletion OTP",
      "institution_deletion_challenges",
      challengeId,
      null,
      { action, expiresAt: expires },
      id,
    ),
  ]);
  return {
    challengeId,
    expiresAt: expires,
    mobile: "******" + mobile.mobile.slice(-4),
  };
}
async function consume(
  actor: Actor,
  id: string,
  action: string,
  body: unknown,
  name: string,
) {
  const d = z
    .object({
      institutionName: z.literal(name),
      secondWarningAccepted: z.literal(true),
      challengeId: z.string(),
      otp: z.string().regex(/^\d{6}$/),
    })
    .parse(body);
  const c = await one(
    "SELECT * FROM institution_deletion_challenges WHERE id=? AND institution_id=? AND user_id=? AND action=? AND session_hash=?",
    [d.challengeId, id, actor.userId, action, await sessionHash(actor)],
  );
  if (!c || c.consumed_at || c.expires_at <= now() || c.attempts >= 5)
    throw new ApiError(
      403,
      "OTP_EXPIRED",
      "Security code expired, consumed or locked. Request a fresh code.",
    );
  const valid = (await sha256(c.id + ":" + d.otp)) === c.otp_hash;
  const updated = await stmt(
    "UPDATE institution_deletion_challenges SET attempts=attempts+1,consumed_at=CASE WHEN ?=1 THEN ? ELSE consumed_at END WHERE id=? AND consumed_at IS NULL AND attempts<5 AND expires_at>? AND attempts=? RETURNING id",
    [+valid, now(), c.id, now(), c.attempts],
  ).first();
  await batch([
    platformAudit(
      actor,
      valid && updated
        ? "Verified destructive-action OTP"
        : "Rejected destructive-action OTP",
      "institution_deletion_challenges",
      c.id,
      null,
      { action },
      id,
    ),
  ]);
  if (!valid || !updated)
    throw new ApiError(
      403,
      "OTP_INVALID",
      "Security code is invalid. Maximum five attempts.",
    );
}
export async function deletionRoute(
  actor: Actor,
  id: string,
  action: string | undefined,
  method: string,
  body: Row,
) {
  permitPlatform(actor, "institutions.delete");
  const institution = await one("SELECT * FROM institutions WHERE id=?", [id]);
  if (!institution)
    throw new ApiError(404, "NOT_FOUND", "Institution not found.");
  let job = await one(
    "SELECT * FROM institution_deletion_jobs WHERE institution_id=? ORDER BY created_at DESC LIMIT 1",
    [id],
  );
  if (method === "GET")
    return {
      institution: { id, name: institution.name, status: institution.status },
      job: job
        ? {
            ...job,
            error: job.error?.startsWith("lease:") ? null : job.error,
            running: !!job.error?.startsWith("lease:"),
          }
        : null,
      inventory: await deletionInventory(id),
    };
  if (method !== "POST")
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use GET or POST.");
  if (action === "challenge") {
    const d = z
      .object({ action: z.enum(["request", "restore", "finalize"]) })
      .parse(body);
    return challenge(actor, id, d.action);
  }
  if (action === "request") {
    // A lost response may replay the already-authorized request. This only
    // returns the existing workflow; it cannot authorize a new destructive step.
    if (
      job &&
      job.created_by === actor.userId &&
      body.challengeId &&
      JSON.parse(job.inventory).authorizationChallengeId === body.challengeId &&
      body.institutionName === job.institution_name &&
      body.secondWarningAccepted === true
    ) {
      return {
        jobId: job.id,
        status: job.status,
        recoveryUntil: job.recovery_until,
        replayed: true,
      };
    }
    if (
      (job && !["Restored", "Completed"].includes(job.status)) ||
      ["Deleting", "Deleted"].includes(institution.status)
    )
      throw new ApiError(
        409,
        "DELETION_EXISTS",
        "A deletion workflow already exists.",
      );
    const inventory = await deletionInventory(id);
    await consume(actor, id, "request", body, institution.name);
    const jobId = uuid(),
      until = new Date(Date.now() + 7 * 86400000).toISOString();
    await batch([
      insert("institution_deletion_jobs", {
        id: jobId,
        institution_id: id,
        status: "Quarantined",
        previous_status: institution.status,
        institution_name: institution.name,
        inventory: JSON.stringify({
          ...inventory,
          authorizationChallengeId: body.challengeId,
        }),
        cursor: 0,
        recovery_until: until,
        ...stamps(actor.userId),
      }),
      stmt(
        "UPDATE institutions SET status='Deleting',updated_at=?,updated_by=? WHERE id=? AND status=?",
        [now(), actor.userId, id, institution.status],
      ),
      stmt(
        "UPDATE support_sessions SET ended_at=? WHERE institution_id=? AND ended_at IS NULL",
        [now(), id],
      ),
      platformAudit(
        actor,
        "Quarantined institution for deletion",
        "institution_deletion_jobs",
        jobId,
        { status: institution.status },
        { recoveryUntil: until },
        id,
      ),
    ]);
    return { jobId, status: "Quarantined", recoveryUntil: until };
  }
  if (!job)
    throw new ApiError(
      409,
      "DELETION_REQUIRED",
      "Start a deletion workflow first.",
    );
  if (action === "restore") {
    if (job.status !== "Quarantined" || job.recovery_until <= now())
      throw new ApiError(
        409,
        "RECOVERY_CLOSED",
        "Automatic recovery is available only during quarantine. Partial purges must be resumed; encrypted backups require controlled operator restoration.",
      );
    await consume(actor, id, "restore", body, job.institution_name);
    await batch([
      stmt(
        "UPDATE institutions SET status=?,updated_at=?,updated_by=? WHERE id=?",
        [job.previous_status, now(), actor.userId, id],
      ),
      stmt(
        "UPDATE institution_deletion_jobs SET status='Restored',updated_at=?,updated_by=? WHERE id=? AND status='Quarantined'",
        [now(), actor.userId, job.id],
      ),
      platformAudit(
        actor,
        "Recovered quarantined institution",
        "institution_deletion_jobs",
        job.id,
        null,
        { status: job.previous_status },
        id,
      ),
    ]);
    return { status: "Restored" };
  }
  if (action === "finalize") {
    if (job.status !== "Quarantined" || job.recovery_until > now())
      throw new ApiError(
        409,
        "RECOVERY_WINDOW",
        "Permanent deletion requires the full seven-day recovery window and another fresh OTP.",
      );
    await recoveryKey();
    await consume(actor, id, "finalize", body, job.institution_name);
    const inventory = await deletionInventory(id);
    await archive(
      job,
      `deletion-recovery/${id}/${job.id}/institution.json`,
      JSON.stringify(institution),
    );
    // Persist final inventory before the first destructive batch. Financial history is never overwritten.
    await batch([
      stmt(
        "UPDATE institution_deletion_jobs SET status='Purging',inventory=?,snapshot_key=?,updated_at=?,updated_by=? WHERE id=? AND status='Quarantined'",
        [
          JSON.stringify(inventory),
          `deletion-recovery/${id}/${job.id}/`,
          now(),
          actor.userId,
          job.id,
        ],
      ),
      platformAudit(
        actor,
        "Authorized permanent institution cleanup",
        "institution_deletion_jobs",
        job.id,
        null,
        { retention: inventory.policy },
        id,
      ),
    ]);
    return { status: "Purging", hasMore: true };
  }
  if (action !== "resume")
    throw new ApiError(404, "NOT_FOUND", "Deletion action not found.");
  if (job.status === "Completed")
    return { status: "Completed", hasMore: false };
  if (!["Purging", "Objects"].includes(job.status))
    throw new ApiError(
      409,
      "DELETION_NOT_AUTHORIZED",
      "Permanent cleanup has not been authorized.",
    );
  // Compare-and-swap lease prevents concurrent workers from deleting unarchived batches.
  const lease = uuid(),
    locked = await stmt(
      "UPDATE institution_deletion_jobs SET error=?,updated_at=? WHERE id=? AND status IN ('Purging','Objects') AND (error IS NULL OR error NOT LIKE 'lease:%' OR updated_at<?) RETURNING *",
      [
        "lease:" + lease,
        now(),
        job.id,
        new Date(Date.now() - 600000).toISOString(),
      ],
    ).first();
  if (!locked)
    throw new ApiError(
      409,
      "DELETION_BUSY",
      "A cleanup batch is already running. Retry after it finishes.",
    );
  // The lease returns current progress atomically; pre-lease reads can be stale.
  job = locked;
  const renewLease = async () => {
    const active = await stmt(
      "UPDATE institution_deletion_jobs SET updated_at=? WHERE id=? AND error=? RETURNING id",
      [now(), job!.id, "lease:" + lease],
    ).first();
    if (!active)
      throw new ApiError(
        409,
        "DELETION_BUSY",
        "Another worker resumed this job. Refresh progress before continuing.",
      );
  };
  try {
    const inventory = JSON.parse(job.inventory),
      table = inventory.purgeOrder[job.cursor];
    if (job.status === "Purging" && table) {
      const rows = await all(
        `SELECT rowid AS __rowid,* FROM ${identifier(table)} WHERE institution_id=? ORDER BY rowid LIMIT 75`,
        [id],
      );
      if (rows.length) {
        const content = JSON.stringify({ table, rows }),
          hash = await sha256(content);
        await archive(
          job,
          job.snapshot_key + table + "/" + hash + ".json",
          content,
        );
        await renewLease();
        await batch([
          stmt(
            `DELETE FROM ${identifier(table)} WHERE institution_id=? AND rowid IN (${rows.map(() => "?").join(",")}) AND EXISTS (SELECT 1 FROM institution_deletion_jobs WHERE id=? AND error=?)`,
            [id, ...rows.map((r) => r.__rowid), job.id, "lease:" + lease],
          ),
          stmt(
            "UPDATE institution_deletion_jobs SET error=NULL,updated_at=? WHERE id=? AND error=?",
            [now(), job.id, "lease:" + lease],
          ),
          platformAudit(
            actor,
            "Purged archived tenant batch",
            "institution_deletion_jobs",
            job.id,
            null,
            { table, count: rows.length, snapshotHash: hash },
            id,
          ),
        ]);
        return { status: "Purging", processed: rows.length, hasMore: true };
      }
      await run(
        "UPDATE institution_deletion_jobs SET cursor=cursor+1,error=NULL,updated_at=? WHERE id=? AND error=?",
        [now(), job.id, "lease:" + lease],
      );
      return { status: "Purging", processed: 0, hasMore: true };
    }
    if (job.status === "Purging") {
      const remaining = await deletionInventory(id);
      const firstRemaining = inventory.purgeOrder.findIndex((name: string) =>
        remaining.entries.some((e) => e.table === name && e.count > 0),
      );
      if (firstRemaining >= 0) {
        await run(
          "UPDATE institution_deletion_jobs SET cursor=?,error=NULL,updated_at=? WHERE id=? AND error=?",
          [firstRemaining, now(), job.id, "lease:" + lease],
        );
        return { status: "Purging", hasMore: true };
      }
      await run(
        "UPDATE institution_deletion_jobs SET status='Objects',error=NULL,updated_at=? WHERE id=? AND error=?",
        [now(), job.id, "lease:" + lease],
      );
      return { status: "Objects", hasMore: true };
    }
    await recoveryKey();
    const objects = await env.BUCKET!.list({
      prefix: id + "/",
      limit: 10,
      ...(inventory.objectCursor ? { cursor: inventory.objectCursor } : {}),
    });
    // Resolve retention for this page only, rather than loading every historical receipt.
    const keys = [
      ...new Set(
        objects.objects.map((object) =>
          object.key.replace(/-80mm\.pdf$/, ".pdf"),
        ),
      ),
    ];
    const retainedRows = keys.length
      ? await all<{ object_key: string }>(
          `SELECT object_key FROM document_artifacts WHERE institution_id=? AND object_key IN (${keys.map(() => "?").join(",")})
       UNION SELECT object_key FROM donation_certificates WHERE institution_id=? AND object_key IN (${keys.map(() => "?").join(",")})`,
          [id, ...keys, id, ...keys],
        )
      : [];
    const retained = new Set(
      retainedRows.flatMap((row) => [
        row.object_key,
        row.object_key.replace(/\.pdf$/, "-80mm.pdf"),
      ]),
    );
    for (const object of objects.objects)
      if (!retained.has(object.key)) {
        const current = await env.BUCKET!.get(object.key);
        if (!current) continue;
        const bytes = new Uint8Array(await current.arrayBuffer());
        await archive(
          job,
          job.snapshot_key + "objects/" + (await sha256(object.key)) + ".json",
          JSON.stringify({
            key: object.key,
            metadata: current.httpMetadata,
            bytes: btoa(
              Array.from(bytes, (x) => String.fromCharCode(x)).join(""),
            ),
          }),
        );
        await renewLease();
        await env.BUCKET!.delete(object.key);
      }
    if (objects.truncated) {
      inventory.objectCursor = objects.cursor;
      await run(
        "UPDATE institution_deletion_jobs SET inventory=?,error=NULL,updated_at=? WHERE id=? AND error=?",
        [JSON.stringify(inventory), now(), job.id, "lease:" + lease],
      );
      return { status: "Objects", hasMore: true };
    }
    const domain = await one(
      "SELECT hosting_id FROM institution_domains WHERE institution_id=?",
      [id],
    );
    // Any remote domain must be disconnected before completion. Retried deletes first check remote existence.
    if (domain?.hosting_id && !domain.hosting_id.startsWith("cf:"))
      throw new ApiError(
        409,
        "LEGACY_DOMAIN_ATTACHED",
        "Disconnect the legacy hosting binding before permanent cleanup can finish.",
      );
    if (domain)
      await archive(
        job,
        job.snapshot_key + "domain.json",
        JSON.stringify(
          await one(
            "SELECT * FROM institution_domains WHERE institution_id=?",
            [id],
          ),
        ),
      );
    if (domain?.hosting_id?.startsWith("cf:")) {
      const remote = await import("./cloudflare-hostnames");
      const exists = await remote.findHostname(
        (await one(
          "SELECT hostname FROM institution_domains WHERE institution_id=?",
          [id],
        ))!.hostname,
      );
      await renewLease();
      if (exists)
        await cloudflareHostname("DELETE", "/" + encodeURIComponent(exists.id));
    }
    await renewLease();
    await batch([
      stmt("DELETE FROM institution_domains WHERE institution_id=?", [id]),
      stmt(
        "UPDATE institutions SET status='Deleted',name=?,address='',email='',phone='',city='',state='',pincode='',website='',settings='{}',logo_key=NULL,gstin=NULL,razorpay_credentials=NULL,cashfree_credentials=NULL,updated_at=?,updated_by=? WHERE id=?",
        ["Deleted institution " + id.slice(0, 8), now(), actor.userId, id],
      ),
      stmt(
        "UPDATE institution_deletion_jobs SET status='Completed',error=NULL,updated_at=?,updated_by=? WHERE id=? AND error=?",
        [now(), actor.userId, job.id, "lease:" + lease],
      ),
      platformAudit(
        actor,
        "Completed permanent operational deletion",
        "institution_deletion_jobs",
        job.id,
        null,
        { retention: inventory.policy },
        id,
      ),
    ]);
    return { status: "Completed", hasMore: false };
  } catch (error) {
    await batch([
      stmt(
        "UPDATE institution_deletion_jobs SET error=?,updated_at=? WHERE id=? AND error=?",
        [
          error instanceof ApiError ? error.code : "BATCH_FAILED",
          now(),
          job.id,
          "lease:" + lease,
        ],
      ),
      platformAudit(
        actor,
        "Cleanup batch interrupted",
        "institution_deletion_jobs",
        job.id,
        null,
        { errorCode: error instanceof ApiError ? error.code : "BATCH_FAILED" },
        id,
      ),
    ]);
    throw error;
  }
}
