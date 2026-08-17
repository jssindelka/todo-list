# Todo

A quiet to-do list. Ref 1's editorial-mono layout in Nothing's visual language:
strict monochrome, dot-matrix display type, technical mono UI, hairline rules,
one restrained red for destructive actions only.

No build step, no npm, no dependencies. `index.html` is entirely self-contained —
fonts included — and works with no network at all.

---

## Using it

| | |
|---|---|
| Add a task | `+` button, or press `N` |
| Save | `Enter` in the title field, `⌘/Ctrl + Enter` in notes |
| Complete | tap the circle |
| Notes, edit, delete | tap the task to expand it |
| **Reorder, desktop** | **press and drag a task** |
| **Reorder, phone** | **hold a task briefly, then drag** |
| **Reorder, keyboard** | **focus a task, `Alt + ↑` / `Alt + ↓`** |
| Filter | All / Personal / Work |
| Theme, name, backup | the globe, top right |
| Close anything | `Esc` |

Reordering uses Pointer Events rather than HTML5 drag-and-drop, which does not
exist on iOS Safari. On phone the long-press is deliberate: without it, every
attempt to scroll the list would pick a task up instead. Completed tasks stay
below open ones — you can reorder within each group, but not across them.

The array order of `state.tasks` *is* the order. Dragging splices that array, so
there is no separate index to keep in sync and nothing to migrate.

Deleting a task and clearing completed both offer **Undo** for a few seconds.

## Where your tasks live

In this browser's `localStorage`, on this device. Nothing is sent anywhere and
there is no account.

**This means your phone and your laptop keep separate lists.** That was a
deliberate v1 decision — see *Adding sync* below. Until then, `Export backup` in
the menu writes a JSON file you can move across manually, and `Import backup`
reads it in.

---

## Deploying to GitHub Pages

The repo is already initialised and committed. You need to create the remote and
push — I can't do that part, it needs your account.

**1.** Create a new **public** repository on GitHub. Don't add a README, licence
or `.gitignore` — the repo already has commits. (Pages needs public unless you're
on a paid plan.)

**2.** Point this folder at it and push:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git && git branch -M main && git push -u origin main
```

**3.** In the repository on GitHub: **Settings → Pages → Build and deployment →
Source: Deploy from a branch**, branch `main`, folder `/ (root)`. Save.

**4.** Wait a minute, then open `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

**5.** On your iPhone, open that URL in **Safari** (not Chrome — only Safari can
install to the home screen on iOS), then **Share → Add to Home Screen**. It gets
the app icon, launches without browser chrome, and works offline.

### After you change anything

Bump `CACHE` in `sw.js` (`todo-v1` → `todo-v2`, and so on) before you push.
Otherwise the service worker keeps serving the old copy from cache and your
change won't appear. This is the single most likely thing to confuse you later.

---

## Editing the app

Edit **`src/app.html`**, then regenerate the single-file build:

```bash
python3 build.py src/app.html index.html
```

`build.py` only inlines the base64 fonts from `src/fonts/` into `index.html`. The
build step is for convenience, not a requirement — `index.html` is plain HTML and
you can edit it directly if you prefer, though the font blobs make it unwieldy.

To preview locally (a plain `file://` open won't register a service worker):

```bash
python3 .claude/serve.py 4173
```

Then visit `http://localhost:4173`.

### Layout of the repo

```
index.html              the whole app — this is the deliverable
sw.js                   offline caching
manifest.webmanifest    PWA metadata
icon*.png / icon.svg    app icons
src/app.html            editable source (fonts as @FONT_*@ tokens)
src/fonts/*.b64         embedded font payloads
build.py                inlines fonts -> index.html
style-tile.html         the design spec: type scale, states, both themes
reference/              the original design references
```

---

## Adding sync

Every read and write goes through the `Store` object at the top of the script,
which currently has one adapter backed by `localStorage`. A synced version means
writing a second adapter with the same `read` / `write` pair and calling
`Store.use(remoteAdapter)` — nothing above that line changes.

The intended approach: a free Supabase project, one table, and a secret key in
the URL fragment that both devices share. No login screen, no passwords. Roughly
an hour's work, and it needs you to create the Supabase project first.

The persisted shape is already versioned (`version: 1`) and passed through
`Store.migrate()` on every read, so changing it later is a migration rather than
a guess.

---

## Accessibility

Both themes were measured, not eyeballed. Every piece of text clears WCAG AA
(4.5:1); the checkbox stroke and chevron clear the 3:1 bar for non-text UI. The
lowest value in the app is the chevron at 3.34:1 in light. Full keyboard support,
labelled controls, visible focus rings, and `prefers-reduced-motion` respected.

Every interactive control is at least 44×44px, Apple's minimum touch target —
including the checkbox, which keeps its 23px circle but carries a 44px hit area
via a transparent pseudo-element. Row padding sits on the button rather than its
wrapper so the full height of a task row is tappable, not just the text.

## Known trade-offs

- **Uppercase task titles** are faithful to ref 1 but give you roughly 19
  characters per line on a phone, so a long task wraps to two lines. Wrapping is
  clean and nothing overflows; switching to sentence case is a one-line change to
  `.ttl`.
- **Doto** is a display face. It's used for the greeting only — it becomes
  illegible below about 20px.
- **No sync**, as above.
