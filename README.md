# signal-piu

**Runtime fine-grained reactive UI for Pebble (Alloy / Piu / Moddable XS).**

Solid-style signals + JSX + components — no virtual DOM — rendering to the
Piu scene graph on the new Pebble watches (Time 2 / Round 2). The UI tree is
built **once**; every update is a single Piu property assignment or a minimal
scene-graph edit driven by a signal.

This is (as far as we know) the first **runtime**-reactive UI running on this
hardware. The existing React-like option, [react-pebble], resolves all
reactivity at compile time in Node and emits static Piu code; signal-piu keeps
a live reactive graph on the watch itself, so runtime-dynamic UIs (lists that
change shape, data-driven trees) work without a compile step.

All milestones below were verified on the **gabbro** (Pebble Round 2, 260×260)
emulator, SDK 4.17. Every number in this README is measured from XS
instrumentation logs or on-device bisection — none are estimates.

![combined demo](screenshots/m7-show-odd.png)

## Quick start

```sh
# prerequisites: pebble tool v5 + SDK 4.17, tsc >= 5.5 on PATH
./build.sh                            # tsc (JSX -> src/embeddedjs/app) + pebble build
pebble install --emulator gabbro
```

Demo controls (buttons, because of an emulator touch bug — see gotcha 2):
**select** = counter +1 (toggles the `Show` block) · **up** = add todo ·
**down** = remove first todo.

## What a component looks like

```tsx
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Show, For } from "runtime/flow";

const [count, setCount] = useState(0);
const [todos, setTodos] = useState([1, 2]);

render(() => (
  <Container left={0} right={0} top={0} bottom={0} focus={true}
    onPressSelect={() => setCount(c => c + 1)}>
    <Column>
      <Label string={() => "c" + count()} />           {/* live binding */}
      <Show keepAlive={true} when={() => count() % 2 === 1}
        width={120} height={30}
        fallback={() => <Container width={120} height={30}><Label string="even" /></Container>}>
        {() => <Container width={120} height={30}><Label string="odd!" /></Container>}
      </Show>
      <For each={() => todos()} key={id => id} width={120}>
        {id => <Label string={"t" + id} />}            {/* per-row component */}
      </For>
    </Column>
  </Container>
), { skin: new Skin({ fill: "black" }), style: new Style({ font: "24px Gothic", color: "white" }) });
```

## Three differences from React

1. **Components run once.** There is no re-render. A component function
   executes a single time to build real Piu nodes; updates flow through
   signals into individual property writes.
2. **Read state by calling the getter**: `count()`, not `count`. `useState`
   returns `[getter, setter]`.
3. **Pass reactive values as thunks and don't destructure reactive props.**
   `string={() => "c" + count()}` creates a live binding;
   `string={"c" + count()}` bakes in the value at build time forever.

## Architecture

```
src/tsx/*.tsx            app code (JSX) — transpiled by plain tsc
src/embeddedjs/
  manifest.json          Moddable mod manifest (maps modules, PRELOADS runtime)
  runtime/signals.js     signals + ownership + hooks   (preloaded to flash)
  runtime/jsx-runtime.js JSX factory -> real Piu nodes (preloaded to flash)
  runtime/flow.js        Show / For control flow       (preloaded to flash)
  app/*.js               generated from src/tsx (gitignored)
src/c/mdbl.c             machine creation + instrumentation flag
build.sh                 tsc + pebble build
```

- **`signals.js`** — `signal/effect/computed/untrack` (auto-tracked,
  class-based so per-instance cost is fields only), `createRoot/onCleanup/
  track` ownership, and the `useState/useEffect/useMemo/useRef` hooks layer.
  Three logical units share one file deliberately: each XS module costs
  arena RAM, and two extra module records were the difference between the
  combined demo booting or dying (the ≤5-module budget holds at 3).
