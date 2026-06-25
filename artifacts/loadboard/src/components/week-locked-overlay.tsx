import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  t: (key: string, vars?: Record<string, string | number>) => string;
  onRequestPermission: () => void;
};

export function WeekLockedOverlay({ t, onRequestPermission }: Props) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/55 backdrop-blur-[1px] pointer-events-none"
      aria-hidden={false}
    >
      <div className="pointer-events-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-red-200/80 bg-card/95 px-8 py-7 text-center shadow-lg">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
          <Lock className="h-7 w-7" strokeWidth={2.25} />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">{t("weekLock.overlayTitle")}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("weekLock.overlayDesc")}</p>
        </div>
        <Button type="button" variant="default" className="bg-red-600 hover:bg-red-700" onClick={onRequestPermission}>
          {t("weekLock.requestPermission")}
        </Button>
      </div>
    </div>
  );
}
