// Pebble's right-edge ActionBar — the opt-in `runtime/actionbar` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/actionbar` never ships
// it (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): an ActionBar is a narrow Piu
// Container anchored to the RIGHT edge (right:0, top:0, bottom:0, fixed width)
// holding a Column of THREE Labels — a hint for the up button near the top, the
// select button centered, the down button near the bottom (up gets top:0, down
// gets bottom:0; select rides the column's middle). An omitted slot is a real
// but EMPTY Label so the layout never reflows when a slot appears/disappears.
//
// REACTIVITY (idiom 5b — the Move/VirtualList pattern, flow.ts): a slot value
// may be a plain string (static) OR a `() => string` thunk. A thunk slot builds
// its Label empty, then ONE effect writes `label.string` and re-runs whenever a
// signal it read changes — the effect registers under the running owner, so it
// disposes with the screen (no leak on navigate-away). Static slots take the
// jsx-free fast path: a bare string in the construction dict, no effect.
//
// GOTCHAS (batch-1 lessons):
//  - This is a PRELOADED module (frozen into ROM at build). NEVER construct a
//    Piu host object (new Style / new Skin / new Label / new Column /
//    new Container) at MODULE SCOPE — a build-time-preload constructor freezes
//    into a broken instance and renders blank on device (measured on badge).
//    Every constructor here runs PER-CALL inside `ActionBar`, at runtime; the
//    optional `background` fill Skin is built lazily (only when a background is
//    actually passed).
//  - The label font MUST be a valid Pebble system font key — "18px Gothic"
//    (tools/fontcheck). An invalid key renders blank.
import { effect } from "runtime/signals";
import { screen } from "runtime/jsx-runtime";
import type { Color, Content, Label as PiuLabel } from "../../../types/moddable/piu/MC-types";

// A single-line hint font — small enough to sit three-up in a ~28px-wide bar,
// and a valid Pebble system font (an invalid key renders blank — tools/fontcheck).
const HINT_FONT = "18px Gothic";

/** Props for {@link ActionBar}. */
export type ActionBarProps = {
	/** Up-button hint (top slot). A thunk (`() => s`) makes it reactive; a bare string is static; omitted = blank. */
	up?: string | (() => string);
	/** Select-button hint (center slot). Thunk = reactive, string = static, omitted = blank. */
	select?: string | (() => string);
	/** Down-button hint (bottom slot). Thunk = reactive, string = static, omitted = blank. */
	down?: string | (() => string);
	/** Bar width in px. Defaults to 28. */
	width?: number;
	/** Hint text color. Defaults to `"white"`. */
	color?: Color;
	/** Bar background fill. Omitted = transparent (no Skin built). */
	background?: Color;
};

// Build one slot Label. A thunk value drives `label.string` through an effect
// (runs now, re-runs on signal change — idiom 5b); a plain string / omitted slot
// is written once into the construction dict (empty string keeps layout stable).
function slot(
	value: string | (() => string) | undefined,
	dims: Record<string, number | object>,
): PiuLabel {
	const reactive = typeof value === "function";
	const label = new Label(null, { ...dims, string: reactive ? "" : (value ?? "") });
	if (reactive) effect(() => (label.string = String((value as () => string)())));
	return label;
}

/**
 * ActionBar — Pebble's right-edge button-hint strip, on ONE Piu Container.
 *
 *   const [n] = useState(0);
 *   <ActionBar up="+" select="OK" down="-" />           // static
 *   <ActionBar up={() => String(n())} select="OK" />    // reactive up hint
 *
 * A narrow Container pinned to the RIGHT edge holds a Column of three Labels
 * (up top, select center, down bottom). Reactive slots are `() => string`
 * thunks driven by per-slot effects (idiom 5b); static strings work too. See
 * the module header for the preload/lazy-construction gotchas.
 */
export function ActionBar(props: ActionBarProps): Content {
	const width = props.width ?? 28;
	const style = new Style({ font: HINT_FONT, color: props.color ?? "white" });
	// EXPLICIT height (gotcha 16): a top+bottom-anchored container measures 0 in
	// Piu's measure pass and draws NOTHING — the strip needs a real height
	// (screen.height) as well as its width.
	const barDims: Record<string, number | object> = {
		right: 0,
		top: 0,
		width,
		height: screen.height,
	};
	if (props.background !== undefined) barDims.skin = new Skin({ fill: props.background });
	const bar = new Container(null, barDims);
	const column = new Column(null, { left: 0, top: 0, width, height: screen.height });
	column.add(slot(props.up, { style, top: 0 }));
	column.add(slot(props.select, { style }));
	column.add(slot(props.down, { style, bottom: 0 }));
	bar.add(column);
	return bar;
}
