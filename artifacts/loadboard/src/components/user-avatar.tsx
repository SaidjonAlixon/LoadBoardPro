import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/profile-avatars";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  avatarKey?: string | null;
  className?: string;
  fallbackClassName?: string;
}

export function UserAvatar({
  name,
  email,
  avatarKey,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const label = name || email || "U";
  const initials = label.charAt(0).toUpperCase();
  const src = avatarKey ? getAvatarUrl(avatarKey) : undefined;

  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={label} /> : null}
      <AvatarFallback className={cn("bg-primary text-white", fallbackClassName)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
