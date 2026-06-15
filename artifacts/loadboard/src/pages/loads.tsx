import { useState } from "react";
import { useListLoads } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { Search, Plus, Filter, AlertTriangle } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function LoadsList() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const { data: loadsData, isLoading } = useListLoads({ search, limit: 50 });

  const formatCurrency = (amount: number = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#1A3C5E]" data-testid="page-title-loads">Loads Board</h1>
        <Button className="bg-[#2196F3] hover:bg-[#1E88E5] text-white" data-testid="button-add-load">
          <Plus className="h-4 w-4 mr-2" /> Add Load
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden shadow-sm border-gray-200">
        <div className="p-4 border-b border-gray-100 bg-white flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search load #, city, driver..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-gray-50 border-gray-200 focus:border-[#1A3C5E] focus:ring-[#1A3C5E]"
              data-testid="input-search-loads"
            />
          </div>
          <Button variant="outline" className="border-gray-200 text-gray-600" data-testid="button-filter-loads">
            <Filter className="h-4 w-4 mr-2" /> Filters
          </Button>
        </div>

        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-sm text-left relative">
            <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4 font-semibold">Load #</th>
                <th className="px-6 py-4 font-semibold">Driver</th>
                <th className="px-6 py-4 font-semibold">Broker</th>
                <th className="px-6 py-4 font-semibold">Route</th>
                <th className="px-6 py-4 font-semibold">Dates</th>
                <th className="px-6 py-4 font-semibold text-right">Rate / RPM</th>
                <th className="px-6 py-4 font-semibold text-right">B-I Diff</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4"><Skeleton className="h-5 w-16" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-5 w-24" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-5 w-24" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-5 w-32" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-5 w-20" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-5 w-16 ml-auto" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-5 w-16 ml-auto" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-20 mx-auto rounded-full" /></td>
                  </tr>
                ))
              ) : loadsData?.data?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No loads found. Adjust your search or add a new load.
                  </td>
                </tr>
              ) : (
                loadsData?.data?.map((load) => {
                  const isNegativeDiff = (load.biDiff || 0) < 0;
                  return (
                    <tr 
                      key={load.id} 
                      onClick={() => setLocation(`/loads/${load.id}`)}
                      className={`hover:bg-blue-50/50 cursor-pointer transition-colors ${isNegativeDiff ? 'bg-red-50/30' : ''}`}
                      data-testid={`row-load-${load.id}`}
                    >
                      <td className="px-6 py-4 font-bold text-[#1A3C5E]">{load.loadNumber}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{load.driver?.fullName || "—"}</td>
                      <td className="px-6 py-4 text-gray-600">{load.broker?.name || "—"}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 truncate max-w-[200px]">
                          {load.originCity}, {load.originState} →
                        </div>
                        <div className="text-gray-500 truncate max-w-[200px]">
                          {load.destCity}, {load.destState} ({load.mileage} mi)
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        <div>{new Date(load.puDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</div>
                        <div className="text-xs text-gray-400">{new Date(load.delDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-bold text-gray-900">{formatCurrency(load.rate)}</div>
                        <div className="text-xs text-gray-500">{formatCurrency(load.rpm || 0)}/mi</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={`font-semibold flex items-center justify-end gap-1 ${isNegativeDiff ? 'text-[#C62828]' : 'text-gray-900'}`}>
                          {isNegativeDiff && <AlertTriangle className="h-3 w-3" />}
                          {formatCurrency(load.biDiff || 0)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <LoadStatusBadge status={load.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
