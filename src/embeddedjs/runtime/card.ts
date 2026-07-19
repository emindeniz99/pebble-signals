// A titled content box — the opt-in `runtime/card` module. OPT-IN & ZERO-COST:
// an app that never imports `runtime/card` never ships it (the manifest prunes
// to the import closure — README tree-shaking), so this module costs non-users
// nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a Card is plain Piu nodes — a fill-
// skinned `Container` wrapping a `Column` that stacks a bold title `Label` over
// a body `Container`. `children` mount into the body via `appendChild` (the same
// flattening/skip-nullish rules as jsx). No Port, no rasterizer — just layout.
//
// REACTIVITY (idiom 5b, the Move/VirtualList idiom from flow.ts): a `title`
// thunk is driven by ONE `effect` that writes `titleLabel.string` on change —
// the effect registers under the running owner and disposes with the screen. A
// bare string title is written once at construction (no effect, no tracking).
//
// LAZY HOST OBJECTS (gotcha — a module-scope `new Skin/Style` freezes BLANK):
// this is a PRELOADED module (frozen into ROM at build), so a top-level
// `new Skin(...)`/`new Style(...)` would construct in the build-time preload
// compartment and freeze into a broken instance (measured on badge: blank until
// its module-scope Style was made lazy). The shared default fill Skin and title
// Style are therefore created LAZILY on first Card, at runtime; a per-Card
// `fill`/`titleColor`/`bodyColor` override is constructed inside the component
// (also runtime). The title font "bold 18px Gothic" is a valid Pebble system
// font key (an invalid one renders blank — tools/fontcheck).
import { effect } from "runtime/signals";
import { screen, appendChild, type JSXNode } from "runtime/jsx-runtime";
import type {
	Color,
	Content,
	Container as PiuContainer,
	Skin,
	Style,
} from "../../../types/moddable/piu/MC-types";

// Bold system font for the title bar — a valid Pebble font key (tools/fontcheck).
const TITLE_FONT = "bold 18px Gothic";
// Dark-gray card background and white title, when the caller overrides neither.
const DEFAULT_FILL: Color = "#202020";
const DEFAULT_TITLE_COLOR: Color = "white";

// The shared default fill Skin + title Style, created ONCE but LAZILY — on the
// first Card, at RUNTIME. They must NOT be constructed at module scope: a
// PRELOADED module's top-level `new Skin/Style` freezes into a broken instance
// and the card renders blank on-device (measured — see the module header).
let defaultFill: Skin | undefined;
const getDefaultFill = (): Skin => (defaultFill ??= new Skin({ fill: DEFAULT_FILL }));
let defaultTitleStyle: Style | undefined;
const getDefaultTitleStyle = (): Style =>
	(defaultTitleStyle ??= new Style({ font: TITLE_FONT, color: DEFAULT_TITLE_COLOR }));

/** Props for {@link Card}. */
export type CardProps = {
	/** Title bar text. A thunk (`() => s`) makes the bar reactive; a bare string is static. Omit for a blank bar. */
	title?: string | (() => string);
	/** Body content mounted below the title bar. May be omitted (an empty body). */
	children?: JSXNode;
	/** Card width in px. Defaults to the screen width (a width-less container measures 0 — gotcha 16). */
	width?: number;
	/** Card height in px. Omit to size to content. */
	height?: number;
	/** Card background fill. Defaults to a dark gray (`"#202020"`). */
	fill?: Color;
	/** Title text color. Defaults to `"white"`. */
	titleColor?: Color;
	/** Body background fill. Omit for a transparent body (inherits the card fill). */
	bodyColor?: Color;
};

/**
 * Card — a titled content box: a bold title bar over a body holding children.
 *
 *   <Card title="Weather" width={140}>
 *     <Label string="Sunny 72°" />
 *   </Card>
 *   <Card title={() => "Steps " + steps()} />   // reactive title bar
 *
 * A fill-skinned Container wraps a Column stacking the title Label over a body
 * Container; `children` mount into the body. See the module header for the
 * composition + reactivity (idiom 5b) contract.
 */
export function Card(props: CardProps): Content {
	const skin = props.fill !== undefined ? new Skin({ fill: props.fill }) : getDefaultFill();
	const titleStyle =
		props.titleColor !== undefined
			? new Style({ font: TITLE_FONT, color: props.titleColor })
			: getDefaultTitleStyle();

	// Outer fill-skinned box. Default to the real screen width — a width-less
	// container measures 0 and draws nothing (gotcha 16); explicit width wins.
	const outerDict: Record<string, number | Skin> = { skin, width: props.width ?? screen.width };
	if (props.height !== undefined) outerDict.height = props.height;
	const outer = new Container(
		null,
		outerDict as ConstructorParameters<typeof Container>[1],
	) as PiuContainer;

	const column = new Column(null, {}) as PiuContainer;
	outer.add(column);

	// Title bar. Reactive thunk -> one effect drives `.string` (idiom 5b); a bare
	// string is written once. The effect registers under the running owner and
	// disposes with the screen.
	const title = props.title;
	const titleLabel = new Label(null, { style: titleStyle });
	if (typeof title === "function") {
		effect(() => {
			titleLabel.string = String(title());
		});
	} else if (title !== undefined) {
		titleLabel.string = title;
	}
	column.add(titleLabel);

	// Body — holds children (may be omitted). appendChild flattens arrays and
	// skips nullish, so an undefined child is a safe no-op.
	const bodyDict: Record<string, Skin> = {};
	if (props.bodyColor !== undefined) bodyDict.skin = new Skin({ fill: props.bodyColor });
	const body = new Container(
		null,
		bodyDict as ConstructorParameters<typeof Container>[1],
	) as PiuContainer;
	if (props.children !== undefined) appendChild(body, props.children);
	column.add(body);

	return outer;
}
