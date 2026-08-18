// The one rule behind the staff gate, kept out of the component so it can be
// stated plainly and tested.

export type StaffGate = "open" | "waiting" | "sign-in";

/**
 * What to show for a staff page.
 *
 * "waiting" matters more than it looks: reading a stored session is
 * asynchronous, and showing the sign-in screen in the meantime flashes a
 * demand for credentials at someone who is already signed in.
 */
export function staffGate({
  required,
  signedIn,
  ready,
}: {
  /** Whether this deployment gates staff pages at all. */
  required: boolean;
  signedIn: boolean;
  /** Whether the stored session has been read yet. */
  ready: boolean;
}): StaffGate {
  if (!required) return "open";
  if (signedIn) return "open";
  return ready ? "sign-in" : "waiting";
}
