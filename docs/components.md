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

## Note on a single all-in-one gallery

An on-watch "browse every component from one menu" app is **not** shippable as a
single mod: each component module's symbols intern at boot, and ~19 of them
overflow the firmware's boot-symbol floor (measured: `fxAbort memory full`).
Lazy screens defer *code instantiation* (arena) but not *symbol interning* (boot
floor), and this firmware has no true separate-archive module loading (upstream
ask #5). So the per-component example apps above **are** the per-feature demos —
each boots on its own and is what these screenshots capture. A future on-watch
gallery would need per-component sub-archives or a firmware symbol-budget lift.
