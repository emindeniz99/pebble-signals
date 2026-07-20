# signal-piu — component catalog

Every catalog component, its one-liner, a usage snippet, and a device
screenshot on **both** watch shapes — gabbro (round, 260×260) and emery
(rectangular, 200×228). All shots are real `pebble screenshot` captures from
the component's example app (`pnpm run dev -- --app <name>`).

Everything here is **opt-in and zero-cost**: a component lives in its own
`runtime/<name>` module and an app that never imports it never ships it (the
manifest prunes to the import closure). The whole catalog is 100%-covered by the
Node suites and each entry below was verified on-device (Rule 2).

> **Round vs rect.** Every component renders the same on both shapes except
> where geometry matters: a top strip (`StatusBar`) sits under the bezel on a
> round watch — wrap it in a `RoundSafeArea`, or use the rectangular layout.

---

## Drawing

### Canvas + draw primitives — `runtime/draw`

Immediate-mode drawing on ONE Piu Port. The Piu Port exposes no native
circle/line/arc (measured — `drawprobe`), so every shape is JS-rasterized into
`fillColor` scanline spans. `paint`'s signal reads auto-track, so the canvas
repaints reactively for free. Primitives: `fillRect`, `fillCircle`,
`strokeCircle`, `line`, `fillRoundRect`, `strokeRect`, `arc`, `text`.

```tsx
import { Canvas } from "runtime/draw";
<Canvas width={150} height={110} fill="black" paint={(g) => {
  g.fillRoundRect(6, 4, 60, 32, 8, "#1560bd");
  g.line(6, 48, 144, 48, 2, "#00a000");
  g.fillCircle(40, 84, 20, "#e01818");
  g.arc(110, 84, 22, 135, 360, 6, "#00d0ff");
}} />
```

| round (gabbro) | rect (emery) |
|---|---|
| ![draw round](../screenshots/draw-gabbro.png) | ![draw rect](../screenshots/draw-emery.png) |

---

## Widgets

### Badge — `runtime/badge`

A reactive count badge: a filled disc with a centered number. Composes `Canvas`,
so `count` (a thunk or number) repaints for free.

```tsx
import { Badge } from "runtime/badge";
<Badge count={() => unread()} size={64} color="#e01818" />
```

| round | rect |
|---|---|
| ![badge round](../screenshots/badge-gabbro.png) | ![badge rect](../screenshots/badge-emery.png) |

### ProgressBar — `runtime/progressbar`

A horizontal progress bar (rounded track + fill), `value` in `0..1`.

```tsx
import { ProgressBar } from "runtime/progressbar";
<ProgressBar value={() => pct()} width={180} height={16} />
```

| round | rect |
|---|---|
| ![progressbar round](../screenshots/progressbar-gabbro.png) | ![progressbar rect](../screenshots/progressbar-emery.png) |

### Slider — `runtime/slider`

A track + thumb that displays a value in `[min,max]` (the app drives it).

```tsx
import { Slider } from "runtime/slider";
<Slider value={() => v()} min={0} max={1} width={180} />
```

| round | rect |
|---|---|
| ![slider round](../screenshots/slider-gabbro.png) | ![slider rect](../screenshots/slider-emery.png) |

### Toggle — `runtime/toggle`

An on/off pill with a sliding knob.

```tsx
import { Toggle } from "runtime/toggle";
<Toggle on={() => enabled()} width={56} height={30} />
```

| round | rect |
|---|---|
| ![toggle round](../screenshots/toggle-gabbro.png) | ![toggle rect](../screenshots/toggle-emery.png) |

### Meter — `runtime/meter`

A segmented linear meter (battery/signal-style bars), `value` in `0..1`.

```tsx
import { Meter } from "runtime/meter";
<Meter value={() => level()} segments={6} width={180} height={22} />
```

| round | rect |
|---|---|
| ![meter round](../screenshots/meter-gabbro.png) | ![meter rect](../screenshots/meter-emery.png) |

### Sparkline — `runtime/sparkline`

A mini line chart from an array of numbers.

```tsx
import { Sparkline } from "runtime/sparkline";
<Sparkline data={() => samples()} width={190} height={80} />
```

