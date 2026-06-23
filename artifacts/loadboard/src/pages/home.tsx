import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, ShieldCheck, ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LoadBoardProLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function Home() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#1A3C5E]/90 backdrop-blur-md shadow-sm shadow-black/10">
        <div className="max-w-7xl mx-auto flex h-16 md:h-[4.25rem] items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
            <LoadBoardProLogo onDarkPanel className="h-11 md:h-12 w-auto max-w-[min(280px,42vw)]" />
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-1.5 rounded-full border border-white/15 bg-white/5 px-1.5 py-1 sm:px-2">
              <ThemeToggle onDarkPanel />
              <span className="hidden sm:block h-4 w-px bg-white/15" aria-hidden />
              <LanguageSwitcher onDarkPanel />
            </div>

            <span className="hidden sm:block h-6 w-px bg-white/15" aria-hidden />

            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link href="/sign-in">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-3 sm:px-4 text-blue-100 hover:text-white hover:bg-white/10 font-medium"
                >
                  {t("home.signIn")}
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="text-white pt-20 pb-32 px-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('/orqafon.png')] bg-cover bg-center" aria-hidden />
          <div className="absolute inset-0 bg-primary/55" aria-hidden />
          <div className="max-w-7xl mx-auto text-center relative z-10">
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
              {t("home.heroTitle")}
            </h1>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-10 leading-relaxed">
              {t("home.heroSubtitle")}
            </p>
            <div className="flex justify-center">
              <Link href="/sign-in">
                <Button size="lg" className="bg-accent hover:bg-accent/90 text-white text-lg px-8 py-6 h-auto w-full sm:w-auto font-semibold">
                  {t("home.heroCta")} <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-24 px-4 bg-card">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">{t("home.featuresTitle")}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-lg">{t("home.featuresSubtitle")}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-10">
              <div className="p-8 rounded-2xl bg-background border border-border hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 bg-blue-100 text-accent rounded-xl flex items-center justify-center mb-6">
                  <BarChart3 size={28} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{t("home.liveDispatchTitle")}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t("home.liveDispatchBody")}
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-background border border-border hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 bg-green-100 text-[#2E7D32] rounded-xl flex items-center justify-center mb-6">
                  <TrendingUp size={28} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{t("home.accountingTitle")}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t("home.accountingBody")}
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-background border border-border hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 bg-amber-100 text-[#E65100] rounded-xl flex items-center justify-center mb-6">
                  <ShieldCheck size={28} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{t("home.driverMgmtTitle")}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t("home.driverMgmtBody")}
                </p>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="bg-muted/50 border-t border-border py-8 px-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center mb-4 md:mb-0">
            <LoadBoardProLogo className="h-10 md:h-11 w-auto max-w-[280px]" />
          </div>
          <p>{t("home.copyright", { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </div>
  );
}
