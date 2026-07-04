# Migrating a stock C project to signal-piu

For someone who found Pebble on the internet, ran `pebble new-project`, wrote
a screen or two of native C (`Window` + `TextLayer` + click handlers), and now
wants fine-grained reactive JSX instead of hand-rolled `text_layer_set_text`
calls.

**Live before/after pair, both device-verified:**

- [`examples/migration/original/`](../examples/migration/original/) — a
  stock 2-screen Pebble C watchapp (counter + SELECT-pushed detail screen,
  BACK pops it), scaffolded with `pebble new-project original --c` (Pebble
  Tool v5.0.39, SDK v4.17 — the CLI scaffold worked as-is, no hand-recreation
  needed). `pebble build` → `build/original.pbw`.
- [`examples/migration/integrated/`](../examples/migration/integrated/) — the
  **same app**, same `uuid`, same `displayName`, ported to signal-piu
  following the steps below. `node node_modules/signal-piu/dist/build.mjs
  --app main --no-check-c` → `build/integrated.pbw`;
  `tsc -p tsconfig.check.json` exits 0.

## What migration actually means

**The UI is rewritten. The project shell is not.** Concretely:

| Stays exactly as it was | Gets replaced |
|---|---|
| `uuid`, `displayName`, other `pebble.*` fields you set | your hand-written `src/c/*.c` UI code |
| `wscript` (still compiles all of `src/c/**/*.c`) | `window_stack_push`/pop screen management |
| `resources`/media, `worker_src` if you have one | `TextLayer`/`Layer` construction and updates |
| any *extra* native C you wrote (sensors, vibration, comms) | manual `text_layer_set_text` calls on every state change |

Your screens become `.tsx` files: JSX describing a Piu scene graph once,
with signals driving updates via a single property assignment instead of you
writing the update code by hand. If you had non-UI native code (an
accelerometer read, a custom protocol over `AppMessage`), it keeps living in
`src/c/` as an extra `.c` file compiled alongside the new `mdbl.c` bootstrap —
see "What stays yours" below.

## Step-by-step

These are the exact steps `examples/migration/integrated/` followed against
`examples/migration/original/`. Read `docs/packaging.md` first if you haven't
— it explains *why* the package is structured this way (source-only tarball,
no prebuilt runtime, etc).

### 1. Flip the project type in `package.json`

Keep your `uuid`, `displayName`, `messageKeys`, `resources` untouched. Add/change:

```jsonc
{
  "pebble": {
    "projectType": "moddable",     // was unset (native C project)
    "enableMultiJS": true,          // new
    "sdkVersion": "3",              // if not already
    "targetPlatforms": ["gabbro"]   // moddable projectType currently
                                     // targets gabbro only — trim your list
  }
}
```

`targetPlatforms` shrinks: the Moddable/XS runtime this package targets is
verified on **gabbro** (and **emery**, see the main README); older platforms
(aplite/basalt/chalk/diorite) aren't part of the moddable path. If you need
those, that's a fork point, not a migration step — this package doesn't cover
them.

### 2. Replace `src/c/` with the mdbl bootstrap (+ your own C, if any)

Copy `templates/app/src/c/mdbl.c` and `templates/app/src/c/.clang-format`
into your `src/c/`. This is the ONLY native file signal-piu needs — it creates
the XS machine that runs your JSX-authored UI:

```c
#include <pebble.h>

int main(void) {
  Window *w = window_create();
  window_stack_push(w, true);

  ModdableCreationRecord cr = {.recordSize = sizeof(cr),
                               .stack = 6144, .slot = 8192, .chunk = 8192,
                               .flags = kModdableCreationFlagLogInstrumentation};
  moddable_createMachine(&cr);

  window_destroy(w);
}
```

**Your old UI `.c` files are deleted** — their `Window`/`TextLayer`/click-handler
code is what gets ported to `.tsx` in step 6. If you had *other* C files with
no UI role (e.g. a sensor poller), keep them in `src/c/` alongside `mdbl.c` —
`wscript`'s `ctx.path.ant_glob('src/c/**/*.c')` compiles every `.c` file it
finds, so nothing needs to change there.

### 3. Add the mod manifest

Copy `templates/app/src/embeddedjs/manifest.base.json` to
`src/embeddedjs/manifest.base.json` — it maps the `runtime/*` device
specifiers your `.tsx` will import (`runtime/jsx-runtime`, `runtime/signals`,
`runtime/flow`) to the preloaded, ROM-resident runtime modules. You don't
edit this by hand for a simple app; `build.mjs` reads it.

### 4. Add the two tsconfigs

Copy `templates/app/tsconfig.json` (device transpile: `src/tsx` →
`src/embeddedjs/app`, `noCheck`) and `templates/app/tsconfig.check.json`
(strict typecheck against the installed package, resolves `runtime/*` via
`paths` into `node_modules/signal-piu`). Both are copy-paste; the only thing
that would change them is a nonstandard `src/tsx` layout.

### 5. Add `src/pkjs/index.js` (phone-side glue)

Copy `templates/app/src/pkjs/index.js`. It wires up
`@moddable/pebbleproxy` so `fetch()` on the watch can proxy through the
phone — needed if any screen ever calls `fetch`; harmless if not.

### 6. Port your screens to `src/tsx/examples/main.tsx`

This is the actual migration work — the rest is scaffolding. For each native
`Window`:

- A `Window` with a couple of `TextLayer`s → a `<Column>` of `<Label>`s.
- `text_layer_set_text(layer, buf)` calls scattered across click handlers →
  ONE reactive binding: `<Label string={() => "Count: " + count()} />`. The
  signal write in the button handler is the only place state changes; the
  label updates itself.
