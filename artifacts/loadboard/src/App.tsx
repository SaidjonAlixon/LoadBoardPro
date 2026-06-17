import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/auth";
import { I18nProvider } from "./lib/i18n";

import Home from "./pages/home";
import Dashboard from "./pages/dashboard";
import LoadsList from "./pages/loads";
import LoadDetail from "./pages/load-detail";
import WeeklyView from "./pages/weekly";
import DriversList from "./pages/drivers";
import DriverDetail from "./pages/driver-detail";
import Accounting from "./pages/accounting";
import Notifications from "./pages/notifications";
import Settings from "./pages/settings";
import AdminPanel from "./pages/admin";
import NotFound from "./pages/not-found";
import SignInPage from "./pages/sign-in";

import Layout from "./components/layout";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
      Loading…
    </div>
  );
}

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <AppLoading />;
  if (user) return <Redirect to="/dashboard" />;
  return <Home />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <AppLoading />;
  if (!user) return <Redirect to="/sign-in" />;
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function AccountingRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <AppLoading />;
  if (!user) return <Redirect to="/sign-in" />;
  if (user.role !== "admin" && user.role !== "accounting") {
    return <Redirect to="/dashboard" />;
  }
  return (
    <Layout>
      <Accounting />
    </Layout>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up"><Redirect to="/sign-in" /></Route>
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/loads"><ProtectedRoute component={LoadsList} /></Route>
      <Route path="/loads/:id"><ProtectedRoute component={LoadDetail} /></Route>
      <Route path="/weekly"><ProtectedRoute component={WeeklyView} /></Route>
      <Route path="/drivers"><ProtectedRoute component={DriversList} /></Route>
      <Route path="/drivers/:id"><ProtectedRoute component={DriverDetail} /></Route>
      <Route path="/accounting" component={AccountingRoute} />
      <Route path="/notifications"><ProtectedRoute component={Notifications} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
      <Route path="/admin"><ProtectedRoute component={AdminPanel} /></Route>
      <Route>
        <Layout><NotFound /></Layout>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="loadboard-theme">
      <I18nProvider>
        <WouterRouter base={basePath}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <AppRoutes />
              <Toaster position="top-right" richColors />
            </AuthProvider>
          </QueryClientProvider>
        </WouterRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}
