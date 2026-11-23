import { readSoundOn } from "./sound-setting";

let context: AudioContext | undefined;

function ready() {
  context ??= new AudioContext();
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

/** Call inside the tap itself: iOS only lets sound start from a gesture, and the clinks come later. */
export function unlockSound() {
  if (!readSoundOn()) return;
  try {
    ready();
  } catch {
    // No sound is better than a broken tick-off.
  }
}

/**
 * One short, soft coin clink with a tap of vibration where the phone can. Follows the device's
 * volume and silent mode and the device's own switch; fails silently.
 */
export function playClink() {
  if (!readSoundOn()) return;
  try {
    navigator.vibrate?.(15);
  } catch {
    // Not every browser lets a page vibrate.
  }
  try {
    const context = ready();
    const now = context.currentTime;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(1760, now);
    tone.frequency.exponentialRampToValueAtTime(2637, now + 0.05);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    tone.connect(gain);
    gain.connect(context.destination);
    tone.start(now);
    tone.stop(now + 0.2);
  } catch {
    // No sound is better than a broken tick-off.
  }
}
