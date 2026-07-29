// A focusable, pressable Button (React-Native Button/Pressable + react-pebble
// useButton) — the opt-in `runtime/button` module. OPT-IN & ZERO-COST: an app
// that never imports `runtime/button` never ships it (the manifest prunes to the
// import closure — README tree-shaking), so this module costs non-users nothing.
//
// WHAT (Rule 2 — no new substrate): Button packages the raw focus + button-press
// substrate the jsx-runtime already proves into ONE component. It is a single
// focusable `Container` (explicit width AND height — gotcha 16) holding a centered
// `Label`, whose background Skin SWAPS on press for visual feedback. Nothing is
// drawn by hand; it is built through the jsx() factory so `focus`, the
// onPress*/onRelease* whitelist and the reactive `skin` binding all ride the
// device-proven paths — the ErrorBoundary crash UI (jsx-runtime.ts:400-425) is the
// in-repo receipt for a focusable Container + onPressSelect + post-mount focus().
//
// PRESS MODEL (RN Pressable): onPress fires on RELEASE, not on press-down — the
// press-down only lights the pressed skin (a `pressed` signal drives the reactive
// `skin` prop, idiom 5b). onPressSelect sets pressed=true; onReleaseSelect sets
// pressed=false and fires onPress. Both handlers RETURN TRUTHY so the Select press
// is CONSUMED (does not bubble past the button — jsx-runtime's HandlerBehavior
// stops bubbling on any non-false return).
//
// LONG PRESS (optional onLongPress, RN Pressable parity): armed ONLY when the
// caller passes onLongPress. Press-down starts a ONE-SHOT timer (LONG_PRESS_MS);
// if it fires before release, onLongPress runs and a `longFired` flag SWALLOWS the
// onPress the following release would otherwise fire. Written when setTimeout
// was believed absent on
// device (Rule 5 — the base manifest ships setInterval / clearInterval only, see
// runtime/timers.ts), so the one-shot is a setInterval that clearInterval's ITSELF
// inside its own callback. onCleanup cancels a still-armed timer if the screen is
// torn down mid-press (no leak on navigate-away).
//
// FOCUS (single-focus constraint): the `focus` prop (default true) is applied by
// the jsx-runtime AFTER mount (render()'s consumePendingFocus) so the button's
// behavior receives Select presses. Only ONE node holds focus at a time — put ONE
// focused Button per screen; for several buttons pass focus={false} to all but one
// and drive focus yourself (there is no built-in focus manager — Rule 2). The
// `focus` prop only takes effect in the initial render() tree (jsx-runtime only
// consumes pending focus there, by measured design).
//
// HOST OBJECTS (gotcha — a module-scope `new Skin/Style` freezes BLANK): the two
// Skins, the label Style, the `pressed` signal AND the timer are ALL built INSIDE
// Button at runtime, never at module scope (a preloaded module's top-level
// construction freezes into a broken ROM instance, measured on Badge). The label
// font "18px Gothic" is a valid Pebble system font key (tools/fontcheck).
import { jsx, screen } from "runtime/jsx-runtime";
import { signal, onCleanup } from "runtime/signals";
import type { Color, Content } from "../../../types/moddable/piu/MC-types";

// Valid Pebble system font key for the label (tools/fontcheck).
const BUTTON_FONT = "18px Gothic";
// Idle vs pressed background fills, and the label text color. Grayscale-safe: the
// fill jumps dark -> bright on press so the change reads on the b/w panels too,
// while white text stays legible on the idle fill.
const IDLE_FILL: Color = "#333333";
const PRESSED_FILL: Color = "#0077cc";
const TEXT_COLOR: Color = "white";
// Default button box. Width falls back to the screen width (card.ts / menu.ts
// convention); height is a constant. Both are ALWAYS explicit on the Container —
// a size-less / anchor-only container measures 0 and draws nothing (gotcha 16).
const DEFAULT_HEIGHT = 40;
// Long-press threshold in ms (RN Pressable's default onLongPress delay).
const LONG_PRESS_MS = 500;

