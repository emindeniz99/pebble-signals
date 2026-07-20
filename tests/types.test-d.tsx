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
// batch 5: menus / input / widgets + ergonomic hooks
import { Menu } from "runtime/menu";
import { Picker } from "runtime/picker";
import { NumberField } from "runtime/numberfield";
import { TextFlow } from "runtime/textflow";
import { ActionMenu } from "runtime/actionmenu";
import { Spinner } from "runtime/spinner";
import { useInterval, useTimeout } from "runtime/timers";
import { useToggle, useCounter, useDebounce } from "runtime/state";
import { useTween, useSequence, useSpring, withDelay, withRepeat, yoyo } from "runtime/anim";
// batch 6: device / time / connectivity / sensor hooks
import { useClock, useTimeParts } from "runtime/clock";
import { watchInfo, useDisplayBounds } from "runtime/watchinfo";
import { useMessage, useAppMessage } from "runtime/message";
import { useConfig } from "runtime/config";
import { useAccel, useTap } from "runtime/accel";
import { useCompass } from "runtime/compass";
import { useBattery } from "runtime/battery";
import { useConnection } from "runtime/connection";
// batch 6c: device-gated data / lifecycle hooks
import { useFetch } from "runtime/fetch";
import { useLaunchReason, useAppFocus, useWakeup } from "runtime/lifecycle";

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

// batch 5: widgets take value/index props (thunk or bare); hooks return getters/controls
Menu({ items: ["Alarms", "Timers"], selected: () => 0 });
Picker({ options: ["A", "B", "C"], selected: 1, wrap: true });
NumberField({ value: () => 5, unit: "%", min: 0, max: 100 });
TextFlow({ text: () => "wrapped body text", charsPerLine: 20 });
ActionMenu({ actions: ["Reply", "Delete"], active: () => 0, title: "Message" });
Spinner({ size: 40, running: () => true });
const _iv: () => void = useInterval(() => {}, 1000);
const _to: () => void = useTimeout(() => {}, 500);
void _iv;
void _to;
const [tgl, tglToggle, tglSet] = useToggle();
const _tglV: boolean = tgl();
tglToggle();
tglSet(true);
const [ctr, cntCtl] = useCounter(0, { min: 0, max: 10, step: 2 });
const _cntV: number = ctr();
cntCtl.inc();
cntCtl.dec();
cntCtl.reset();
cntCtl.set(3);
const _dbV: number = useDebounce(() => ctr(), 300)();
const _twV: number = useTween(() => 100, { duration: 400 })();
// anim additions: keyframe sequence (+combinators) and spring physics
const _sqV: number = useSequence(withDelay(100, [{ to: 100, ms: 200 }, { hold: 50 }]), {
	loop: true,
})();
useSequence(withRepeat([{ to: 10, ms: 50 }], 2, true));
useSequence(yoyo([{ to: 10, ms: 50 }]));
const _spV: number = useSpring(() => 100, { stiffness: 200, damping: 20, from: 0 })();
const _spC: number = useSpring(42)();
const _clkV: Date = useClock("second")();
const _tpV: number = useTimeParts().hours();
const _wiV: number = watchInfo().width;
const _dbW: number = useDisplayBounds().width;
const _msg = useMessage(["cfg"]);
void _msg.last();
_msg.send({ cfg: "x" });
useAppMessage(["cfg"], (m) => void m);
const _cfgV: number = useConfig({ n: 0 })().n;
const _accV: number = useAccel({ hz: 25 })().x;
void useTap()();
const _cmpV: number = useCompass({ filter: 2 })();
const _batV: number = useBattery()().percent;
const _connV: boolean = useConnection()().app;
void _tglV;
void _cntV;
void _dbV;
void _twV;
void _sqV;
void _spV;
void _spC;
void _clkV;
void _tpV;
void _wiV;
void _dbW;
void _cfgV;
void _accV;
void _cmpV;
void _batV;
void _connV;
// batch 6c: useFetch returns a Resource<T>; lifecycle hooks are typed
const _fr = useFetch<{ v: number }>("http://x/thing.json");
const _frd: { v: number } | undefined = _fr.data();
void _fr.loading();
void _fr.error();
_fr.refetch();
const _fr2 = useFetch(() => "http://x/y", { parse: (r) => r.text() });
void _fr2.data();
const _lr = useLaunchReason();
const _lrr: number = _lr.reason;
const _af: boolean = useAppFocus()();
const _wk = useWakeup();
const _wid: number = _wk.schedule(1000, 42);
_wk.cancel();
void _wk.query(_wid);
void _wk.last();
void _frd;
void _lrr;
void _af;
void _wid;

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
