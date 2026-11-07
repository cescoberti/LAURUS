import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Who is asking, and the client that read them — the four lines every download
 * route opened with, written once.
 *
 * It deliberately stops there. The `if (!user) return 401` stays at each call
 * site: a route that decides who may download a voting list should say so in
 * its own body, not inherit the decision from a helper it imports.
 */
export async function sessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Server Component / Server Action client — reads and writes the auth cookie
 * via Next's cookie jar, subject to RLS as the signed-in user.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: "laurus" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render (no cookie write access);
          // the proxy middleware refreshes the session on the next request.
        }
      },
    },
  });
}
