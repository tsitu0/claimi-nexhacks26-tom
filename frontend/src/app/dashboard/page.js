"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const router = useRouter();
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        router.push("/login");
        return;
      }
      setUserEmail(user.email || "");

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          [
            "id",
            "onboarded",
            "legal_first_name",
            "legal_last_name",
            "email",
            "phone_number",
            "city",
            "state",
            "zip_code",
            "country",
            "employment_status",
            "employment_type",
            "occupation_category",
            "preferred_contact_method",
          ].join(",")
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setError("Unable to load your profile. Please try again.");
        setStatus("error");
        return;
      }

      if (!profileError && (!profileData || !profileData.onboarded)) {
        router.push("/onboarding");
        return;
      }

      setProfile(profileData);
      setStatus("ready");
    };

    load();
  }, [router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading your dashboard...
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        {error || "Unable to load your dashboard. Please try again."}
      </div>
    );
  }

  const displayName = (() => {
    const first = profile?.legal_first_name || "";
    const last = profile?.legal_last_name || "";
    const full = `${first} ${last}`.trim();
    return full || profile?.email || userEmail || "there";
  })();

  const infoRows = [
    { label: "Email", value: profile?.email || userEmail },
    { label: "Phone", value: profile?.phone_number },
    {
      label: "Location",
      value: [profile?.city, profile?.state, profile?.zip_code, profile?.country]
        .filter(Boolean)
        .join(", "),
    },
    { label: "Employment status", value: profile?.employment_status },
    { label: "Employment type", value: profile?.employment_type },
    { label: "Occupation category", value: profile?.occupation_category },
    { label: "Preferred contact", value: profile?.preferred_contact_method },
  ];

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-[#E5E7EB]">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-[-140px] h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-[#2563EB]/20 blur-[140px]" />
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                Dashboard
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white">
                Hello {displayName}, this is your info.
              </h1>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                Review your details and jump into your claims.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button>Current claims</Button>
              <Button variant="outline">View past claims</Button>
              <Button
                variant="ghost"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                Sign out
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-white/10 bg-[#0E1424]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white">
                  Your profile snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {infoRows.map((row) => (
                  <div key={row.label} className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-white/40">
                      {row.label}
                    </p>
                    <p className="text-sm text-white">
                      {row.value || "Not provided"}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-[#0E1424]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white">
                  Quick actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-[#9CA3AF]">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  Track active claims, upload documents, and see upcoming
                  deadlines in one view.
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  Review previous submissions and export your claim history.
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  Update your preferred contact method at any time.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
