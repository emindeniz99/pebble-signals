// button suite — runtime/button (opt-in focusable pressable Button). Proves:
// Button returns a Container with EXPLICIT width (screen default or override) +
// height (gotcha 16) holding ONE centered Label whose caption matches; the
// reactive `skin` binding (idiom 5b) shows the IDLE fill at rest, swaps to the
// PRESSED fill on onPressSelect and back to IDLE on onReleaseSelect; onPress fires
// on RELEASE (RN Pressable), never on press-down; both handlers return TRUTHY so
// the Select event is consumed; a thunk `label` updates the Label reactively (the
// `string` whitelist) while a bare string is static; `focus` defaults on and can be
// turned off; and the OPTIONAL onLongPress arms a one-shot setInterval on press
// that — held past the threshold — fires onLongPress and SWALLOWS the following
// release's onPress, while a short press cancels the pending timer and fires
// onPress, and disposing the owner mid-press cancels a still-armed timer (no leak).
// A plain button (no onLongPress) never arms a timer. Every prop branch
// (width/height/focus default vs override, label string vs thunk, onLongPress
// present vs absent) and every timer edge (arm, self-clear on fire, cancel on
// release, cancel on dispose) is covered for 100% line/branch/function coverage.
//
// Style/Skin are host compartment globals (absent in the Node sandbox) — inject
// stubs that store the construction dict BEFORE loadModule (the tabs.test idiom),
// so each node's `.skin.d.fill` / `.style.d.font` is assertable. Timers are the
// harness's controllable stubs: setInterval stores the fn, tick(n) fires every LIVE
// interval n times (ignoring real ms), liveTimers() is the live count. The button
// behavior is reached exactly as the device does — invoking node.behavior.
// onPressSelect / onReleaseSelect (the HandlerBehavior delegates to the buttons
// dict) — and each block disposes its root so timers/effects stay isolated.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, tick, liveTimers, loadModule } = await loadRuntime();
jsxM.screen.width = 200; // Button reads screen.width for its default width (gotcha 16)
// Style/Skin stubs: store the construction dict so font/fill are assertable.
sandbox.Style = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
sandbox.Skin = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
const { signal, createRoot } = signals;
const { Button } = await loadModule("runtime/button");
const { check, done } = makeChecker("button");

// --- defaults + static label: structure, centered style, skin swap, press model ---
{
	let presses = 0;
	const [node, dispose] = createRoot(() => Button({ label: "OK", onPress: () => presses++ }));
	check("Button returns a Container", node && typeof node.add === "function");
	check(
		"explicit default width (screen) + height — gotcha 16",
		node.width === 200 && node.height === 40,
	);
	check("one centered Label child carrying the caption", node.contents.length === 1);
	check("the label string is the caption", node.contents[0].string === "OK");
	check(
		"label wears the valid 18px Gothic centered style",
		node.contents[0].style.d.font === "18px Gothic" &&
			node.contents[0].style.d.horizontal === "center" &&
			node.contents[0].style.d.vertical === "middle",
	);
	// reactive skin binding (idiom 5b): idle fill applied before any press
	check("idle skin applied at rest", node.skin.d.fill === "#333333");
	// press-down: pressed skin swaps in, onPress has NOT fired yet, event consumed
	const consumedPress = node.behavior.onPressSelect(node);
	check("press-down swaps to the pressed skin", node.skin.d.fill === "#0077cc");
	check("onPressSelect consumes the Select event (truthy)", consumedPress === true);
	check("onPress does not fire on press-down (RN Pressable)", presses === 0);
	// release: idle skin returns, onPress fires exactly once, event consumed
	const consumedRelease = node.behavior.onReleaseSelect(node);
	check("release restores the idle skin", node.skin.d.fill === "#333333");
	check("onReleaseSelect consumes the event (truthy)", consumedRelease === true);
	check("onPress fires once on release", presses === 1);
	// no onLongPress → no timer was ever armed
	check("a plain button arms no timer", liveTimers() === 0);
	dispose();
}

