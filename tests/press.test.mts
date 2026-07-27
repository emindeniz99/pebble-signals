// press suite — runtime/press (opt-in react-pebble press-gesture hooks:
// useLongPress / useRepeatClick / useMultiClick). Each hook RETURNS a handler bag
// keyed for the chosen button ("onPress" + button / "onRelease" + button, the exact
// jsx-runtime BUTTON_EVENTS names) whose handlers return TRUTHY to consume. Proves:
//
//  - useLongPress arms a ONE-SHOT on press (a self-clearing setInterval — no
//    setTimeout on device) that fires onFire EXACTLY ONCE when held (a tick while
//    armed) and self-clears; releasing before the tick cancels it (never fires);
//    disposing the owner mid-hold clears the still-armed timer (no leak).
//  - useRepeatClick fires once immediately on press then auto-repeats on ONE
//    rescheduling timer, the delay ACCELERATING (shrinking) after each repeat and
//    FLOORING at `min` (asserted by wrapping setInterval to capture the delays);
//    release stops it, dispose clears a live repeat.
//  - useMultiClick counts presses and, `window` ms after the last release, fires
//    handlers[count] (double-click → handlers[2]) and resets; a count with no
//    handler is a no-op; a second press cancels the pending dispatch; dispose
//    clears a pending burst.
//  - end-to-end: all three bags spread through the REAL jsx() factory onto one
//    focused Container, driven via node.behavior.onPress*/onRelease* — the device
//    seam — consume (HandlerBehavior `!== false`) and dispatch correctly.
//
// Every prop branch (repeat/multi defaults vs overrides), every clear/arm edge, the
// if(handler) present/absent branch and the delay<min clamp are covered for 100%
// line/branch/function coverage. Timers are the harness's controllable stubs:
// setInterval stores the fn, tick(n) fires every LIVE interval n times (ignoring
// real ms — so one tick = "the ms elapsed" for a one-shot), liveTimers() is the live
// count. To ALSO observe the repeat's acceleration (the harness ignores ms), we wrap
// sandbox.setInterval to record each delay while delegating to the harness's real
// one (the tabs.test idiom of injecting sandbox globals, applied to a wrapper). Each
// block builds under createRoot and disposes it so timers stay isolated.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, tick, liveTimers, loadModule } = await loadRuntime();
const { createRoot } = signals;

// Wrap the harness's setInterval to CAPTURE each delay (its second arg — the
// harness stub ignores it) while still registering the fn with the harness so
// tick()/liveTimers() keep working. Lets the repeat-click block assert acceleration.
const realSetInterval = sandbox.setInterval;
const delays: number[] = [];
sandbox.setInterval = (fn: () => void, ms: number) => {
	delays.push(ms);
	return realSetInterval(fn);
};

const { useLongPress, useRepeatClick, useMultiClick } = await loadModule("runtime/press");
const { check, done } = makeChecker("press");

// --- useLongPress: arm on press, fire once when held, self-clear ------------------
{
	let fired = 0;
	const [bag, dispose] = createRoot(() => useLongPress("Select", 600, () => fired++));
	check(
		"useLongPress returns onPress/onReleaseSelect handlers",
		typeof bag.onPressSelect === "function" && typeof bag.onReleaseSelect === "function",
	);
	check("no one-shot is armed until pressed", liveTimers() === 0);
	check("press consumes the button (returns truthy)", bag.onPressSelect() === true);
	check("press arms exactly one one-shot", liveTimers() === 1);
	tick(5);
	check("a held long-press fires onFire exactly once across many ticks", fired === 1);
	check("the one-shot self-clears after firing (no live timer)", liveTimers() === 0);
	dispose();
}

// --- useLongPress: released early never fires -------------------------------------
{
	let fired = 0;
	const [bag, dispose] = createRoot(() => useLongPress("Back", 600, () => fired++));
	bag.onPressBack();
	check("press arms the hold", liveTimers() === 1);
	check("release consumes the button (returns truthy)", bag.onReleaseBack() === true);
	check("releasing early cancels the pending one-shot", liveTimers() === 0);
	tick(5);
	check("a long-press released before the tick never fires", fired === 0);
	dispose();
}

