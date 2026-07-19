// A centered modal-style card — the opt-in `runtime/dialog` module. OPT-IN &
// ZERO-COST: an app that never imports `runtime/dialog` never ships it (the
// manifest prunes to the import closure — README tree-shaking), so this module
// costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a Dialog is plain Piu nodes — a
// fill-skinned `Container` centered on the screen, wrapping a `Column` that
// stacks a bold title `Label`, a wrapping message `Label` (given an explicit
// width so it breaks across lines), and an optional bottom hint `Label`. It is
// the hand-built Piu-node idiom (like Card / StatusBar), NOT a Canvas
// composition (like Badge): there is no drawing, just positioned text.
//
// REACTIVITY (idiom 5b — hand-built node + driving effect): a `title` or
// `message` passed as a THUNK (`() => s`) gets ONE effect that writes
// `lbl.string` on every change — the thunk's signal reads inside the effect
// auto-subscribe, so the label re-renders when they change. A plain string is
// written once at construction (static, no effect). Each effect registers under
// the running owner and disposes with the screen (no leak on navigate-away).
// The `hint` is a static string only (a modal's dismiss prompt is fixed).
//
// EXPLICIT SIZE (gotcha 16 — a size-less container measures 0 and draws
// NOTHING): the outer box carries an EXPLICIT width AND height (defaults derived
// from screen.{width,height}) and is centered by computed `left`/`top`. Without
// them the modal blanks on-device — the same real bug StatusBar/Card hit.
//
// LAZY HOST OBJECTS (gotcha — a module-scope `new Skin/Style` freezes BLANK):
// this is a PRELOADED module (frozen into ROM at build), so a top-level
// `new Skin(...)`/`new Style(...)` would construct in the build-time preload
// compartment and freeze into a broken instance (measured on Badge: blank until
// its module-scope Style was made lazy). The shared default fill Skin and text
// Styles are therefore created LAZILY on first Dialog, at runtime; per-Dialog
// `fill`/`titleColor`/`textColor` overrides are constructed inside the function
// (also runtime). Every font key is a valid Pebble system font (tools/fontcheck)
// — an invalid one renders blank.
import { effect } from "runtime/signals";
import { screen } from "runtime/jsx-runtime";
import type {
	Color,
	Content,
	Container as PiuContainer,
	Label as PiuLabel,
	Skin,
	Style,
} from "../../../types/moddable/piu/MC-types";

// Valid Pebble system font keys (tools/fontcheck): a bold title, a regular
// message body, and a smaller hint line.
const TITLE_FONT = "bold 18px Gothic";
const MESSAGE_FONT = "18px Gothic";
const HINT_FONT = "14px Gothic";
// Dark modal background; white title and body when the caller overrides neither.
const DEFAULT_FILL: Color = "#202020";
const DEFAULT_TITLE_COLOR: Color = "white";
const DEFAULT_TEXT_COLOR: Color = "white";
// Horizontal inset so the wrapping message Label doesn't touch the box edges.
const PADDING = 8;

// The shared default fill Skin + text Styles, created ONCE but LAZILY — on the
// first Dialog, at RUNTIME. They must NOT be constructed at module scope: a
// PRELOADED module's top-level `new Skin/Style` freezes into a broken instance
// and the modal renders blank on-device (measured — see the module header).
let defaultFill: Skin | undefined;
const getDefaultFill = (): Skin => (defaultFill ??= new Skin({ fill: DEFAULT_FILL }));
let defaultTitleStyle: Style | undefined;
const getDefaultTitleStyle = (): Style =>
	(defaultTitleStyle ??= new Style({ font: TITLE_FONT, color: DEFAULT_TITLE_COLOR }));
let defaultMessageStyle: Style | undefined;
const getDefaultMessageStyle = (): Style =>
	(defaultMessageStyle ??= new Style({ font: MESSAGE_FONT, color: DEFAULT_TEXT_COLOR }));
