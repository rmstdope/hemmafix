/**
 * This device's memory that its person uses Jul, so the night sky is there from the first paint,
 * before their choice has streamed in. It only counts on themed pages and until their own marks
 * arrive (globals.css), which then correct it.
 */
const KEY = "hemmafix-sky";

/** Runs in <head>, before anything is painted. */
export const SKY_HINT_SCRIPT = `try{if(localStorage.getItem("${KEY}"))document.documentElement.dataset.sky="jul"}catch(e){}`;

export function setSkyHint(jul: boolean) {
  if (jul) document.documentElement.dataset.sky = "jul";
  else delete document.documentElement.dataset.sky;
  try {
    if (jul) window.localStorage.setItem(KEY, "jul");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Without storage the sky simply waits for the person's choice.
  }
}