- `window_stack_push`/`window_stack_pop` for a second screen → **`<Navigator>`
  from `runtime/flow`**, not multiple prebuilt trees. This is the one place a
  literal transliteration breaks: building every screen upfront blows the
  32KB arena at boot (see the main README's `multiscreen` entry — it's kept
  specifically as the "doesn't boot" cautionary example). `<Navigator>` holds
  exactly one screen built at a time and disposes the outgoing one on
  push/pop, same asymptotic cost as the original's window stack.

`examples/migration/integrated/src/tsx/examples/main.tsx` in full — a
counter screen (UP/DOWN adjust a signal, SELECT pushes a screen) and a detail
screen (shows the same signal, BACK pops):

```tsx
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Navigator } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

const [count, setCount] = useState(0);
let NAV: any = null;

const counterScreen = () => (
  <Column>
    <Label style={big} string={() => "Count: " + count()} />
    <Label style={dim} string="SELECT for details" />
  </Column>
);

const detailScreen = () => (
  <Column>
    <Label style={big} string="Details" />
    <Label style={dim} string={() => "Count: " + count()} />
  </Column>
);

render(() => (
  <Container left={0} right={0} top={0} bottom={0} focus={true}
    onPressUp={() => setCount((c: number) => c + 1)}
    onPressDown={() => setCount((c: number) => c - 1)}
    onPressSelect={() => { if (NAV) NAV.push(detailScreen); }}
    onPressBack={() => { if (NAV && NAV.canPop()) { NAV.pop(); return true; } return false; }}>
    <Column>
      <Navigator root={(nav: any) => { NAV = nav; return counterScreen(); }} />
    </Column>
  </Container>
), { skin: bg, style: big });
```

Note `<Navigator>` is wrapped in a `<Column>`, never a direct child of the
focused `<Container>` — a dynamically-built direct child crashes the piu
port's focus resolution at mount (measured; see `src/tsx/examples/navdrill.tsx`
in the signal-piu repo for the same pattern with commentary).

### 7. Install the package and build tools

```sh
npm pack --pack-destination .                       # from the signal-piu repo root
cd your-app/
npm install --no-save <path-to>/signal-piu-1.0.0.tgz typescript@6 esbuild@0.28 @moddable/pebbleproxy
```

`typescript`/`esbuild` are YOUR devDependencies (the package brings the
orchestrator, not the compilers) — see `docs/packaging.md` for why the
tarball ships source, not a prebuilt bundle.

**Gotcha:** if your npm install policy runs `allow-scripts` gating (as this
repo's does), esbuild's postinstall (which places its native binary) can be
skipped with only a warning, not a hard failure — check before assuming it's
broken:

```sh
./node_modules/.bin/esbuild --version   # should print a version, not error
```

If it errors, run its postinstall manually: `node node_modules/esbuild/install.js`.

### 8. Build and verify

```sh
node node_modules/signal-piu/dist/build.mjs --app main --no-check-c
./node_modules/.bin/tsc -p tsconfig.check.json
```

The first produces `build/<name>.pbw` (device-installable); the second must
exit 0. `--no-check-c` skips the clang-format gate on `src/c/*.c` — drop the
flag once you've formatted your own C files with the shipped
`.clang-format`. Both commands are exactly what
`examples/migration/integrated/` runs — see its README for the full output.

## What stays yours

A migration doesn't hand your project shell to the package:

- **`wscript` is yours to customize.** It's copied verbatim from the stock
  scaffold and untouched by this migration; if you had custom build steps,
  they still work.
- **`src/c/` can hold your own native code alongside `mdbl.c`.** Only the UI
  code (the part that becomes `.tsx`) is deleted; a sensor poller, a custom
  `AppMessage` handler, anything non-UI stays a `.c` file compiled by the
  same `wscript` glob.
- **Resources/media are yours.** Fonts, images, anything under `resources/`
  in `package.json` — unaffected by this migration.
- **`worker_src/` still works** if you have a background worker — `wscript`
  compiles it exactly as before (`build_worker = os.path.exists('worker_src')`).

## See also

- [`docs/packaging.md`](packaging.md) — what the npm package exports and why
  it ships source, not a prebuilt bundle.
- [`docs/lifecycle.md`](lifecycle.md) — what actually happens at build time,
  boot, and steady state on the watch.
- [`examples/consumer/`](../examples/consumer/) — the reference scaffold this
  guide's steps 2–6 are lifted from (a fresh app, not a migration).

## Coming from something other than the classic C SDK?

The guide above is the CLASSIC C SDK path (the most common). Two other
starting points differ enough to call out:

### From Rocky.js (the old JS watchface API)

Same overall shape as the C path — Rocky's `rocky.on('draw', …)` canvas
callbacks have no equivalent here (signal-piu is retained UI, not immediate-
mode drawing): re-express each draw callback as JSX with reactive bindings
(`<Label string={() => time()} />` instead of redrawing text per frame).
Rocky's `postMessage` phone channel maps to our pkjs/AppMessage setup. The
project shell migration is identical (projectType `"moddable"`, scaffold
files, npm install).

### From a hand-written Moddable/Piu project (projectType already "moddable")

The EASY one — you're already on the same engine and UI framework. Keep your
manifest and project shell; `npm install` signal-piu + tools; adopt the build
(`dist/build.mjs`) or keep yours and add our runtime modules to your manifest.
Crucially, **signal-piu nodes ARE Piu nodes** — `<Label>` returns the same
`Label` instance `new Label(...)` gives you — so you can migrate one screen
at a time: hand-Piu screens and JSX screens coexist in the same app, and your
existing Behaviors/Skins/Styles are used as-is by JSX props.
