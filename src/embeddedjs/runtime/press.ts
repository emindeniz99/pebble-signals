// react-pebble press-gesture hooks — the opt-in `runtime/press` module. OPT-IN &
// ZERO-COST: an app that never imports `runtime/press` never ships it (the
// manifest prunes to the import closure — README tree-shaking), so this module
// costs non-users nothing. It constructs NOTHING at module scope (Rule 1): every
// timer id, counter and closure is created INSIDE the exported hook at call time,
// so there is no host node, timer or mutable object to freeze into a broken
// preload instance, and the three exports are `function` declarations exactly like
// timers.ts's useInterval / useTimeout.
//
// WHAT (Rule 2 — no new substrate): the three press GESTURES react-pebble apps
// reach for, each a hold/tempo reading of the raw jsx-runtime button events.
//   - useLongPress   — HOLD-TO-CONFIRM: fire only if the button is held `ms`.
//   - useRepeatClick — HOLD-TO-SCROLL: fire once, then auto-repeat, accelerating.
//   - useMultiClick  — DOUBLE / TRIPLE CLICK: dispatch by click count in a window.
//
// THE HANDLER-BAG IDIOM (like runtime/backhandler): each hook RETURNS a bag of
// button-event handlers keyed for the CHOSEN button — `"onPress" + button` and
// `"onRelease" + button`, which land EXACTLY on the jsx-runtime button whitelist
// (BUTTON_EVENTS: onPress/onRelease × Select|Up|Down|Back). SPREAD the bag onto a
// FOCUSED node and pair it with the `focus` prop:
//
//   <Container focus {...useLongPress("Select", 600, confirm)}>…</Container>
//
// Button events reach the behavior of the FOCUSED content (or a focused ancestor)
// and only ONE node holds focus at a time, so the node the bag is spread onto must
// be the focused one (jsx-runtime applies node.focus() after mount). Every handler
// RETURNS TRUTHY so it CONSUMES the button (a gesture owns its button); returning
// false would let it bubble (jsx-runtime HandlerBehavior's `!== false` delegate).
//
// TIMERS — the timers.ts one-shot + teardown contract, REUSED as a pattern (not a
// dependency): there is NO setTimeout on device (Rule 5 — the base manifest ships
// setInterval / clearInterval only), so a "fire after ms" countdown is a
// setInterval that clearInterval's ITSELF inside its own callback before it fires
// (useTimeout's exact shape; button.ts's long-press uses the same). The live
// interval id lives in a per-call closure; an idempotent `clear()` stops it and
// forgets it; and `track(clear)` registers that clear with the RUNNING OWNER so
// disposing the screen that built the hook stops any still-live timer (a
// long-press armed at navigate-away does not leak). Call the hooks inside a render
// root / component body (Rule 5) so `track` binds — render()'s build runs under
// createRoot, so a spread inside the JSX is owned.
//
// NO SIGNALS, NO APP STATE (Rule 8): a hook owns only timer ids and (multi-click) a
// private click counter — no signal, effect or Piu node. The APP owns the STATE the
// gesture drives (a confirm flag, a scroll counter) and passes plain callbacks; the
// hook owns only the timing. Every default is inlined via `??` (state.ts / anim.ts
// style), so there is not even a module-scope constant.
import { track } from "runtime/signals";

/**
 * The hardware button a press-gesture hook watches — the suffix appended to
 * `onPress` / `onRelease` to form the jsx-runtime button-event keys: `"Select"` →
 * `onPressSelect` / `onReleaseSelect`, `"Up"` → `onPressUp` / `onReleaseUp`, and so
 * on for `"Down"` / `"Back"`, the four buttons Piu delivers to the focused content.
 */
export type PressButton = "Select" | "Up" | "Down" | "Back";

/**
 * The spread-ready bag of button-event handlers every hook returns. Keys are the
 * `onPress<Button>` / `onRelease<Button>` names for the chosen button; each handler
 * returns `true` to CONSUME the event (jsx-runtime's HandlerBehavior treats any
 * non-`false` return as "consume"). Spread it onto a FOCUSED node:
 * `<Container focus {...bag}>`.
 */
export type PressHandlers = Record<string, () => boolean>;

