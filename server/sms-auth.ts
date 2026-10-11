import { env } from "cloudflare:workers";
import { z } from "zod";
import { all, batch, insert, now, one, run, stmt, uuid } from "./db";
import {
  ApiError,
  accountIdForEmail,
  authenticate,
  rateLimit,
  sha256,
} from "./security";
import { ok, readBody } from "./routes/shared";
const cookieName = "__Host-sohan_session";
const mobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/^\+91/, ""))
  .pipe(
    z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number."),
  );
const cookie = (token: string, age: number) =>
  `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export async function smsEnabled() {
  return (
    (await one("SELECT value FROM platform WHERE key='auth:sms-enabled'"))
      ?.value === "1"
  );
}
export async function smsIdentity(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const user = await one(
    "SELECT u.id,u.email,u.name FROM sms_sessions s JOIN users u ON u.id=s.user_id JOIN sms_accounts a ON a.user_id=s.user_id AND a.mobile=s.mobile WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?",
    [await sha256(token), now()],
  );
  return user ? { userId: user.id, email: user.email, name: user.name } : null;
}
async function cryptKey() {
  const secret = env.PROVIDER_ENCRYPTION_KEY;
  if (!secret || !/^[0-9a-f]{64}$/.test(secret))
    throw new ApiError(
      503,
      "SMS_NOT_CONFIGURED",
      "Credential encryption is unavailable.",
    );
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(secret.match(/../g)!, (v) => parseInt(v, 16)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
async function saveConfig(apiKey: string, template: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const result = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("sohan:otp"),
    },
    await cryptKey(),
    new TextEncoder().encode(JSON.stringify({ apiKey, template })),
  );
  const value =
    btoa(String.fromCharCode(...iv)) +
    "." +
    btoa(String.fromCharCode(...new Uint8Array(result)));
  await run(
    "INSERT INTO platform(key,value) VALUES ('auth:sms-config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [value],
  );
}
async function config(): Promise<{ apiKey: string; template: string }> {
  const row = await one(
    "SELECT value FROM platform WHERE key='auth:sms-config'",
  );
  if (!row)
    throw new ApiError(
      503,
      "SMS_NOT_CONFIGURED",
      "Your platform administrator must configure SMS sign-in.",
    );
  const [nonce, cipher] = row.value.split(".");
  const decode = (v: string) =>
    Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(nonce),
      additionalData: new TextEncoder().encode("sohan:otp"),
    },
    await cryptKey(),
    decode(cipher),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
async function provider(
  action: "send" | "verify" | "resend",
  mobile: string,
  otp?: string,
) {
  const c = await config();
  let response: Response;
  try {
    response = await fetch(`https://www.fast2sms.com/dev/otp/${action}`, {
      method: "POST",
      redirect: "manual",
      headers: { Authorization: c.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        mobile,
        ...(action === "send"
          ? { otp_id: c.template, otp_expiry: 5, otp_length: 6 }
          : {}),
        ...(otp ? { otp } : {}),
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new ApiError(
      503,
      "SMS_PROVIDER_UNAVAILABLE",
      "SMS service is unavailable. Please try again later.",
    );
  }
  let result: { return?: boolean; status_code?: number };
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      502,
      "SMS_PROVIDER_ERROR",
      "SMS service returned an invalid response.",
    );
  }
  if (!response.ok || result.return !== true || result.status_code !== 200)
    throw new ApiError(
      action === "verify" ? 400 : 503,
      action === "verify" ? "OTP_INVALID" : "SMS_SEND_FAILED",
      action === "verify"
        ? "Code is invalid, expired, or already used."
        : "SMS could not be sent. Check the provider configuration and credit balance.",
    );
}
async function owner(request: Request) {
  const user = await authenticate(request);
  if (
    !(await one(
      "SELECT user_id FROM platform_admins WHERE user_id=? AND active=1",
      [user.userId],
    )) ||
    user.email !== env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase()
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only the platform owner can configure authentication.",
    );
  return user;
}
async function candidate(mobile: string) {
  const bound = await one(
    "SELECT u.id user_id,u.email FROM sms_accounts a JOIN users u ON u.id=a.user_id WHERE a.mobile=?",
    [mobile],
  );
  const normalize =
    "replace(replace(replace(m.mobile,'+91',''),' ',''),'-','')";
  const rows = await all<{ email: string }>(
    `SELECT DISTINCT lower(u.email) email FROM memberships m JOIN users u ON u.id=m.user_id JOIN institutions i ON i.id=m.institution_id WHERE m.active=1 AND i.status='Active' AND m.role NOT IN ('PARENT','STUDENT','SUPER_ADMIN') AND ${normalize}=? UNION SELECT DISTINCT lower(m.email) email FROM invitations m JOIN institutions i ON i.id=m.institution_id WHERE m.status='Pending' AND i.status='Active' AND ${normalize}=?`,
    [mobile, mobile],
  );
  if (bound) {
    const platform = await one(
      "SELECT user_id FROM platform_admins WHERE user_id=? AND active=1",
      [bound.user_id],
    );
    if (platform || rows.some((x) => x.email === bound.email)) return bound;
  }
  if (rows.length !== 1 || bound)
    throw new ApiError(
      403,
      "MOBILE_ACCESS_REQUIRED",
      "Ask your administrator to register a unique mobile number for staff access.",
    );
  const email = rows[0].email;
  const userId = await accountIdForEmail(email);
  // A tenant admin may grant their own tenant, but cannot rebind an existing
  // cross-tenant identity by inviting its email onto a new phone number.
  const incompatible = await one(
    "SELECT m.id FROM memberships m WHERE m.user_id=? AND m.active=1 AND replace(replace(replace(m.mobile,'+91',''),' ',''),'-','')<>? LIMIT 1",
    [userId, mobile],
  );
  if (incompatible)
    throw new ApiError(
      403,
      "MOBILE_ACCESS_REQUIRED",
      "Ask your administrators to confirm a consistent registered mobile before migrating this account.",
    );
  const other = await one(
    "SELECT mobile FROM sms_accounts WHERE user_id=? AND mobile<>?",
    [userId, mobile],
  );
  if (other)
    throw new ApiError(
      403,
      "MOBILE_ACCESS_REQUIRED",
      "Ask your administrator to reset mobile access.",
    );
  return { user_id: userId, email };
}
export async function smsAuthRoute(
  request: Request,
  path: string[],
  requestId: string,
): Promise<Response | null> {
  if (path[0] !== "auth") return null;
  const action = path[1];
  if (action === "status" && request.method === "GET")
    return ok(
      { enabled: await smsEnabled(), template: "7a563a8ad5" },
      requestId,
    );
  if (request.method !== "POST")
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use POST.");
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new ApiError(403, "CSRF_REJECTED", "Request origin is not allowed.");
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "JSON_REQUIRED", "Use JSON.");
  await rateLimit(
    request,
    "otp-ip:" + (request.headers.get("cf-connecting-ip") || "unknown"),
    15,
  );
  const body = await readBody(request);
  if (action === "logout") {
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (token)
      await run("UPDATE sms_sessions SET revoked_at=? WHERE token_hash=?", [
        now(),
        await sha256(token),
      ]);
    const res = ok({ signedOut: true }, requestId);
    res.headers.set("Set-Cookie", cookie("", 0));
    return res;
  }
  if (action === "configure") {
    if (await smsEnabled())
      throw new ApiError(
        409,
        "SMS_ALREADY_ENABLED",
        "SMS authentication is already enabled.",
      );
    const u = await owner(request);
    const d = z
      .object({
        apiKey: z.string().trim().min(20).max(4096),
        template: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,100}$/)
          .default("7a563a8ad5"),
        mobile: mobileSchema,
      })
      .parse(body);
    if (
      await one(
        "SELECT user_id FROM sms_accounts WHERE mobile=? AND user_id<>?",
        [d.mobile, u.userId],
      )
    )
      throw new ApiError(
        409,
        "MOBILE_IN_USE",
        "This mobile is already registered.",
      );
    await saveConfig(d.apiKey, d.template);
    await run(
      "INSERT INTO platform(key,value) VALUES ('auth:setup-mobile',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [d.mobile],
    );
    return start(request, d.mobile, "setup", u.userId, u.email, requestId);
  }
  if (action === "send") {
    if (!(await smsEnabled()))
      throw new ApiError(
        503,
        "SMS_NOT_CONFIGURED",
        "The platform owner must complete SMS setup first.",
      );
    const mobile = mobileSchema.parse(body.mobile),
      account = await candidate(mobile);
    return start(
      request,
      mobile,
      "login",
      account.user_id,
      account.email,
      requestId,
    );
  }
  if (action !== "verify" && action !== "resend")
    throw new ApiError(404, "NOT_FOUND", "Authentication route not found.");
  const id = z.string().uuid().parse(body.challengeId);
  const challenge = await one(
    "SELECT * FROM sms_challenges WHERE id=? AND state='Sent' AND expires_at>?",
    [id, now()],
  );
  if (!challenge) throw new ApiError(400, "OTP_EXPIRED", "Request a new code.");
  if (challenge.purpose === "setup") {
    const u = await owner(request);
    if (u.userId !== challenge.user_id)
      throw new ApiError(403, "FORBIDDEN", "Setup session mismatch.");
  } else {
    const current = await candidate(challenge.mobile);
    if (
      current.user_id !== challenge.user_id ||
      current.email !== challenge.email
    )
      throw new ApiError(
        403,
        "ACCESS_CHANGED",
        "Staff access changed. Request a new code.",
      );
  }
  if (action === "resend") {
    const updated = await stmt(
      "UPDATE sms_challenges SET resends=resends+1,last_sent_at=? WHERE id=? AND state='Sent' AND resends<5 AND last_sent_at<? RETURNING id",
      [now(), id, new Date(Date.now() - 60000).toISOString()],
    ).first();
    if (!updated)
      throw new ApiError(
        429,
        "RESEND_LIMIT",
        "Wait 60 seconds. Maximum five resends per challenge.",
      );
    await provider("resend", challenge.mobile);
    return ok({ resent: true }, requestId);
  }
  const otp = z
    .string()
    .regex(/^\d{6}$/)
    .parse(body.otp);
  const locked = await stmt(
    "UPDATE sms_challenges SET attempts=attempts+1,state='Verifying' WHERE id=? AND state='Sent' AND attempts<5 RETURNING id",
    [id],
  ).first();
  if (!locked) throw new ApiError(429, "OTP_ATTEMPTS", "Request a new code.");
  try {
    await provider("verify", challenge.mobile, otp);
  } catch (e) {
    await run(
      "UPDATE sms_challenges SET state='Sent' WHERE id=? AND state='Verifying'",
      [id],
    );
    throw e;
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  const stamps = now();
  const queries = [
    stmt(
      "INSERT OR IGNORE INTO users(id,email,name,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?)",
      [
        challenge.user_id,
        challenge.email,
        challenge.email.split("@")[0],
        stamps,
        stamps,
        challenge.user_id,
        challenge.user_id,
      ],
    ),
    stmt(
      "INSERT INTO sms_accounts(mobile,user_id,verified_at) VALUES (?,?,?) ON CONFLICT(mobile) DO UPDATE SET verified_at=excluded.verified_at WHERE sms_accounts.user_id=excluded.user_id",
      [challenge.mobile, challenge.user_id, stamps],
    ),
    stmt(
      "INSERT INTO sms_sessions(token_hash,user_id,mobile,created_at,expires_at) VALUES (?,?,?,?,?)",
      [
        await sha256(token),
        challenge.user_id,
        challenge.mobile,
        stamps,
        new Date(Date.now() + 8 * 3600000).toISOString(),
      ],
    ),
    stmt("UPDATE sms_challenges SET state='Consumed' WHERE id=?", [id]),
    insert("platform_audit_logs", {
      id: uuid(),
      institution_id: null,
      user_id: challenge.user_id,
      user_name: challenge.email,
      action:
        challenge.purpose === "setup"
          ? "Activated SMS authentication"
          : "Verified mobile sign-in",
      entity: "authentication",
      entity_id: challenge.user_id,
      old_value: null,
      new_value: JSON.stringify({
        method: "SMS OTP",
        mobileSuffix: challenge.mobile.slice(-4),
      }),
      ip: request.headers.get("cf-connecting-ip"),
      user_agent: request.headers.get("user-agent")?.slice(0, 256),
      created_at: stamps,
    }),
  ];
  if (challenge.purpose === "setup")
    queries.push(
      stmt(
        "INSERT INTO platform(key,value) VALUES ('auth:sms-enabled','1') ON CONFLICT(key) DO UPDATE SET value='1'",
      ),
    );
  await batch(queries);
  const res = ok({ signedIn: true, smsEnabled: true }, requestId);
  res.headers.set("Set-Cookie", cookie(token, 8 * 3600));
  res.headers.set("Cache-Control", "no-store");
  return res;
}
async function start(
  request: Request,
  mobile: string,
  purpose: string,
  userId: string,
  email: string,
  requestId: string,
) {
  await rateLimit(request, "otp-mobile:" + (await sha256(mobile)), 3);
  const daily = await stmt(
    "INSERT INTO rate_limits(key,count,window) VALUES (?,1,0) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    ["otp-daily:" + (await sha256(mobile)) + ":" + now().slice(0, 10)],
  ).first<{ count: number }>();
  if ((daily?.count || 0) > 10)
    throw new ApiError(
      429,
      "OTP_DAILY_LIMIT",
      "Daily OTP limit reached. Please contact your administrator.",
    );
  const id = uuid(),
    stamp = now();
  const created = await stmt(
    "INSERT INTO sms_challenges(id,mobile,purpose,email,user_id,state,attempts,resends,created_at,expires_at,last_sent_at) VALUES (?,?,?,?,?,'Sending',0,0,?,?,?) ON CONFLICT(mobile,purpose) DO UPDATE SET id=excluded.id,email=excluded.email,user_id=excluded.user_id,state='Sending',attempts=0,resends=0,created_at=excluded.created_at,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at WHERE sms_challenges.expires_at<? OR sms_challenges.state IN ('Consumed','Failed') RETURNING id",
    [
      id,
      mobile,
      purpose,
      email,
      userId,
      stamp,
      new Date(Date.now() + 5 * 60000).toISOString(),
      stamp,
      stamp,
    ],
  ).first();
  if (!created)
    throw new ApiError(
      429,
      "OTP_ALREADY_SENT",
      "A code is already active. Use resend or wait five minutes.",
    );
  try {
    await provider("send", mobile);
    await run("UPDATE sms_challenges SET state='Sent' WHERE id=?", [id]);
  } catch (e) {
    await run("UPDATE sms_challenges SET state='Failed' WHERE id=?", [id]);
    throw e;
  }
  return ok({ challengeId: id, expiresIn: 300, resendAfter: 60 }, requestId);
}

// Security challenges use a distinct, server-generated OTP. Login verification
// at the provider cannot consume or replay this destructive-action challenge.
export async function sendSecurityOtp(mobile: string, otp: string) {
  return provider("send", mobile, otp);
}
