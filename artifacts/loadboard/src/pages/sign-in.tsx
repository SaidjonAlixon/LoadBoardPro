import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadBoardProLogo } from "@/components/brand-logo";

export default function SignInPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qEmail = params.get("email");
    const qPassword = params.get("password");
    if (!qEmail || !qPassword) return;

    setEmail(qEmail);
    setPassword(qPassword);
    setLoading(true);
    login(qEmail, qPassword)
      .then(() => setLocation("/dashboard"))
      .catch((err) => setError(err instanceof Error ? err.message : t("auth.loginFailed")))
      .finally(() => setLoading(false));
  }, [login, setLocation, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      setLocation("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[url('/fonorqa2.png')] bg-cover bg-center" aria-hidden />
      <div className="absolute inset-0 bg-primary/60 backdrop-blur-[2px]" aria-hidden />
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-card p-8 shadow-xl">
        <div className="mb-6 text-center">
          <LoadBoardProLogo className="mx-auto mb-4 w-full max-w-[300px] h-12" />
          <h1 className="text-2xl font-bold text-foreground">{t("auth.welcomeBack")}</h1>
          <p className="text-sm text-muted-foreground">{t("auth.signInSubtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                required
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-white"
            disabled={loading}
          >
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t("auth.adminOnlySignup")}
        </p>
      </div>
    </div>
  );
}
