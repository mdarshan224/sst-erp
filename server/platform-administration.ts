import { z } from "zod";
import { platformPermissions } from "../lib/platform-permissions";
import { all, batch, insert, now, one, stamps, stmt, uuid } from "./db";
import { Actor, ApiError, accountIdForEmail, deny } from "./security";
import { platformAudit } from "./tenancy";
export async function platformAdministration(
  actor: Actor,
  path: string[],
  method: string,
  body: unknown,
) {
  if (!actor.primaryPlatform) deny();
  if (method === "GET")
    return {
      roles: await all("SELECT * FROM platform_roles ORDER BY name"),
      administrators: await all(
        "SELECT a.user_id,a.active,a.role_id,u.name,u.email,(SELECT mobile FROM sms_accounts sa WHERE sa.user_id=u.id) mobile,r.name role_name FROM platform_admins a JOIN users u ON u.id=a.user_id LEFT JOIN platform_roles r ON r.id=a.role_id ORDER BY u.name",
      ),
      permissions: platformPermissions,
      primaryUserId: actor.userId,
    };
  if (path[0] === "roles") {
    const d = z
      .object({
        name: z.string().trim().min(2).max(80),
        permissions: z
          .array(z.enum(platformPermissions))
          .max(platformPermissions.length),
        active: z.boolean(),
      })
      .parse(body);
    const id = path[1] || uuid(),
      old = await one("SELECT * FROM platform_roles WHERE id=?", [id]);
    if (path[1] && !old)
      throw new ApiError(404, "NOT_FOUND", "Role not found.");
    await batch([
      old
        ? stmt(
            "UPDATE platform_roles SET name=?,permissions=?,active=?,updated_at=?,updated_by=? WHERE id=?",
            [
              d.name,
              JSON.stringify([...new Set(d.permissions)]),
              +d.active,
              now(),
              actor.userId,
              id,
            ],
          )
        : insert("platform_roles", {
            id,
            name: d.name,
            permissions: JSON.stringify([...new Set(d.permissions)]),
            active: +d.active,
            ...stamps(actor.userId),
          }),
      platformAudit(
        actor,
        "Configured platform role",
        "platform_roles",
        id,
        old,
        d,
      ),
    ]);
    return { id };
  }
  const d = z
    .object({
      email: z
        .string()
        .email()
        .transform((x) => x.toLowerCase()),
      name: z.string().trim().min(2).max(100),
      mobile: z.string().regex(/^[6-9]\d{9}$/),
      roleId: z.string().min(1),
      active: z.boolean(),
    })
    .parse(body);
  const role = await one(
    "SELECT id FROM platform_roles WHERE id=? AND active=1",
    [d.roleId],
  );
  if (!role) throw new ApiError(422, "ROLE_REQUIRED", "Select an active role.");
  const id = await accountIdForEmail(d.email);
  if (id === actor.userId)
    throw new ApiError(
      422,
      "PRIMARY_PROTECTED",
      "The primary administrator cannot be disabled or delegated a restricted role.",
    );
  const mobile = await one("SELECT user_id FROM sms_accounts WHERE mobile=?", [
    d.mobile,
  ]);
  if (mobile && mobile.user_id !== id)
    throw new ApiError(
      409,
      "MOBILE_IN_USE",
      "This mobile number belongs to another account.",
    );
  const old = await one("SELECT * FROM platform_admins WHERE user_id=?", [id]);
  await batch([
    stmt(
      "INSERT INTO users(id,email,name,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      [id, d.email, d.name, now(), now(), actor.userId, actor.userId],
    ),
    stmt(
      "INSERT INTO platform_admins(user_id,role_id,active,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET role_id=excluded.role_id,active=excluded.active,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [id, d.roleId, +d.active, now(), now(), actor.userId, actor.userId],
    ),
    stmt(
      "INSERT INTO sms_accounts(user_id,mobile,verified_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET mobile=excluded.mobile,verified_at=excluded.verified_at",
      [id, d.mobile, now()],
    ),
    stmt(
      "UPDATE sms_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
      [now(), id],
    ),
    stmt(
      "UPDATE support_sessions SET ended_at=? WHERE user_id=? AND ended_at IS NULL",
      [now(), id],
    ),
    platformAudit(
      actor,
      "Configured platform administrator",
      "platform_admins",
      id,
      old,
      { roleId: d.roleId, active: d.active },
    ),
  ]);
  return { id };
}
