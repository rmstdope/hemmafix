"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { createList, setListOrder } from "@/app/actions";
import { attempt } from "@/components/attempt";
import {
  countLabel,
  LIST_ORDERS,
  orderButtonLabel,
  orderMenuLabel,
  sortLists,
  type ListOrder,
} from "@/lib/lists";
import { expectFocusIn } from "./focus-new";
import { Menu } from "./menu";
import { NameDialog } from "./name-dialog";
import { useHydrated } from "./use-hydrated";

type Row = { id: string; name: string; createdAt: Date; updatedAt: Date; openCount: number; totalCount: number };

/** Listor: the home's lists in this person's order, Ny lista and the sort button. */
export function ListsOverview({ lists, order }: { lists: Row[]; order: ListOrder }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, showOrder] = useOptimistic(order);
  const [making, setMaking] = useState(false);
  const hydrated = useHydrated();
  const newButton = useRef<HTMLButtonElement>(null);
  const sortButton = useRef<HTMLButtonElement>(null);

  const choose = (next: ListOrder) =>
    startTransition(async () => {
      showOrder(next);
      await attempt(() => setListOrder(next));
    });

  return (
    <div data-hydrated={hydrated}>
      <div className="mb-3 flex gap-2">
        <button
          ref={newButton}
          type="button"
          onClick={() => setMaking(true)}
          className="h-11 min-w-0 flex-1 rounded-xl border font-semibold"
        >
          ＋ Ny lista
        </button>
        <Menu
          radio
          triggerRef={sortButton}
          label={`Sortera listor: ${orderMenuLabel(shown)}`}
          triggerClassName="h-11 shrink-0 rounded-xl border px-3 text-sm font-semibold whitespace-nowrap"
          items={LIST_ORDERS.map((o) => ({ label: orderMenuLabel(o), checked: o === shown, onSelect: () => choose(o) }))}
        >
          {orderButtonLabel(shown)}
        </Menu>
      </div>

      {lists.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          <p>Inga listor ännu.</p>
          <p className="mt-3">Gör en lista för inköp, packning eller annat ni vill bocka av tillsammans.</p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Listor">
          {sortLists(lists, shown).map((l) => (
            <li key={l.id}>
              <Link href={`/listor/${l.id}`} className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3 py-2">
                <span className="min-w-0 flex-1 font-medium break-words">{l.name}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{countLabel(l.openCount, l.totalCount)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {making && (
        <NameDialog
          title="Ny lista"
          submitLabel="Skapa"
          opener={newButton}
          onClose={() => setMaking(false)}
          onSubmit={async (name) => {
            let id: string | undefined;
            const ok = await attempt(async () => {
              const result = await createList(name);
              id = result.id;
              return result;
            });
            if (ok && id) {
              expectFocusIn(id);
              router.push(`/listor/${id}`);
            }
            return ok;
          }}
        />
      )}
    </div>
  );
}
