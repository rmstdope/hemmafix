import { GRADIENT_FRAME, frameClass, isGradientFrame } from "./look-styles";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function MemberAvatar({
  name,
  image,
  size = "default",
  frame = "none",
}: {
  name: string;
  image: string | null;
  size?: "default" | "sm" | "lg";
  /** The frame this person bought (src/lib/looks.ts); the family sees it wherever the picture is. */
  frame?: string;
}) {
  const avatar = (
    <Avatar size={size} data-frame={frame === "none" ? undefined : frame} className={cn(frameClass(frame))}>
      {image && <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
  if (!isGradientFrame(frame)) return avatar;
  return (
    <span style={GRADIENT_FRAME} className="inline-flex shrink-0 rounded-full">
      {avatar}
    </span>
  );
}
