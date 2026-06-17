export function getLoadStatusClass(status: string): string {
  switch (normalizeLoadStatus(status)) {
    case "Booked":
      return "bg-[#E3F2FD] text-[#1976D2] border-[#BBDEFB]";
    case "InQM":
      return "bg-[#FFF3E0] text-[#E65100] border-[#FFE0B2]";
    case "Delivered":
      return "bg-[#E8F5E9] text-[#2E7D32] border-[#C8E6C9]";
    case "Canceled":
      return "bg-[#FFEBEE] text-[#C62828] border-[#FFCDD2]";
    case "Completed":
      return "bg-[#E0F2F1] text-[#00695C] border-[#B2DFDB]";
    case "NeedRevRC":
      return "bg-[#F3E5F5] text-[#6A1B9A] border-[#E1BEE7]";
    case "Issue":
      return "bg-[#FFF8E1] text-[#F57F17] border-[#FFECB3]";
    case "Checked":
      return "bg-[#E0F7FA] text-[#006064] border-[#B2EBF2]";
    case "Invoiced":
      return "bg-[#E8EAF6] text-[#283593] border-[#C5CAE9]";
    case "Reinvoiced":
      return "bg-[#FFF3E0] text-[#E65100] border-[#FFE0B2]";
    case "BrokerPaid":
      return "bg-[#E8F5E9] text-[#1B5E20] border-[#A5D6A7]";
    default:
      return "bg-muted text-foreground";
  }
}

function normalizeLoadStatus(status: string): string {
  return status === "PickedUp" ? "InQM" : status;
}

export function getSheetStatusClass(status: string): string {
  switch (normalizeLoadStatus(status)) {
    case "Booked":
      return "bg-[#90caf9] text-[#0d47a1]";
    case "InQM":
      return "bg-[#fff59d] text-[#f57f17]";
    case "Delivered":
      return "bg-[#a5d6a7] text-[#1b5e20]";
    case "Canceled":
      return "bg-[#ef9a9a] text-[#b71c1c]";
    case "Completed":
      return "bg-[#80cbc4] text-[#004d40]";
    case "NeedRevRC":
      return "bg-[#ce93d8] text-[#4a148c]";
    case "Issue":
      return "bg-[#ffcc80] text-[#e65100]";
    case "Checked":
      return "bg-[#80deea] text-[#006064]";
    case "Invoiced":
      return "bg-[#9fa8da] text-[#1a237e]";
    case "Reinvoiced":
      return "bg-[#ffcc80] text-[#e65100]";
    case "BrokerPaid":
      return "bg-[#81c784] text-[#1b5e20]";
    default:
      return "bg-gray-200 text-foreground";
  }
}
