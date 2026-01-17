"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialForm = {
  legal_first_name: "",
  legal_last_name: "",
  email: "",
  phone_number: "",
  city: "",
  state: "",
  zip_code: "",
  country: "",
  date_of_birth: "",
  employment_status: "",
  employment_type: "",
  occupation_category: "",
  preferred_contact_method: "",
  payout_preference: "",
  terms_accepted: false,
  privacy_policy_accepted: false,
  ethnicity: "",
  gender_identity: "",
  disability_status: "",
};

const selectClassName =
  "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950";

const toText = (value) => (value == null ? "" : String(value));
const toNull = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) {
        setError("Unable to load your account. Please try again.");
        setLoading(false);
        return;
      }
      if (!user) {
        router.push("/login");
        return;
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select(
          [
            "legal_first_name",
            "legal_last_name",
            "email",
            "phone_number",
            "city",
            "state",
            "zip_code",
            "country",
            "date_of_birth",
            "employment_status",
            "employment_type",
            "occupation_category",
            "preferred_contact_method",
            "payout_preference",
            "terms_accepted",
            "privacy_policy_accepted",
            "ethnicity",
            "gender_identity",
            "disability_status",
            "onboarded",
          ].join(",")
        )
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        setError("Unable to load your profile. Please try again.");
        setLoading(false);
        return;
      }

      if (data?.onboarded) {
        router.push("/dashboard");
        return;
      }

      setForm((prev) => ({
        ...prev,
        legal_first_name: toText(data?.legal_first_name),
        legal_last_name: toText(data?.legal_last_name),
        email: toText(data?.email || user.email),
        phone_number: toText(data?.phone_number),
        city: toText(data?.city),
        state: toText(data?.state),
        zip_code: toText(data?.zip_code),
        country: toText(data?.country),
        date_of_birth: toText(data?.date_of_birth),
        employment_status: toText(data?.employment_status),
        employment_type: toText(data?.employment_type),
        occupation_category: toText(data?.occupation_category),
        preferred_contact_method: toText(data?.preferred_contact_method),
        payout_preference: toText(data?.payout_preference),
        terms_accepted: Boolean(data?.terms_accepted),
        privacy_policy_accepted: Boolean(data?.privacy_policy_accepted),
        ethnicity: toText(data?.ethnicity),
        gender_identity: toText(data?.gender_identity),
        disability_status: toText(data?.disability_status),
      }));
      setLoading(false);
    };
    load();
  }, [router]);

  const updateField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const updateCheckbox = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.checked }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    if (!form.date_of_birth) {
      setError("Please enter your date of birth.");
      setLoading(false);
      return;
    }
    if (!form.terms_accepted || !form.privacy_policy_accepted) {
      setError("Please accept the terms and privacy policy.");
      setLoading(false);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) {
      setError("Unable to load your account. Please try again.");
      setLoading(false);
      return;
    }
    if (!user) {
      router.push("/login");
      return;
    }

    const { error: upsertError } = await supabase.from("profiles").upsert({
      id: user.id,
      legal_first_name: toNull(form.legal_first_name),
      legal_last_name: toNull(form.legal_last_name),
      email: toNull(form.email),
      phone_number: toNull(form.phone_number),
      city: toNull(form.city),
      state: toNull(form.state),
      zip_code: toNull(form.zip_code),
      country: toNull(form.country),
      date_of_birth: toNull(form.date_of_birth),
      employment_status: toNull(form.employment_status),
      employment_type: toNull(form.employment_type),
      occupation_category: toNull(form.occupation_category),
      preferred_contact_method: toNull(form.preferred_contact_method),
      payout_preference: toNull(form.payout_preference),
      terms_accepted: form.terms_accepted,
      privacy_policy_accepted: form.privacy_policy_accepted,
      ethnicity: toNull(form.ethnicity),
      gender_identity: toNull(form.gender_identity),
      disability_status: toNull(form.disability_status),
      onboarded: true,
    });

    if (upsertError) {
      setError(upsertError.message);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[#9CA3AF]">
        Preparing your profile...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Complete your profile</CardTitle>
          <CardDescription>
            Add basic details so we can personalize your claims.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-8" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="legalFirstName">Legal first name</Label>
                  <Input
                    id="legalFirstName"
                    autoComplete="given-name"
                    value={form.legal_first_name}
                    onChange={updateField("legal_first_name")}
                    placeholder="Jordan"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="legalLastName">Legal last name</Label>
                  <Input
                    id="legalLastName"
                    autoComplete="family-name"
                    value={form.legal_last_name}
                    onChange={updateField("legal_last_name")}
                    placeholder="Lee"
                    required
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={updateField("email")}
                    placeholder="you@company.com"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone_number}
                  onChange={updateField("phone_number")}
                  placeholder="(555) 555-5555"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Location</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    autoComplete="address-level2"
                    value={form.city}
                    onChange={updateField("city")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    autoComplete="address-level1"
                    value={form.state}
                    onChange={updateField("state")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">Zip code</Label>
                  <Input
                    id="zip"
                    autoComplete="postal-code"
                    value={form.zip_code}
                    onChange={updateField("zip_code")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    autoComplete="country-name"
                    value={form.country}
                    onChange={updateField("country")}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Age and eligibility</h3>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={form.date_of_birth}
                  onChange={updateField("date_of_birth")}
                  required
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Employment</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="employmentStatus">Employment status</Label>
                  <select
                    id="employmentStatus"
                    className={selectClassName}
                    value={form.employment_status}
                    onChange={updateField("employment_status")}
                    required
                  >
                    <option value="" disabled>
                      Select
                    </option>
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
                    value={form.employment_type}
                    onChange={updateField("employment_type")}
                    required
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    <option value="full_time">Full time</option>
                    <option value="part_time">Part time</option>
                    <option value="contractor">Contractor</option>
                    <option value="self_employed">Self employed</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="occupationCategory">Occupation category</Label>
                  <select
                    id="occupationCategory"
                    className={selectClassName}
                    value={form.occupation_category}
                    onChange={updateField("occupation_category")}
                    required
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    <option value="tech">Tech</option>
                    <option value="retail">Retail</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="education">Education</option>
                    <option value="transportation">Transportation</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Preferences</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="preferredContact">
                    Preferred contact method
                  </Label>
                  <select
                    id="preferredContact"
                    className={selectClassName}
                    value={form.preferred_contact_method}
                    onChange={updateField("preferred_contact_method")}
                    required
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payoutPreference">
                    Payout preference (optional)
                  </Label>
                  <Input
                    id="payoutPreference"
                    value={form.payout_preference}
                    onChange={updateField("payout_preference")}
                    placeholder="e.g. Check or ACH"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Compliance</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <input
                    id="termsAccepted"
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-950"
                    checked={form.terms_accepted}
                    onChange={updateCheckbox("terms_accepted")}
                    required
                  />
                  <Label htmlFor="termsAccepted">I accept the terms of use</Label>
                </div>
                <div className="flex items-start gap-2">
                  <input
                    id="privacyAccepted"
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-950"
                    checked={form.privacy_policy_accepted}
                    onChange={updateCheckbox("privacy_policy_accepted")}
                    required
                  />
                  <Label htmlFor="privacyAccepted">
                    I accept the privacy policy
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">
                  Optional or sensitive (not required)
                </h3>
                <p className="text-xs text-[#9CA3AF]">
                  You can leave these blank.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="ethnicity">Ethnicity (optional)</Label>
                  <Input
                    id="ethnicity"
                    value={form.ethnicity}
                    onChange={updateField("ethnicity")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genderIdentity">
                    Gender identity (optional)
                  </Label>
                  <Input
                    id="genderIdentity"
                    value={form.gender_identity}
                    onChange={updateField("gender_identity")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="disabilityStatus">
                    Disability status (optional)
                  </Label>
                  <Input
                    id="disabilityStatus"
                    value={form.disability_status}
                    onChange={updateField("disability_status")}
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-red-300">{error}</p>}
            <Button className="w-full" type="submit" disabled={loading}>
              Save and continue
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <button
            className="text-sm text-[#9CA3AF] hover:text-white"
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
          >
            Sign out
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}