/**
 * useLongPress(button, ms, onFire) — HOLD-TO-CONFIRM. Press and hold `button` for
 * `ms`; `onFire` runs only if the button is STILL held when `ms` elapses. Releasing
 * early cancels it (nothing fires) — the classic "hold to confirm / hold to delete".
 *
 *   const [ok, setOk] = useState(false);
 *   <Container focus {...useLongPress("Select", 600, () => setOk(true))}>
 *     <Label string={() => (ok() ? "confirmed" : "hold SELECT…")} />
 *   </Container>
 *
 * onPress arms a ONE-SHOT — a setInterval that clearInterval's itself before firing
 * (no setTimeout on device; the timers.ts useTimeout shape) — so `onFire` runs
 * exactly once, `ms` after the press. onRelease clears the pending one-shot, so a
 * release before `ms` fires nothing. The id lives in a per-call closure; `track`
 * stops a still-armed hold when the owner is disposed (no leak on navigate-away).
 * Both handlers return `true` to consume the button. Call inside a render root so
 * `track` binds (Rule 5).
 *
 * @param button which hardware button — `"Select" | "Up" | "Down" | "Back"`.
 * @param ms hold duration (ms) the button must be held before `onFire` runs.
 * @param onFire invoked once when the button has been held `ms`.
 * @returns a {@link PressHandlers} bag `{ onPress<Button>, onRelease<Button> }` to
 *   spread on a focused node.
 */
export function useLongPress(button: PressButton, ms: number, onFire: () => void): PressHandlers {
	// Live one-shot id, held in this call's closure (Rule 5) — null when unarmed.
	let current: number | null = null;
	const clear = (): void => {
		if (current !== null) {
			clearInterval(current);
			current = null;
		}
	};
	// Arm the one-shot: a setInterval whose callback clears its OWN timer BEFORE
	// invoking onFire, so it fires exactly once even if onFire throws (useTimeout).
	const arm = (): void => {
		clear();
		current = setInterval(() => {
			clear();
			onFire();
		}, ms);
	};
	track(clear); // owner dispose stops a still-armed hold
	const press = (): boolean => {
		arm();
		return true;
	};
	const release = (): boolean => {
		clear();
		return true;
	};
	return { ["onPress" + button]: press, ["onRelease" + button]: release };
}

/** Options for {@link useRepeatClick} — the auto-repeat tempo and its acceleration. */
export type RepeatClickOptions = {
	/** Delay (ms) before the FIRST auto-repeat, after the immediate press fire. Default 400. */
	initial?: number;
	/** Floor (ms) the accelerating delay never drops below. Default 80. */
	min?: number;
	/** Multiplier applied to the delay after each repeat (`< 1` accelerates). Default 0.8. */
	accel?: number;
};

/**
 * useRepeatClick(button, onFire, opts?) — HOLD-TO-SCROLL. Press fires `onFire` once
 * immediately, then AUTO-REPEATS while the button is held, the gap SHRINKING each
 * time (`delay *= accel`, floored at `min`) so a held button scrolls faster the
 * longer you hold it — the key-repeat / spinner gesture. Releasing stops it.
 *
 *   const [n, setN] = useState(0);
 *   <Container focus {...useRepeatClick("Up", () => setN((c) => c + 1))}>
 *     <Label string={() => "n " + n()} />
 *   </Container>
 *
 * onPress clears any prior run, fires `onFire` once (so a single tap still acts
 * once), then arms a setInterval at `initial` ms; each tick fires `onFire`,
 * multiplies the delay by `accel` (clamped up to `min`) and RE-arms at the new delay
 * — only ONE live timer at a time (it reschedules, it never stacks). onRelease stops
 * the repeat. The id lives in a per-call closure; `track` stops a held repeat on
 * owner dispose. Both handlers return `true` to consume the button. Call inside a
 * render root so `track` binds (Rule 5).
 *
 * @param button which hardware button — `"Select" | "Up" | "Down" | "Back"`.
 * @param onFire invoked on the press and on every auto-repeat tick.
 * @param opts `{ initial=400, min=80, accel=0.8 }` — repeat tempo + acceleration.
 * @returns a {@link PressHandlers} bag `{ onPress<Button>, onRelease<Button> }` to
 *   spread on a focused node.
 */
