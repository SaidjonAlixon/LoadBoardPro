import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
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
  X
} from "lucide-react";
import { useListNotifications } from "@workspace/api-client-react";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const [location] = useLocation();

  // Polling notifications unread count
  const { data: notifications } = useListNotifications({ unreadOnly: true });
  const unreadCount = notifications?.length || 0;

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Loads", href: "/loads", icon: Truck },
    { label: "Weekly View", href: "/weekly", icon: CalendarDays },
    { label: "Drivers", href: "/drivers", icon: Users },
    { label: "Accounting", href: "/accounting", icon: Calculator },
    { label: "Notifications", href: "/notifications", icon: Bell, badge: unreadCount },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-[#F5F7FA]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-[#1A3C5E] text-white overflow-y-auto">
        <div className="p-6 flex items-center space-x-3">
          <div className="bg-white p-1 rounded">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 16H2V6C2 4.89543 2.89543 4 4 4H14C15.1046 4 16 4.89543 16 6V16H14" stroke="#1A3C5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 11H20C21.1046 11 22 11.8954 22 13V16H20" stroke="#1A3C5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="6" cy="18" r="2" stroke="#1A3C5E" strokeWidth="2"/>
              <circle cx="18" cy="18" r="2" stroke="#1A3C5E" strokeWidth="2"/>
              <path d="M8 18H16" stroke="#1A3C5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <text x="5" y="12" fontFamily="Inter, sans-serif" fontWeight="bold" fontSize="6" fill="#1A3C5E">LB</text>
            </svg>
          </div>
          <span className="font-bold text-xl tracking-tight">LoadBoard Pro</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex items-center space-x-3 px-3 py-2.5 rounded-md transition-colors ${isActive ? 'bg-[#2196F3] text-white' : 'text-blue-100 hover:bg-[#2A4D70] hover:text-white'}`}>
                <item.icon size={18} />
                <span className="flex-1 font-medium text-sm">{item.label}</span>
                {item.badge ? (
                  <span className="bg-[#E65100] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#2A4D70]">
          <div className="flex items-center space-x-3">
            <Avatar className="h-9 w-9 border border-[#2196F3]">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="bg-[#2A4D70] text-white">
                {user?.firstName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.fullName || "User"}</p>
              <p className="text-xs text-blue-200 truncate capitalize">{user?.publicMetadata?.role as string || "Dispatcher"}</p>
            </div>
            <button onClick={() => signOut({ redirectUrl: "/" })} className="text-blue-200 hover:text-white transition-colors" data-testid="button-logout">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Mobile Sidebar */}
      <div className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-[#1A3C5E] transform transition-transform duration-200 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-[#2A4D70]">
          <span className="font-bold text-white text-lg">LoadBoard Pro</span>
          <button onClick={() => setIsMobileMenuOpen(false)} className="text-blue-200 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={`flex items-center space-x-3 px-3 py-2.5 rounded-md text-white ${location === item.href ? 'bg-[#2196F3]' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
              <item.icon size={18} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="bg-[#E65100] text-white text-xs px-2 py-0.5 rounded-full">{item.badge}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header Mobile */}
        <header className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between shadow-sm z-10">
          <button onClick={() => setIsMobileMenuOpen(true)} className="text-gray-500 hover:text-[#1A3C5E]">
            <Menu size={24} />
          </button>
          <span className="font-bold text-[#1A3C5E]">LoadBoard Pro</span>
          <div className="flex items-center space-x-4">
            <Link href="/notifications" className="text-gray-500 hover:text-[#1A3C5E] relative">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E65100] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#E65100]"></span>
                </span>
              )}
            </Link>
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="bg-[#1A3C5E] text-white">{user?.firstName?.charAt(0) || "U"}</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Desktop Header Top Bar */}
        <header className="hidden md:flex bg-white border-b border-gray-200 h-16 items-center justify-end px-6 shadow-sm z-10">
          <div className="flex items-center space-x-4">
            <Link href="/notifications" className="relative p-2 text-gray-500 hover:text-[#1A3C5E] hover:bg-gray-50 rounded-full transition-colors">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E65100] opacity-75"></span>
                  <span className="relative inline-flex items-center justify-center rounded-full h-4 w-4 bg-[#E65100] text-[8px] font-bold text-white">
                    {unreadCount}
                  </span>
                </span>
              )}
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-[#F5F7FA] p-4 md:p-8">
          <div className="max-w-7xl mx-auto h-full flex flex-col">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
