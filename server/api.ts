import { bindHost } from "./domain-routing";
import { smsAuthRoute } from "./sms-auth";
import { uuid } from "./db";
import { platformRoute } from "./platform";
import { organizationReport } from "./organizations";
import { publicRoute } from "./routes/public";
import { errorResponse, ok, readBody } from "./routes/shared";
import {
  ApiError,
  authenticate,
  csrf,
  platformActor,
  rateLimit,
} from "./security";
import { bootstrap, initializeAccount, session } from "./seed";
import { institutionMiddleware, portalInfo } from "./tenancy";
import { dispatchInstitution } from "./routes";
export async function dispatch(request: Request): Promise<Response> {
  const requestId = uuid();
  try {
    const url = new URL(request.url),
      path = url.pathname
        .replace(/^\/api\/?/, "")
        .split("/")
        .filter(Boolean),
      p = url.searchParams,
      method = request.method;
    const host = await bindHost(request, path);
    request = host.request;
    const authResponse = await smsAuthRoute(request, path, requestId);
    if (authResponse) return authResponse;
    const publicResponse = await publicRoute(request, path, method, requestId);
    if (publicResponse) return publicResponse;
    if (path[0] === "campus") {
      const info = await portalInfo(path[1] || "");
      const supplied = request.headers.get("x-institution-id");
      if (supplied && supplied !== info.id)
        throw new ApiError(
          403,
          "TENANT_MISMATCH",
          "The requested institution does not match this portal.",
        );
      const headers = new Headers(request.headers);
      headers.set("x-institution-id", info.id);
      request = new Request(request.url, {
        method: request.method,
        headers,
        ...(!["GET", "HEAD"].includes(request.method)
          ? { body: await request.arrayBuffer() }
          : {}),
      });
      path.splice(0, 2);
    }
    if (["parent", "pay", "payment-links"].includes(path[0]))
      throw new ApiError(
        410,
        "PORTAL_REMOVED",
        "Parent account and payment portal access is not available. Contact the institution accounts office.",
      );
    csrf(request);
    const user = await authenticate(request);
    await rateLimit(request, user.userId);
    if (path[0] === "session") return ok(await session(request), requestId);
    if (path[0] === "platform") {
      await initializeAccount(request);
      const admin = await platformActor(request);
      const body = method === "GET" ? {} : await readBody(request);
      const result = await platformRoute(admin, path.slice(1), method, p, body);
      const response = ok(result?.cookie ? result.data : result, requestId);
      if (result?.cookie) response.headers.set("Set-Cookie", result.cookie);
      return response;
    }
    if (path[0] === "bootstrap") return ok(await bootstrap(request), requestId);
    if (
      path[0] === "organizations" &&
      path[2] === "reports" &&
      method === "GET"
    )
      return ok(await organizationReport(request, path[1], p), requestId);

    return await institutionMiddleware(request, path, p, async (actor) =>
      dispatchInstitution({
        actor,
        path,
        p,
        method,
        request,
        url,
        requestId,
        body: ["GET", "HEAD"].includes(method) ? {} : await readBody(request),
      }),
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
