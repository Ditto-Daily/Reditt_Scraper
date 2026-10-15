import { computeSessionToken, getPassword, safeEqual, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const expected = getPassword();
  if (!expected) {
    return Response.json({ error: "App access is not configured. Add APP_PASSWORD to the environment variables." }, { status: 503 });
  }
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  const [a, b] = await Promise.all([computeSessionToken(String(password ?? "")), computeSessionToken(expected)]);
  if (!safeEqual(a, b)) return Response.json({ error: "Incorrect password." }, { status: 401 });

  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${b}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return response;
}
