import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { resetPassword } from "../lib/api";
import { useToast } from "../hooks/use-toast";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CheckCircle2, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
      toast({ title: "Password reset", description: "Your password has been changed." });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-radial-gradient(900px_circle_at_50%_40%,rgba(59,130,246,0.15),transparent_60%) bg-slate-50 dark:bg-slate-950/20 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="size-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shadow-sm">
              <ShieldCheck className="size-5 text-blue-400" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">ReguLens</span>
          </Link>
          <p className="text-sm text-muted-foreground mt-2">Choose a new password</p>
        </div>

        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="pt-6 pb-6">
            {!token ? (
              <div className="text-center space-y-4">
                <p className="font-semibold text-foreground">Invalid Reset Link</p>
                <p className="text-sm text-muted-foreground">
                  This reset link is missing a token. Please request a new link.
                </p>
                <Link
                  to="/forgot-password"
                  className="w-full inline-flex items-center justify-center h-10 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/95 active:scale-[0.99] transition-all"
                >
                  Request Reset Link
                </Link>
              </div>
            ) : done ? (
              <div className="text-center space-y-4">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto animate-bounce-once" />
                <h3 className="font-semibold text-foreground">Password reset successfully!</h3>
                <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
                <button
                  onClick={() => navigate("/login")}
                  className="w-full inline-flex items-center justify-center h-10 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/95 active:scale-[0.99] transition-all cursor-pointer"
                >
                  Sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      autoFocus
                      className="h-9.5 text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/95 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-primary/25 hover:shadow-primary/45"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Resetting...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>
                <p className="text-center text-xs text-muted-foreground pt-1">
                  <Link to="/login" className="text-primary font-semibold hover:underline">
                    Back to Sign In
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
