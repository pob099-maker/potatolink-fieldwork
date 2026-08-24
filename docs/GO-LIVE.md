# Locking Fieldwork down

Fieldwork is deliberately open at the moment. Anyone with the link can see every
trial, and the app's database key — which is compiled into the JavaScript and so
is readable by anyone who looks — can change anything. That is a considered
choice for the testing period: the point is for colleagues, and anything else
poking at it, to reach every corner of the app without being stopped.

This page is the other half of that choice. "We'll secure it before go-live"
only works if somebody wrote down what *it* is, in order. This is that list.

---

## What is open today

| | Today | After lock-down |
|---|---|---|
| Seeing trials, sites, results | Anyone with the link | Anyone with the link *(unchanged)* |
| Changing trial setup | Anyone with the link | Signed-in staff only |
| Recording an entry | Anyone with the link + the access code | *(unchanged)* |
| Creating an account | Anyone | Administrator only |

Two things are worth being precise about.

**The access code is not security.** `VITE_ACCESS_CODE` gates the entry form,
but like every `VITE_` value it is compiled into the bundle and can be read out
of it by anyone who opens the page source. It stops a passer-by filling in a
form by accident. It stops nothing else, and it is not part of the lock-down.

The current value lives in the repository variable of that name, and in
`.env.local` for local work. It is deliberately not written down here: this file
is in a public repository, and a value pasted into documentation goes stale the
moment step 5 changes it while still advertising what it used to be.

**Reads stay open even after lock-down.** The entry form has to load its trial,
site, practice and questions before anyone has signed in to anything. Closing
reads would mean giving every grower an account, which is how you end up with no
data.

---

## The order matters

Each step is safe on its own. Done out of order, step 3 locks the whole team out
of an app they are using.

### 1. Close sign-ups

Supabase dashboard → **Authentication** → **Sign In / Providers** → Email →
turn **Allow new users to sign up** off.

Until this is off, step 3 achieves nothing: anyone can create themselves an
account and get exactly the access it was meant to restrict, except now behind a
login screen that makes it look protected. That is worse than leaving it open,
because it invites trust it hasn't earned.

### 2. Create the staff accounts by hand

Supabase dashboard → **Authentication** → **Users** → **Add user** → *Create new
user*, with **Auto Confirm User** ticked. One per person who needs to change a
trial.

Growers and contractors do **not** need accounts. They record through a link.

Do this before step 3, and have at least one person actually sign in to the live
site successfully. That sign-in is the proof that step 3 is safe.

### 3. Require staff sign-in in the app

Set `VITE_REQUIRE_STAFF_SIGNIN=true` and rebuild. On GitHub Pages this is a
repository secret and a redeploy; locally it is `.env.local`.

This puts the sign-in screen in front of every page that changes a trial. It is
a *browser-side* guard only — it stops the pages being used, not the database
being written to. Step 4 is what actually closes that.

### 4. Apply the database rules

Run [`supabase/migrations/0013_staff_write_access.sql`](../supabase/migrations/0013_staff_write_access.sql)
in the Supabase SQL Editor.

This is the step that matters. It makes trial *structure* — trials, sites,
practices, forms, economics — writable only by a signed-in account, so reading
the key out of the bundle no longer buys anyone the ability to change a trial.
Recording data stays open on purpose, because that is the paddock workflow.

Read the comment at the top of that file before running it; it explains what it
deliberately leaves alone.

### 5. Change the access code

Set the `VITE_ACCESS_CODE` repository variable to a new value and redeploy.
Changing it re-locks every device that had the old one, so re-send it with the
entry links. Do not commit the new value anywhere — the repository is public.

### 6. Check it actually took

Do not trust the dashboard's word for any of it.

- Sign out, open the app, and confirm trial setup asks you to sign in.
- With the app signed out, confirm a write is refused. The quickest check is
  the Supabase **API Docs** page, or a `curl` with the anon key against
  `/rest/v1/trials`; it should come back `401` or `42501`, not `200`.
- Confirm an entry link still works end to end, on a phone, with the new code.
- Create a throwaway email at the sign-up screen and confirm it is refused.

### 7. Remove the demonstration data

The three example trials (CropVision, HarvestEye, Nitrogen) are marked
**Example** in the app. Remove each from its trial page once real trials exist.
The "these are examples" notice on the dashboard disappears by itself when the
last one goes.

---

## What this does *not* do

Lock-down separates staff from the public. It does **not** separate one team
from another: every signed-in person still sees and can change every trial.

Per-team visibility would mean trials belonging to a team, membership recorded
somewhere, and row-level rules keyed on it. That is a real piece of work, not a
setting. Worth deciding whether it is needed *before* several teams start
entering data, because retrofitting ownership onto existing rows is the harder
version of the same job.

---

## While it is still open

One boundary worth keeping, because it is the only thing that is hard to undo:

**Do not put real grower contact details in until lock-down is done.** Trial
data, site names and invented costs are recoverable if something goes wrong.
Somebody's name, phone number and farm are not. The seeded contacts are
fictional; keep them that way until step 6 passes.
