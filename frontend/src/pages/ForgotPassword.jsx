import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../lib/api";
import { useToast } from "../hooks/use-toast";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
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
          <p className="text-sm text-muted-foreground mt-2">Reset your password</p>
        </div>

        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="pt-6 pb-6">
            {sent ? (
              <div className="text-center space-y-4">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto animate-bounce-once" />
                <h3 className="font-semibold text-foreground">Check your email</h3>
                <p className="text-sm text-muted-foreground">
                  If an account exists for <span className="font-semibold text-foreground">{email}</span>, we've sent a password reset link.
                </p>
                <Link
                  to="/login"
                  className="w-full inline-flex items-center justify-center h-10 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/95 active:scale-[0.99] transition-all"
                >
                  Back to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoFocus
                    className="h-9.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/95 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-primary/25 hover:shadow-primary/45"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Sending Link...
                    </>
                  ) : (
                    "Send Reset Link"
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
