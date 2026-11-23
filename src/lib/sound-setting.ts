/** Where a device remembers whether Hemmafix may make sound and vibrate. */
export const SOUND_KEY = "hemmafix-sound";

/** Sound and vibration are on, unless this device stored "off". */
export function parseSoundOn(raw: string | null): boolean {
  return raw !== "off";
}
