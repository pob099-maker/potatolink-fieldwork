# Listening to Fieldwork

A screen reader pass, written to be run by somebody who has never used one.

Thirty to forty minutes. You are not auditing the code — automated checks
already confirm the markup is *present*. You are checking whether the app can
be **operated by ear**, which is a different question and the one that finds
real problems. What breaks is sequence, timing and focus, and none of those
exist in a static snapshot of a page.

Anything that leaves you unsure what just happened is a finding, even if you
cannot say why. That instinct is the whole point of doing this by ear.

---

## Turning one on

**iPhone** — the device that matters most, because it is the one in a paddock.
Settings → Accessibility → VoiceOver. Set Settings → Accessibility →
Accessibility Shortcut → VoiceOver first, so triple-clicking the side button
turns it on and off; you will want that.

- Swipe right: next item
- Swipe left: previous item
- Double-tap: activate what is selected
- Two-finger swipe down: read from here

**Android** — at least as important as the iPhone for growers, and worth doing
as well rather than instead: TalkBack and VoiceOver disagree often enough that
passing on one does not mean passing on the other.

Settings → Accessibility → TalkBack. Turn the shortcut on first — holding both
volume keys for three seconds toggles it, and you will want that.

- Swipe right: next item
- Swipe left: previous item
- Double-tap: activate what is selected
- Two-finger swipe down: read from here

**Windows** — NVDA, free from nvaccess.org.

- `Tab`: next control
- `H`: next heading
- `Insert + F7`: list every heading and link on the page
- `Ctrl`: stop talking (learn this one first)

**A warning worth having.** With VoiceOver or TalkBack on, a single tap no
longer presses things — it selects them, and you double-tap to press. The first minute is
disorientating for everybody. That is normal and it is not the app's fault.

---

## The route to test

The grower path, because it is the one somebody might genuinely need by ear,
and the one used standing in a paddock rather than sitting at a desk.

Open an entry link on the phone. Then, with the screen off or your eyes shut:

1. Pick a site
2. Pick a practice
3. **Leave a required field blank and try to continue**
4. Fill it in properly and move through every step
5. Take a photo
6. Save

Doing it with your eyes shut is not theatre. You will discover you were
navigating by memory of the layout the moment you stop being able to.

---

## What to listen for

### Moving between steps

Press Next. You should hear **"Step 2 of 3"** and then the new fields.

If you hear the step number but land nowhere — still on the Next button, with
the new fields somewhere you have to go hunting for — that is the defect this
document was written after fixing. Check it stayed fixed.

### The error on a blank required field

You should hear **which field** and **what is wrong** — "Tonnes handled,
required" or similar. Not just "invalid", and not silence.

Then: can you get *to* the field it is complaining about? An error you can hear
but not reach is not much better than no error.

### Required fields

You should hear "required" as part of the field. If you hear "star" or
"asterisk", something has regressed — the asterisk is meant to be hidden from
speech and the state carried properly.

### The sync line

The green "Connected" line and the red refusal line are different things said
in different ways. The red one should **interrupt** — it is the one that means
your entry did not go anywhere.

To hear it, you would need a genuine sync failure, so this one is fair to skip
unless you happen to hit one.

### The photo and video buttons

Should say what they do — "Take or choose a photo, button". If you hear only
"button", the accessible name is missing.

### Anything read as nonsense

`t/ha`, `m²`, `°C`. Some of these will be read oddly by any screen reader and
that is not always worth fixing — but note what you hear. A yield unit
announced as gibberish in a field where somebody is entering a number matters
more than one in a report.

### The storage line in Settings

Settings says whether the browser has promised to keep entries on this device.
It is the one place the app admits to a risk it cannot otherwise show, so check
it reads sensibly rather than as jargon.

### Where you are

At any point, could you say which trial and which site you are recording
against? The context is pre-filled and shown as pills near the top. If it is
never spoken, somebody working by ear has no way to catch the case where they
opened the wrong link.

---

## What to write down

For each thing that felt wrong:

- Which screen
- What you did
- What you heard
- What you expected to hear

That is enough. "Pressed Next on the CropVision form, heard 'Step 2 of 3', then
nothing — had to swipe six times to find the photo button" is a better bug
report than any severity rating.

---

## What is already known good

Checked in code, so you do not need to spend time on it:

- Every image has alt text; every button has an accessible name
- Field errors are wired properly — `aria-invalid` on the input,
  `aria-describedby` pointing at the message, `role="alert"` so it is announced
- Required state is carried as `required`, with the asterisk hidden from speech
- The focus ring is restored after Tailwind's reset removes it, and appears for
  keyboard and assistive navigation but not on a mouse click
- A skip link, one `<h1>` per page, semantic elements throughout
- Focus moves to the new step when you press Next, and is *not* stolen on first
  load — so the top of the page is still the first thing you hear

None of that proves the app is usable. It proves the plumbing is connected,
which is why the listening still has to happen.
