import { NextResponse, type NextRequest } from "next/server";

import { computeSessionToken, getPassword, safeEqual, SESSION_COOKIE } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const password = getPassword();
  if (!password) {
    return new NextResponse("App access is not configured. Add APP_PASSWORD to the environment variables.", {
      status: 503,
    });
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await computeSessionToken(password))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Your session has expired. Reload the page and sign in." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
