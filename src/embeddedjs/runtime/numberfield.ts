// A big centered number STEPPER display (a Pebble NumberWindow analog) — the
// opt-in `runtime/numberfield` module. OPT-IN & ZERO-COST: an app that never
// imports `runtime/numberfield` never ships it (the manifest prunes to the
// import closure — README tree-shaking), so this module costs non-users nothing.
//
// DISPLAY-ONLY (Rule 8 — no substrate, owns no state): NumberField renders the
// number plus the +/- affordance HINTS, nothing more. The APP owns the value (a
// signal) and does the increment on a button press; NumberField just reflects
// it, clamped into [min,max] FOR DISPLAY. It owns no timer, no navigation, no
// button handling — a bare reflector of app state (the Spinner is the sole
// widget that owns its own animation; this is not it).
//
// COMPOSITION (idiom 5b — hand-built Piu nodes + ONE driving effect, like
// tabs.ts / statusbar.ts / card.ts, NOT a Canvas): a NumberField is a `Column`
// (vertical stack, top-to-bottom) of up to three `Label`s — a '+' hint on top,
// the big value(+unit) Label in the middle, a '-' hint on the bottom. There is
// no drawing, just positioned text with two shared Styles (a big value Style +
// a muted affordance Style — indices, not per-label allocations, Rule 4 / 32KB).
//
// REACTIVITY (idiom 5b): a `value` passed as a THUNK (`() => n`) gets ONE effect
// that re-strings the value Label on every change — the thunk's signal reads
// inside the effect auto-subscribe, so the number follows the signal with no
// bind wiring at the call site. A bare number `value` is stringified ONCE at
// construction (static, no effect). The effect registers under the running owner
// and disposes with the screen (no leak on navigate-away). The displayed value
// is clamped into [min,max] (each bound applied only when provided) BEFORE
// display, INSIDE the effect, so a reactive value that runs out of range still
// shows the bound rather than the raw number.
//
// GOTCHA 16 (an anchor-only / width-less container measures 0 and draws
// NOTHING): the Column is built with an EXPLICIT numeric width AND height, and
// every Label carries an explicit width + height too — a measure-0 node paints
// blank on device. The three rows split the height 1/4 : 1/2 : 1/4 (round(h/4)
// per hint, the remainder for the value) so the big number sits centered between
// the hints.
//
// FONT / HOST OBJECTS (Rule 1 + Rule 4 — a module-scope `new Style` freezes into
// a broken ROM instance and renders BLANK, and an invalid font key renders
// BLANK): the two label Styles are built PER-CALL inside NumberField (runtime,
// never module scope), with valid Pebble system font keys — "bold 42px Bitham"
// for the value, "24px Gothic" for the hints (tools/fontcheck). The affordance
// hints are ASCII "+"/"-", NOT unicode arrows (exotic glyphs may be absent on
// device — Rule 4).
import { effect } from "runtime/signals";
import { screen } from "runtime/jsx-runtime";
import type {
	Color,
	Content,
	Container as PiuContainer,
	Label as PiuLabel,
} from "../../../types/moddable/piu/MC-types";

// Valid Pebble system font keys (tools/fontcheck): a big bold Bitham for the
// value, a muted Gothic for the +/- hints. An invalid key renders BLANK (Rule 4).
const VALUE_FONT = "bold 42px Bitham";
const AFFORDANCE_FONT = "24px Gothic";
// White value text; muted gray hints, when the caller overrides neither.
const DEFAULT_COLOR: Color = "white";
const AFFORDANCE_COLOR: Color = "#808080";

/** Props for {@link NumberField}. */
export type NumberFieldProps = {
	/** The number to display. A thunk (`() => n`) makes it reactive; a bare number is static. Clamped into `[min,max]` for display when those are given. */
	value: number | (() => number);
	/** Field width in px. Defaults to the screen width (a width-less Column measures 0 — gotcha 16). */
	width?: number;
	/** Field height in px. Defaults to 120. Split 1/4 : 1/2 : 1/4 across the +/value/- rows. */
	height?: number;
	/** Lower display bound — the shown value never drops below it. Omit for no floor. */
	min?: number;
	/** Upper display bound — the shown value never rises above it. Omit for no ceiling. */
	max?: number;
	/** Suffix appended after the number (e.g. `"%"`). Omit for none. */
	unit?: string;
	/** Value font. Defaults to `"bold 42px Bitham"` (a valid Pebble key — Rule 4). */
	font?: string;
	/** Value text color. Defaults to `"white"`. */
	color?: Color;
	/** Show the `+`/`-` affordance hints above/below the number. Defaults to `true`. */
	affordance?: boolean;
	/** Affordance hint color. Defaults to `"#808080"`. */
	affordanceColor?: Color;
	/** Affordance hint font. Defaults to `"24px Gothic"` (a valid Pebble key — Rule 4). */
	affordanceFont?: string;
};

