// Tell somebody a request has arrived.
//
// The queue on the dashboard is reliable but passive: it is only seen when
// somebody opens the app, and the whole point of this is knowing that a person
// explored it — which is exactly the moment nobody is looking.
//
// So a database webhook fires this on every insert into access_requests, and
// this sends an email. It runs on Supabase rather than in the browser because
// a mail provider's key cannot live in a bundle that anybody can read.
//
// Nothing here is committed with a secret in it. The recipients and the API
// key are Supabase secrets, set once with `supabase secrets set`, and this
// repository is public — an address hardcoded here would be published.
//
// Deploy:
//   supabase functions deploy notify-access-request --no-verify-jwt
//
// Then in the dashboard: Database → Webhooks → new webhook on
// access_requests, INSERT only, type "Supabase Edge Functions", pointed at
// this function, with a header WEBHOOK_SECRET matching the secret below.

interface RequestRow {
  request_id: string;
  name: string;
  email: string;
  reason: string;
  requested_at: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

Deno.serve(async (request: Request): Promise<Response> => {
  // A function deployed with --no-verify-jwt is reachable by anyone who finds
  // the URL, so it checks a shared secret before doing anything. Without this
  // it would be an open relay for sending mail to the project's own inbox.
  const expected = Deno.env.get("WEBHOOK_SECRET");
  if (!expected || request.headers.get("webhook_secret") !== expected) {
    return new Response("no", { status: 401 });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = (Deno.env.get("NOTIFY_EMAILS") ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  const from = Deno.env.get("NOTIFY_FROM") ?? "Fieldwork <onboarding@resend.dev>";

  if (!apiKey || to.length === 0) {
    // Loud in the logs rather than silently doing nothing: a notifier that
    // quietly stops is worse than one that was never set up, because the queue
    // is still filling and nobody knows to look at it.
    console.error("notify-access-request: RESEND_API_KEY or NOTIFY_EMAILS is not set");
    return new Response("not configured", { status: 500 });
  }

  const body = (await request.json()) as { record?: RequestRow };
  const row = body.record;
  if (!row) return new Response("no record", { status: 400 });

  const reason = row.reason?.trim()
    ? `<p style="margin:0 0 12px">“${escapeHtml(row.reason)}”</p>`
    : `<p style="margin:0 0 12px;color:#666">No reason given.</p>`;

  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      // The name in the subject, so the inbox answers the question without
      // being opened.
      subject: `Fieldwork: ${row.name} asked for access`,
      html: [
        `<p style="margin:0 0 12px"><strong>${escapeHtml(row.name)}</strong> has asked for access to Fieldwork.</p>`,
        `<p style="margin:0 0 12px"><a href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a></p>`,
        reason,
        `<p style="margin:0;color:#666;font-size:13px">Nothing has been granted. Create the account in Supabase under Authentication → Users, then mark the request approved on the Fieldwork dashboard.</p>`,
      ].join(""),
    }),
  });

  if (!sent.ok) {
    const detail = await sent.text();
    console.error("notify-access-request: send failed", sent.status, detail);
    return new Response("send failed", { status: 502 });
  }

  return new Response("ok");
});
