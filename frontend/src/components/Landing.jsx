"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
import { Separator } from "@/components/ui/separator";

export default function Landing() {
  const [healthStatus, setHealthStatus] = useState("loading");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5171";
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${apiUrl}/health`);
        const data = await res.json();
        setHealthStatus(data?.ok ? "ok" : "error");
      } catch {
        setHealthStatus("error");
      }
    };
    check();
  }, [apiUrl]);

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-[#E5E7EB]">
      <header className="border-b border-white/10 bg-[#0E1424]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="text-lg font-semibold tracking-wide text-white">
            Claimi
          </div>
        </div>
      </header>

      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-[-120px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#2563EB]/20 blur-[140px]" />

        <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-6">
            <Badge className="bg-white/5 text-white/80">
              Not a law firm • No legal advice • You control submissions
            </Badge>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
                Find money you're owed. Claim it in minutes.
              </h1>
              <p className="text-base text-[#9CA3AF] md:text-lg">
                Claimi finds settlements you may qualify for and guides you
                step-by-step to submit claims.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => router.push("/signup")}>
                Continue with Google
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => router.push("/signup")}
              >
                Sign up with email
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Start in under 2 minutes</CardTitle>
              <CardDescription>
                Tell us a bit about you and we'll surface settlements that
                match your profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-24 rounded-xl border border-white/10 bg-white/5" />
              <div className="h-6 w-3/4 rounded-lg border border-white/10 bg-white/5" />
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => router.push("/signup")}>
                Get started
              </Button>
              <Button variant="outline" size="lg" onClick={() => router.push("/")}>
                Learn more
              </Button>
            </CardFooter>
          </Card>
        </section>

        <Separator />

        <section className="mx-auto max-w-6xl px-6 py-12">
          <div className="space-y-6 text-center">
            <h2 className="text-2xl font-semibold text-white">How it works</h2>
            <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
              <Card className="bg-[#0E1424]">
                <CardHeader className="space-y-2 text-center pt-4 pb-8">
                  <CardTitle className="text-lg">Create profile</CardTitle>
                  <CardDescription>
                    Add basic details once to match you to settlements.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="bg-[#0E1424]">
                <CardHeader className="space-y-2 text-center pt-4 pb-8">
                  <CardTitle className="text-lg">
                    See eligible settlements
                  </CardTitle>
                  <CardDescription>
                    View clear requirements and estimated payout ranges.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="bg-[#0E1424]">
                <CardHeader className="space-y-2 text-center pt-4 pb-8">
                  <CardTitle className="text-lg">
                    Submit and track claims
                  </CardTitle>
                  <CardDescription>
                    We guide you step-by-step and keep your status updated.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>

        <Separator />

        <section className="mx-auto grid max-w-6xl gap-8 px-6 py-16 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-white">
              Built for transparency and control
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0E1424] px-4 py-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#2563EB]" />
                <span className="text-sm text-[#E5E7EB]">
                  Transparent eligibility and deadlines for each claim
                </span>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0E1424] px-4 py-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#2563EB]" />
                <span className="text-sm text-[#E5E7EB]">
                  Secure storage for your documents and submissions
                </span>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0E1424] px-4 py-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#2563EB]" />
                <span className="text-sm text-[#E5E7EB]">
                  No spam. You choose what to file and when
                </span>
              </div>
            </div>
          </div>

          <Card className="bg-[#0E1424]">
            <CardContent className="space-y-3 p-6 text-sm text-[#9CA3AF]">
              <p>
                Claimi is not a law firm and does not provide legal advice. We
                provide informational tools to help you complete claims you
                choose to submit.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#0E1424]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-[#9CA3AF]">
          <div className="flex gap-6">
            <a href="#privacy" className="hover:text-white">
              Privacy
            </a>
            <a href="#terms" className="hover:text-white">
              Terms
            </a>
            <a href="#contact" className="hover:text-white">
              Contact
            </a>
          </div>
          <div aria-live="polite">
            {healthStatus === "loading" && "Checking Supabase..."}
            {healthStatus === "ok" && "Supabase connected"}
            {healthStatus === "error" && "Supabase not connected"}
          </div>
        </div>
      </footer>
    </div>
  );
}