| round | rect |
|---|---|
| ![sparkline round](../screenshots/sparkline-gabbro.png) | ![sparkline rect](../screenshots/sparkline-emery.png) |

### DotIndicator — `runtime/dots`

Page/step dots, the active one highlighted.

```tsx
import { DotIndicator } from "runtime/dots";
<DotIndicator count={5} active={() => page()} width={150} />
```

| round | rect |
|---|---|
| ![dots round](../screenshots/dots-gabbro.png) | ![dots rect](../screenshots/dots-emery.png) |

### Gauge — `runtime/gauge`

A circular value dial (arc sweep + optional centered label). Composes `Canvas` +
the `arc` primitive.

```tsx
import { Gauge } from "runtime/gauge";
<Gauge value={() => v()} label={(x) => Math.round(x * 100) + "%"} />
```

| round | rect |
|---|---|
| ![gauge round](../screenshots/gauge-gabbro.png) | ![gauge rect](../screenshots/gauge-emery.png) |

### ClockFace — `runtime/clockface`

An analog clock face — 12 ticks + hour/minute/second hands.

```tsx
import { ClockFace } from "runtime/clockface";
<ClockFace hours={() => h()} minutes={() => m()} seconds={() => s()} />
```

| round | rect |
|---|---|
| ![clockface round](../screenshots/clockface-gabbro.png) | ![clockface rect](../screenshots/clockface-emery.png) |

---

## UI kit

### StatusBar — `runtime/statusbar`

A top strip: title left, time right (thunks auto-track). On a round watch, wrap
it in a `RoundSafeArea` — a bare top strip sits under the bezel.

```tsx
import { StatusBar } from "runtime/statusbar";
<StatusBar title="Inbox" time={() => clock()} background="#303030" />
```

| round | rect |
|---|---|
| ![statusbar round](../screenshots/statusbar-gabbro.png) | ![statusbar rect](../screenshots/statusbar-emery.png) |

### ActionBar — `runtime/actionbar`

Pebble's right-edge button-hint strip (up / select / down).

```tsx
import { ActionBar } from "runtime/actionbar";
<ActionBar up="+" select="OK" down="-" background="#303030" />
```

| round | rect |
|---|---|
| ![actionbar round](../screenshots/actionbar-gabbro.png) | ![actionbar rect](../screenshots/actionbar-emery.png) |

### Card — `runtime/card`

A titled, fill-skinned content box (bold title + body children).

```tsx
import { Card } from "runtime/card";
<Card title="Weather" width={190}><Label string="Sunny 72°F" /></Card>
```

| round | rect |
|---|---|
| ![card round](../screenshots/card-gabbro.png) | ![card rect](../screenshots/card-emery.png) |

### Dialog — `runtime/dialog`

A centered title/message/hint modal card.

```tsx
import { Dialog } from "runtime/dialog";
<Dialog title="Alert" message="Battery low" hint="SELECT ok" />
```

| round | rect |
|---|---|
| ![dialog round](../screenshots/dialog-gabbro.png) | ![dialog rect](../screenshots/dialog-emery.png) |

### Tabs — `runtime/tabs`

A horizontal tab bar, the active cell highlighted (the app owns the index).

```tsx
import { Tabs } from "runtime/tabs";
<Tabs labels={["Home", "Stats", "Set"]} active={() => tab()} activeFill="#1a4d4d" />
```

| round | rect |
|---|---|
| ![tabs round](../screenshots/tabs-gabbro.png) | ![tabs rect](../screenshots/tabs-emery.png) |

### RoundSafeArea — `runtime/roundsafe`

Insets its children to the round-screen safe area (pass-through on a rectangular
screen), so edge content isn't clipped by a round watch's bezel.

```tsx
import { RoundSafeArea } from "runtime/roundsafe";
<RoundSafeArea inset={18}><StatusBar title="Inbox" time={clock} /></RoundSafeArea>
```

| round | rect |
|---|---|
| ![roundsafe round](../screenshots/roundsafe-gabbro.png) | ![roundsafe rect](../screenshots/roundsafe-emery.png) |

