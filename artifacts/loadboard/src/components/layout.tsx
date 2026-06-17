import React, { useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useI18n, translateRole } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LayoutDashboard,
  Truck,
  CalendarDays,
  Users,
  Calculator,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { useListNotifications, useGetMe } from "@workspace/api-client-react";
import { UserAvatar } from "@/components/user-avatar";
import { LoadBoardProLogo } from "./brand-logo";

interface LayoutProps {
  children: React.ReactNode;
}

type NavItem = {
  labelKey: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
};

export default function Layout({ children }: LayoutProps) {
  const { t } = useI18n();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const { data: notifications } = useListNotifications({ unreadOnly: true });
  const unreadCount = notifications?.length || 0;

  const { data: me } = useGetMe({});
  const isAdmin = me?.role === "admin";

  const displayName = me?.name || user?.name || user?.email || t("common.user");
  const userRole = me?.role || user?.role || "dispatcher";

  const showAccounting = userRole === "admin" || userRole === "accounting";

  const baseNavItems: NavItem[] = [
    { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
    { labelKey: "nav.loads", href: "/loads", icon: Truck },
    { labelKey: "nav.weeklyView", href: "/weekly", icon: CalendarDays },
    { labelKey: "nav.drivers", href: "/drivers", icon: Users },
    ...(showAccounting
      ? [{ labelKey: "nav.accounting", href: "/accounting", icon: Calculator }]
      : []),
    { labelKey: "nav.notifications", href: "/notifications", icon: Bell, badge: unreadCount },
    { labelKey: "nav.settings", href: "/settings", icon: Settings },
  ];

  const navItems: NavItem[] = isAdmin
    ? [...baseNavItems, { labelKey: "nav.adminPanel", href: "/admin", icon: ShieldCheck, badge: 0 }]
    : baseNavItems;

  const openSidebar = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setSidebarOpen(true);
  }, []);

  const scheduleCloseSidebar = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setSidebarOpen(false), 280);
  }, []);

  const NavLink = ({ item, onClick }: { item: NavItem; onClick?: () => void }) => {
    const isActive =
      location === item.href || (item.href !== "/" && location.startsWith(item.href));
    return (
      <Link
        href={item.href}
        onClick={onClick}
        className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
          isActive
            ? "bg-accent text-accent-foreground shadow-md shadow-accent/30"
            : "text-blue-100/90 hover:bg-white/10 hover:text-white"
        }`}
      >
        <item.icon
          size={18}
          className={isActive ? "text-white" : "text-blue-200 group-hover:text-white"}
        />
        <span className="flex-1 font-medium text-sm">{t(item.labelKey)}</span>
        {item.badge ? (
          <span className="bg-[#E65100] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
            {item.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  const isFullWidth = location === "/loads" || location === "/weekly" || location === "/accounting";
  const isCompactPage = location === "/settings";

  const sidebarContent = (onNavClick?: () => void) => (
    <>
      <div className="flex items-center justify-center px-3 py-4 border-b border-white/10">
        <LoadBoardProLogo onDarkPanel className="w-full h-20 max-h-20 shrink-0" />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} onClick={onNavClick} />
        ))}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-3 bg-black/10">
        <div className="flex justify-center items-center gap-2">
          <ThemeToggle compact />
          <LanguageSwitcher compact />
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-white/5 p-2.5 ring-1 ring-white/10">
          <UserAvatar
            name={displayName}
            email={me?.email || user?.email}
            avatarKey={me?.avatarKey}
            className="h-9 w-9 ring-2 ring-[#2196F3]/50"
            fallbackClassName="bg-[#2A4D70] text-sm"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{displayName}</p>
            <p className="text-[11px] text-blue-200/80 truncate">{translateRole(t, userRole)}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
            data-testid="button-logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop: hover edge + slide-out sidebar */}
      <div
        className="hidden md:block fixed inset-y-0 left-0 z-50"
        onMouseLeave={scheduleCloseSidebar}
      >
        {/* Left edge trigger strip */}
        <div
          className={`absolute inset-y-0 left-0 z-10 flex items-center justify-center transition-all duration-300 ${
            sidebarOpen ? "w-0 opacity-0" : "w-3 opacity-100"
          }`}
          onMouseEnter={openSidebar}
        >
          <div className="h-16 w-1 rounded-full bg-primary/30 hover:bg-accent/60 transition-colors" />
        </div>

        {/* Hover catcher when sidebar closed — wider invisible zone */}
        {!sidebarOpen && (
          <div
            className="absolute inset-y-0 left-0 w-4 z-[5]"
            onMouseEnter={openSidebar}
          />
        )}

        {/* Sidebar panel */}
        <aside
          className={`absolute inset-y-0 left-0 w-[260px] flex flex-col overflow-hidden transition-transform duration-300 ease-out shadow-2xl shadow-black/30 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{
            background: "linear-gradient(180deg, #1A3C5E 0%, #152e47 55%, #0f2236 100%)",
          }}
          onMouseEnter={openSidebar}
        >
          {sidebarContent()}
        </aside>

        {/* Subtle edge hint when open */}
        {sidebarOpen && (
          <div className="absolute top-1/2 -translate-y-1/2 left-[260px] pointer-events-none">
            <ChevronRight className="h-4 w-4 text-primary/40" />
          </div>
        )}
      </div>

      {/* Mobile overlay menu */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col transform transition-transform duration-300 ease-out shadow-2xl ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "linear-gradient(180deg, #1A3C5E 0%, #152e47 55%, #0f2236 100%)",
        }}
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 gap-2">
          <LoadBoardProLogo onDarkPanel className="h-16 w-auto min-w-0 flex-1 max-w-[300px]" />
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1.5 rounded-md text-blue-200 hover:text-white hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} onClick={() => setIsMobileMenuOpen(false)} />
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 flex items-center justify-center gap-2">
          <ThemeToggle compact />
          <LanguageSwitcher compact />
        </div>
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden w-full">
        <header className="md:hidden bg-card border-b border-border p-4 flex items-center justify-between shadow-sm z-10">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Menu size={24} />
          </button>
          <LoadBoardProLogo className="h-12 w-auto max-w-[300px] shrink-0" />
          <UserAvatar
            name={displayName}
            email={me?.email || user?.email}
            avatarKey={me?.avatarKey}
            className="h-8 w-8"
            fallbackClassName="bg-primary text-primary-foreground text-sm"
          />
        </header>

        <header className="hidden md:flex bg-card/80 backdrop-blur-sm border-b border-border h-[4.5rem] items-center justify-between gap-4 px-5 shadow-sm z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1 h-5 rounded-full bg-primary/30 shrink-0" />
            <LoadBoardProLogo className="h-14 w-auto max-w-[340px] shrink-0" />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
            <Link
              href="/notifications"
              className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E65100] opacity-75" />
                  <span className="relative inline-flex items-center justify-center rounded-full h-4 w-4 bg-[#E65100] text-[8px] font-bold text-white">
                    {unreadCount}
                  </span>
                </span>
              )}
            </Link>
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <UserAvatar
                name={displayName}
                email={me?.email || user?.email}
                avatarKey={me?.avatarKey}
                className="h-8 w-8"
                fallbackClassName="bg-primary text-primary-foreground text-xs"
              />
              <span className="text-sm font-medium text-foreground hidden lg:block">{displayName}</span>
            </div>
          </div>
        </header>

        <div
          className={`flex-1 overflow-auto bg-background ${
            isFullWidth ? "p-2 md:p-3" : isCompactPage ? "p-3 md:p-4" : "p-4 md:p-8"
          }`}
        >
          <div
            className={`${isFullWidth ? "w-full max-w-none" : "max-w-7xl mx-auto"} h-full flex flex-col`}
          >
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
