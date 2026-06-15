import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

// Import pages
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

import Layout from "./components/layout";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(210 57% 24%)",
    colorForeground: "hsl(210 57% 15%)",
    colorMutedForeground: "hsl(215 16% 47%)",
    colorDanger: "hsl(0 66% 47%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(214 32% 91%)",
    colorInputForeground: "hsl(210 57% 15%)",
    colorNeutral: "hsl(214 32% 91%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-gray-100",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold text-[#1A3C5E]",
    headerSubtitle: "text-gray-500",
    socialButtonsBlockButtonText: "text-[#1A3C5E] font-medium",
    formFieldLabel: "text-sm font-medium text-[#1A3C5E]",
    footerActionLink: "text-[#2196F3] hover:underline",
    footerActionText: "text-gray-500",
    dividerText: "text-gray-400 text-sm",
    identityPreviewEditButton: "text-[#2196F3] hover:underline",
    formFieldSuccessText: "text-[#2E7D32] text-sm",
    alertText: "text-[#C62828] text-sm",
    logoBox: "flex items-center justify-center h-12 w-full mb-4",
    logoImage: "h-8 object-contain",
    socialButtonsBlockButton: "border border-gray-200 hover:bg-gray-50",
    formButtonPrimary: "bg-[#1A3C5E] hover:bg-[#122A42] text-white",
    formFieldInput: "border border-gray-200 focus:border-[#1A3C5E] focus:ring-1 focus:ring-[#1A3C5E] rounded-md",
    footerAction: "mt-6",
    dividerLine: "bg-gray-200",
    alert: "bg-red-50 border border-red-200 rounded-md p-3",
    otpCodeFieldInput: "border border-gray-300 focus:border-[#1A3C5E]",
    formFieldRow: "mb-4",
    main: "w-full",
  },
};

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Component />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A3C5E] px-4 bg-[url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-[#1A3C5E]/90 backdrop-blur-sm mix-blend-multiply"></div>
      <div className="relative z-10">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A3C5E] px-4 bg-[url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-[#1A3C5E]/90 backdrop-blur-sm mix-blend-multiply"></div>
      <div className="relative z-10">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back to LoadBoard Pro",
            subtitle: "Sign in to access the cockpit",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
          <Route path="/loads"><ProtectedRoute component={LoadsList} /></Route>
          <Route path="/loads/:id"><ProtectedRoute component={LoadDetail} /></Route>
          <Route path="/weekly"><ProtectedRoute component={WeeklyView} /></Route>
          <Route path="/drivers"><ProtectedRoute component={DriversList} /></Route>
          <Route path="/drivers/:id"><ProtectedRoute component={DriverDetail} /></Route>
          <Route path="/accounting"><ProtectedRoute component={Accounting} /></Route>
          <Route path="/notifications"><ProtectedRoute component={Notifications} /></Route>
          <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
          <Route path="/admin"><ProtectedRoute component={AdminPanel} /></Route>
          <Route><Layout><NotFound /></Layout></Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
