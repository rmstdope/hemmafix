"use client";

import { useSyncExternalStore } from "react";
import { parseSoundOn, SOUND_KEY } from "@/lib/sound-setting";

const listeners = new Set<() => void>();

/** Whether this device may make sound and vibrate. Blocked storage counts as on. */
export function readSoundOn(): boolean {
  try {
    return parseSoundOn(window.localStorage.getItem(SOUND_KEY));
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(SOUND_KEY);
    else window.localStorage.setItem(SOUND_KEY, "off");
  } catch {
    // Storage is blocked: nothing is saved, so sound stays on (readSoundOn answers true).
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export const useSoundOn = () => useSyncExternalStore(subscribe, readSoundOn, () => true);
