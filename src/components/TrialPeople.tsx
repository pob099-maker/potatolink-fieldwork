// Who is involved in this trial.
//
// Most of this panel is not editable and should not be: a farmer whose paddock
// holds a site is involved because the site is theirs, and offering a button to
// "remove" them would be a control that appears to work and changes nothing —
// or worse, one that quietly deletes a paddock to satisfy a list. Site owners
// are shown as what they are, with the site named, and the way to change them
// is to change the site.
//
// What is editable is everybody else: the agronomist who co-operates, the
// project officer, the researcher who reads results and records nothing. None
// of them own a paddock, so nothing else in the app knows they exist.
//
// Nothing here is a permission today. Reads are open for the testing period,
// so this records involvement and scopes what the app *offers* somebody; it
// does not stop anybody reading anything, and the panel says so rather than
// implying a privacy the deployment has not got yet.

import { useState } from "react";
import { useContacts, useSites, useTrialMembers } from "../hooks/useCollections";
import { addTrialMember, removeTrialMember } from "../services/store";
import { involvementFor, type InvolvementReason } from "../services/involvement";
import { Card, CardTitle, ErrorState } from "./ui";
import type { Contact, TrialMember } from "../types";

const ROLE_LABELS: Record<TrialMember["role"], string> = {
  owner: "Answers for the trial",
  collaborator: "Takes part",
  viewer: "Reads results",
};

const REASON_LABELS: Record<InvolvementReason, string> = {
  site: "has a paddock in this trial",
  member: "named on this trial",
};

const inputClass = "min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

export function TrialPeople({ trialId }: { trialId: string }) {
  const contacts = useContacts();
  const sites = useSites();
  const members = useTrialMembers();

  const [adding, setAdding] = useState(false);
  const [contactId, setContactId] = useState("");
  const [role, setRole] = useState<TrialMember["role"]>("collaborator");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allSites = sites.data ?? [];
  const allMembers = members.data ?? [];
  const involved = involvementFor(trialId, allSites, allMembers);

  const nameOf = (id: string): Contact | undefined =>
    contacts.data?.find((contact) => contact.contactId === id);

  const siteNamesFor = (id: string): string[] =>
    allSites
      .filter((site) => site.trialId === trialId && site.contactId === id)
      .map((site) => site.location);

  // Somebody already involved is still offerable — naming them explicitly is
  // how you record that they answer for the trial rather than just farm it.
  const addable = (contacts.data ?? []).filter(
    (contact) =>
      !allMembers.some(
        (member) => member.trialId === trialId && member.contactId === contact.contactId,
      ),
  );

  async function add(): Promise<void> {
    if (!contactId) return;
    setBusy(true);
    setError(null);
    const result = await addTrialMember({ trialId, contactId, role });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setContactId("");
    setRole("collaborator");
    setAdding(false);
  }

  return (
    <Card>
      <CardTitle>Who is involved</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        Everyone with a paddock in this trial is here already. Add anyone else who takes
        part or reads the results.
      </p>

      {involved.length === 0 ? (
        <p className="mt-3 rounded-lg bg-sunk p-3 text-sm text-ink-soft">
          Nobody yet. A trial gets its first person when a site is added, because a site
          names the paddock it is in.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {involved.map((entry) => {
            const contact = nameOf(entry.contactId);
            const paddocks = siteNamesFor(entry.contactId);
            const memberRow = allMembers.find(
              (member) => member.trialId === trialId && member.contactId === entry.contactId,
            );
            return (
              <li key={entry.contactId} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5">
                <span className="font-medium">{contact?.name ?? "Someone not in contacts"}</span>
                {contact?.business ? (
                  <span className="text-sm text-ink-soft">{contact.business}</span>
                ) : null}
                {entry.role ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-meta font-medium text-primary dark:bg-primary-soft/20 dark:text-primary-soft">
                    {ROLE_LABELS[entry.role]}
                  </span>
                ) : null}
                <span className="w-full text-sm text-ink-faint">
                  {entry.reasons
                    .map((reason) =>
                      reason === "site" && paddocks.length > 0
                        ? `has ${paddocks.join(" and ")} in this trial`
                        : REASON_LABELS[reason],
                    )
                    .join(" · ")}
                </span>
                {/* Only the explicit row can be removed. Somebody here because
                    a paddock is theirs stays until the paddock does. */}
                {memberRow ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeTrialMember(memberRow.memberId)}
                    aria-label={`Remove ${contact?.name ?? "this person"} from the trial`}
                    className="ml-auto min-h-11 px-2 py-2.5 text-sm font-medium text-danger underline"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {error ? <ErrorState message={error} /> : null}

      {adding ? (
        <div className="mt-3 rounded-lg border border-line p-3">
          <label className="block text-sm font-medium">
            Who
            <select
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
              className={inputClass}
            >
              <option value="">Choose someone…</option>
              {addable.map((contact) => (
                <option key={contact.contactId} value={contact.contactId}>
                  {contact.name}
                  {contact.business ? ` — ${contact.business}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-medium">
            What they do on it
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as TrialMember["role"])}
              className={inputClass}
            >
              {(Object.keys(ROLE_LABELS) as TrialMember["role"][]).map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !contactId}
              onClick={() => void add()}
              className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add them"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
            >
              Cancel
            </button>
          </div>
          {addable.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              Everybody in contacts is already named on this trial.
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 min-h-11 w-full rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft"
        >
          + Add someone
        </button>
      )}

      {/* Said plainly, because the gap between what this records and what it
          enforces is exactly the thing somebody would otherwise assume wrong. */}
      <p className="mt-3 text-sm text-ink-faint">
        This records who is involved. It does not yet restrict what anybody can open —
        every trial is still readable by anyone with the link while the app is in testing.
      </p>
    </Card>
  );
}
