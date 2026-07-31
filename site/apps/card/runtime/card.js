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
import { screen, appendChild } from "runtime/jsx-runtime";
// Bold system font for the title bar — a valid Pebble font key (tools/fontcheck).
const TITLE_FONT = "bold 18px Gothic";
// Dark-gray card background and white title, when the caller overrides neither.
const DEFAULT_FILL = "#202020";
const DEFAULT_TITLE_COLOR = "white";
// The shared default fill Skin + title Style, created ONCE but LAZILY — on the
// first Card, at RUNTIME. They must NOT be constructed at module scope: a
// PRELOADED module's top-level `new Skin/Style` freezes into a broken instance
// and the card renders blank on-device (measured — see the module header).
let defaultFill;
const getDefaultFill = () => (defaultFill ??= new Skin({ fill: DEFAULT_FILL }));
let defaultTitleStyle;
const getDefaultTitleStyle = () => (defaultTitleStyle ??= new Style({ font: TITLE_FONT, color: DEFAULT_TITLE_COLOR }));
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
export function Card(props) {
    const skin = props.fill !== undefined ? new Skin({ fill: props.fill }) : getDefaultFill();
    const titleStyle = props.titleColor !== undefined
        ? new Style({ font: TITLE_FONT, color: props.titleColor })
        : getDefaultTitleStyle();
    // Outer fill-skinned box. Default to the real screen width — a width-less
    // container measures 0 and draws nothing (gotcha 16); explicit width wins.
    const outerDict = { skin, width: props.width ?? screen.width };
    if (props.height !== undefined)
        outerDict.height = props.height;
    const outer = new Container(null, outerDict);
    const column = new Column(null, {});
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
    }
    else if (title !== undefined) {
        titleLabel.string = title;
    }
    column.add(titleLabel);
    // Body — holds children (may be omitted). appendChild flattens arrays and
    // skips nullish, so an undefined child is a safe no-op.
    const bodyDict = {};
    if (props.bodyColor !== undefined)
        bodyDict.skin = new Skin({ fill: props.bodyColor });
    const body = new Container(null, bodyDict);
    if (props.children !== undefined)
        appendChild(body, props.children);
    column.add(body);
    return outer;
}
