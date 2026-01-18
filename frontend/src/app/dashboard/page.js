"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [responses, setResponses] = useState({});
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [extensionStatus, setExtensionStatus] = useState("checking"); // checking, installed, not_installed
  const [applyStatus, setApplyStatus] = useState("idle"); // idle, sending, success, error
  const [applyError, setApplyError] = useState("");

  // Check if Claimi extension is installed
  useEffect(() => {
    const handleExtensionReady = (event) => {
      console.log("[Dashboard] Extension detected:", event.detail);
      setExtensionStatus("installed");
    };

    const handlePacketStored = (event) => {
      console.log("[Dashboard] Packet stored result:", event.detail);
      if (event.detail?.success) {
        setApplyStatus("success");
      } else {
        setApplyStatus("error");
        setApplyError(event.detail?.error || "Failed to send to extension");
      }
    };

    // Listen for extension events
    window.addEventListener("claimi-bridge-ready", handleExtensionReady);
    window.addEventListener("claimi-extension-ready", handleExtensionReady);
    window.addEventListener("claimi-packet-stored", handlePacketStored);

    // Check if extension is already loaded
    window.dispatchEvent(new CustomEvent("claimi-check-extension"));

    // Timeout to mark as not installed if no response
    const timeout = setTimeout(() => {
      if (extensionStatus === "checking") {
        setExtensionStatus("not_installed");
      }
    }, 2000);

    return () => {
      window.removeEventListener("claimi-bridge-ready", handleExtensionReady);
      window.removeEventListener("claimi-extension-ready", handleExtensionReady);
      window.removeEventListener("claimi-packet-stored", handlePacketStored);
      clearTimeout(timeout);
    };
  }, [extensionStatus]);
  const [userId, setUserId] = useState("");
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitError, setSubmitError] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);


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
      setUserId(user.id);

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
          .from("parsed_settlements")
          .select(
            [
              "id",
              "settlement_id",
              "settlement_title",
              "source_url",
              "claim_form_url",
              "general_requirements",
              "specific_requirements",
              "onboarding_questions",
              "proof_checklist",
              "parsing_confidence",
              "created_at",
              "updated_at",
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
      setProfileForm({
        legal_first_name: profileData?.legal_first_name || "",
        legal_last_name: profileData?.legal_last_name || "",
        email: profileData?.email || user.email || "",
        phone_number: profileData?.phone_number || "",
        city: profileData?.city || "",
        state: profileData?.state || "",
        zip_code: profileData?.zip_code || "",
        country: profileData?.country || "",
        employment_status: profileData?.employment_status || "",
        employment_type: profileData?.employment_type || "",
        occupation_category: profileData?.occupation_category || "",
        preferred_contact_method: profileData?.preferred_contact_method || "",
      });
      setStatus("ready");
    };

    load();
  }, [router]);

  useEffect(() => {
    setSubmitStatus("idle");
    setSubmitError("");
    setHasSubmitted(false);
  }, [selectedSettlement?.id]);

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
    {
      label: "Legal name",
      value: [profile?.legal_first_name, profile?.legal_last_name]
        .filter(Boolean)
        .join(" "),
    },
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

  const selectClassName =
    "h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60";

  const toNull = (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }
    return value;
  };

  const updateProfileField = (field) => (event) => {
    setProfileForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleEditProfile = () => {
    setSaveError("");
    setIsEditingProfile(true);
  };

  const handleCancelEdit = () => {
    if (profile) {
      setProfileForm({
        legal_first_name: profile?.legal_first_name || "",
        legal_last_name: profile?.legal_last_name || "",
        email: profile?.email || userEmail || "",
        phone_number: profile?.phone_number || "",
        city: profile?.city || "",
        state: profile?.state || "",
        zip_code: profile?.zip_code || "",
        country: profile?.country || "",
        employment_status: profile?.employment_status || "",
        employment_type: profile?.employment_type || "",
        occupation_category: profile?.occupation_category || "",
        preferred_contact_method: profile?.preferred_contact_method || "",
      });
    }
    setSaveError("");
    setIsEditingProfile(false);
  };

  const handleSaveProfile = async () => {
    if (!profile?.id || !profileForm) {
      return;
    }
    setSaveStatus("loading");
    setSaveError("");
    const payload = {
      legal_first_name: toNull(profileForm.legal_first_name),
      legal_last_name: toNull(profileForm.legal_last_name),
      email: toNull(profileForm.email),
      phone_number: toNull(profileForm.phone_number),
      city: toNull(profileForm.city),
      state: toNull(profileForm.state),
      zip_code: toNull(profileForm.zip_code),
      country: toNull(profileForm.country),
      employment_status: toNull(profileForm.employment_status),
      employment_type: toNull(profileForm.employment_type),
      occupation_category: toNull(profileForm.occupation_category),
      preferred_contact_method: toNull(profileForm.preferred_contact_method),
    };
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", profile.id)
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
      .maybeSingle();

    if (updateError) {
      setSaveError(updateError.message);
      setSaveStatus("idle");
      return;
    }
    const updatedProfile = Array.isArray(updated) ? updated[0] : updated;
    const mergedProfile = updatedProfile || { ...profile, ...payload };
    setProfile(mergedProfile);
    setProfileForm({
      legal_first_name: mergedProfile?.legal_first_name || "",
      legal_last_name: mergedProfile?.legal_last_name || "",
      email: mergedProfile?.email || userEmail || "",
      phone_number: mergedProfile?.phone_number || "",
      city: mergedProfile?.city || "",
      state: mergedProfile?.state || "",
      zip_code: mergedProfile?.zip_code || "",
      country: mergedProfile?.country || "",
      employment_status: mergedProfile?.employment_status || "",
      employment_type: mergedProfile?.employment_type || "",
      occupation_category: mergedProfile?.occupation_category || "",
      preferred_contact_method: mergedProfile?.preferred_contact_method || "",
    });
    setSaveStatus("idle");
    setIsEditingProfile(false);
  };

  // Build and send claim packet to extension
  const handleApplyToClaim = async () => {
    if (!selectedSettlement || !profile) {
      setApplyError("Missing settlement or profile data");
      setApplyStatus("error");
      return;
    }

    setApplyStatus("sending");
    setApplyError("");

    // Build the claim packet
    const claimPacket = {
      id: selectedSettlement.id || selectedSettlement.settlement_id,
      settlementName: selectedSettlement.settlement_title || "Unknown Settlement",
      settlementId: selectedSettlement.settlement_id,
      userData: {
        firstName: profile.legal_first_name || "",
        lastName: profile.legal_last_name || "",
        fullName: [profile.legal_first_name, profile.legal_last_name]
          .filter(Boolean)
          .join(" "),
        email: profile.email || userEmail || "",
        phone: profile.phone_number || "",
        address: {
          city: profile.city || "",
          state: profile.state || "",
          zip: profile.zip_code || "",
          country: profile.country || "",
        },
      },
      caseAnswers: {},
      caseAnswerMeta: {},
    };

    // Collect user's answers to eligibility questions
    const settlementKey =
      selectedSettlement.id || selectedSettlement.settlement_id || "settlement";
    const onboardingQuestions = parseJsonField(
      selectedSettlement.onboarding_questions
    );

    if (Array.isArray(onboardingQuestions)) {
      onboardingQuestions.forEach((question, index) => {
        const key = `${settlementKey}-question-${question?.id ?? index}`;
        const answer = responses[key];
        if (answer) {
          // Create a snake_case key from the question
          const answerKey =
            question?.id ||
            `question_${index}`;
          claimPacket.caseAnswers[answerKey] = answer === "yes";
          claimPacket.caseAnswerMeta[answerKey] =
            question?.question || `Question ${index + 1}`;
        }
      });
    }

    // Collect answers to general/specific requirements
    const parsedGeneralReqs = parseJsonField(
      selectedSettlement.general_requirements
    );
    const parsedSpecificReqs = parseJsonField(
      selectedSettlement.specific_requirements
    );

    [
      { items: parsedGeneralReqs, prefix: "general" },
      { items: parsedSpecificReqs, prefix: "specific" },
    ].forEach(({ items, prefix }) => {
      if (Array.isArray(items)) {
        items.forEach((item, index) => {
          const key = `${settlementKey}-${prefix}-${item?.id ?? index}`;
          const answer = responses[key];
          if (answer) {
            const answerKey = `${prefix}_${item?.id || index}`;
            claimPacket.caseAnswers[answerKey] = answer === "yes";
            claimPacket.caseAnswerMeta[answerKey] =
              item?.description || item?.original_text || `${prefix} requirement`;
          }
        });
      }
    });

    console.log("[Dashboard] Sending claim packet to extension:", claimPacket);

    // Dispatch custom event to the extension
    window.dispatchEvent(
      new CustomEvent("claimi-claim-packet", {
        detail: claimPacket,
      })
    );

    // Set a timeout in case extension doesn't respond
    setTimeout(() => {
      if (applyStatus === "sending") {
        setApplyStatus("error");
        setApplyError(
          "No response from extension. Make sure the Claimi extension is installed and enabled."
        );
      }
    }, 5000);
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

  const formatConfidence = (value) => {
    if (value === null || value === undefined) {
      return "Confidence n/a";
    }
    const percent = Math.round(Number(value) * 100);
    if (Number.isNaN(percent)) {
      return "Confidence n/a";
    }
    return `Confidence ${percent}%`;
  };

  const parseJsonField = (value) => {
    if (!value) {
      return null;
    }
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  };

  const setAnswer = (key, value) => {
    setResponses((prev) => ({ ...prev, [key]: value }));
    if (key.startsWith(`${settlementKey}-`)) {
      setHasSubmitted(false);
    }
  };

  const renderItemList = (items, renderItem, keyPrefix) => {
    if (!Array.isArray(items) || items.length === 0) {
      return <p className="mt-2 text-white/70">Not provided</p>;
    }
    return (
      <ul className="mt-2 space-y-2 text-sm text-white/80">
        {items.map((item, index) => {
          const key = `${keyPrefix || "item"}-${item?.id ?? index}`;
          const answer = responses[key];
          return (
            <li
              key={item?.id ?? index}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
            >
              <div className="space-y-1">{renderItem(item)}</div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAnswer(key, "yes")}
                  className={`rounded-full border px-3 py-1 transition ${
                    answer === "yes"
                      ? "border-[#2563EB] bg-[#2563EB]/20 text-white"
                      : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setAnswer(key, "no")}
                  className={`rounded-full border px-3 py-1 transition ${
                    answer === "no"
                      ? "border-[#2563EB] bg-[#2563EB]/20 text-white"
                      : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                  }`}
                >
                  No
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  const parsedGeneralRequirements = parseJsonField(
    selectedSettlement?.general_requirements
  );
  const parsedSpecificRequirements = parseJsonField(
    selectedSettlement?.specific_requirements
  );
  const parsedOnboardingQuestions = parseJsonField(
    selectedSettlement?.onboarding_questions
  );
  const parsedProofChecklist = parseJsonField(
    selectedSettlement?.proof_checklist
  );
  const settlementKey =
    selectedSettlement?.id || selectedSettlement?.settlement_id || "settlement";
  const sourceUrl =
    typeof selectedSettlement?.source_url === "string"
      ? selectedSettlement.source_url.trim()
      : "";
  const claimFormUrl =
    typeof selectedSettlement?.claim_form_url === "string"
      ? selectedSettlement.claim_form_url.trim()
      : "";
  const canLinkClaimFormUrl = /^https?:\/\//i.test(claimFormUrl);

  const normalizedAnswer = (value) =>
    value === null || value === undefined
      ? ""
      : String(value).trim().toLowerCase();

  const onboardingQuestions = Array.isArray(parsedOnboardingQuestions)
    ? parsedOnboardingQuestions
    : [];

  const buildAnswerItems = () => {
    const items = [];
    const pushItems = (list, keyPrefix, getQuestion, section) => {
      if (!Array.isArray(list)) {
        return;
      }
      list.forEach((item, index) => {
        const key = `${keyPrefix}-${item?.id ?? index}`;
        const questionText = getQuestion(item) || "Question";
        items.push({
          key,
          section,
          question: questionText,
          answer: responses[key] ?? null,
        });
      });
    };

    pushItems(
      onboardingQuestions,
      `${settlementKey}-question`,
      (item) => item?.question,
      "onboarding"
    );
    pushItems(
      parsedGeneralRequirements,
      `${settlementKey}-general`,
      (item) => item?.description || item?.original_text || "Requirement",
      "general"
    );
    pushItems(
      parsedSpecificRequirements,
      `${settlementKey}-specific`,
      (item) => item?.description || item?.original_text || "Requirement",
      "specific"
    );
    pushItems(
      parsedProofChecklist,
      `${settlementKey}-proof`,
      (item) => item?.description || "Proof item",
      "proof"
    );

    return items;
  };

  const eligibilityStatus = (() => {
    let answeredCount = 0;
    let totalRequired = 0;
    const hasDisqualifying = onboardingQuestions.some((question, index) => {
      const key = `${settlementKey}-question-${question?.id ?? index}`;
      const answer = responses[key];
      totalRequired += 1;
      if (answer) {
        answeredCount += 1;
      }
      const disqualifying = normalizedAnswer(question?.disqualifying_answer);
      return (
        answer &&
        disqualifying &&
        normalizedAnswer(answer) === disqualifying
      );
    });
    const evaluateRequirements = (items, keyPrefix, isRequired) => {
      if (!Array.isArray(items)) {
        return false;
      }
      return items.some((item, index) => {
        const required = isRequired(item);
        if (required) {
          totalRequired += 1;
        }
        const key = `${keyPrefix}-${item?.id ?? index}`;
        const answer = responses[key];
        if (required && answer) {
          answeredCount += 1;
        }
        return required && answer === "no";
      });
    };

    const generalDisqualifying = evaluateRequirements(
      parsedGeneralRequirements,
      `${settlementKey}-general`,
      () => true
    );
    const specificDisqualifying = evaluateRequirements(
      parsedSpecificRequirements,
      `${settlementKey}-specific`,
      (item) => !item?.is_optional
    );
    const proofDisqualifying = evaluateRequirements(
      parsedProofChecklist,
      `${settlementKey}-proof`,
      (item) => item?.is_required !== false
    );

    if (hasDisqualifying || generalDisqualifying || specificDisqualifying || proofDisqualifying) {
      return "Does not qualify";
    }
    if (totalRequired > 0 && answeredCount === totalRequired) {
      return "Qualifies";
    }
    return "Not enough info";
  })();

  const handleSubmitAnswers = async () => {
    if (!selectedSettlement || !userId) {
      return;
    }
    setSubmitStatus("loading");
    setSubmitError("");
    const answerItems = buildAnswerItems();
    const payload = {
      user_id: userId,
      settlement_key: String(settlementKey),
      settlement_record_id: selectedSettlement?.id
        ? String(selectedSettlement.id)
        : null,
      settlement_external_id: selectedSettlement?.settlement_id
        ? String(selectedSettlement.settlement_id)
        : null,
      answers: answerItems,
      eligibility_status: eligibilityStatus,
    };
    const { error: submitError } = await supabase
      .from("settlement_responses")
      .upsert(payload, { onConflict: "user_id,settlement_key" });
    if (submitError) {
      setSubmitError(submitError.message);
      setSubmitStatus("idle");
      return;
    }
    setSubmitStatus("success");
    setHasSubmitted(true);
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
              <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base text-white">
                  Your profile snapshot
                </CardTitle>
                {isEditingProfile ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveProfile}
                      disabled={saveStatus === "loading"}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleEditProfile}>
                    Edit profile
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {isEditingProfile && profileForm ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="legalFirstName">Legal first name</Label>
                      <Input
                        id="legalFirstName"
                        value={profileForm.legal_first_name}
                        onChange={updateProfileField("legal_first_name")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="legalLastName">Legal last name</Label>
                      <Input
                        id="legalLastName"
                        value={profileForm.legal_last_name}
                        onChange={updateProfileField("legal_last_name")}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="profileEmail">Email</Label>
                      <Input
                        id="profileEmail"
                        type="email"
                        value={profileForm.email}
                        onChange={updateProfileField("email")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber">Phone</Label>
                      <Input
                        id="phoneNumber"
                        value={profileForm.phone_number}
                        onChange={updateProfileField("phone_number")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={profileForm.city}
                        onChange={updateProfileField("city")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={profileForm.state}
                        onChange={updateProfileField("state")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zip">Zip code</Label>
                      <Input
                        id="zip"
                        value={profileForm.zip_code}
                        onChange={updateProfileField("zip_code")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        value={profileForm.country}
                        onChange={updateProfileField("country")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="employmentStatus">Employment status</Label>
                      <select
                        id="employmentStatus"
                        className={selectClassName}
                        value={profileForm.employment_status}
                        onChange={updateProfileField("employment_status")}
                      >
                        <option value="">Select</option>
                        <option value="employed">Employed</option>
                        <option value="unemployed">Unemployed</option>
                        <option value="student">Student</option>
                        <option value="retired">Retired</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="employmentType">Employment type</Label>
                      <select
                        id="employmentType"
                        className={selectClassName}
                        value={profileForm.employment_type}
                        onChange={updateProfileField("employment_type")}
                      >
                        <option value="">Select</option>
                        <option value="full_time">Full time</option>
                        <option value="part_time">Part time</option>
                        <option value="contractor">Contractor</option>
                        <option value="self_employed">Self employed</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="occupationCategory">
                        Occupation category
                      </Label>
                      <select
                        id="occupationCategory"
                        className={selectClassName}
                        value={profileForm.occupation_category}
                        onChange={updateProfileField("occupation_category")}
                      >
                        <option value="">Select</option>
                        <option value="tech">Tech</option>
                        <option value="retail">Retail</option>
                        <option value="healthcare">Healthcare</option>
                        <option value="education">Education</option>
                        <option value="transportation">Transportation</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="preferredContact">
                        Preferred contact method
                      </Label>
                      <select
                        id="preferredContact"
                        className={selectClassName}
                        value={profileForm.preferred_contact_method}
                        onChange={updateProfileField("preferred_contact_method")}
                      >
                        <option value="">Select</option>
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                      </select>
                    </div>
                    {saveError && (
                      <p className="text-sm text-red-300 md:col-span-2">
                        {saveError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
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
                  </div>
                )}
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
                              Parsed settlement
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px]">
                              Ready
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-white">
                            {settlement.settlement_title || "Untitled settlement"}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-xs text-white/80">
                          <span>
                            {formatConfidence(settlement.parsing_confidence)}
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
                  {selectedSettlement.settlement_title || "Untitled settlement"}
                </h2>
                {sourceUrl && (
                  <p className="text-sm text-white/70">
                    Source:{" "}
                    <a
                      className="break-all text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {sourceUrl}
                    </a>
                  </p>
                )}
                <p className="text-sm text-white/70">
                  Settlement ID: {selectedSettlement.settlement_id || "Unknown"}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setSelectedSettlement(null)}>
                Close
              </Button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Created
                </p>
                <p className="mt-1 text-sm text-white">
                  {formatDate(selectedSettlement.created_at)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Updated
                </p>
                <p className="mt-1 text-sm text-white">
                  {formatDate(selectedSettlement.updated_at)}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4 text-sm text-white/80">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  General requirements
                </p>
                {renderItemList(
                  parsedGeneralRequirements,
                  (item) => (
                  <>
                    <p className="text-sm text-white">
                      {item?.description ||
                        item?.original_text ||
                        "Requirement"}
                    </p>
                  </>
                  ),
                  `${settlementKey}-general`
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Specific requirements
                </p>
                {renderItemList(
                  parsedSpecificRequirements,
                  (item) => (
                  <>
                    <p className="text-sm text-white">
                      {item?.description ||
                        item?.original_text ||
                        "Requirement"}
                    </p>
                    {Array.isArray(item?.proof_examples) &&
                      item.proof_examples.length > 0 && (
                        <p className="mt-2 text-xs text-white/60">
                          Examples: {item.proof_examples.join(", ")}
                        </p>
                      )}
                  </>
                  ),
                  `${settlementKey}-specific`
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Onboarding questions
                </p>
                {onboardingQuestions.length === 0 ? (
                  <p className="mt-2 text-white/70">Not provided</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm text-white/80">
                    {onboardingQuestions.map((item, index) => {
                      const key = `${settlementKey}-question-${item?.id ?? index}`;
                      const answer = responses[key];
                      return (
                        <li
                          key={item?.id ?? index}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
                        >
                          <span className="text-sm text-white">
                            {item?.question || "Question"}
                          </span>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setAnswer(key, "yes")}
                              className={`rounded-full border px-3 py-1 transition ${
                                answer === "yes"
                                  ? "border-[#2563EB] bg-[#2563EB]/20 text-white"
                                  : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                              }`}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => setAnswer(key, "no")}
                              className={`rounded-full border px-3 py-1 transition ${
                                answer === "no"
                                  ? "border-[#2563EB] bg-[#2563EB]/20 text-white"
                                  : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                              }`}
                            >
                              No
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Proof checklist
                </p>
                {renderItemList(
                  parsedProofChecklist,
                  (item) => (
                  <>
                    <p className="text-sm text-white">
                      {item?.description || "Proof item"}
                    </p>
                    {Array.isArray(item?.examples) && item.examples.length > 0 && (
                      <p className="mt-2 text-xs text-white/60">
                        Examples: {item.examples.join(", ")}
                      </p>
                    )}
                  </>
                  ),
                  `${settlementKey}-proof`
                )}
              </div>
              {hasSubmitted &&
                eligibilityStatus === "Qualifies" &&
                claimFormUrl && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-white/40">
                    Claim form
                  </p>
                  <div className="mt-2 text-sm text-white">
                    {canLinkClaimFormUrl ? (
                      <a
                        className="break-all underline decoration-white/30 underline-offset-4 hover:decoration-white"
                        href={claimFormUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {claimFormUrl}
                      </a>
                    ) : (
                      <span className="break-all text-white/70">
                        {claimFormUrl}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="mx-auto w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-5 text-center">
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Submit answers
                </p>
                <div className="mt-3 flex flex-col items-center gap-2 text-sm text-white">
                  <Button
                    size="lg"
                    className="min-w-[200px]"
                    onClick={handleSubmitAnswers}
                    disabled={submitStatus === "loading"}
                  >
                    {submitStatus === "loading"
                      ? "Submitting..."
                      : hasSubmitted
                        ? "Submitted"
                        : "Submit"}
                  </Button>
                  {hasSubmitted && submitStatus === "success" && (
                    <span className="text-white/70">Answers saved.</span>
                  )}
                </div>
                {submitError && (
                  <p className="mt-2 text-sm text-red-300">{submitError}</p>
                )}
              </div>

              {/* Apply to Claim Section */}
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Apply for this claim
                </p>
                {eligibilityStatus === "Qualifies" ? (
                  <div className="mt-3 space-y-3">
                    {extensionStatus === "not_installed" && (
                      <p className="text-sm text-amber-400">
                        Install the Claimi browser extension to autofill claim forms.
                      </p>
                    )}
                    {applyStatus === "success" && (
                      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                        <p className="text-sm text-green-400">
                          Claim packet sent to extension! Navigate to the claim form
                          and click the Claimi extension to autofill.
                        </p>
                      </div>
                    )}
                    {applyStatus === "error" && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                        <p className="text-sm text-red-400">
                          {applyError || "Failed to send claim packet to extension"}
                        </p>
                      </div>
                    )}
                    <Button
                      onClick={handleApplyToClaim}
                      disabled={applyStatus === "sending"}
                      className="w-full"
                    >
                      {applyStatus === "sending"
                        ? "Sending to extension..."
                        : applyStatus === "success"
                        ? "Send again"
                        : "Prepare claim for autofill"}
                    </Button>
                    {applyStatus === "success" && (
                      <p className="text-xs text-white/50 text-center">
                        Open the claim form URL in a new tab, then click the Claimi
                        extension icon and press Autofill.
                      </p>
                    )}
                  </div>
                ) : eligibilityStatus === "Does not qualify" ? (
                  <p className="mt-3 text-sm text-red-400">
                    Based on your answers, you may not be eligible for this
                    settlement.
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-white/70">
                    Please answer all eligibility questions above to check if you
                    qualify.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
