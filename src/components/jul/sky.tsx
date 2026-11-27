import { SKY_PIECES } from "@/lib/jul";
import { Sky, type SkyProps } from "../sky/sky";

/** Jul's snow and wrapped presents. */
export function JulSky(props: SkyProps) {
  return <Sky {...props} theme="jul" pieces={SKY_PIECES} />;
}
