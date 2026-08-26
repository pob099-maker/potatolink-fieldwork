# Typefaces

**Cabinet Grotesk** (display) and **Satoshi** (body), from
[Fontshare](https://www.fontshare.com) by the Indian Type Foundry, under the
ITF Free Font Licence — free for personal and commercial use, including
self-hosting on the web. Only the `.woff2` files are kept; every browser that
can run this app supports woff2, so the `.woff` and `.ttf` fallbacks Fontshare
also serves are dead weight.

Six files, 144 KB total.

## Why they are here and not on a CDN

Two reasons, and the second is the one that bites.

**An offline app cannot fetch its own typography.** Fieldwork is meant to open
in a paddock with no signal. A font requested over the network is a font that is
not there when it matters — and because the headings carried uppercase and
letter-spacing tuned for Cabinet Grotesk, falling back to `system-ui` did not
just change the face, it changed the proportions the spacing was set for.

**The CDN was returning the wrong font anyway.** `index.html` asked Fontshare
for two families in one URL:

```
https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&f[]=cabinet-grotesk@500,700,800
```

That request returns **Satoshi and General Sans** — not Cabinet Grotesk. So the
display face never loaded once, every heading in the app was actually Satoshi,
and three weights of a family the app never uses were downloaded on every visit.
Asking for one family per URL returns the right font, which is how these files
were fetched.

## Refreshing them

Request each family on its own, take the `woff2` URL for each weight, and save
it as `<Family>-<weight>.woff2`. Then check the headings really did change — the
whole point of this note is that a font can fail to load without anything
looking broken.
