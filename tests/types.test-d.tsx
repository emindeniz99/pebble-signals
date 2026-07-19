// Compile-time type-guard test (#25). Checked by `npm run typecheck`
// (tsconfig.check.json, noCheck OFF). Correct usage must compile; misuse must
// error — the `@ts-expect-error` lines FAIL the build if they ever stop being
// errors, which is how we prove the guards actually bite.
import { Show, For, VirtualList, Navigator } from "runtime/flow";
import { useState, signal, computed } from "runtime/signals";
import { Canvas } from "runtime/draw";
import { Badge } from "runtime/badge";
import { useLocalStorage } from "runtime/localstorage";
import { StatusBar } from "runtime/statusbar";
import { ActionBar } from "runtime/actionbar";
import { Card } from "runtime/card";
import { useKVStorage } from "runtime/kvstore";
import { ProgressBar } from "runtime/progressbar";
import { Slider } from "runtime/slider";
import { Toggle } from "runtime/toggle";
import { Meter } from "runtime/meter";
import { Sparkline } from "runtime/sparkline";
import { DotIndicator } from "runtime/dots";
import { quadInOut } from "runtime/easing";
import { Gauge } from "runtime/gauge";
import { ClockFace } from "runtime/clockface";
import { Dialog } from "runtime/dialog";
import { Tabs } from "runtime/tabs";
import { RoundSafeArea } from "runtime/roundsafe";

const data = { count: () => 3, get: (i: number) => "row" + i };

// --- valid usage: all of these must compile clean ---
Show({ when: () => true, children: () => 1, width: 10, height: 10 });
For({ each: () => [1, 2, 3], key: (n) => n, children: (n, i) => n + i });
VirtualList({ data, rows: 3, format: (v, i) => v + ":" + i }); // simple mode
VirtualList({ data, rows: 1, renderRow: (at, d) => d.get(at()) }); // rich mode
Navigator({
	root: (nav) => {
		nav.push(() => 0);
		return nav.depth();
	},
});

// draw: Canvas takes a paint callback receiving the DrawContext
Canvas({ width: 20, height: 20, paint: (g) => g.fillCircle(10, 10, 5, "red") });
// badge: count may be a thunk or a bare number
Badge({ count: () => 3 });
Badge({ count: 7, color: "blue", size: 24 });
// localstorage: useState-shaped [getter, setter] over strings
const [ls, setLs] = useLocalStorage("k", "v");
const _ls: string = ls();
setLs("next");
// batch 2: composition components + structured storage
StatusBar({ title: "Home", time: () => "10:30" });
ActionBar({ up: "+", select: "OK", down: "-" });
Card({ title: () => "Weather" });
const [kv, setKv] = useKVStorage("prefs", { n: 0 });
const _kv: number = kv().n;
setKv({ n: 1 });
// batch 3: Canvas-composition widgets + easing
ProgressBar({ value: () => 0.5 });
Slider({ value: 0.3, min: 0, max: 1 });
Toggle({ on: () => true });
Meter({ value: 0.6, segments: 5 });
Sparkline({ data: () => [1, 2, 3] });
DotIndicator({ count: 4, active: () => 1 });
const _e: number = quadInOut(0.5);
// batch 4: gauge/clock (Canvas+arc), dialog/tabs (composition), round-safe layout
Gauge({ value: () => 0.5, label: (v) => Math.round(v * 100) + "%" });
ClockFace({ hours: 10, minutes: () => 30, seconds: 15 });
Dialog({ title: "Alert", message: () => "Battery low", hint: "SELECT ok" });
Tabs({ labels: ["A", "B"], active: () => 0 });
RoundSafeArea({ inset: 16 });

// --- misuse: each MUST be a type error (guards biting) ---
// @ts-expect-error — Canvas requires `paint`
Canvas({ width: 20, height: 20 });
// @ts-expect-error — format and renderRow are mutually exclusive
VirtualList({ data, format: (v) => "" + v, renderRow: (at) => at() });
// @ts-expect-error — Show requires `when`
Show({ children: () => 1 });
// @ts-expect-error — For children must be a function, not a node
For({ each: () => [1], children: 5 });
// @ts-expect-error — Navigator requires `root`
Navigator({ width: 100 });

// signals surface stays typed too
const [count, setCount] = useState(0);
setCount((c) => c + 1);
const n: number = count();
const flag = signal(false);
flag.value = true;
const dbl = computed(() => n * 2);
const _d: number = dbl.value;

// B6 guards: generics now come from the runtime SOURCE (tsconfig paths), so
// these prove the derived types actually bite, not just exist.
// @ts-expect-error — a computed is ReadonlySignal: writing .value is a type error
dbl.value = 5;
// @ts-expect-error — signal<boolean> rejects a number write
flag.value = 42;
// For<T> infers the item type from `each`; children sees it
For({ each: () => ["a", "b"], children: (s2, i) => s2.toUpperCase() + i });
// @ts-expect-error — children item type mismatches the each() element type
For({ each: () => [1, 2], children: (s2: string) => s2 });

// the byte store surface is typed (was `any` in the hand-written decls)
import { createStore } from "runtime/signals";
const store = createStore(64);
const cnt: number = store.push(42);
const back: unknown = store.get(0);
void cnt;
void back;
// @ts-expect-error — save() takes a string key
store.save(123);

// JSX.Element is the runtime's JSXNode now, not `any` — these pins FAIL if
// it ever regresses (an unnecessary @ts-expect-error is itself an error).
// @ts-expect-error — a JSX expression is not assignable to number
const jsxNotAny: number = <Container width={10} />;
void jsxNotAny;
// positive: a JSX expression IS a JSXNode
import type { JSXNode } from "runtime/jsx-runtime";
const jsxIsNode: JSXNode = <Container width={10} />;
void jsxIsNode;