- **`jsx-runtime.js`** — `jsx/jsxs/Fragment` + `render`. Host elements are
  recognized by identity against a lazily-built `Set` of the compartment's
  Piu globals (Hardened JS makes `instanceof` unreliable; laziness is
  required because preloaded module bodies run at build time, before Piu
  globals exist). Static props go into the construction dictionary; function
  props become tracked effects through a `setProp` switch (`string`,
  `visible`, `state`, `variant`, `skin`, `style`, `active`); `onTap` maps to
  `active:true` + a shared `HandlerBehavior` whose `onTouchEnded` calls the
  handler with `(content, x, y)`; `onPressSelect/Up/Down/Back` (+`onRelease*`)
  map to Piu button-behavior methods (pair with the `focus` prop — the
  Application self-focuses, so an unfocused container never hears buttons).
  Coordinates are static-only in v1.
- **`flow.js`** — `Show` and keyed `For`. Both host a `Column` sized by
  caller props. `For` reconciles with **minimal Piu ops** (remove departed,
  cursor-walk and insert/move only misplaced nodes); each row lives in its
  own root and is disposed on removal. `Show` has two modes: the default
  rebuilds the active side per toggle (Solid semantics, heap returns to the
  floor — verified), and `keepAlive` builds both sides once and swaps them
  by reference with **zero per-toggle allocation** (both stay live; the
  right default on this platform).

JSX wiring: the Moddable/Alloy build only recognizes `.ts` sources, so the
SDK's own TypeScript integration can't transform `.tsx`. `build.sh` runs
plain `tsc` (`jsx: react-jsx`, `jsxImportSource: "runtime"`, `noCheck`)
into `src/embeddedjs/app/` before `pebble build`. This is the documented
fallback; the `jsxImportSource` route through the SDK doesn't fire.

## Measured memory reality (SDK 4.17)

**The JS arena is 32KB, firmware-fixed, and it is the scarce resource.**

- Every Alloy mod gets an XS machine cloned from the firmware's creation
  config: 32KB static arena → chunk heap 8192B initial, slot heap ~8KB
  growing on demand into the arena (observed growing 8176 → 18416B before
  exhaustion), 6144B stack. Chunk space is whatever the slot heap hasn't
  claimed — long strings and concat garbage compete with your object graph.
