"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import GoogleLogo from "@/components/GoogleLogo";
import { Badge } from "@/components/ui/badge";
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

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const handleGoogle = async () => {
    setError("");
    setStatus("loading");
    const redirectUrl = new URL("/auth/callback", window.location.origin);
    redirectUrl.searchParams.set("next", "/dashboard");
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl.toString(),
      },
    });
    if (authError) {
      setError(authError.message);
      setStatus("idle");
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("loading");
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (authError) {
      setError(authError.message);
      setStatus("idle");
      return;
    }
    const identities = data?.user?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });
      if (signInError) {
        setError("Account already exists. Please log in instead.");
        setStatus("idle");
        return;
      }
      const user = signInData?.user;
      if (!user) {
        setError("Unable to load your account. Please try again.");
        setStatus("idle");
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,onboarded")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        setError("Unable to load your profile. Please try again.");
        setStatus("idle");
        return;
      }
      if (!profileError && (!profile || !profile.onboarded)) {
        router.push("/onboarding");
        return;
      }
      router.push("/dashboard");
      return;
    }
    router.push("/onboarding");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0B0F1A] text-[#E5E7EB]">
      <div className="pointer-events-none absolute left-1/2 top-[-140px] h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-[#2563EB]/20 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-[-160px] right-[-160px] h-[420px] w-[420px] rounded-full bg-[#1D4ED8]/20 blur-[160px]" />
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
        <div className="grid w-full gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="hidden lg:flex flex-col gap-6">
            <div className="text-5xl font-semibold tracking-tight text-white">
              Claimi
            </div>
            <Badge className="w-fit">Join in minutes</Badge>
            <h1 className="text-4xl font-semibold leading-tight text-white">
              Create your account and start claiming.
            </h1>
            <p className="text-base text-[#9CA3AF]">
              One profile unlocks eligible settlements and guided submissions.
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-white/50">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                No legal advice
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                You control submissions
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6">
            <div className="text-5xl font-semibold tracking-tight text-white lg:hidden">
              Claimi
            </div>
            <Card className="w-full max-w-md border-white/10 bg-[#0E1424]/90">
              <CardHeader>
                <CardTitle>Create your account</CardTitle>
                <CardDescription>Join Claimi to start claiming.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Button
                  className="w-full border border-slate-200 bg-white text-black hover:bg-slate-100"
                  onClick={handleGoogle}
                  disabled={status === "loading"}
                >
                  <span className="flex items-center gap-2">
                    <GoogleLogo className="h-4 w-4" />
                    Continue with Google
                  </span>
                </Button>
                <div className="text-center text-xs text-[#9CA3AF]">
                  or continue with email
                </div>
                <form className="space-y-4" onSubmit={handleSignup}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@company.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-red-300">{error}</p>}
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={status === "loading"}
                  >
                    Create account
                  </Button>
                </form>
              </CardContent>
              <CardFooter className="justify-center">
                <div className="flex flex-col items-center gap-2">
                  <button
                    className="text-sm text-[#9CA3AF] hover:text-white"
                    onClick={() => router.push("/login")}
                  >
                    Already have an account? Log in
                  </button>
                  <button
                    className="text-sm text-[#9CA3AF] hover:text-white"
                    onClick={() => router.push("/")}
                  >
                    Back to landing
                  </button>
                </div>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
