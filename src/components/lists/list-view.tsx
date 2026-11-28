"use client";

import { ArrowLeft, Check, Lock, MoreHorizontal, RotateCcw, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { toast } from "sonner";
import {
  addListItem,
  clearListDone,
  deleteList,
  editListItem,
  removeListItem,
  renameList,
  restoreListItems,
  setListItemDone,
  setListSharing,
  type ActionState,
} from "@/app/actions";
import { attempt } from "@/components/attempt";
import { applyItemChange, clearedNotice, type ItemChange, type ItemView, type ListSharing } from "@/lib/lists";
import { cn } from "@/lib/utils";
import { takeFocus } from "./focus-new";
import { Menu } from "./menu";
import { Modal } from "./modal";
import { useHydrated } from "./use-hydrated";
import { NameDialog } from "./name-dialog";
import type { ShareChoice } from "./sharing-picker";
import { SharingSheet } from "./sharing-sheet";

type Focus = { box: string } | "field" | null;

/** Whether Klart is open is remembered per person and list on this device, never shared. */
const klartKey = (userId: string, listId: string) => `hemmafix-klart:${userId}:${listId}`;
const KLART_EVENT = "hemmafix-klart";
const readKlart = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "open";
  } catch {
    return false;
  }
};
const subscribeKlart = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(KLART_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(KLART_EVENT, notify);
  };
};