/** Props for {@link Button}. */
export type ButtonProps = {
	/** The centered caption. A thunk (`() => s`) makes it reactive (the `string` whitelist); a bare string is static. */
	label: string | (() => string);
	/** Fired once per completed press — on RELEASE (RN Pressable semantics), not on press-down. */
	onPress: () => void;
	/** Button width in px. Defaults to the screen width (a width-less container measures 0 — gotcha 16). */
	width?: number;
	/** Button height in px. Defaults to 40. */
	height?: number;
	/**
	 * Whether this button takes input focus after mount (default true) so its
	 * behavior receives Select presses. Only ONE node can hold focus — pass
	 * `false` on every button but one when a screen has several (see the header).
	 */
	focus?: boolean;
	/**
	 * Optional long-press handler (RN Pressable parity). When given, holding
	 * Select ~500ms fires this INSTEAD of `onPress` (the release that follows is
	 * swallowed). Omit for a plain button (no timer is ever armed).
	 */
	onLongPress?: () => void;
};

/**
 * Button — a focusable, pressable Container with a centered label and a skin that
 * swaps on press.
 *
 *   const [n, setN] = useState(0);
 *   <Button label="Press SELECT" onPress={() => setN((c) => c + 1)} width={160} />
 *   <Button label={() => `Count ${n()}`} onPress={reset} onLongPress={hardReset} />
 *
 * Built through the jsx() factory so the `focus` prop, the onPressSelect/
 * onReleaseSelect whitelist and the reactive `skin` binding all ride the
 * device-proven paths (the ErrorBoundary crash UI is the in-repo receipt). onPress
 * fires on RELEASE; press-down only lights the pressed skin. Handlers return truthy
 * to CONSUME the Select press. See the module header for the press / long-press /
 * focus / single-focus contract.
 */
export function Button(props: ButtonProps): Content {
	const onPress = props.onPress;
	const onLongPress = props.onLongPress;
	const width = props.width ?? screen.width;
	const height = props.height ?? DEFAULT_HEIGHT;
	const focus = props.focus ?? true;

	// Idle + pressed background Skins and the label Style — built per-call at
	// runtime, NEVER module scope (a preloaded top-level `new Skin/Style` freezes
	// broken, measured on Badge). The Style centers the caption both ways.
	const idleSkin = new Skin({ fill: IDLE_FILL });
	const pressedSkin = new Skin({ fill: PRESSED_FILL });
	const labelStyle = new Style({
		font: BUTTON_FONT,
		color: TEXT_COLOR,
		horizontal: "center",
		vertical: "middle",
	});

	// `pressed` drives the reactive skin swap (idiom 5b): reading it inside the
	// `skin` thunk subscribes the jsx binding, so a press repaints the background.
	const pressed = signal(false);

	// One-shot long-press timer state, held in this call's closure (Rule 5 —
	// created at runtime, cleared idempotently). `longFired` records that the long
	// press already ran so the FOLLOWING release swallows onPress.
	let timerId: number | null = null;
	let longFired = false;
	const clearTimer = (): void => {
		if (timerId !== null) {
			clearInterval(timerId);
			timerId = null;
		}
	};

	// Press-down: light the pressed skin; if a long-press handler was given, arm
	// the one-shot (a setInterval that clears ITSELF on fire — the pre-hostprobe
	// no-setTimeout shape, kept as-is; see button.ts header note on
	// device). Return truthy to consume the Select press.
	const handlePress = (): boolean => {
		pressed.value = true;
		if (onLongPress)
			timerId = setInterval(() => {
				clearTimer(); // one-shot: fire exactly once
				longFired = true;
				onLongPress();
			}, LONG_PRESS_MS);
		return true;
	};
	// Release: clear the pressed skin + cancel any pending timer; fire onPress
	// UNLESS a long press already handled this gesture (then reset the flag).
	const handleRelease = (): boolean => {
		pressed.value = false;
		clearTimer();
		if (longFired) longFired = false;
		else onPress();
		return true;
	};
	// Cancel a still-armed timer if the owner is disposed mid-press (no leak). Only
	// registered when a timer can exist (onLongPress given) — Rule 2.
	if (onLongPress) onCleanup(clearTimer);

	// The centered label — a thunk `label` becomes a reactive `string` binding, a
	// bare string is static (jsx routes both off the `string` whitelist).
	const labelNode = jsx(Label, {
		width,
		height,
		string: props.label,
		style: labelStyle,
	});

	// The focusable box: explicit width AND height (gotcha 16); a reactive `skin`
	// bound to `pressed` (idiom 5b, `skin` is whitelisted); focus applied post-mount
	// by the jsx-runtime; the Select press/release wired to the handlers above.
	return jsx(Container, {
		width,
		height,
		skin: () => (pressed.value ? pressedSkin : idleSkin),
		focus,
		onPressSelect: handlePress,
		onReleaseSelect: handleRelease,
		children: labelNode,
	}) as Content;
}