- `ModdableCreationRecord` **cannot change this**: the firmware rejects the
  record unless `stack`/`slot`/`chunk` are all nonzero ("invalid
  ModdableCreationRecord"), then **ignores the size fields** — 16K/16K and
  32K/32K requests produce byte-identical instrumentation. Only `.flags`
  (instrumentation logging, debug) takes effect. There is no manifest
  `creation` route for mods either.
- **Piu nodes are comparatively cheap for the arena** (their weight lands in
  the 122KB native app heap); closures, signals, effects, behavior handlers
  and module records are what exhaust the 32KB. Budget accordingly.
- Baselines (slot used, post-GC): empty Piu app ~7.0KB · M3 reactive label
  ~10.9KB · M5 Show demo ~15.3KB · combined M7 demo sits within ~a few
  hundred bytes of the ceiling and only fits with the runtime preloaded.
- Update costs: a ticking reactive label allocates ~464B slots + ~116B chunk
  of transient garbage per update, GC every ~6 ticks, post-GC floor flat
  (90s run). 20 Show toggle cycles: floor oscillates 14.1–16.2KB with no
  upward trend (disposal verified).
- `For` stress (1 row/s ramp): **"fxAbort memory full" at ~10–12 bare-Label
  rows** (~450B slots per row) or ~6–8 skinned Container+Label rows, from a
  baseline app. That is the realistic list ceiling on this firmware.
- **Preload the runtime.** `"preload"` in the mod manifest moves module
  bodies to flash; before preloading, hooks + Show + For could not coexist
  at all. Preloaded modules must not touch Piu globals at module scope
  (they don't exist at build time) — access them lazily. Writable module
  state still works via XS aliasing.

## XS / Piu gotchas actually hit

1. **Every fatal error looks identical**: `fxAbort` (memory full, unhandled
   exception) reboots the whole firmware to "Install an app to continue",
   and the reboot also kills pypkjs's serial session, so `pebble logs`
   dies with it. Attach logs *before* install (the instrumentation flag is
   only honored if a log listener is connected when the machine starts) and
   screendump via the QEMU monitor (`screendump` over the monitor TCP port)
   — it keeps working when everything else is down.
2. **The QEMU gabbro/emery touch peripheral crashes the firmware on any
   real-coordinate touch** — even in a static app with no active contents.
   Degenerate (0,0) touches work, which is what our M4/M5 touch milestones
   exercised (the full Behavior/onTouchEnded machinery is fine). Drive
   emulator UIs with buttons (`pebble emu-button`); `onTap` is for hardware.
3. **Piu-Pebble port: swapping a bare `Label` as a container host's direct
   child crashes the firmware** — rebuilt-fresh on the first swap, or
   re-bound prebuilt on the second. **Container-wrapped subtrees swap and
   re-bind indefinitely.** Wrap both sides of a `Show`.
4. **Setting `visible` on bound content crashes the port** (first write).
   signal-piu's `Show keepAlive` therefore swaps by add/remove-by-reference
   instead of visibility.
5. `pebble install` intermittently stops auto-launching the app — looks
   exactly like an instant crash. Check the launcher menu before debugging.
6. The Application **self-focuses at creation**; button events bubble from
   the focus. Use the `focus` prop (applied post-mount — `focus()` on an
   unbound node is a no-op) or handlers never fire.
7. Fonts are the system set only, resolved as `"<size>px <Family>"` against
   a fixed table (Gothic 14/18/24/28, Bitham 30/42, …). An unknown
   family/size pair throws `font not found`.
8. `console.log` from the mod does not reach `pebble logs` on release
   builds; only XS instrumentation traces do. Render test verdicts on
   screen (our M1 suite does exactly that).
9. The strip list is real: no `Proxy/Reflect/WeakMap/WeakSet/Atomics/
   BigInt/eval/Function/Generator` anywhere, including dependencies — which
   is why the reactive core is hand-rolled closures + `Set`.

## vs react-pebble

|                       | react-pebble                          | signal-piu                                |
|-----------------------|---------------------------------------|-------------------------------------------|
| Reactivity resolved   | compile time (Node, perturbation diff) | **runtime** (signals on the watch)        |
| Runtime-dynamic trees | limited to precompiled variants        | native: `Show`, keyed `For`               |
| Per-update cost       | zero JS on watch                       | one effect run + one Piu property write   |
| Memory ceiling        | generous (static output)               | 32KB JS arena — small trees only          |
| Components            | React semantics                        | run-once, thunk props, getter reads       |
| Best for              | static-layout watchfaces               | data-driven apps within a small footprint |

Honest summary: compile-time resolution buys react-pebble immunity from the
32KB arena; runtime signals buy signal-piu live dynamic structure. On today's
firmware (fixed arena) both are legitimate points on the trade-off curve.

## Milestones & screenshots

| M  | Proof | Screenshot |
|----|-------|------------|
| M0 | scaffold + instrumentation + static Piu label | `m0-static-label.png` |
| M1 | signal core: 10/10 assertions on XS | `m1-signals-pass.png` |
| M2 | JSX → real Piu nodes, round-safe centering | `m2-static-jsx.png` |
| M3 | live binding, flat post-GC floor over 90s | `m3-reactive-ticks.png` |
| M4 | onTap → Behavior, count via injected touches | `m4-tap-counter.png` |
| M5 | Show swap + disposal flat over 20 cycles | `m5-show-on.png` / `m5-show-fallback.png` |
| M6 | keyed For add/reverse/remove + stress ceiling | `m6-for-*.png` / `m6-stress-ceiling.png` |
| M7 | combined demo, 24 interactions, no degradation | `m7-*.png` |

[react-pebble]: https://github.com/eddiemoore/react-pebble
