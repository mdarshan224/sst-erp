import { scrypt as derive } from "node:crypto";
import { z } from "zod";
import { Actor, ApiError, audit, constantEqual, permit } from "./security";
import { all, batch, insert, now, one, Row, stamps, stmt, uuid } from "./db";
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{3,47}$/,
    "Use 4–48 letters, numbers, dots, underscores or hyphens.",
  );
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128);
export function randomSecret(bytes = 24) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hashPassword(password: string, salt = randomSecret(16)) {
  const hash = await new Promise<Buffer>((resolve, reject) =>
    derive(
      password,
      salt,
      32,
      { N: 32768, r: 8, p: 3, maxmem: 67108864 },
      (error, value) => (error ? reject(error) : resolve(value)),
    ),
  );
  return `scrypt$32768$8$3$${salt}$${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== "scrypt$32768$8$3")
    return false;
  return constantEqual(await hashPassword(password, parts[4]), encoded);
}
export async function newPortalAccount(
  actor: Actor,
  kind: "Student" | "Parent",
  subjectId: string,
) {
  const id = uuid(),
    username = (kind === "Student" ? "s." : "p.") + id.replace(/-/g, ""),
    password = randomSecret(12),
    expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  return {
    credentials: { accountId: id, username, password, expiresAt, kind },
    statement: insert("portal_accounts", {
      id,
      institution_id: actor.institutionId,
      kind,
      student_id: kind === "Student" ? subjectId : null,
      parent_id: kind === "Parent" ? subjectId : null,
      username,
      password_hash: await hashPassword(password),
      must_change: 1,
      credential_expires: expiresAt,
      ...stamps(actor.userId),
    }),
  };
}
export async function portalStaffScope(actor: Actor, studentId: string) {
  permit(actor, "portal.manage");
  const student = await one(
    "SELECT id FROM students WHERE institution_id=? AND id=?",
    [actor.institutionId, studentId],
  );
  if (!student) throw new ApiError(404, "NOT_FOUND", "Student not found.");
  if (
    actor.role === "TEACHER" &&
    !(await one(
      "SELECT e.id FROM enrollments e WHERE e.institution_id=? AND e.student_id=? AND (e.section_id=? OR EXISTS(SELECT 1 FROM teaching_assignments t WHERE t.institution_id=e.institution_id AND t.academic_year_id=e.academic_year_id AND t.section_id=e.section_id AND t.teacher_id=?))",
      [actor.institutionId, studentId, actor.sectionId || "", actor.userId],
    ))
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only assigned students can be managed.",
    );
}
export async function managePortalAccount(
  actor: Actor,
  studentId: string,
  input: Row,
) {
  await portalStaffScope(actor, studentId);
  const d = z
    .object({
      kind: z.enum(["Student", "Parent"]),
      parentId: z.string().optional(),
      action: z.enum(["create", "reset", "rename", "disable", "enable"]),
      username: usernameSchema.optional(),
    })
    .parse(input);
  let subject = studentId;
  if (d.kind === "Parent") {
    if (
      !d.parentId ||
      !(await one(
        "SELECT id FROM student_parents WHERE institution_id=? AND student_id=? AND parent_id=?",
        [actor.institutionId, studentId, d.parentId],
      ))
    )
      throw new ApiError(404, "NOT_FOUND", "Linked guardian not found.");
    subject = d.parentId;
    // A parent account covers every explicitly linked sibling: teachers need scope for all.
    const siblings = await all(
      "SELECT student_id FROM student_parents WHERE institution_id=? AND parent_id=?",
      [actor.institutionId, subject],
    );
    for (const sibling of siblings)
      await portalStaffScope(actor, sibling.student_id);
  }
  const field = d.kind === "Student" ? "student_id" : "parent_id";
  const existing = await one(
    `SELECT id,username,version,active FROM portal_accounts WHERE institution_id=? AND ${field}=?`,
    [actor.institutionId, subject],
  );
  if (d.action === "create") {
    if (existing)
      throw new ApiError(
        409,
        "ACCOUNT_EXISTS",
        "An account already exists. Reset its password if needed.",
      );
    const created = await newPortalAccount(actor, d.kind, subject);
    await batch([
      created.statement,
      audit(
        actor,
        "Created portal account",
        "portal_accounts",
        created.credentials.accountId,
        null,
        { kind: d.kind, subject },
      ),
    ]);
    return created.credentials;
  }
  if (!existing)
    throw new ApiError(404, "NOT_FOUND", "Create an account first.");
  const edits: Record<string, unknown> = {
    version: existing.version + 1,
    updated_at: now(),
    updated_by: actor.userId,
  };
  let password: string | undefined, expiresAt: string | undefined;
  if (d.action === "rename") {
    if (!d.username)
      throw new ApiError(422, "USERNAME_REQUIRED", "Enter a username.");
    if (
      await one("SELECT id FROM portal_accounts WHERE username=? AND id<>?", [
        d.username,
        existing.id,
      ])
    )
      throw new ApiError(409, "USERNAME_TAKEN", "Choose another username.");
    edits.username = d.username;
  }
  if (d.action === "reset") {
    password = randomSecret(12);
    expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    Object.assign(edits, {
      password_hash: await hashPassword(password),
      must_change: 1,
      credential_expires: expiresAt,
      failed_attempts: 0,
      locked_until: null,
    });
  }
  if (d.action === "disable" || d.action === "enable")
    edits.active = d.action === "enable" ? 1 : 0;
  const result = await batch([
    stmt(
      `UPDATE portal_accounts SET ${Object.keys(edits)
        .map((k) => k + "=?")
        .join(",")} WHERE institution_id=? AND id=? AND version=?`,
      [
        ...Object.values(edits),
        actor.institutionId,
        existing.id,
        existing.version,
      ],
    ),
    stmt(
      "DELETE FROM portal_sessions WHERE institution_id=? AND account_id=?",
      [actor.institutionId, existing.id],
    ),
    audit(
      actor,
      "Portal account " + d.action,
      "portal_accounts",
      existing.id,
      null,
      { kind: d.kind, subject },
    ),
  ]);
  if (!result[0].meta.changes)
    throw new ApiError(
      409,
      "STALE_ACCOUNT",
      "Account changed. Refresh and retry.",
    );
  return {
    accountId: existing.id,
    username: d.username || existing.username,
    password,
    expiresAt,
    kind: d.kind,
  };
}
