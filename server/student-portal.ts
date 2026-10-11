import { env } from "cloudflare:workers";
import { z } from "zod";
import { all, batch, insert, now, one, Row, stmt, uuid } from "./db";
import {
  Actor,
  ApiError,
  accessStudent,
  audit,
  csrf,
  sha256,
  rateLimit,
  constantEqual,
} from "./security";
import {
  passwordSchema,
  usernameSchema,
  hashPassword,
  verifyPassword,
  randomSecret,
} from "./portal-credentials";
import { parentOverview } from "./parent-portal";
import { withTenantContext } from "./tenant-context";
import { enforceSubscription } from "./tenancy";
import {
  availableGateways,
  initiatePayment,
  verifyPayment,
  reconcilePayment,
} from "./gateway";
import { receiptDownload } from "./receipt-download";
import { parseMoney } from "../lib/money";
import { internalGrade } from "../lib/exam-grading";
import { ok, readBody } from "./routes/shared";
const cookieName = "sohan_student_session";
function cookie(value: string, seconds = 43200) {
  return `${cookieName}=${value}; Path=/api/student-portal; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
}
function authError() {
  return new ApiError(
    401,
    "PORTAL_AUTH",
    "Username or password is incorrect, expired or temporarily locked. Contact your institution for a reset.",
  );
}
const expired = () =>
  new ApiError(401, "PORTAL_SESSION", "Please sign in again.");
function actorFor(request: Request, account: Row): Actor {
  return {
    request,
    userId: "portal:" + account.id,
    name: account.kind + " portal",
    email: "",
    institutionId: account.institution_id,
    role: "CUSTOM",
    portalGrantId: account.id,
    parentId: account.parent_id || undefined,
    portalStudentId: account.student_id || undefined,
    feeVisibility: true,
    permissions: [
      "students.view",
      "fees.view",
      "payments.view",
      "payments.collect",
      "payments.manage",
      "receipts.view",
    ],
  };
}
async function session(request: Request) {
  const token =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1) || "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw expired();
  const row = await one(
    "SELECT a.*,s.id session_id,s.expires_at,s.last_seen FROM portal_sessions s JOIN portal_accounts a ON a.id=s.account_id AND a.institution_id=s.institution_id AND a.version=s.version JOIN institutions i ON i.id=a.institution_id AND i.status='Active' WHERE s.token_hash=? AND a.active=1 AND s.expires_at>? AND s.last_seen>?",
    [
      await sha256(token),
      now(),
      new Date(Date.now() - 30 * 60000).toISOString(),
    ],
  );
  if (!row) throw expired();
  if (row.must_change && row.credential_expires < now()) throw expired();
  const domain = request.headers.get("x-sohan-domain-tenant");
  if (domain && domain !== row.institution_id) throw expired();
  if (
    row.student_id &&
    !(await one(
      "SELECT id FROM students WHERE institution_id=? AND id=? AND status='Active'",
      [row.institution_id, row.student_id],
    ))
  )
    throw expired();
  await stmt("UPDATE portal_sessions SET last_seen=? WHERE id=?", [
    now(),
    row.session_id,
  ]).run();
  return { account: row, actor: actorFor(request, row) };
}
async function addSession(request: Request, account: Row) {
  const token = randomSecret(32),
    id = uuid();
  await batch([
    stmt(
      "DELETE FROM portal_sessions WHERE account_id=? AND (expires_at<? OR last_seen<?)",
      [account.id, now(), new Date(Date.now() - 30 * 60000).toISOString()],
    ),
    insert("portal_sessions", {
      id,
      institution_id: account.institution_id,
      account_id: account.id,
      token_hash: await sha256(token),
      version: account.version,
      expires_at: new Date(Date.now() + 12 * 3600000).toISOString(),
      last_seen: now(),
      created_at: now(),
    }),
    audit(
      actorFor(request, account),
      "Portal signed in",
      "portal_accounts",
      account.id,
      null,
      { kind: account.kind },
    ),
  ]);
  return token;
}
export async function studentPortalRoute(
  request: Request,
  path: string[],
  requestId: string,
) {
  if (path[0] !== "student-portal") return null;
  const method = request.method,
    action = path[1] || "session",
    p = new URL(request.url).searchParams;
  csrf(request);
  if (action === "login" && method === "POST") {
    await rateLimit(
      request,
      "portal-login-ip:" +
        (request.headers.get("cf-connecting-ip") || "unknown"),
      15,
    );
    const d = z
      .object({
        username: usernameSchema,
        password: z.string().min(1).max(128),
      })
      .parse(await readBody(request));
    await rateLimit(
      request,
      "portal-login-user:" + (await sha256(d.username)),
      5,
    );
    const account = await one(
      "SELECT a.* FROM portal_accounts a JOIN institutions i ON i.id=a.institution_id AND i.status='Active' WHERE a.username=?",
      [d.username],
    );
    const valid = await verifyPassword(
      d.password,
      account?.password_hash ||
        "scrypt$32768$8$3$00000000000000000000000000000000$" + "0".repeat(64),
    );
    const domain = request.headers.get("x-sohan-domain-tenant");
    if (
      !account ||
      !valid ||
      !account.active ||
      (account.locked_until && account.locked_until > now()) ||
      (account.must_change && account.credential_expires < now()) ||
      (domain && domain !== account.institution_id)
    ) {
      if (account)
        await batch([
          stmt(
            "UPDATE portal_accounts SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts>=9 THEN ? ELSE locked_until END WHERE id=?",
            [new Date(Date.now() + 15 * 60000).toISOString(), account.id],
          ),
          audit(
            actorFor(request, account),
            "Portal sign-in rejected",
            "portal_accounts",
            account.id,
            null,
            {},
          ),
        ]);
      throw authError();
    }
    if (
      account.student_id &&
      !(await one(
        "SELECT id FROM students WHERE institution_id=? AND id=? AND status='Active'",
        [account.institution_id, account.student_id],
      ))
    )
      throw authError();
    await stmt(
      "UPDATE portal_accounts SET failed_attempts=0,locked_until=NULL WHERE id=? AND version=?",
      [account.id, account.version],
    ).run();
    const token = await addSession(request, account),
      response = ok(
        {
          username: account.username,
          kind: account.kind,
          mustChange: !!account.must_change,
        },
        requestId,
      );
    response.headers.set("Set-Cookie", cookie(token));
    return response;
  }
  const { actor, account } = await session(request);
  await rateLimit(request, "portal-session:" + account.id, 120);
  return withTenantContext(actor, async () => {
    if (action === "logout" && method === "POST") {
      await batch([
        stmt("DELETE FROM portal_sessions WHERE id=?", [account.session_id]),
        audit(
          actor,
          "Portal signed out",
          "portal_accounts",
          account.id,
          null,
          {},
        ),
      ]);
      const response = ok({ signedOut: true }, requestId);
      response.headers.set("Set-Cookie", cookie("", 0));
      return response;
    }
    if (action === "session" && method === "GET")
      return ok(
        {
          username: account.username,
          kind: account.kind,
          mustChange: !!account.must_change,
        },
        requestId,
      );
    if (action === "password" && method === "POST") {
      const d = z
        .object({
          currentPassword: z.string().max(128),
          password: passwordSchema,
        })
        .parse(await readBody(request));
      await rateLimit(request, "portal-password:" + account.id, 5);
      if (!(await verifyPassword(d.currentPassword, account.password_hash)))
        throw authError();
      if (constantEqual(d.currentPassword, d.password))
        throw new ApiError(
          422,
          "SAME_PASSWORD",
          "Choose a different password.",
        );
      const changed = await batch([
        stmt(
          "UPDATE portal_accounts SET password_hash=?,must_change=0,credential_expires=NULL,version=version+1,failed_attempts=0,locked_until=NULL,updated_at=?,updated_by=? WHERE id=? AND version=?",
          [
            await hashPassword(d.password),
            now(),
            actor.userId,
            account.id,
            account.version,
          ],
        ),
        stmt("DELETE FROM portal_sessions WHERE account_id=?", [account.id]),
        audit(
          actor,
          "Portal password changed",
          "portal_accounts",
          account.id,
          null,
          {},
        ),
      ]);
      if (!changed[0].meta.changes) throw expired();
      const response = ok({ signInRequired: true }, requestId);
      response.headers.set("Set-Cookie", cookie("", 0));
      return response;
    }
    if (account.must_change)
      throw new ApiError(
        403,
        "PASSWORD_CHANGE_REQUIRED",
        "Change your initial password before opening student records.",
      );
    if (action === "overview" && method === "GET")
      return ok(await overview(actor, p), requestId);
    if (action === "receipt" && method === "GET")
      return receiptDownload(actor, path[2] || "");
    if (action === "document" && method === "GET") {
      const doc = await one(
        "SELECT * FROM portal_documents WHERE institution_id=? AND id=? AND status='Published'",
        [actor.institutionId, path[2] || ""],
      );
      if (!doc) throw new ApiError(404, "NOT_FOUND", "Document not found.");
      await accessStudent(actor, doc.student_id);
      const file = await env.BUCKET?.get(doc.object_key);
      if (!file)
        throw new ApiError(404, "NOT_FOUND", "Document file not found.");
      return new Response(file.body, {
        headers: {
          "Content-Type": doc.mime,
          "Content-Disposition":
            'attachment; filename="Student-document.' +
            (doc.mime === "application/pdf"
              ? "pdf"
              : doc.mime === "image/png"
                ? "png"
                : "jpg") +
            '"',
          "Cache-Control": "private,no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (action === "photo" && method === "GET") {
      const id = p.get("student") || "";
      await accessStudent(actor, id);
      const st = await one(
        "SELECT photo_key FROM students WHERE institution_id=? AND id=?",
        [actor.institutionId, id],
      );
      const file = st?.photo_key ? await env.BUCKET?.get(st.photo_key) : null;
      if (!file) throw new ApiError(404, "NOT_FOUND", "Photo unavailable.");
      return new Response(file.body, {
        headers: {
          "Content-Type": file.httpMetadata?.contentType || "image/jpeg",
          "Cache-Control": "private,no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (action === "checkout" && method === "POST") {
      await enforceSubscription(actor, "POST", "payments");
      await rateLimit(request, "portal-checkout:" + account.id, 8);
      const d = z
        .object({
          studentId: z.string(),
          yearId: z.string(),
          amount: z.string(),
          gateway: z.enum(["Razorpay", "Cashfree"]),
          idempotencyKey: z.string().uuid(),
        })
        .parse(await readBody(request));
      await accessStudent(actor, d.studentId, d.yearId);
      return ok(
        await initiatePayment(actor, {
          ...d,
          amountPaise: parseMoney(d.amount),
        }),
        requestId,
      );
    }
    if (action === "verify" && method === "POST") {
      const d = z
        .object({
          paymentId: z.string(),
          razorpay_order_id: z.string(),
          razorpay_payment_id: z.string(),
          razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
        })
        .parse(await readBody(request));
      return ok(await verifyPayment(actor, d), requestId);
    }
    if (action === "reconcile" && method === "POST") {
      await rateLimit(request, "portal-reconcile:" + account.id, 10);
      const d = z
        .object({ paymentId: z.string() })
        .parse(await readBody(request));
      return ok(await reconcilePayment(actor, d.paymentId), requestId);
    }
    if (action === "services" && method === "POST") {
      await enforceSubscription(actor, "POST", "students");
      const d = z
        .object({
          studentId: z.string(),
          yearId: z.string(),
          kind: z.enum(["Transport", "Hostel"]),
          notes: z.string().trim().min(5).max(1000),
        })
        .parse(await readBody(request));
      await accessStudent(actor, d.studentId, d.yearId);
      if (
        !(await one(
          "SELECT id FROM enrollments WHERE institution_id=? AND student_id=? AND academic_year_id=?",
          [actor.institutionId, d.studentId, d.yearId],
        ))
      )
        throw new ApiError(404, "NOT_FOUND", "Enrolment not found.");
      const id = uuid();
      try {
        await batch([
          insert("portal_service_requests", {
            id,
            institution_id: actor.institutionId,
            student_id: d.studentId,
            academic_year_id: d.yearId,
            kind: d.kind,
            notes: d.notes,
            created_at: now(),
            updated_at: now(),
            created_by: actor.userId,
            updated_by: actor.userId,
          }),
          audit(
            actor,
            "Requested facility enrolment",
            "portal_service_requests",
            id,
            null,
            { studentId: d.studentId, kind: d.kind },
          ),
        ]);
      } catch (e) {
        if (
          await one(
            "SELECT id FROM portal_service_requests WHERE institution_id=? AND student_id=? AND academic_year_id=? AND kind=? AND status='Pending'",
            [actor.institutionId, d.studentId, d.yearId, d.kind],
          )
        )
          throw new ApiError(
            409,
            "REQUEST_PENDING",
            "A request is already awaiting review.",
          );
        throw e;
      }
      return ok({ id }, requestId);
    }
    throw new ApiError(404, "NOT_FOUND", "Portal route not found.");
  });
}
async function overview(actor: Actor, p: URLSearchParams) {
  const base = await parentOverview(actor, p),
    id = base.studentId,
    year = base.yearId,
    scope = [actor.institutionId, id || "", year || ""];
  if (!id) return { ...base, profile: null };
  await accessStudent(actor, id, year);
  const offset =
    (Math.max(1, Math.min(10000, parseInt(p.get("page") || "1") || 1)) - 1) *
    30;
  const [
    profile,
    guardians,
    attendance,
    results,
    announcements,
    documents,
    payments,
    services,
    requests,
    gateways,
  ] = await Promise.all([
    one(
      "SELECT s.id,s.name,s.admission_number,s.dob,s.gender,s.blood_group,s.admission_date,s.previous_school,s.status,s.photo_key,e.roll_number,c.name class_name,sec.name section_name FROM students s LEFT JOIN enrollments e ON e.student_id=s.id AND e.institution_id=s.institution_id AND e.academic_year_id=? LEFT JOIN sections sec ON sec.id=e.section_id AND sec.institution_id=e.institution_id LEFT JOIN classes c ON c.id=sec.class_id AND c.institution_id=sec.institution_id WHERE s.institution_id=? AND s.id=?",
      [year || "", actor.institutionId, id],
    ),
    all(
      "SELECT par.id,par.guardian_name,par.father_name,par.mother_name,par.relationship,par.mobile,par.alternate_mobile,par.email,par.address,par.occupation FROM parents par JOIN student_parents sp ON sp.parent_id=par.id AND sp.institution_id=par.institution_id WHERE sp.institution_id=? AND sp.student_id=?",
      [actor.institutionId, id],
    ),
    all(
      "SELECT local_date,morning,afternoon,half_day FROM attendance_days WHERE institution_id=? AND student_id=? AND academic_year_id=? ORDER BY local_date DESC LIMIT 30 OFFSET ?",
      [...scope, offset],
    ),
    all(
      "SELECT ex.name exam_name,ex.kind,ex.tier,ex.policy,su.name subject_name,su.max_units,x.score_units,x.qualitative,x.assignment_status,x.absent,x.official_grade FROM exam_results x JOIN exam_registrations r ON r.id=x.registration_id AND r.institution_id=x.institution_id JOIN exams ex ON ex.id=r.exam_id AND ex.institution_id=r.institution_id JOIN exam_subjects su ON su.id=x.subject_id AND su.institution_id=x.institution_id WHERE r.institution_id=? AND r.student_id=? AND ex.academic_year_id=? AND ex.status='Published' ORDER BY ex.created_at DESC,su.name LIMIT 30 OFFSET ?",
      [...scope, offset],
    ),
    all(
      "SELECT id,title,body,created_at FROM portal_announcements WHERE institution_id=? AND (student_id=? OR student_id IS NULL) AND status='Published' ORDER BY created_at DESC LIMIT 30 OFFSET ?",
      [actor.institutionId, id, offset],
    ),
    all(
      "SELECT id,title,mime,size,created_at FROM portal_documents WHERE institution_id=? AND student_id=? AND status='Published' ORDER BY created_at DESC LIMIT 30 OFFSET ?",
      [actor.institutionId, id, offset],
    ),
    all(
      "SELECT p.id,p.amount_paise,p.method,p.gateway,p.status,p.paid_at,p.reference,r.id receipt_id,r.number receipt_number FROM payments p LEFT JOIN receipts r ON r.payment_id=p.id AND r.institution_id=p.institution_id WHERE p.institution_id=? AND p.student_id=? AND p.academic_year_id=? ORDER BY p.created_at DESC LIMIT 30 OFFSET ?",
      [...scope, offset],
    ),
    all(
      "SELECT a.id,a.kind,a.status,a.start_date,a.end_date,a.charges,a.bed_number,t.name stop_name,r.name room_name FROM facility_allocations a LEFT JOIN transport_stops t ON t.id=a.stop_id AND t.institution_id=a.institution_id LEFT JOIN hostel_rooms r ON r.id=a.room_id AND r.institution_id=a.institution_id WHERE a.institution_id=? AND a.student_id=? AND a.academic_year_id=? ORDER BY a.created_at DESC LIMIT 30 OFFSET ?",
      [...scope, offset],
    ),
    all(
      "SELECT id,kind,notes,status,resolution,created_at FROM portal_service_requests WHERE institution_id=? AND student_id=? AND academic_year_id=? ORDER BY created_at DESC LIMIT 30 OFFSET ?",
      [...scope, offset],
    ),
    availableGateways(actor),
  ]);
  const safeProfile: Row | null = profile
    ? { ...profile, hasPhoto: !!profile.photo_key }
    : null;
  if (safeProfile) delete safeProfile.photo_key;
  return {
    ...base,
    profile: safeProfile,
    guardians,
    attendance,
    announcements,
    documents,
    payments,
    services: services.map((r) => ({ ...r, charges: JSON.parse(r.charges) })),
    requests,
    gateways: gateways.providers,
    results: results.map((r) => {
      const policy = JSON.parse(r.policy);
      const { policy: _, ...safe } = r;
      return {
        ...safe,
        grade: r.absent
          ? "Absent"
          : r.tier === "Nursery"
            ? r.qualitative
            : r.kind === "Board"
              ? r.official_grade || "Not reported"
              : r.score_units === null
                ? "Not graded"
                : internalGrade(r.score_units, r.max_units, policy.bands),
      };
    }),
  };
}