/**
 * NumberField — a big centered number with `+`/`-` stepper affordance hints
 * (a Pebble NumberWindow analog), on ONE Column of Labels.
 *
 *   const [n, setN] = useState(0);
 *   const up = () => setN((v) => Math.min(v + 5, 100));
 *   const down = () => setN((v) => Math.max(v - 5, 0));
 *   <NumberField value={n} min={0} max={100} unit="%" />   // reactive
 *   <NumberField value={42} affordance={false} />          // static, no hints
 *
 * DISPLAY-ONLY (Rule 8) — the APP owns the value and steps it on a button press;
 * NumberField just reflects it, clamped into `[min,max]`. Hand-builds a Column of
 * up to three Labels; a thunk `value` is driven by ONE effect (idiom 5b). See the
 * module header for the composition + reactivity + gotcha-16 contract.
 */
export function NumberField(props: NumberFieldProps): Content {
	const width = props.width ?? screen.width;
	const height = props.height ?? 120;
	const unit = props.unit ?? "";
	const font = props.font ?? VALUE_FONT;
	const color = props.color ?? DEFAULT_COLOR;
	const affordance = props.affordance !== false;
	const affordanceColor = props.affordanceColor ?? AFFORDANCE_COLOR;
	const affordanceFont = props.affordanceFont ?? AFFORDANCE_FONT;
	const min = props.min;
	const max = props.max;

	// Two shared Styles cover every label (big value text + muted hint text).
	// Built PER-CALL at runtime — never module scope (a preloaded top-level
	// `new Style` freezes broken, Rule 1). The hint Style is only built when the
	// hints are shown (no wasted allocation — Rule 4).
	const valueStyle = new Style({ font, color });
	const affordanceStyle = affordance
		? new Style({ font: affordanceFont, color: affordanceColor })
		: undefined;

	// Clamp a raw value into [min,max] — each bound applied ONLY when provided
	// (display clamp; the app still owns the real value, Rule 8) — then stringify
	// with the optional unit suffix. Reused by BOTH the static and reactive paths.
	const format = (raw: number): string => {
		let v = raw;
		if (min !== undefined && v < min) v = min;
		if (max !== undefined && v > max) v = max;
		return String(v) + unit;
	};

	// EXPLICIT width + height (gotcha 16): a measure-0 Column draws nothing. The
	// rows split 1/4 : 1/2 : 1/4 — round(h/4) per hint, the remainder for the
	// value — so the big number sits centered between the hints. No hints -> the
	// value Label fills the whole height.
	const hintHeight = affordance ? Math.round(height / 4) : 0;
	const valueHeight = height - 2 * hintHeight;
	const column = new Column(null, { width, height }) as PiuContainer;

	// '+' hint above the number (ASCII, not a unicode arrow — Rule 4). Static.
	if (affordance) {
		column.add(
			new Label(null, {
				width,
				height: hintHeight,
				style: affordanceStyle,
				string: "+",
			}) as PiuLabel,
		);
	}

	// The value Label (center, big). Reactive thunk -> ONE effect re-strings it on
	// change (idiom 5b, auto-tracks); a bare number is stringified once at
	// construction (static). Explicit width + height (gotcha 16).
	const valueLabel = new Label(null, {
		width,
		height: valueHeight,
		style: valueStyle,
	}) as PiuLabel;
	const value = props.value;
	if (typeof value === "function") {
		effect(() => {
			valueLabel.string = format(value());
		});
	} else {
		valueLabel.string = format(value);
	}
	column.add(valueLabel);

	// '-' hint below the number (ASCII). Static.
	if (affordance) {
		column.add(
			new Label(null, {
				width,
				height: hintHeight,
				style: affordanceStyle,
				string: "-",
			}) as PiuLabel,
		);
	}

	return column;
}
