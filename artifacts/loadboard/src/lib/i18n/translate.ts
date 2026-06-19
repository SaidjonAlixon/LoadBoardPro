export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function translateLoadStatus(t: TranslateFn, status: string): string {
  const normalized = status === "PickedUp" ? "InQM" : status;
  const map: Record<string, string> = {
    Booked: t("status.booked"),
    InQM: t("status.inQM"),
    Delivered: t("status.delivered"),
    Canceled: t("status.canceled"),
    Completed: t("status.completed"),
    NeedRevRC: t("status.needRevRC"),
    Issue: t("status.issue"),
    PickedUp: t("status.inQM"),
    Checked: t("status.checked"),
    Invoiced: t("status.invoiced"),
    Reinvoiced: t("status.reinvoiced"),
    BrokerPaid: t("status.brokerPaid"),
  };
  return map[normalized] ?? status;
}

export function translateLoadStatusDesc(t: TranslateFn, status: string): string | undefined {
  const normalized = status === "PickedUp" ? "InQM" : status;
  const map: Record<string, string> = {
    Booked: t("status.bookedDesc"),
    InQM: t("status.inQMDesc"),
    Delivered: t("status.deliveredDesc"),
    Canceled: t("status.canceledDesc"),
    Completed: t("status.completedDesc"),
    NeedRevRC: t("status.needRevRCDesc"),
    Issue: t("status.issueDesc"),
    PickedUp: t("status.inQMDesc"),
    Checked: t("status.checkedDesc"),
    Invoiced: t("status.invoicedDesc"),
    Reinvoiced: t("status.reinvoicedDesc"),
    BrokerPaid: t("status.brokerPaidDesc"),
  };
  return map[normalized];
}

export function translateRole(t: TranslateFn, role: string): string {
  const map: Record<string, string> = {
    admin: t("roles.admin"),
    dispatcher: t("roles.dispatcher"),
    accounting: t("roles.accounting"),
    driver: t("roles.driver"),
  };
  return map[role] ?? role;
}
