import { Badge } from "@/components/ui/badge";
import { LoadStatus } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { translateLoadStatus, translateLoadStatusDesc } from "@/lib/i18n/translate";
import { getLoadStatusClass } from "@/lib/load-status-styles";

export function LoadStatusBadge({ status }: { status: LoadStatus | string }) {
  const { t } = useI18n();
  const desc = translateLoadStatusDesc(t, status);

  return (
    <Badge
      variant="outline"
      className={`${getLoadStatusClass(status)} font-semibold`}
      title={desc}
      data-testid={`status-badge-${status}`}
    >
      {translateLoadStatus(t, status)}
    </Badge>
  );
}
