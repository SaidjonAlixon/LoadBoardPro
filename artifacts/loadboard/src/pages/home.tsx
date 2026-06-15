import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Truck, BarChart3, TrendingUp, ShieldCheck, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <header className="bg-[#1A3C5E] text-white p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Truck size={28} className="text-[#2196F3]" />
            <span className="text-xl font-bold tracking-tight">LoadBoard Pro</span>
          </div>
          <div className="flex space-x-4">
            <Link href="/sign-in">
              <Button variant="ghost" className="text-white hover:text-white hover:bg-white/10">Sign In</Button>
            </Link>
            <Link href="/sign-up">
              <Button className="bg-[#2196F3] hover:bg-[#1E88E5] text-white border-0">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-[#1A3C5E] text-white pt-20 pb-32 px-4 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[url('https://images.unsplash.com/photo-1519003722824-194d4455a60c?q=80&w=2075&auto=format&fit=crop')] bg-cover bg-center"></div>
          <div className="max-w-7xl mx-auto text-center relative z-10">
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
              The Command Center for <br className="hidden md:block"/> Freight Operations
            </h1>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-10 leading-relaxed">
              High-performance logistics management platform built for dispatchers, accountants, and modern transport companies. Maximize your RPM, streamline billing, and scale your fleet.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              <Link href="/sign-up">
                <Button size="lg" className="bg-[#2196F3] hover:bg-[#1E88E5] text-white text-lg px-8 py-6 h-auto w-full sm:w-auto font-semibold">
                  Start Your Command <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 text-lg px-8 py-6 h-auto w-full sm:w-auto">
                  Sign In to Portal
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 px-4 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-[#1A3C5E] mb-4">Precision Tools for Freight Pros</h2>
              <p className="text-gray-600 max-w-2xl mx-auto text-lg">LoadBoard Pro eliminates manual tracking and gives you instant visibility into every load, driver, and invoice.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-10">
              <div className="p-8 rounded-2xl bg-[#F5F7FA] border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 bg-blue-100 text-[#2196F3] rounded-xl flex items-center justify-center mb-6">
                  <BarChart3 size={28} />
                </div>
                <h3 className="text-xl font-bold text-[#1A3C5E] mb-3">Live Dispatch Dashboard</h3>
                <p className="text-gray-600 leading-relaxed">
                  Monitor all active loads in real-time. See color-coded statuses, identify critical issues before they escalate, and rank dispatcher performance automatically.
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-[#F5F7FA] border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 bg-green-100 text-[#2E7D32] rounded-xl flex items-center justify-center mb-6">
                  <TrendingUp size={28} />
                </div>
                <h3 className="text-xl font-bold text-[#1A3C5E] mb-3">Accounting & Billing</h3>
                <p className="text-gray-600 leading-relaxed">
                  Never miss an invoice. Track Broker-to-Invoiced (B-I) and Invoiced-to-Reimbursed (I-R) differentials. Spot underpayments instantly with automated highlighting.
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-[#F5F7FA] border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 bg-amber-100 text-[#E65100] rounded-xl flex items-center justify-center mb-6">
                  <ShieldCheck size={28} />
                </div>
                <h3 className="text-xl font-bold text-[#1A3C5E] mb-3">Driver Management</h3>
                <p className="text-gray-600 leading-relaxed">
                  Detailed performance tracking for Owner-Operators, Company Drivers, and Lease drivers. Weekly earnings charts and total historical load tracking per driver.
                </p>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="bg-gray-50 border-t border-gray-200 py-8 px-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-sm text-gray-500">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <Truck size={20} className="text-gray-400" />
            <span className="font-semibold text-gray-600">LoadBoard Pro</span>
          </div>
          <p>© {new Date().getFullYear()} LoadBoard Pro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
