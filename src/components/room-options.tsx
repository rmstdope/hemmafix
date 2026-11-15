import { floorLabel } from "@/lib/floors";

type Floor = { id: string; name: string };
type Room = { id: string; name: string; floorId: string };

/**
 * `<option>`s for choosing a room: grouped by floor (top floor first) when the home has
 * several, a flat list otherwise. `wholeFloor` adds a "Hela Plan 2" choice to each group.
 */
export function RoomOptions({
  floors,
  rooms,
  roomValue = (id) => id,
  wholeFloor,
}: {
  floors: Floor[];
  rooms: Room[];
  roomValue?: (roomId: string) => string;
  wholeFloor?: (floorId: string) => string;
}) {
  if (floors.length <= 1) {
    return rooms.map((r) => (
      <option key={r.id} value={roomValue(r.id)}>
        {r.name}
      </option>
    ));
  }
  return floors.map((f) => (
    <optgroup key={f.id} label={floorLabel(f.name)}>
      {wholeFloor && <option value={wholeFloor(f.id)}>Hela {floorLabel(f.name).replace(/^Plan/, "plan")}</option>}
      {rooms
        .filter((r) => r.floorId === f.id)
        .map((r) => (
          // The floor in the text too: a closed select shows only the chosen option's text.
          <option key={r.id} value={roomValue(r.id)}>
            {`${r.name} (${floorLabel(f.name)})`}
          </option>
        ))}
    </optgroup>
  ));
}
