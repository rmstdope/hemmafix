"use client";

import { ArrowDownUp, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { createList, setListOrder } from "@/app/actions";
import { attempt } from "@/components/attempt";
import {
  countLabel,
  LIST_ORDERS,
  orderMenuLabel,
  sortLists,
  type ListOrder,
} from "@/lib/lists";
import { expectFocusIn } from "./focus-new";
import { Menu } from "./menu";
import { FloatingAdd } from "@/components/sheet";
import { NewListSheet } from "./new-list-sheet";
import { useHydrated } from "./use-hydrated";

type Row = { id: string; name: string; createdAt: Date; updatedAt: Date; openCount: number; totalCount: number };

/** Listor: the page header with the sort button, the home's lists in this person's order, and the round + for Ny lista. */
export function ListsOverview({
  lists,
  order,
  subtitle,
  children,
}: {
  lists: Row[];
  order: ListOrder;
  subtitle?: string;
  children?: ReactNode;
}) {
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
    <div data-hydrated={hydrated} className="flex flex-1 flex-col">
      <PageHeader title="Listor" subtitle={subtitle}>
        <Menu
          radio
          triggerRef={sortButton}
          label={`Sortera listor: ${orderMenuLabel(shown)}`}
          heading="Sortera listor"
          triggerClassName="on-sky-muted sky-toggle flex size-11 items-center justify-center rounded-lg border text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-foreground aria-expanded:bg-foreground aria-expanded:text-background"
          items={LIST_ORDERS.map((o) => ({ label: orderMenuLabel(o), checked: o === shown, onSelect: () => choose(o) }))}
        >
          <ArrowDownUp className="size-5" aria-hidden />
        </Menu>
        {children}
      </PageHeader>

      {lists.length === 0 ? (
        <div className="sky-box rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          <p>Inga listor ännu.</p>
          <p className="mt-3">Tryck på + för att göra en lista för inköp, packning eller annat ni vill bocka av tillsammans.</p>
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

      <FloatingAdd label="Ny lista" buttonRef={newButton} onClick={() => setMaking(true)} />

      {making && (
        <NewListSheet
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
