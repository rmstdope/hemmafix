import { fieldClass } from "./field-class";
import { RoomOptions } from "./room-options";

type Floor = { id: string; name: string };
type Room = { id: string; name: string; floorId: string };

/** The "Rum" select of a task form. The form owns the choice; this owns what is shown of it. */
export function RoomField({
  floors,
  rooms,
  roomId,
  onChange,
}: {
  floors: Floor[];
  rooms: Room[];
  /** The room the form has chosen, "" for none. */
  roomId: string;
  onChange: (roomId: string) => void;
}) {
  // The chosen room may be removed while the form is open, and the live refresh then takes its
  // option away. Left to itself the browser would fall back to the first room; it has to be chosen
  // again instead, and "Välj rum" is required.
  const shownRoomId = rooms.some((r) => r.id === roomId) ? roomId : "";

  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">Rum</span>
      <select
        name="roomId"
        aria-label="Rum"
        value={shownRoomId}
        onChange={(e) => onChange(e.target.value)}
        required
        className={fieldClass}
      >
        <option value="" disabled>
          Välj rum
        </option>
        <RoomOptions floors={floors} rooms={rooms} />
      </select>
    </label>
  );
}
