import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/use-toast";
// eslint-disable-next-line no-unused-vars
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const prev = location.state?.from;
  const from = prev ? prev.pathname + prev.search : "/compliance";

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast({ title: "Welcome back!", description: "Signed in successfully." });
      navigate(from, { replace: true });
    } catch (err) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
            <span className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">A</span>
            ReguLens
          </Link>
          <p className="text-muted-foreground mt-2">Sign in to your compliance dashboard</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@regulens.ai" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
                <div className="text-right">
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-10 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : "Sign in"}
              </button>

              <p className="text-xs text-muted-foreground text-center">
                New to ReguLens?{" "}
                <Link to="/signup" className="text-primary hover:underline">Create an account</Link>
              </p>
              <p className="text-xs text-muted-foreground text-center">Default: admin@regulens.ai / admin123</p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