export function useRepeatClick(
	button: PressButton,
	onFire: () => void,
	opts?: RepeatClickOptions,
): PressHandlers {
	const initial = opts?.initial ?? 400;
	const min = opts?.min ?? 80;
	const accel = opts?.accel ?? 0.8;
	// Live repeat id + the current (accelerating) delay, held in this call's closure.
	let current: number | null = null;
	let delay = initial;
	// `onFire()` may synchronously tear this component down — a handler calling
	// Navigator.push() is the ordinary case. The owner cleanup then runs while
	// we are still inside press()/step(), and re-arming AFTER it left an
	// interval firing forever against an unmounted screen that can no longer
	// receive onRelease (codex P2). Latch the dispose and never re-arm past it.
	let dead = false;
	const clear = (): void => {
		if (current !== null) {
			clearInterval(current);
			current = null;
		}
	};
	// One repeat tick: fire, accelerate the delay (floored at `min`), then reschedule
	// the SINGLE timer at the new delay (clear-then-set, so it never stacks).
	const step = (): void => {
		onFire();
		if (dead) {
			clear();
			return;
		}
		delay *= accel;
		if (delay < min) delay = min;
		clear();
		current = setInterval(step, delay);
	};
	track(() => {
		dead = true;
		clear();
	}); // owner dispose stops a held repeat
	const press = (): boolean => {
		clear();
		delay = initial; // restart the tempo from the top on each fresh hold
		onFire(); // immediate first fire (a single tap still acts once)
		if (dead) return true;
		current = setInterval(step, delay);
		return true;
	};
	const release = (): boolean => {
		clear();
		return true;
	};
	return { ["onPress" + button]: press, ["onRelease" + button]: release };
}

/** Options for {@link useMultiClick}. */
export type MultiClickOptions = {
	/** Max quiet gap (ms) between clicks that still counts them as one burst. Default 300. */
	window?: number;
};

/**
 * useMultiClick(button, handlers, opts?) — DOUBLE / TRIPLE CLICK. Counts how many
 * times `button` is clicked within a rolling `window` ms of quiet, then dispatches
 * `handlers[count]` — `handlers[2]` for a double-click, `handlers[3]` for a triple,
 * and so on. A count with no entry in `handlers` is a no-op.
 *
 *   <Container focus {...useMultiClick("Down", { 2: reset, 3: hardReset })}>
 *     …
 *   </Container>
 *
 * onPress increments the click count (and pauses the idle countdown while the button
 * is held); onRelease (re)arms a ONE-SHOT `window` timer — a setInterval that clears
 * itself before firing (no setTimeout on device; the timers.ts useTimeout shape).
 * Each further click within `window` bumps the count and restarts the timer, so a
 * burst collapses to ONE dispatch; once the button has been quiet for `window` the
 * one-shot fires `handlers[count]` (if present) and RESETS the count to 0. The id +
 * count live in per-call closures; `track` clears a pending timer on owner dispose.
 * Both handlers return `true` to consume the button. Call inside a render root so
 * `track` binds (Rule 5).
 *
 * @param button which hardware button — `"Select" | "Up" | "Down" | "Back"`.
 * @param handlers map of click-count → callback (`{ 2: dbl, 3: triple }`).
 * @param opts `{ window=300 }` — the inter-click quiet time that ends a burst.
 * @returns a {@link PressHandlers} bag `{ onPress<Button>, onRelease<Button> }` to
 *   spread on a focused node.
 */
export function useMultiClick(
	button: PressButton,
	handlers: Record<number, () => void>,
	opts?: MultiClickOptions,
): PressHandlers {
	const windowMs = opts?.window ?? 300;
	// Clicks in the current burst + the live window id, held in this call's closure.
	let count = 0;
	let current: number | null = null;
	const clear = (): void => {
		if (current !== null) {
			clearInterval(current);
			current = null;
		}
	};
	// Burst ended: the one-shot clears itself, dispatches handlers[count] (if any),
	// and resets the count for the next burst.
	const fire = (): void => {
		clear();
		const h = handlers[count];
		count = 0;
		if (h) h();
	};
	track(clear); // owner dispose clears a pending dispatch
	const press = (): boolean => {
		clear(); // a held button is not idle — pause the countdown while pressed
		count++;
		return true;
	};
	const release = (): boolean => {
		clear();
		current = setInterval(fire, windowMs); // (re)arm the burst window
		return true;
	};
	return { ["onPress" + button]: press, ["onRelease" + button]: release };
}