---

## Data

### useLocalStorage — `runtime/localstorage`

A `useState`-shaped reactive **string** cell persisted to the host `localStorage`
(webstorage over `device.keyValue`); degrades to an in-memory signal on a host
without webstorage.

```tsx
import { useLocalStorage } from "runtime/localstorage";
const [name, setName] = useLocalStorage("name", "world");
<Label string={() => "hi " + name()} />
```

| round | rect |
|---|---|
| ![localstore round](../screenshots/localstore-gabbro.png) | ![localstore rect](../screenshots/localstore-emery.png) |

### useKVStorage — `runtime/kvstore`

The **structured** sibling of `useLocalStorage`: a reactive JSON-persisted store
for objects/arrays/numbers (corrupt/legacy values fall back to `initial`).

```tsx
import { useKVStorage } from "runtime/kvstore";
const [prefs, setPrefs] = useKVStorage("prefs", { count: 0 });
<Label string={() => "count " + prefs().count} />
```

| round | rect |
|---|---|
| ![kvstore round](../screenshots/kvstore-gabbro.png) | ![kvstore rect](../screenshots/kvstore-emery.png) |

---

## Utilities

### easing — `runtime/easing`

Penner-style timing curves for `animate()`/tweens — `linear`, `quadIn/Out/InOut`,
`cubic*`, `sine*`, `expoOut`, `backOut`, `bounceOut`. Pure functions
(`[0,1]→[0,1]`, exact 0/1 endpoints), no Piu. The shot animates a box with
`backOut`.

```tsx
import { animate } from "runtime/flow";
import { backOut } from "runtime/easing";
const x = animate(0, 100, 800, backOut);
```

| round | rect |
|---|---|
| ![easing round](../screenshots/easing-gabbro.png) | ![easing rect](../screenshots/easing-emery.png) |

---

## Menus, input & lists

### Menu — `runtime/menu`

A vertical **scrolling, selectable** list (react-pebble MenuLayer analog). A clip
viewport over a Column of rows; the active row is highlighted and kept in view by
shifting the Column with `moveBy` (the proven Move idiom). Display-only — the app
owns `selected` and drives it with buttons.

```tsx
import { Menu } from "runtime/menu";
<Menu items={["Alarms", "Timers", "Stopwatch"]} selected={() => sel()} />
```

| round | rect |
|---|---|
| ![menu round](../screenshots/menu-gabbro.png) | ![menu rect](../screenshots/menu-emery.png) |

### Picker — `runtime/picker`

A value **carousel**: the current option centered and bold, its neighbors faded
above and below (a 3-row window). Optional `wrap` for a circular list.

```tsx
import { Picker } from "runtime/picker";
<Picker options={["Mango", "Apple", "Banana"]} selected={() => i()} wrap />
```

| round | rect |
|---|---|
| ![picker round](../screenshots/picker-gabbro.png) | ![picker rect](../screenshots/picker-emery.png) |

### NumberField — `runtime/numberfield`

A big-number **stepper** display (Pebble NumberWindow analog): the value centered
with `+`/`−` affordance hints and an optional unit suffix. The app owns the value.

```tsx
import { NumberField } from "runtime/numberfield";
<NumberField value={() => pct()} unit="%" min={0} max={100} />
```

| round | rect |
|---|---|
| ![numberfield round](../screenshots/numberfield-gabbro.png) | ![numberfield rect](../screenshots/numberfield-emery.png) |

### TextFlow — `runtime/textflow`

