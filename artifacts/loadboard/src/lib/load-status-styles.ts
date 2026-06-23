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
      return "bg-[#E3F2FD]/78 text-[#1565C0] border-[#BBDEFB]/85";
    case "InQM":
      return "bg-[#FFF3E0]/80 text-[#E65100] border-[#FFE0B2]/85";
    case "Delivered":
      return "bg-[#E8F5E9]/78 text-[#2E7D32] border-[#C8E6C9]/85";
    case "Canceled":
      return "bg-[#FFEBEE]/78 text-[#C62828] border-[#FFCDD2]/85";
    case "Completed":
      return "bg-[#E0F2F1]/78 text-[#00695C] border-[#B2DFDB]/85";
    case "NeedRevRC":
      return "bg-[#F3E5F5]/78 text-[#6A1B9A] border-[#E1BEE7]/85";
    case "Issue":
      return "bg-[#FFF8E1]/80 text-[#F57F17] border-[#FFECB3]/85";
    case "Checked":
      return "bg-[#E0F7FA]/78 text-[#006064] border-[#B2EBF2]/85";
    case "Invoiced":
      return "bg-[#E8EAF6]/78 text-[#283593] border-[#C5CAE9]/85";
    case "Reinvoiced":
      return "bg-[#FFF3E0]/80 text-[#E65100] border-[#FFE0B2]/85";
    case "BrokerPaid":
      return "bg-[#E8F5E9]/78 text-[#1B5E20] border-[#A5D6A7]/85";
    default:
      return "bg-muted/70 text-foreground border-border/60";
  }
}
