import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { resetPassword } from "../lib/api";
import { useToast } from "../hooks/use-toast";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [newPassword, setNewPassword] = useState("");
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

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 pb-6 text-center space-y-4">
            <p className="font-medium text-foreground">Invalid reset link</p>
            <p className="text-sm text-muted-foreground">This link is missing the reset token. Please request a new password reset.</p>
            <Link to="/forgot-password" className="inline-flex items-center justify-center h-10 px-6 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition">
              Request Reset
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 pb-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <p className="font-medium text-foreground">Password reset successfully!</p>
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center justify-center h-10 px-6 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition"
            >
              Sign in
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
            <span className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">A</span>
            ReguLens
          </Link>
          <p className="text-muted-foreground mt-2">Choose a new password</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
              </div>
              <button type="submit" disabled={submitting}
                className="w-full h-10 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting...</> : "Reset Password"}
              </button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="text-primary hover:underline">Back to sign in</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