// --- useLongPress: disposing the owner mid-hold clears the armed timer -------------
{
	let fired = 0;
	const [bag, dispose] = createRoot(() => useLongPress("Up", 600, () => fired++));
	bag.onPressUp();
	check("hold armed before dispose", liveTimers() === 1);
	dispose();
	check("disposing the owner stops a still-armed hold (no leak)", liveTimers() === 0);
	tick(5);
	check("a disposed hold never fires", fired === 0);
}

// --- useRepeatClick: fire once on press, auto-repeat, stop on release + dispose ----
{
	let fired = 0;
	const [bag, dispose] = createRoot(() => useRepeatClick("Up", () => fired++));
	check(
		"useRepeatClick returns onPress/onReleaseUp handlers",
		typeof bag.onPressUp === "function" && typeof bag.onReleaseUp === "function",
	);
	check("press consumes + fires onFire once immediately", bag.onPressUp() === true && fired === 1);
	check("press arms one repeat timer", liveTimers() === 1);
	tick(1);
	check("holding auto-repeats (one fire per tick)", fired === 2);
	tick(3);
	check("the repeat keeps firing while held", fired === 5);
	check("only ONE live timer — it reschedules, never stacks", liveTimers() === 1);
	check("release consumes + stops the repeat", bag.onReleaseUp() === true && liveTimers() === 0);
	tick(5);
	check("a released repeat never fires again", fired === 5);
	// a fresh hold, then dispose while it is live → owner dispose clears it
	bag.onPressUp();
	check("a fresh hold re-arms the repeat", liveTimers() === 1 && fired === 6);
	dispose();
	check("disposing the owner clears a live repeat", liveTimers() === 0);
	tick(5);
	check("a disposed repeat never fires again", fired === 6);
}

// --- useRepeatClick: custom opts, delay accelerates then floors at min -------------
{
	let fired = 0;
	delays.length = 0; // isolate this block's setInterval delays
	const [bag, dispose] = createRoot(() =>
		useRepeatClick("Down", () => fired++, { initial: 400, min: 80, accel: 0.8 }),
	);
	bag.onPressDown();
	check("the custom initial delay arms the first repeat", delays[0] === 400);
	tick(1);
	check("the delay accelerates (shrinks) after a repeat", delays[1] < delays[0]);
	tick(30); // drive well past the min threshold
	check("the accelerating delay never drops below min", Math.min(...delays) === 80);
	check("the delay clamps to exactly min once it bottoms out", delays[delays.length - 1] === 80);
	check("repeats kept firing throughout the acceleration", fired > 10);
	bag.onReleaseDown();
	dispose();
}

// --- useMultiClick: a double-click dispatches handlers[2] (default window) ---------
{
	let which = 0;
	const handlers = {
		1: () => {
			which = 1;
		},
		2: () => {
			which = 2;
		},
		3: () => {
			which = 3;
		},
	};
	const [bag, dispose] = createRoot(() => useMultiClick("Down", handlers));
	check(
		"useMultiClick returns onPress/onReleaseDown handlers",
		typeof bag.onPressDown === "function" && typeof bag.onReleaseDown === "function",
	);
	// double click: press, release, press, release — quiet window, then dispatch
	check("press consumes the button (returns truthy)", bag.onPressDown() === true);
	check("release consumes + arms the window", bag.onReleaseDown() === true && liveTimers() === 1);
	bag.onPressDown(); // second click within the window
	check("a second press cancels the pending dispatch", liveTimers() === 0);
	bag.onReleaseDown();
	check("the burst re-arms after the second click", liveTimers() === 1);
	tick(1); // window elapses
	check("a double-click dispatches handlers[2]", which === 2);
	check("the window one-shot self-clears after dispatch", liveTimers() === 0);
	dispose();
}

// --- useMultiClick: a single click with no handler is a no-op (custom window) ------
{
	let fired = 0;
	const [bag, dispose] = createRoot(() =>
		useMultiClick("Select", { 2: () => fired++ }, { window: 500 }),
	);
	bag.onPressSelect();
	bag.onReleaseSelect();
	check("a single click arms the window", liveTimers() === 1);
	tick(1); // fire handlers[1] — undefined
	check("a click count with no handler is a no-op", fired === 0);
	check("the window one-shot still self-clears", liveTimers() === 0);
	dispose();
}

