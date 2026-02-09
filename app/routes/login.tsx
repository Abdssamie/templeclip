import React, { useState } from "react";
import { auth } from "~/lib/auth.server";
import { useAuth } from "~/hooks/useAuth";
import { KimuLogo } from "~/components/ui/KimuLogo";
import { Clapperboard, Wand2, Scissors, Mail, Lock, User } from "lucide-react";
import { FaGoogle } from "react-icons/fa";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";

export async function loader({ request }: { request: Request }) {
  // If already authenticated, redirect to projects
  try {
    const session = await auth.api?.getSession?.({ headers: request.headers });
    const uid: string | undefined = session?.user?.id || session?.session?.userId;
    if (uid)
      return new Response(null, {
        status: 302,
        headers: { Location: "/projects" },
      });
  } catch {
    console.error("Login failed");
  }
  return null;
}

export default function LoginPage() {
  const { isSigningIn, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && !name) {
      setError("Name is required for sign up");
      return;
    }

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    let result;
    if (mode === "signin") {
      result = await signInWithEmail(email, password);
    } else {
      result = await signUpWithEmail(email, password, name);
    }

    if (result?.error) {
      setError(result.error.message || "Authentication failed");
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Animated timeline grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.08]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 72px)",
          backgroundSize: "auto",
        }}
      />

      {/* Accent radial glows (multi-hue) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 -top-24 h-[48vw] w-[48vw] rounded-full blur-3xl mix-blend-screen bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.28),transparent_65%)]" />
        <div className="absolute -right-24 top-[-10%] h-[40vw] w-[40vw] rounded-full blur-3xl mix-blend-screen bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.20),transparent_65%)]" />
        <div className="absolute -left-20 bottom-[-10%] h-[38vw] w-[38vw] rounded-full blur-3xl mix-blend-screen bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.18),transparent_65%)]" />
        <div className="absolute -right-36 bottom-[-12%] h-[46vw] w-[46vw] rounded-full blur-3xl mix-blend-screen bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.20),transparent_65%)]" />
      </div>

      {/* Sweeping playhead */}
      <div className="absolute inset-y-0 -z-10" style={{ animation: "sweep 14s linear infinite" }}>
        <div className="absolute top-0 bottom-0 w-px bg-primary/70" />
        <div className="absolute top-0 bottom-0 w-[3px] translate-x-[-1px] bg-primary/30 blur-[1px]" />
      </div>

      {/* Floating editor artifacts */}
      <Clapperboard
        aria-hidden
        className="absolute left-10 top-16 h-6 w-6 text-primary/30 animate-[float_8s_ease-in-out_infinite]"
      />
      <Wand2
        aria-hidden
        className="absolute right-12 top-24 h-5 w-5 text-primary/30 animate-[float_9s_ease-in-out_infinite] [animation-delay:2s]"
      />
      <Scissors
        aria-hidden
        className="absolute left-1/2 bottom-16 h-5 w-5 text-primary/30 animate-[float_10s_ease-in-out_infinite] [animation-delay:1s]"
      />

      {/* Centerpiece orb & Login Form */}
      <main className="relative grid place-items-center px-4 min-h-screen">
        <div className="relative flex flex-col items-center w-full max-w-md p-8 rounded-3xl border border-border/40 bg-background/25 backdrop-blur-2xl">
          {/* Kimu Logo Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative h-20 w-20 mb-4 rounded-full border border-white/10 flex items-center justify-center bg-black/20">
              <KimuLogo className="h-10 w-10" />
              {/* Subtle spin effect on hover/active */}
              <div className="absolute inset-0 rounded-full border border-white/5 animate-[spin_10s_linear_infinite] opacity-50 pointer-events-none" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Welcome back" : "Create an account"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              {mode === "signin"
                ? "Enter your credentials to access your projects"
                : "Join Kimu to start creating cinematic videos"}
            </p>
          </div>

          {/* Auth Form */}
          <div className="w-full space-y-4">
            <Button
              type="button"
              variant="outline"
              onClick={signInWithGoogle}
              disabled={isSigningIn}
              className="w-full h-11 relative overflow-hidden bg-white/5 hover:bg-white/10 border-white/10 transition-all">
              <FaGoogle className="mr-2 h-4 w-4" />
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background/0 px-2 text-muted-foreground backdrop-blur-xl">Or continue with</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      placeholder="Your Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-9 bg-white/5 border-white/10 focus-visible:ring-primary/50"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="hello@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 bg-white/5 border-white/10 focus-visible:ring-primary/50"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 bg-white/5 border-white/10 focus-visible:ring-primary/50"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-500 text-center bg-red-500/10 p-2 rounded-md border border-red-500/20">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isSigningIn}
                className="w-full h-11 bg-foreground text-background hover:bg-foreground/90 transition-all font-medium">
                {isSigningIn ? (
                  <>
                    <svg className="h-4 w-4 animate-spin mr-2" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25" />
                      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none" />
                    </svg>
                    {mode === "signin" ? "Signing in..." : "Creating account..."}
                  </>
                ) : mode === "signin" ? (
                  "Sign In"
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>

            <div className="text-center text-sm text-muted-foreground mt-4">
              {mode === "signin" ? (
                <>
                  Don't have an account?{" "}
                  <button onClick={() => setMode("signup")} className="text-primary hover:underline font-medium">
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button onClick={() => setMode("signin")} className="text-primary hover:underline font-medium">
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Local keyframes and bokeh */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-radial-gradient(circle at 20% 30%, rgba(255,255,255,0.5) 0 1px, transparent 2px 28px), repeating-radial-gradient(circle at 80% 60%, rgba(255,255,255,0.5) 0 1px, transparent 2px 36px)",
        }}
      />
      <style>{`
        @keyframes sweep { 0% { left: -10%; } 100% { left: 110%; } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
        @keyframes pulse { 0%, 100% { opacity: .55; transform: scale(0.98); } 50% { opacity: .85; transform: scale(1.03); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