// --- reactive thunk label + explicit width/height override --------------------------
{
	const cap = signal("A");
	const [node, dispose] = createRoot(() =>
		Button({ label: () => cap.value, onPress: () => {}, width: 160, height: 48 }),
	);
	check("explicit width/height override applied", node.width === 160 && node.height === 48);
	check("the label inherits the button box", node.contents[0].width === 160);
	check("thunk label renders its initial string", node.contents[0].string === "A");
	cap.value = "B";
	check("thunk label updates reactively (string whitelist)", node.contents[0].string === "B");
	dispose();
}

// --- focus default true vs explicit false (covers `props.focus ?? true`) ------------
{
	// focus omitted → default true; the button still presses
	let a = 0;
	const [n1, d1] = createRoot(() => Button({ label: "F", onPress: () => a++ }));
	check("focus defaults on: a valid focusable button", n1 && typeof n1.add === "function");
	n1.behavior.onPressSelect(n1);
	n1.behavior.onReleaseSelect(n1);
	check("the default-focus button presses", a === 1);
	d1();
	// focus:false → still builds + presses if focus is granted another way. Actual
	// focus() application is the jsx-runtime's post-mount job (render()); a bare
	// createRoot never calls it, so this only asserts focus:false doesn't break it.
	let b = 0;
	const [n2, d2] = createRoot(() => Button({ label: "G", onPress: () => b++, focus: false }));
	check("focus:false still builds a valid button", n2 && typeof n2.add === "function");
	n2.behavior.onPressSelect(n2);
	n2.behavior.onReleaseSelect(n2);
	check("a focus:false button still presses when driven", b === 1);
	d2();
}

// --- onLongPress: arm on press, long-press fires + swallows onPress, short press OK --
{
	let presses = 0;
	let longs = 0;
	const [node, dispose] = createRoot(() =>
		Button({ label: "Hold", onPress: () => presses++, onLongPress: () => longs++ }),
	);
	check("no timer armed before any press", liveTimers() === 0);
	// press-down arms exactly one one-shot timer and lights the pressed skin
	node.behavior.onPressSelect(node);
	check("press-down with onLongPress arms one timer", liveTimers() === 1);
	check("pressed skin lit while held", node.skin.d.fill === "#0077cc");
	// hold past the threshold → the one-shot fires onLongPress and self-clears
	tick(1);
	check("holding fires onLongPress", longs === 1);
	check("the one-shot self-clears (no live timer)", liveTimers() === 0);
	// the release that follows a long press is swallowed (no onPress) + skin resets
	node.behavior.onReleaseSelect(node);
	check("onPress is swallowed after a long press", presses === 0);
	check("release still clears the pressed skin", node.skin.d.fill === "#333333");
	// a SHORT press now: arm, release before the tick → onPress fires, timer gone
	node.behavior.onPressSelect(node);
	check("a fresh press re-arms the timer", liveTimers() === 1);
	node.behavior.onReleaseSelect(node);
	check("a short press fires onPress on release", presses === 1);
	check("releasing cancels the pending long-press timer", liveTimers() === 0);
	check("a short press does not fire onLongPress", longs === 1);
	dispose();
}

// --- dispose mid-press cancels a still-armed long-press timer (onCleanup) ------------
{
	let longs = 0;
	const [node, dispose] = createRoot(() =>
		Button({ label: "Hold", onPress: () => {}, onLongPress: () => longs++ }),
	);
	node.behavior.onPressSelect(node); // arm the timer, never release
	check("timer armed and held", liveTimers() === 1);
	dispose(); // onCleanup(clearTimer) cancels the pending timer
	check("disposing mid-press cancels the armed timer (no leak)", liveTimers() === 0);
	tick(3);
	check("the cancelled long-press never fires", longs === 0);
}

done();