let defaultHintStyle: Style | undefined;
const getDefaultHintStyle = (): Style =>
	(defaultHintStyle ??= new Style({ font: HINT_FONT, color: DEFAULT_TEXT_COLOR }));

/** Props for {@link Dialog}. */
export type DialogProps = {
	/** Bold title line. A thunk (`() => s`) makes it reactive; a bare string is static. Omit for no title Label. */
	title?: string | (() => string);
	/** Message body (wraps to the box width). A thunk (`() => s`) makes it reactive; a bare string is static. Omit for no message Label. */
	message?: string | (() => string);
	/** Static bottom hint, e.g. `"SELECT to dismiss"`. Omit for no hint Label. */
	hint?: string;
	/** Box width in px. Defaults to `screen.width - 20` (a width-less container measures 0 — gotcha 16). */
	width?: number;
	/** Box height in px. Defaults to `screen.height - 40`. */
	height?: number;
	/** Box background fill. Defaults to a dark gray (`"#202020"`). */
	fill?: Color;
	/** Title text color. Defaults to `"white"`. */
	titleColor?: Color;
	/** Message + hint text color. Defaults to `"white"`. */
	textColor?: Color;
};

// Add one Label to the column, driving it with an effect when the value is a
// thunk (idiom 5b — reads inside the effect auto-track), or writing a bare
// string once. `extra` carries any per-Label dict (e.g. the message width).
function addLabel(
	column: PiuContainer,
	value: string | (() => string),
	style: Style,
	extra?: Record<string, number>,
): void {
	const reactive = typeof value === "function";
	const lbl = new Label(null, {
		style,
		string: reactive ? "" : String(value),
		...extra,
	}) as PiuLabel;
	if (reactive) {
		const fn = value;
		effect(() => {
			lbl.string = String(fn());
		});
	}
	column.add(lbl);
}

/**
 * Dialog — a centered modal card: a bold title over a wrapping message and an
 * optional dismiss hint, on ONE fill-skinned Container.
 *
 *   <Dialog title="Alert" message="Battery low" hint="SELECT to dismiss" />
 *   <Dialog title={() => `${n()} left`} message={() => status()} />  // reactive
 *
 * A fill-skinned Container (explicit width + height, centered via computed
 * left/top — gotcha 16) wraps a Column of Labels; thunk props are driven by
 * effects (idiom 5b). See the module header.
 */
export function Dialog(props: DialogProps): Content {
	const skin = props.fill !== undefined ? new Skin({ fill: props.fill }) : getDefaultFill();
	const titleStyle =
		props.titleColor !== undefined
			? new Style({ font: TITLE_FONT, color: props.titleColor })
			: getDefaultTitleStyle();
	const messageStyle =
		props.textColor !== undefined
			? new Style({ font: MESSAGE_FONT, color: props.textColor })
			: getDefaultMessageStyle();
	const hintStyle =
		props.textColor !== undefined
			? new Style({ font: HINT_FONT, color: props.textColor })
			: getDefaultHintStyle();

	// Explicit size + centered position (gotcha 16). Defaults leave a margin
	// around the screen; explicit width/height win. left/top center the box.
	const width = props.width ?? screen.width - 20;
	const height = props.height ?? screen.height - 40;
	const outer = new Container(null, {
		skin,
		width,
		height,
		left: (screen.width - width) / 2,
		top: (screen.height - height) / 2,
	}) as PiuContainer;

	const column = new Column(null, {}) as PiuContainer;
	outer.add(column);

	if (props.title !== undefined) addLabel(column, props.title, titleStyle);
	// The message Label gets an explicit width so Piu wraps it across lines.
	if (props.message !== undefined)
		addLabel(column, props.message, messageStyle, { width: width - PADDING * 2 });
	if (props.hint !== undefined) addLabel(column, props.hint, hintStyle);

	return outer;
}
