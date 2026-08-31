# Knowing who has asked to get in

Once sign-ups are closed, somebody with the link who types their email at the
sign-in screen is refused — and that used to be the whole of it. No route
forward, and nobody ever learned they had tried. The only way in was already
knowing somebody.

This is the route, and the two ways you find out about it.

---

## What a person sees

At the staff sign-in screen there is now **"No account yet? Ask for access"**.
It takes a name, the email they would sign in with, and optionally why — which
is the most useful part, because an address on its own cannot say who somebody
is.

It is honest about what it is: *"Nothing has changed yet — an account has to be
created by whoever runs the project."* An interface that says "request sent"
and implies access is coming has made a promise on somebody else's behalf.

Growers are unaffected. Recording still needs no account at all, and the form
says so, because the most likely person to arrive here by mistake is somebody
who followed a recording link to the wrong place.

---

## How you find out

### 1. On the dashboard — works with no setup

When somebody is waiting, a panel sits above the trials: *"2 people have asked
for access"*, with the name, the address, what they wrote, and how long they
have been waiting.

It only appears when there is something in it. A permanent empty panel is a
thing you learn to ignore, and the one time it matters it will have been
ignored.

Reliable, but passive — you see it when you open the app, which is not
necessarily when somebody asks.

### 2. By email — needs setting up once

A database webhook fires an Edge Function on every new request, and that sends
you an email. The function is in
`supabase/functions/notify-access-request/index.ts`.

**Nothing about it is committed with a secret in it.** The recipients and the
API key are Supabase secrets. This repository is public, so an address
hardcoded in the function would be published.

#### Setting it up

**a. Get a mail sender.** [Resend](https://resend.com) has a free tier — 100
emails a day, no card. Sign up and make an API key. You can send from their
`onboarding@resend.dev` immediately; sending from an `agaims.com.au` address
means verifying the domain, which is worth doing later, not now.

**b. Set the secrets.** In the Supabase dashboard under **Edge Functions →
Secrets**, or with the CLI:

```bash
supabase secrets set RESEND_API_KEY=re_your_key_here NOTIFY_EMAILS=pob099@gmail.com,peter.obrien@agaims.com.au WEBHOOK_SECRET=pick-a-long-random-string
```

`NOTIFY_EMAILS` is comma-separated, so both addresses get it.

**c. Deploy the function.**

```bash
supabase functions deploy notify-access-request --no-verify-jwt
```

**d. Point a webhook at it.** Dashboard → **Database → Webhooks → Create**:

- Table: `access_requests`
- Events: **Insert** only
- Type: Supabase Edge Functions → `notify-access-request`
- Add an HTTP header: `webhook_secret` with the same long random string

#### Why the shared secret

A function deployed with `--no-verify-jwt` is reachable by anyone who finds the
URL. Without the check it would be an open relay for sending mail to your own
inbox. The function refuses anything without the matching header.

---

## Answering a request

The dashboard panel has **Mark approved** and **Decline**.

**Marking approved does not create the account, and cannot.** The account is
made by hand in Supabase under **Authentication → Users → Add user**, with
*Auto Confirm User* ticked. The app saying "approved" and stopping there would
be the interface claiming something it has not done, so it says as much on the
panel.

The order that matters:

1. Create the account in Supabase
2. Tell them — the email address in the panel is a `mailto:` link
3. Then mark the request approved

Marking it first is harmless but leaves a queue that says somebody has been let
in when they have not.

---

## What this does and does not tell you

It tells you when somebody **asks** for staff access.

It does not tell you who has merely *opened* the app. Reads are open by design
— the recording form has to load its trial before anybody has signed in to
anything, and closing that would mean giving every grower an account, which is
how you end up with no data. See `docs/GO-LIVE.md`.

So: you learn about anybody who wants to get past the sign-in screen. You do
not get a log of every visitor, and this is not an analytics tool.