/** A list's page: who sees it, the field, the open items, Klart, and ⋯ for renaming and removing the list. */
export function ListView({
  list,
  userId,
  choices,
}: {
  list: {
    id: string;
    name: string;
    items: ItemView[];
    privacy: string | null;
    sharing: ListSharing;
    canChangeSharing: boolean;
    canDelete: boolean;
  };
  userId: string;
  choices: ShareChoice[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, change] = useOptimistic(list.items, applyItemChange);
  const [text, setText] = useState("");
  // Where focus goes once the change is on screen; read after every render, used once.
  const focusNext = useRef<Focus>(null);
  const [dialog, setDialog] = useState<"rename" | "delete" | "sharing" | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const changeSharing = useRef<HTMLButtonElement>(null);
  const key = klartKey(userId, list.id);
  const hydrated = useHydrated();
  const klartOpen = useSyncExternalStore(subscribeKlart, () => readKlart(key), () => false);

  const openItems = items.filter((i) => !i.doneAt).sort((a, b) => b.rank - a.rank);
  const done = items.filter((i) => i.doneAt).sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime());

  useEffect(() => {
    if (takeFocus(list.id)) input.current?.focus();
  }, [list.id]);

  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    if (target === "field") input.current?.focus();
    else document.querySelector<HTMLElement>(`[data-box="${target.box}"]`)?.focus();
  });

  /** Shows the change at once and sends it; a failed save puts the page back and says so. */
  const run = (c: ItemChange, action: () => Promise<ActionState>, after?: (ok: boolean) => void) => {
    startTransition(async () => {
      change(c);
      const ok = await attempt(action);
      after?.(ok);
    });
  };

  const add = () => {
    const value = text.trim();
    if (!value) return;
    const id = crypto.randomUUID();
    setText("");
    run({ type: "add", id, text: value }, () => addListItem(list.id, id, value), (ok) => {
      if (!ok) setText((now) => now || value);
    });
    input.current?.focus();
  };

  const restore = (restored: ItemView[], focusId?: string) =>
    startTransition(async () => {
      change({ type: "restore", items: restored });
      if (focusId) focusNext.current = { box: focusId };
      await attempt(() => restoreListItems(list.id, restored));
    });

  /** Ticks or unticks, and moves focus on to where the item went or the next open one. */
  const tick = (item: ItemView, done: boolean) => {
    const next = openItems[openItems.indexOf(item) + 1];
    focusNext.current = done ? (next ? { box: next.id } : "field") : { box: item.id };
    run({ type: "done", id: item.id, done }, () => setListItemDone(list.id, item.id, done));
  };

  const remove = (item: ItemView) => {
    const next = openItems[openItems.indexOf(item) + 1];
    focusNext.current = next ? { box: next.id } : "field";
    run({ type: "remove", id: item.id }, () => removeListItem(list.id, item.id));
    toast(`${item.text} är borttagen`, { action: { label: "Ångra", onClick: () => restore([item], item.id) } });
  };

  const clear = () => {
    const cleared = done;
    focusNext.current = "field";
    run({ type: "clear" }, () => clearListDone(list.id, cleared.map((i) => i.id)));
    toast(clearedNotice(cleared.length), {
      action: {
        label: "Ångra",
        onClick: () => {
          focusNext.current = "field";
          restore(cleared);
        },
      },
    });
  };

  const toggleKlart = () => {
    try {
      if (klartOpen) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, "open");
    } catch {
      // Without storage Klart simply stays folded.
    }
    window.dispatchEvent(new Event(KLART_EVENT));
  };

  const closeDialog = () => setDialog(null);

  return (
    <div data-hydrated={hydrated}>
      {/* Who sees the list has a row of its own under the name, so ⋯ stays on the name's row and comes first for Tab. */}
      <header className="mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1">
        <Link
          href="/listor"
          aria-label="Tillbaka"
          className="on-sky-muted -ml-3 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="on-sky min-w-0 text-xl font-semibold break-words">{list.name}</h1>
        <Menu
          triggerRef={more}
          label={`Mer för ${list.name}`}
          triggerClassName="on-sky-muted flex size-11 items-center justify-center rounded-lg text-muted-foreground"
          items={[
            { label: "Byt namn", onSelect: () => setDialog("rename") },
            ...(list.canDelete
              ? [{ label: "Ta bort lista", destructive: true, onSelect: () => setDialog("delete") }]
              : []),
          ]}
        >
          <MoreHorizontal className="size-5" />
        </Menu>
        <p className="on-sky-muted col-span-2 col-start-2 flex items-start gap-1.5 text-sm text-muted-foreground">
          {list.privacy ? (
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 break-words">
            <span data-testid="list-privacy">{list.privacy ?? "Alla i hemmet"}</span>
            {list.canChangeSharing && (
              <button
                ref={changeSharing}
                type="button"
                onClick={() => setDialog("sharing")}
                className="on-sky -my-3 ml-1 inline-block rounded-lg px-1 py-3 font-medium text-foreground underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Ändra
              </button>
            )}
          </span>
        </p>
      </header>

      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder="Lägg till…"
        aria-label="Lägg till…"
        maxLength={200}
        autoComplete="off"
        enterKeyHint="done"
        className="sky-box mb-3 h-11 w-full rounded-xl border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
      />

      {openItems.length > 0 ? (
        <ul className="space-y-2" aria-label="Saker kvar">
          {openItems.map((item) => (
            <OpenRow
              key={item.id}
              item={item}
              onTick={() => tick(item, true)}
              onEdit={(value) => run({ type: "edit", id: item.id, text: value }, () => editListItem(list.id, item.id, value))}
              onRemove={() => remove(item)}
            />
          ))}
        </ul>
      ) : (
        <p className="sky-box rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          {done.length > 0 ? "Allt är avbockat." : "Listan är tom."}
        </p>
      )}

      {done.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleKlart}
              aria-expanded={klartOpen}
              className="on-sky-muted flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground"
            >
              Klart ({done.length}) <span aria-hidden>{klartOpen ? "▾" : "▸"}</span>
            </button>
            <button type="button" onClick={clear} className="on-sky-muted min-h-11 px-2 text-sm font-medium text-muted-foreground underline">
              Rensa
            </button>
          </div>
          {klartOpen && (
            <ul className="space-y-2" aria-label="Klart">
              {done.map((item) => (
                <li key={item.id} className="flex items-center gap-1 rounded-xl border bg-card py-1 pr-3 pl-1">
                  <button
                    type="button"
                    data-box={item.id}
                    aria-label={`${item.text}: ångra avbockad`}
                    onClick={() => tick(item, false)}
                    className="done-mark flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
                  >
                    <RotateCcw className="size-4" />
                  </button>
                  <span className="min-w-0 flex-1 py-2 break-words text-muted-foreground line-through">{item.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {dialog === "rename" && (
        <NameDialog
          title="Byt namn"
          initial={list.name}
          submitLabel="Spara"
          opener={more}
          onClose={closeDialog}
          onSubmit={(name) => attempt(() => renameList(list.id, name))}
        />
      )}
      {dialog === "sharing" && (
        <SharingSheet
          initial={list.sharing}
          choices={choices}
          opener={changeSharing}
          onClose={closeDialog}
          onSubmit={(sharing) => attempt(() => setListSharing(list.id, sharing))}
        />
      )}
      {dialog === "delete" && (
        <DeleteDialog
          name={list.name}
          opener={more}
          onClose={closeDialog}
          onConfirm={async () => {
            if (!(await attempt(() => deleteList(list.id)))) return false;
            toast(`${list.name} är borttagen`);
            router.push("/listor");
            return true;
          }}
        />
      )}
    </div>
  );
}

/** One open item: a tick box, the words (tap to edit in place) and ×. */
function OpenRow({
  item,
  onTick,
  onEdit,
  onRemove,
}: {
  item: ItemView;
  onTick: () => void;
  onEdit: (text: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const finished = useRef(false);
  const words = useRef<HTMLButtonElement>(null);
  const backToWords = useRef(false);

  useEffect(() => {
    if (!editing && backToWords.current) {
      backToWords.current = false;
      words.current?.focus();
    }
  }, [editing]);

  const finish = (save: boolean, refocus: boolean) => {
    if (finished.current) return;
    finished.current = true;
    backToWords.current = refocus;
    const value = draft.trim();
    if (save && value && value !== item.text) onEdit(value);
    setEditing(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true, true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false, true);
    }
  };

  return (
    <li className="flex items-start gap-1 rounded-xl border bg-card py-1 pr-1 pl-1">
      <button
        type="button"
        data-box={item.id}
        aria-label={`${item.text}: bocka av`}
        onClick={onTick}
        className="flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <span className="tick-box flex size-6 items-center justify-center rounded-full border-2 border-input">
          <Check className="size-3.5 opacity-0" aria-hidden />
        </span>
      </button>
      {editing ? (
        <textarea
          ref={(el) => {
            if (el && !el.dataset.ready) {
              el.dataset.ready = "1";
              el.focus();
              el.setSelectionRange(el.value.length, el.value.length);
            }
          }}
          value={draft}
          rows={1}
          maxLength={200}
          aria-label={`Ändra ${item.text}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => finish(true, false)}
          className="my-1 min-w-0 flex-1 resize-none rounded-lg border border-ring bg-transparent px-2 py-1.5 text-base outline-none [field-sizing:content] md:text-sm"
        />
      ) : (
        <button
          ref={words}
          type="button"
          onClick={() => {
            finished.current = false;
            setDraft(item.text);
            setEditing(true);
          }}
          className={cn("min-w-0 flex-1 rounded-lg px-2 py-2.5 text-left break-words")}
        >
          {item.text}
        </button>
      )}
      <button
        type="button"
        aria-label={`Ta bort ${item.text}`}
        onClick={onRemove}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
      >
        <X className="size-5" />
      </button>
    </li>
  );
}

function DeleteDialog({
  name,
  opener,
  onClose,
  onConfirm,
}: {
  name: string;
  opener: RefObject<HTMLElement | null>;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Modal title={`Ta bort ${name}?`} onClose={() => !pending && onClose()} returnFocusTo={opener}>
      <p className="mt-2 text-sm text-muted-foreground">Listan och allt på den tas bort för hela familjen.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={pending} className="h-11 rounded-xl border px-4 font-semibold disabled:opacity-50">
          Avbryt
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (!(await onConfirm())) onClose();
            })
          }
          className="h-11 rounded-xl bg-destructive px-4 font-semibold text-white disabled:opacity-50"
        >
          Ta bort
        </button>
      </div>
    </Modal>
  );
}
