import { Badge } from "@/components/ui/badge";
import { LoadStatus } from "@workspace/api-client-react";

export function LoadStatusBadge({ status }: { status: LoadStatus | string }) {
  let bgColor = "bg-gray-100 text-gray-800";
  
  switch (status) {
    case "Booked":
      bgColor = "bg-[#E3F2FD] text-[#1976D2] border-[#BBDEFB]";
      break;
    case "PickedUp":
      bgColor = "bg-[#FFF3E0] text-[#E65100] border-[#FFE0B2]";
      break;
    case "Delivered":
      bgColor = "bg-[#E8F5E9] text-[#2E7D32] border-[#C8E6C9]";
      break;
    case "Canceled":
      bgColor = "bg-[#FFEBEE] text-[#C62828] border-[#FFCDD2]";
      break;
  }

  return (
    <Badge variant="outline" className={`${bgColor} font-semibold`} data-testid={`status-badge-${status}`}>
      {status}
    </Badge>
  );
}
