import { z } from "zod";
import {
  addSubject,
  createExam,
  examCandidates,
  examDetail,
  examList,
  examPhoto,
  gradeResults,
  issueAdmitCard,
  registerStudents,
  transitionExam,
} from "../exams";
import { batch, now, stmt } from "../db";
import { audit, own, permit } from "../security";
import { ok, RouteContext } from "./shared";
export async function examsRoute(ctx: RouteContext): Promise<Response | null> {
  const { actor, path, method, body, p, requestId } = ctx;
  if (path[0] !== "exams") return null;
  if (!path[1] && method === "GET")
    return ok(
      await examList(
        actor,
        p.get("year") || "",
        Math.max(1, parseInt(p.get("page") || "1") || 1),
      ),
      requestId,
    );
  if (!path[1] && method === "POST")
    return ok(await createExam(actor, body), requestId);
  if (path[2] === "candidates" && method === "GET")
    return ok(
      await examCandidates(
        actor,
        path[1],
        Math.max(1, parseInt(p.get("page") || "1") || 1),
      ),
      requestId,
    );
  if (path[1] && !path[2] && method === "GET")
    return ok(await examDetail(actor, path[1], p), requestId);
  if (path[2] === "subjects" && method === "POST")
    return ok(await addSubject(actor, path[1], body), requestId);
  if (path[2] === "register" && method === "POST")
    return ok(await registerStudents(actor, path[1], body), requestId);
  if (path[2] === "results" && method === "POST")
    return ok(await gradeResults(actor, path[1], body), requestId);
  if (path[2] === "status" && method === "POST")
    return ok(
      await transitionExam(
        actor,
        path[1],
        z.enum(["Scheduled", "Published", "Archived"]).parse(body.status),
      ),
      requestId,
    );
  if (path[2] === "admit" && method === "POST")
    return ok(
      await issueAdmitCard(
        actor,
        path[1],
        z.string().parse(body.registrationId),
      ),
      requestId,
    );
  if (path[2] === "photo" && path[3] && method === "GET")
    return examPhoto(actor, path[1], path[3]);
  if (path[2] === "revoke" && method === "POST") {
    permit(actor, "exams.manage");
    const d = z.object({ cardId: z.string() }).parse(body),
      card = await own(actor, "admit_cards", d.cardId),
      reg = await own(actor, "exam_registrations", card.registration_id);
    if (reg.exam_id !== path[1]) return null;
    await batch([
      stmt(
        "UPDATE admit_cards SET revoked_at=?,updated_at=?,updated_by=? WHERE id=? AND institution_id=?",
        [now(), now(), actor.userId, d.cardId, actor.institutionId],
      ),
      audit(actor, "Revoked admit card", "admit_cards", d.cardId, null, {
        revoked: true,
      }),
    ]);
    return ok({ revoked: true }, requestId);
  }
  return null;
}
