let context: AudioContext | undefined;

/** One short, soft coin clink. Follows the device's volume and silent mode; fails silently. */
export function playClink() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
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
