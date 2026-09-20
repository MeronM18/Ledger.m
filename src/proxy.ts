import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  // Defense-in-depth: this app has exactly one legitimate user. Checking
  // only "is there a session" would let a real-but-wrong-email Supabase
  // account (see requireApiUser()'s ALLOWED_EMAIL check) straight through
  // proxy and rely entirely on (dashboard)/layout.tsx's requireUser() to
  // catch it — fine today, but a future page added outside that layout
  // would silently skip the check. Enforcing ALLOWED_EMAIL here too means
  // that can never happen, even if the layout-level check is ever forgotten.
  const isAllowedUser = !!user && user.email === env.ALLOWED_EMAIL;

  if (!isAllowedUser && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// Excludes /api/* entirely: every route under it does its own auth
// (requireApiUser(), a CRON_SECRET bearer check, or — for the Plaid webhook —
// signature verification) and none of them have a browser session to redirect.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};