**Wrapped** multi-line paragraph text — manual word-wrap into a Column of Label
lines (Piu `Text` isn't used; Labels are the device-proven substrate). Reactive
`text` re-wraps.

```tsx
import { TextFlow } from "runtime/textflow";
<TextFlow text="Signal Piu wraps this text into a column of label lines." />
```

| round | rect |
|---|---|
| ![textflow round](../screenshots/textflow-gabbro.png) | ![textflow rect](../screenshots/textflow-emery.png) |

### ActionMenu — `runtime/actionmenu`

A modal **action sheet** (Pebble ActionMenu analog): a filled backdrop, a bold
title, and a Column of actions with the active one highlighted.

```tsx
import { ActionMenu } from "runtime/actionmenu";
<ActionMenu title="Message" actions={["Reply", "Archive", "Delete"]} active={() => a()} />
```

| round | rect |
|---|---|
| ![actionmenu round](../screenshots/actionmenu-gabbro.png) | ![actionmenu rect](../screenshots/actionmenu-emery.png) |

---

## Loading & animation

### Spinner — `runtime/spinner`

An animated indeterminate **loading indicator** (RN ActivityIndicator analog):
composes a `Canvas` + the `arc` primitive with an owned `angle` signal driven by a
~30fps `setInterval`. `running` (thunk) starts/stops it; the timer is cleared on
owner dispose.

```tsx
import { Spinner } from "runtime/spinner";
<Spinner size={48} running={() => loading()} />
```

| round | rect |
|---|---|
| ![spinner round](../screenshots/spinner-gabbro.png) | ![spinner rect](../screenshots/spinner-emery.png) |

---

## Hooks — timers, state & animation

Pure reactive logic on top of signals; no Piu nodes. Each cleans up (timers,
subscriptions) on owner dispose via `onCleanup`. Timers use `setInterval` only
(no `setTimeout` on device). Hook demos render the hook driving a `Label` — shown
on gabbro, since a hook's output is shape-independent.

### timers — `runtime/timers`

`useInterval(cb, delay)` / `useTimeout(cb, delay)` — reactive timer hooks. A thunk
`delay` re-arms the timer; `null` pauses. Both return a manual `cancel()`.

```tsx
import { useInterval } from "runtime/timers";
useInterval(() => setCount((c) => c + 1), () => (paused() ? null : 1000));
```

| round | rect |
|---|---|
| ![timers round](../screenshots/timers-gabbro.png) | ![timers rect](../screenshots/timers-emery.png) |

### state — `runtime/state`

`useToggle`, `useCounter` (bounded, `inc/dec/reset/set`), and `useDebounce`
(follows a source but settles only after it's stable).

```tsx
import { useCounter } from "runtime/state";
const [count, c] = useCounter(0, { min: 0, max: 10 });
```

_Node-100%-covered; builds + boots on device — demo: `pnpm run dev -- --app state`._

### useTween / useSequence / useSpring — `runtime/anim`

Motion hooks over the shared ~30fps ticker. `useTween` eases toward a **reactive
target** (RN `withTiming`) — composes `animate`, retargeting mid-flight from the
current value. `useSequence(steps, opts)` chains keyframes (moves + holds, optionally
looping — RN `withSequence`); the pure combinators `withDelay`/`withRepeat`/`yoyo`
compose into it. `useSpring(target, opts)` is physics-based motion (RN `withSpring`).
Each `useSequence`/`useSpring` owns one interval, cleaned up on dispose.

```tsx
import { useSequence, useSpring, yoyo } from "runtime/anim";
const x = useSequence(yoyo([{ to: 110, ms: 700 }]), { loop: true }); // bounce
const y = useSpring(() => open() ? 100 : 0, { stiffness: 180 });     // springy
```

| round | rect |
|---|---|
| ![usetween round](../screenshots/usetween-gabbro.png) | ![usetween rect](../screenshots/usetween-emery.png) |

_`useSequence`/`useSpring` Node-100%-covered; build + boot — demo: `pnpm run dev -- --app sequence`._

---

## Hooks — time & device

### useClock — `runtime/clock`

A reactive current-time `Date` getter over the **native watch tick service**
(`secondchange`/`minutechange`) — one shared, wall-clock-aligned firmware timer,
better than a drifting `setInterval`. `useTimeParts()` splits it into per-field
getters.

```tsx
import { useClock } from "runtime/clock";
const now = useClock();
<Label string={() => now().toTimeString().slice(0, 8)} />
```

_Node-100%-covered; builds + boots on device — demo: `pnpm run dev -- --app clockhook`._

### watchInfo — `runtime/watchinfo`

`watchInfo()` — a one-shot snapshot of `model`, `firmware`, `hour12`, plus the
screen bounds (`width`/`height`/`round`/`color`). `useDisplayBounds()` returns just
the screen subset.

```tsx
import { watchInfo } from "runtime/watchinfo";
const info = watchInfo();  // { model, firmware, width, height, round, color, hour12 }
```

![watchInfo on gabbro](../screenshots/watchinfo-gabbro.png)

---

## Hooks — connectivity

### useMessage — `runtime/message`

A reactive **AppMessage** channel (watch ⇄ pkjs ⇄ phone) over `pebble/message`.
`last()` is the reactive inbound map; `send(obj)` writes outbound (outbox-full is
swallowed). `useAppMessage(keys, handler)` is the callback form.

```tsx
import { useMessage } from "runtime/message";
const { last, send } = useMessage(["cmd"]);
```

![useMessage on gabbro](../screenshots/message-gabbro.png)

### useConfig — `runtime/config`

Clay **settings** as a reactive, persisted object: merges the config page's
payload (via pkjs `showConfiguration`) into a `useKVStorage` cell.

```tsx
import { useConfig } from "runtime/config";
const cfg = useConfig({ text: "hi", invert: 0 });
<Label string={() => cfg().text} />
```

![useConfig on gabbro](../screenshots/config-hook-gabbro.png)

### useFetch — `runtime/fetch`

Reactive HTTP fetch composed over the shipped `createResource` — a `{ data,
loading, error, refetch }` `Resource<T>`. **Device-gated:** watch-side `fetch`
proxies through the phone and its `Response` allocations OOM the 32KB arena from a
signal-runtime app (gotcha 18a) — keep a `useFetch` app lean, or prefer
fetch-over-message (XHR pkjs-side → string AppMessage → `createResource`).

```tsx
import { useFetch } from "runtime/fetch";
const res = useFetch<{ value: string }>("https://api.example.com/thing.json");
<Label string={() => (res.loading() ? "…" : String(res.data()?.value))} />
```

_Node-100%-covered; device-gated (gotcha 18a) — demo: `pnpm run dev -- --app fetch`._

---

## Hooks — sensors

Each wraps a single-instance Pebble host sensor (`embedded:sensor/*` or the bare
`watch` global) as a module-level singleton with refcount cleanup; `onSample` /
event callbacks write a signal. Drive live values under QEMU with the `pebble
emu-*` commands noted below.

### useAccel — `runtime/accel`

`useAccel()` → `{ x, y, z }` accelerometer readings (raw milli-g). `useTap()` →
the last tap direction (`"x+"` … `"z-"`). Drive: `pebble emu-accel gravity+x`,
`pebble emu-tap --direction x+`.

```tsx
import { useAccel } from "runtime/accel";
const a = useAccel({ hz: 25 });
<Label string={() => `x ${a().x}`} />
```

![useAccel on gabbro](../screenshots/accel-gabbro.png)

### useCompass — `runtime/compass`

`useCompass()` → the magnetic heading in **degrees** (0–360, CCW from north). A
`filter` throttles updates. Drive: `pebble emu-compass --heading 90`.

```tsx
import { useCompass } from "runtime/compass";
const heading = useCompass({ filter: 2 });
```

![useCompass on gabbro](../screenshots/compass-gabbro.png)

### useBattery — `runtime/battery`

`useBattery()` → `{ percent, charging, plugged }` (specifier
`embedded:sensor/Battery`). Drive: `pebble emu-battery --percent 25 --charging`.

```tsx
import { useBattery } from "runtime/battery";
const bat = useBattery();
<Label string={() => `${bat().percent}%`} />
```

![useBattery on gabbro](../screenshots/battery-gabbro.png)

### useConnection — `runtime/connection`

`useConnection()` → `{ app, pebblekit }` bluetooth/phone connection state (the bare
`watch.connected` + its `connected` event). Drive: `pebble emu-bt-connection
--connected no`.

```tsx
import { useConnection } from "runtime/connection";
const conn = useConnection();
<Label string={() => (conn().app ? "Connected" : "Disconnected")} />
```

![useConnection on gabbro](../screenshots/connection-gabbro.png)

---

## Hooks — lifecycle

`useLaunchReason()` (why the app launched — a one-shot `{ reason, arguments }`),
`useAppFocus()` (a reactive focus getter), and `useWakeup()`
(`schedule`/`query`/`cancel` + a reactive `last` wakeup event) over the bare
`watch` global and `pebble/wakeup`. **Device-gated:** `didFocus`/`wakeup` are
event-driven and need a real device (or a scheduled wakeup) to fire — the hooks
are Node-verified and build+boot, but QEMU may not emit those events.

```tsx
import { useLaunchReason, useAppFocus } from "runtime/lifecycle";
const focused = useAppFocus();
<Label string={() => (focused() ? "focused" : "background")} />
```

_Node-100%-covered; device-gated (focus/wakeup events) — demo: `pnpm run dev -- --app lifecycle`._

---

## Media

Bitmap and vector images as reactive components — formalizing the hand-built
`Texture`/`SVGImage` idioms every watchface previously rolled by hand. The
`.png`/`.pdc` resource is derived from the `src` string **literal** at build time
(gen-manifest scans the app source), so passing a literal ships the asset
automatically. All substrate here is device-proven (`sloth`/`imgwatch`/`slothvec`).

### Image — `runtime/image`

A single bitmap on one Piu Content (RN `<Image>` analog): `new Texture(src)` (the
`.png` suffix is **mandatory** — gotcha 19) framed by a texture Skin. An optional
`variants` (per-frame width) + reactive `variant` turns it into a sprite filmstrip
that animates by ONE integer write (a whitelisted reactive prop).

```tsx
import { Image } from "runtime/image";
<Image src="logo.png" width={64} height={64} />
```

_Node-100%-covered; builds (asset derived from the `src` literal) + boots — demo: `pnpm run dev -- --app image`. Substrate device-proven (imgwatch)._

### ImageBackground — `runtime/imagebackground`

Children composited **over** a bitmap (RN `<ImageBackground>` analog): a texture Skin
is the Container's background and `children` mount on top — the watchface "art +
clock" pattern. Distinct from `Image` (a lone leaf) and `Card` (a flat fill).

```tsx
import { ImageBackground } from "runtime/imagebackground";
<ImageBackground src="bg.png" width={120} height={120}><Label string={() => t()} /></ImageBackground>
```

_Node-100%-covered; builds + boots — demo: `pnpm run dev -- --app imagebackground`._

### VectorImage — `runtime/vectorimage`

A resolution-independent **PDC vector** on one `SVGImage` node — free scaling, zero
pixel RAM. It hides the four hard SVGImage rules (transforms applied post-mount via
an `onDisplaying` hook; `center` required; forced `scale(1,1)` so it draws at all;
`rotate` absolute), turning the multi-hour slothvec saga into one component.
`scale`/`rotate` are reactive; a driving effect re-applies them (idiom 5b).

```tsx
import { VectorImage } from "runtime/vectorimage";
<VectorImage src="icon.pdc" width={120} height={120} center={[30, 7]} translate={[30, 7]} scale={() => s()} />
```

_Node-100%-covered; builds + boots — demo: `pnpm run dev -- --app vectorimage`. Substrate device-proven (slothvec)._

---

## Input

Button-driven interaction over the jsx-runtime focus/press substrate
(`onPress*`/`onRelease*` events reach the **focused** node; pair with the `focus`
prop). Touch is deliberately unused — gotcha 2: a real-coordinate touch reboots the
emulator, and most Pebbles have no digitizer. Drive on QEMU with `pebble emu-button`.

### Button — `runtime/button`

A focusable Container+Label with a pressed-skin swap (RN Button/Pressable +
react-pebble `useButton`): owns a `pressed` signal wired to `onPressSelect`/
`onReleaseSelect`, fires `onPress` on release, optional `onLongPress`. One focused
Button per screen (or manage focus yourself).

```tsx
import { Button } from "runtime/button";
<Button label="OK" onPress={() => fire()} />
```

_Node-100%-covered; builds + boots — demo: `pnpm run dev -- --app button` (drive with `pebble emu-button select`)._

### press — `runtime/press`

Three press-timing hooks that return handler **bags** to spread on a focused node:
`useLongPress(button, ms, onFire)` (hold-to-fire), `useRepeatClick(button, onFire,
opts)` (press-and-hold auto-repeat, accelerating), `useMultiClick(button, handlers,
opts)` (double/triple click). All share the `setInterval` timing substrate and clean
up on dispose.

```tsx
import { useLongPress } from "runtime/press";
<Container focus {...useLongPress("Select", 600, () => confirm())} />
```

_Node-100%-covered; builds + boots — demo: `pnpm run dev -- --app press`._

### useBackHandler — `runtime/backhandler`

Intercept the **Back** button (RN `BackHandler`): returns `{ onPressBack }` to spread
on a focused node; the handler returns `true` to consume Back (stay in-app, e.g. pop
a Navigator) or `false` to allow exit. **Device caveat:** the in-app intercept is
proven; whether consuming Back prevents the *firmware* app-exit is unverified under
QEMU (a guaranteed override needs `pebble/button` — see device-gated below).

```tsx
import { useBackHandler } from "runtime/backhandler";
<Container focus {...useBackHandler(() => nav.canPop() ? (nav.pop(), true) : false)} />
```

_Node-100%-covered; builds + boots — demo: `pnpm run dev -- --app backhandler`._

---

## Layout & lists

### Scrollable — `runtime/scrollable`

Free-form scroll of arbitrary-height content (RN `ScrollView` + Pebble
`ContentIndicator`) — the one foundational primitive the catalog lacked (`Menu` is
selectable rows, `VirtualList` recycles). A clip viewport over a Column scrolled by
`offset` via `moveBy` (the proven Menu idiom); optional up/down chevrons drawn on a
`Canvas` bound to the offset. `ContentIndicator` is also exported standalone.

```tsx
import { Scrollable } from "runtime/scrollable";
<Scrollable height={140} offset={() => y()} indicator>{tallColumn}</Scrollable>
```

_Node-100%-covered; builds + boots — demo: `pnpm run dev -- --app scrollable`._

### Grid — `runtime/grid`

An N-column tile layout (RN `FlatList numColumns`): a Column of Rows built from
`items` via a `cell(item, index)` render prop — app launchers, icon pickers, keypads.
Static structure (drive a changing set with `<For>`/`VirtualList` over the rows).

```tsx
import { Grid } from "runtime/grid";
<Grid columns={3} items={icons} cell={(it, i) => <Image src={it.png} width={40} height={40} />} />
```

_Node-100%-covered; builds + boots — demo: `pnpm run dev -- --app grid`._

### SectionList — `runtime/sectionlist`

Grouped headers + rows over the windowed `VirtualList` (RN `<SectionList>`): flattens
sections+headers into one index space, headers non-selectable, `selected` kept in
view. `renderHeader`/`renderRow` return **string** captions (a recycled slot is one
reused Label).

```tsx
import { SectionList } from "runtime/sectionlist";
<SectionList sections={() => groups()} renderHeader={(h) => h} renderRow={(r) => r.name} selected={() => i()} />
```

_Node-100%-covered; builds + boots — demo: `pnpm run dev -- --app sectionlist`._

---

## Hooks — output

### useHaptics — `runtime/vibration`

The vibration motor (RN `Vibration` + react-pebble `useVibration`) — the biggest
missing OUTPUT channel: `useHaptics()` → `{ short, long, double, pattern, cancel }`
over the static `pebble/vibes` class. `pattern([on, off, …])` takes alternating ms
segments; the motor is cancelled on owner dispose.

```tsx
import { useHaptics } from "runtime/vibration";
const h = useHaptics();
<Button label="OK" onPress={() => { save(); h.short(); }} />
```

_Node-100%-covered; builds + boots. The physical buzz is **not** observable on QEMU (no motor / `emu-vibe`) — felt only on real hardware._

---

## Not feasible from watch JS today

The exhaustive Piu/Pebble API survey (against the on-disk Moddable/Pebble host)
classified the remaining RN/Pebble surface. These families are **intentionally not
shipped** — no watch-side JS surface reaches them from a mod:

- **`useHealth`** (steps / activity / heart rate) — the HealthService lives only
  in the Pebble **C** SDK; Moddable ships no health JS module or typing. The QEMU
  emulator can inject values (`pebble emu-steps` …) but there is nothing on the JS
  side to observe them. Needs a new native/host module upstream.
- **`useLight`** (ambient light) — there is **no live light service anywhere**,
  even in C (only a per-minute historical `AmbientLightLevel` buried in the Health
  API); no `emu-light` command. Treat ambient light as unavailable. (`watch.light()`
  controls the **backlight**, an output — not an ambient sensor.)
- **`QRCode`** — the `data/qrcode` encoder is a **native** function (`@ "xs_qrcode"`,
  backed by `qrcodegen.c`). It appears in the SDK's Pebble host manifest, but
  `xs_qrcode` is **not present in the built Pebble device tree**, and a mod is JS-only
  (cannot compile C), so `import qrCode from "qrcode"` would not resolve on the actual
  firmware. Reclassified from the survey's "build-now": needs an on-device probe of
  `importNow("qrcode")` on healthy firmware (and a build-tripwire whitelist), or a
  pure-JS encoder too heavy for the 32 KB arena. A device-gated *probe*, not shipped.
- **Sound / audio** — no watch-side JS audio surface and no speaker (only the
  vibration motor); `piu/Sound` has no Pebble implementation. Route tones to
  `useHaptics`.
- **Touch gestures** (swipe / drag / pan / pull-to-refresh) — button-first platform;
  a real-coordinate touch reboots QEMU (gotcha 2) and most Pebbles have no digitizer.
  Steer all gesture UX to buttons.
- **`Die` clip / `Wipe`&`Comb` transitions**, **native `AnimatedImage`/APNG**,
  **`Shape`** — not Pebble globals (absent from `piuPebble.js` / the Pebble Piu
  manifest). The feasible substitutes: rectangular clip via a container `clip`,
  reactive-`variant` sprites (see `Image`), and vector art via `VectorImage`.
- **`useContentSize`**, **`useAppGlance`**, **`useTimelinePin`**, **`useQuietTime` /
  `useNotification`**, **`useTouch`** — no Moddable JS getter/binding exists (C-SDK,
  phone/pkjs, or dead surface); the emulator can *set* some but nothing on the JS side
  observes them.
- **RN system APIs** — `useColorScheme`, `Clipboard`, `Share`, `Linking`/`openURL`,
  `Keyboard`, `AccessibilityInfo`, `PixelRatio`: no Pebble surface (use `useDictation`
  or the char-picker for text input; `openURL` is pkjs-config-only).

## Device-gated (probe-pending)

Reachable in principle (the host surface exists) but **not yet device-verified**, so
not shipped this round — each needs a healthy emulator or a real watch to confirm. In
rough priority: **`useUnobstructedArea`** (Quick-View resize; watchface-only),
**animated Navigator transitions** (base `Transition` + `moveBy`; ~2× arena overlap),
**`useLocation`** (GPS via pkjs; no QEMU fix), **`useDictation`** (probe-proven UI, no
transcript without mic+phone), **`usePhysicalButtons`** (focus-free buttons +
guaranteed Back-override via `pebble/button`), **`useWebSocket`** (phone-tunnelled,
arena pressure), the **Pebble-only native content nodes** (`RoundRect`, `Inverter`,
`RichText`, `NinePatch` — globalThis'd but never exercised), a **native content-clock
animator**, and **`ScreenBuffer`**.

---

## Note on a single all-in-one gallery

An on-watch "browse every component from one menu" app is **not** shippable as a
single mod: each component module's symbols intern at boot, and ~19 of them
overflow the firmware's boot-symbol floor (measured: `fxAbort memory full`).
Lazy screens defer *code instantiation* (arena) but not *symbol interning* (boot
floor), and this firmware has no true separate-archive module loading (upstream
ask #5). So the per-component example apps above **are** the per-feature demos —
each boots on its own and is what these screenshots capture. A future on-watch
gallery would need per-component sub-archives or a firmware symbol-budget lift.
