# Turning on staff sign-in

The code is in and shipped, but the gate is **switched off** in the deployed
build. This page is the four steps to switch it on, in the order that avoids
locking your own team out.

## Why it ships off

Two things have to be true before a sign-in can succeed, and neither can be
done from the codebase:

1. Supabase has to be told which addresses a sign-in link may return to. That
   list is currently empty, so a link would bounce to the wrong place.
2. Someone has to receive an actual email and click an actual link.

Turning the gate on before both are true would leave every staff page showing a
sign-in screen that cannot be completed — on an app your colleagues are already
using. So it ships off, and you turn it on once you have seen it work.

## What the gate covers

| Who | How they get in | Changes here? |
| --- | --- | --- |
| Growers recording data | Their entry link plus the shared access code | No — unchanged |
| Staff running trials | Emailed sign-in link, no password | Yes — this is new |

Recording data deliberately does **not** need an account. Requiring growers to
sign up is how you end up with no data. What sign-in protects is everything
that changes what a trial *is*: its sites, practices, forms and economics.

## The four steps

### 1. Tell Supabase where a sign-in link may land

In the Supabase dashboard, **Authentication → URL Configuration**:

- **Site URL**: `https://pob099-maker.github.io/potatolink-fieldwork/`
- **Redirect URLs** — add both:
  - `https://pob099-maker.github.io/potatolink-fieldwork/`
  - `http://localhost:5180/` (so sign-in works while developing)

Email auth is already enabled, so nothing else needs changing there.

### 2. Prove a sign-in actually works

Run the app locally with the gate on:

```bash
VITE_REQUIRE_STAFF_SIGNIN=true npm run dev
```

Enter your email, click the link in the message, and confirm you land back in
the app signed in — your address appears in the header. **Do not go further
until this works.**

### 3. Turn the gate on for the deployed site

In the GitHub repository, add a repository variable
`VITE_REQUIRE_STAFF_SIGNIN` set to `true`, or delete the fallback line from
`.github/workflows/deploy.yml`. The next deploy has the gate live.

At this point staff pages need a sign-in, but the database itself still accepts
writes from anyone holding the anon key. That is the last step.

### 4. Close the database

Apply `supabase/migrations/0013_staff_write_access.sql` in the SQL editor. It
makes the trial structure writable only by a signed-in account, while leaving
entries, corrections and reads open to the anon key — because that is the
grower's paddock workflow and it has to keep working with nothing but a link
and a code.

Run this one **last**. It is the step that cannot be undone by a redeploy: if
you apply it while nobody can sign in, nobody can set up a trial.

## Getting back in

If sign-in ever fails in the field, set `VITE_REQUIRE_STAFF_SIGNIN` to `false`
and redeploy. That reopens the staff pages in the app immediately. Note that it
does **not** undo step 4 — with migration 0013 applied, writes to trial
structure still need a signed-in account. To fully reverse, restore the anon
policies that 0013 dropped.
