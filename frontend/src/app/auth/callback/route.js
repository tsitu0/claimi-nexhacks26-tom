import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";
  const nextPath = next.startsWith("/") ? next : "/dashboard";
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      code
    );
    if (exchangeError) {
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent("Unable to sign in. Please try again.")}`,
          origin
        )
      );
    }
    if (!exchangeError) {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id,onboarded")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) {
          return NextResponse.redirect(
            new URL(
              `/login?error=${encodeURIComponent(
                "Unable to load your profile. Please try again."
              )}`,
              origin
            )
          );
        }
        if (!profileError && (!profile || !profile.onboarded)) {
          return NextResponse.redirect(new URL("/onboarding", origin));
        }
      }
    }
  }
  return NextResponse.redirect(new URL(nextPath, origin));
}