// --- useMultiClick: disposing the owner clears a pending burst ---------------------
{
	let which = 0;
	const [bag, dispose] = createRoot(() =>
		useMultiClick("Back", {
			1: () => {
				which = 1;
			},
		}),
	);
	bag.onPressBack();
	bag.onReleaseBack();
	check("a pending burst holds one live timer", liveTimers() === 1);
	dispose();
	check("disposing the owner clears the pending burst (no leak)", liveTimers() === 0);
	tick(3);
	check("a disposed burst never dispatches", which === 0);
}

// --- end-to-end: all three bags spread through the REAL jsx() factory --------------
// Mirrors the example: one focused Container with long-press Select, repeat Up and
// double-click Down. Drive node.behavior.onPress*/onRelease* — the device seam — and
// prove the keys land on the whitelist, consume (HandlerBehavior `!== false`), and
// dispatch through the wired bag.
{
	let confirmed = 0;
	let scrolls = 0;
	let resets = 0;
	const [node, dispose] = createRoot(() =>
		jsxM.jsx(sandbox.Container, {
			focus: true,
			...useLongPress("Select", 600, () => confirmed++),
			...useRepeatClick("Up", () => scrolls++),
			...useMultiClick("Down", { 2: () => resets++ }),
		}),
	);
	check(
		"the spread lands every button handler on the HandlerBehavior",
		typeof node.behavior.onPressSelect === "function" &&
			typeof node.behavior.onPressUp === "function" &&
			typeof node.behavior.onReleaseDown === "function",
	);
	// long-press Select through the real behavior delegate (returns truthy = consume)
	check("driving onPressSelect consumes the event", node.behavior.onPressSelect(node) === true);
	check("the long-press one-shot is armed via the behavior", liveTimers() === 1);
	tick(1);
	check("holding fires the long-press through the wired bag", confirmed === 1);
	// repeat-click Up
	node.behavior.onPressUp(node);
	check(
		"repeat-click fires immediately + arms via the behavior",
		scrolls === 1 && liveTimers() === 1,
	);
	node.behavior.onReleaseUp(node);
	check("releasing stops the repeat", liveTimers() === 0);
	// multi-click Down: a double-click dispatches handlers[2]
	node.behavior.onPressDown(node);
	node.behavior.onReleaseDown(node);
	node.behavior.onPressDown(node);
	node.behavior.onReleaseDown(node);
	tick(1);
	check("a double-click Down dispatches handlers[2] through the wired bag", resets === 1);
	dispose();
	check("disposing the focused node leaves no live timer", liveTimers() === 0);
}

// --- round 13: a callback that disposes the owner must not re-arm the repeat --
// `onFire()` calling Navigator.push() tears the component down synchronously;
// the owner cleanup ran, then press()/step() created a FRESH interval after it,
// leaving a timer firing forever against a screen that can never see onRelease
// (codex P2).
{
	let fires = 0;
	let disposeSelf = () => {};
	const [bag, dispose] = createRoot(() => {
		const b = useRepeatClick("Up", () => {
			fires++;
			disposeSelf(); // the handler navigates away mid-press
		});
		return b;
	});
	disposeSelf = dispose;
	(bag as any).onPressUp();
	check("the press still fires its callback once", fires === 1);
	check("no interval survives a callback-triggered dispose", liveTimers() === 0);
	tick(3);
	check("…and nothing keeps firing against the dead component", fires === 1);
}

// --- …and the same ordering inside a repeat TICK ----------------------------
{
	let fires = 0;
	let disposeSelf = () => {};
	const [bag, dispose] = createRoot(() =>
		useRepeatClick("Up", () => {
			fires++;
			if (fires === 2) disposeSelf(); // navigate away on the first REPEAT
		}),
	);
	disposeSelf = dispose;
	(bag as any).onPressUp();
	check("the immediate fire ran and the repeat is armed", fires === 1 && liveTimers() === 1);
	tick(1);
	check("the repeat tick ran once", fires === 2);
	check("a dispose from inside step() leaves no timer", liveTimers() === 0);
	tick(3);
	check("…and no further repeats reach the dead component", fires === 2);
}

done();
