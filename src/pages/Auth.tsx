import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link, useNavigate } from "react-router-dom";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = isSignUp ? "Sign up | Strategy Portal" : "Log in | Strategy Portal";

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Sync state only, do not call Supabase here
      if (session) {
        // On any successful auth event, go home
        navigate("/", { replace: true });
      }
    });

    // Initialize session after listener is set
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });

    return () => subscription.unsubscribe();
  }, [isSignUp, navigate]);

  const handleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Welcome back", description: "You are now signed in" });
  };

  const handleSignUp = async () => {
    setLoading(true);
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Account created", description: "You can now sign in" });
    setIsSignUp(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-6 space-y-4 bg-gradient-card border-border">
        <header>
          <h1 className="text-2xl font-bold">{isSignUp ? "Create account" : "Sign in"}</h1>
          <p className="text-sm text-muted-foreground">
            Access strategy backtests and analytics
          </p>
        </header>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button
            className="w-full"
            onClick={isSignUp ? handleSignUp : handleSignIn}
            disabled={loading}
          >
            {loading ? "Please wait..." : isSignUp ? "Sign up" : "Sign in"}
          </Button>
          <div className="text-sm text-muted-foreground text-center">
            {isSignUp ? (
              <span>
                Already have an account?{" "}
                <button className="underline" onClick={() => setIsSignUp(false)}>Sign in</button>
              </span>
            ) : (
              <span>
                No account?{" "}
                <button className="underline" onClick={() => setIsSignUp(true)}>Create one</button>
              </span>
            )}
          </div>
        </div>

        <footer className="text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">Back to dashboard</Link>
        </footer>
      </Card>
    </main>
  );
};

export default Auth;
