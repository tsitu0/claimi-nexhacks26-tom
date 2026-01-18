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
  const [settlements, setSettlements] = useState([]);
  const [settlementsStatus, setSettlementsStatus] = useState("loading");
  const [settlementsError, setSettlementsError] = useState("");
  const [selectedSettlement, setSelectedSettlement] = useState(null);

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

      const { data: settlementsData, error: settlementsLoadError } =
        await supabase
          .from("Settlement")
          .select(
            [
              "id",
              "title",
              "provider",
              "settlement_amount",
              "description",
              "deadline",
              "claim_url",
              "source_url",
              "status",
              "created_at",
              "updated_at",
              "case_name",
              "eligibility_rules",
              "citations",
              "claim_form_info",
              "has_valid_form",
              "raw_content",
            ].join(",")
          )
          .order("created_at", { ascending: false });

      if (settlementsLoadError) {
        setSettlementsError(
          settlementsLoadError.message ||
            "Unable to load settlements. Please try again."
        );
        setSettlementsStatus("error");
      } else {
        setSettlements(settlementsData || []);
        setSettlementsStatus("ready");
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

  const formatDate = (value) => {
    if (!value) {
      return "Not listed";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }
    return parsed.toLocaleDateString();
  };

  const formatValue = (value) => {
    if (value === null || value === undefined || value === "") {
      return "Not provided";
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
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

          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Settlements
                </h2>
                <p className="text-sm text-[#9CA3AF]">
                  Tap a tile to see the full details.
                </p>
              </div>
              <div className="text-xs text-white/50">
                {settlements.length} total
              </div>
            </div>

            {settlementsStatus === "loading" && (
              <div className="mt-6 text-sm text-[#9CA3AF]">
                Loading settlements...
              </div>
            )}
            {settlementsStatus === "error" && (
              <div className="mt-6 text-sm text-red-300">
                {settlementsError}
              </div>
            )}
            {settlementsStatus === "ready" && settlements.length === 0 && (
              <div className="mt-6 text-sm text-[#9CA3AF]">
                No settlements available yet.
              </div>
            )}
            {settlementsStatus === "ready" && settlements.length > 0 && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {settlements.map((settlement) => (
                  <button
                    key={settlement.id}
                    type="button"
                    onClick={() => setSelectedSettlement(settlement)}
                    className="group text-left"
                  >
                    <Card className="relative h-full overflow-hidden border-white/10 bg-[#0E1424] transition duration-200 group-hover:-translate-y-1 group-hover:border-[#2563EB]/50 group-hover:shadow-[0_0_0_1px_rgba(37,99,235,0.25),0_18px_40px_rgba(8,11,22,0.5)]">
                      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-200 group-hover:opacity-100">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#2563EB]/15 via-transparent to-transparent" />
                        <div className="absolute -top-10 right-6 h-24 w-24 rounded-full bg-[#2563EB]/20 blur-[40px]" />
                      </div>
                      <CardContent className="relative flex min-h-[140px] flex-col justify-between gap-4 p-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-white/70">
                            <span className="uppercase tracking-wide">
                              {settlement.provider || "Unknown provider"}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px]">
                              {settlement.status || "Unknown"}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-white">
                            {settlement.title || "Untitled settlement"}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-xs text-white/80">
                          <span>
                            {settlement.settlement_amount || "Amount varies"}
                          </span>
                          <span className="text-white/60">Tap for details</span>
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      {selectedSettlement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 py-10"
          onClick={() => setSelectedSettlement(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0E1424] p-6 text-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Settlement details
                </p>
                <h2 className="text-2xl font-semibold">
                  {selectedSettlement.title || "Untitled settlement"}
                </h2>
                <p className="text-sm text-white/70">
                  {selectedSettlement.provider || "Unknown provider"}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setSelectedSettlement(null)}>
                Close
              </Button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Settlement amount
                </p>
                <p className="mt-1 text-sm text-white">
                  {selectedSettlement.settlement_amount || "Amount varies"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Deadline
                </p>
                <p className="mt-1 text-sm text-white">
                  {formatDate(selectedSettlement.deadline)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Status
                </p>
                <p className="mt-1 text-sm text-white">
                  {selectedSettlement.status || "Unknown"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Case name
                </p>
                <p className="mt-1 text-sm text-white">
                  {selectedSettlement.case_name || "Not provided"}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4 text-sm text-white/80">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Description
                </p>
                <p className="mt-2 text-white">
                  {selectedSettlement.description || "Not provided"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Claim link
                </p>
                {selectedSettlement.claim_url ? (
                  <a
                    className="mt-2 inline-block text-sm text-[#60A5FA] hover:text-[#93C5FD]"
                    href={selectedSettlement.claim_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selectedSettlement.claim_url}
                  </a>
                ) : (
                  <p className="mt-2 text-white/70">Not provided</p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Source link
                </p>
                {selectedSettlement.source_url ? (
                  <a
                    className="mt-2 inline-block text-sm text-[#60A5FA] hover:text-[#93C5FD]"
                    href={selectedSettlement.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selectedSettlement.source_url}
                  </a>
                ) : (
                  <p className="mt-2 text-white/70">Not provided</p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Eligibility rules
                </p>
                <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/80">
                  {formatValue(selectedSettlement.eligibility_rules)}
                </pre>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Claim form info
                </p>
                <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/80">
                  {formatValue(selectedSettlement.claim_form_info)}
                </pre>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Has valid form
                </p>
                <p className="mt-2 text-white">
                  {selectedSettlement.has_valid_form ? "Yes" : "No"}
                </p>
              </div>
              <details className="rounded-xl border border-white/10 bg-white/5 p-4">
                <summary className="cursor-pointer text-xs uppercase tracking-wide text-white/40">
                  Raw content
                </summary>
                <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-white/80">
                  {formatValue(selectedSettlement.raw_content)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
