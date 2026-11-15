import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { floor, household, membership, room, user } from "@/db/schema";
import type { Role } from "@/lib/permissions";

/** Inserts a verified user, as Better Auth would after a Google login. */
export async function createUser(name: string) {
  const id = randomUUID();
  const [row] = await db
    .insert(user)
    .values({ id, name, email: `${name.toLowerCase()}-${id.slice(0, 8)}@example.com`, emailVerified: true })
    .returning();
  return row!;
}

/**
 * A home with an adult (Anna), a child (Bo) and a kitchen and bathroom, plus a neighbouring
 * home with its own adult (Eve) and room, for checking that nothing crosses between homes.
 */
export async function createFamily() {
  const [home, other] = await db.insert(household).values([{ name: "Hemma" }, { name: "Grannar" }]).returning();
  const [ground, neighbourFloor] = await db
    .insert(floor)
    .values([
      { householdId: home!.id, name: "1", position: 1 },
      { householdId: other!.id, name: "1", position: 1 },
    ])
    .returning();
  const [anna, bo, eve] = [await createUser("Anna"), await createUser("Bo"), await createUser("Eve")];
  await db.insert(membership).values([
    { userId: anna.id, householdId: home!.id, role: "adult" },
    { userId: bo.id, householdId: home!.id, role: "child" },
    { userId: eve.id, householdId: other!.id, role: "adult" },
  ]);
  const [kitchen, bathroom, garage] = await db
    .insert(room)
    .values([
      { householdId: home!.id, floorId: ground!.id, name: "Kök" },
      { householdId: home!.id, floorId: ground!.id, name: "Badrum" },
      { householdId: other!.id, floorId: neighbourFloor!.id, name: "Garage" },
    ])
    .returning();
  const actor = (u: { id: string }, householdId: string, role: Role) => ({
    userId: u.id,
    householdId,
    role,
    name: u.id === anna.id ? "Anna" : u.id === bo.id ? "Bo" : "Eve",
    image: null,
  });
  return {
    homeId: home!.id,
    ground: ground!,
    neighbourFloor: neighbourFloor!,
    adult: actor(anna, home!.id, "adult"),
    child: actor(bo, home!.id, "child"),
    neighbour: actor(eve, other!.id, "adult"),
    kitchen: kitchen!,
    bathroom: bathroom!,
    garage: garage!,
  };
}
