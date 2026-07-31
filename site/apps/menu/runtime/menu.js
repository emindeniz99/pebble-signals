// A vertical SCROLLING, SELECTABLE list (react-pebble MenuLayer / SimpleMenu
// analog) — the opt-in `runtime/menu` module. OPT-IN & ZERO-COST: an app that
// never imports `runtime/menu` never ships it (the manifest prunes to the import
// closure — README tree-shaking), so this module costs non-users nothing.
//
// DISPLAY-ONLY (Rule 8 — no substrate): Menu renders the LIST and reflects which
// row is selected; it does NOT own the selection. The app owns the `selected`
// index (a signal) and drives it (buttons up/down, a rotary, etc.); Menu just
// highlights the row and scrolls to keep it visible. No navigation, no touch, no
// input handling — a loader is the sole self-owning widget, and this is not one.
//
// COMPOSITION (the hand-built Piu-node idiom, like tabs.ts / statusbar.ts — NOT a
// Canvas): an OUTER clipping `Container` sized to the viewport holds an INNER
// `Column` of one `Label` per item. The Column's content height is
// items.length*rowHeight — TALLER than the viewport when the list overflows — and
// the outer Container CLIPS it to the viewport window. Two shared Styles + one
// Skin cover every row (indices, not per-row allocations — Rule 4, the 32KB
// heap): the active row wears `activeStyle` (activeColor text) + the `activeFill`
// Skin; the rest wear `inactiveStyle` (color text) + a null skin (tabs.ts idiom).
//
// SCROLL (the device-proven Move idiom, flow.ts): coordinate props are
// construction-time statics on this port — a post-mount coordinate WRITE is
// rejected by the port — so the ONLY safe way to scroll a mounted subtree is
// content.moveBy(dx,dy) on the inner Column (2026-07 probe: moveBy stepped a box
// across gabbro for 6 heartbeats with 0 aborts, unlike `visible`/position writes,
// which crash the port). Menu keeps the last-applied scroll offset (start 0) and,
// when the selection would fall out of the viewport, computes the new offset,
// clamps it to [0, contentHeight-height], and applies the DELTA via moveBy —
// GUARDED so a still-visible selection issues no moveBy at all (mirrors Move's
// lx/ly guard exactly). The content shifts UP as the offset grows, so the y delta
// handed to moveBy is negative.
//
// REACTIVITY (idiom 5b — hand-built nodes + ONE driving effect): a `selected`
// passed as a THUNK (`() => i`) gets ONE effect that RE-HIGHLIGHTS the rows AND
// RE-SCROLLS on every change — the thunk's signal reads inside the effect
// auto-subscribe, so the list follows the selection with no bind wiring. A bare
// number `selected` is applied ONCE at construction (static, no effect). The
// effect registers under the running owner and disposes with the screen (no leak
// on navigate-away). The raw index is clamped to [0, items.length-1] so a
// wrapped/out-of-range counter still lights (and scrolls to) exactly one row.
//
// GOTCHA 16 (an anchor-only / size-less container measures 0 and draws NOTHING):
// the outer Container carries an EXPLICIT numeric width AND height (the viewport);
// the inner Column an explicit width AND content height; every row Label an
// explicit width AND rowHeight. Vertical stacking uses a Piu `Column` (a bare
// Container stacks children at one y — a measured bug; Column lays them out
// top-to-bottom), the vertical mirror of tabs.ts's Row-not-Container rule.
//
// FONT / HOST OBJECTS (an invalid font key or a module-scope `new Style/Skin`
// renders BLANK): the two row Styles and the active-fill Skin are built PER-CALL
// inside Menu (runtime, never module scope — a preloaded module's top-level
// `new Style/Skin` freezes into a broken ROM instance, measured on Badge), with
// the valid Pebble system font key "18px Gothic" (tools/fontcheck).
import { effect } from "runtime/signals";
import { screen } from "runtime/jsx-runtime";
// Valid Pebble system font key for the row labels (tools/fontcheck).
const MENU_FONT = "18px Gothic";
// Muted gray inactive text; white active text; a dark teal active-row fill.
const DEFAULT_COLOR = "#808080";
const DEFAULT_ACTIVE_COLOR = "white";
const DEFAULT_ACTIVE_FILL = "#1a4d4d";
// Default viewport height (px — the clip window) and per-row height (px).
const DEFAULT_HEIGHT = 132;
const DEFAULT_ROW_HEIGHT = 28;
/**
 * Menu — a reactive vertical scrolling, selectable list, display-only.
 *
 *   const [sel] = useState(0);
 *   <Menu items={["Alarms", "Timers", "Stopwatch"]} selected={sel} />  // reactive
 *   <Menu items={rows} selected={2} height={120} rowHeight={24} />     // static
 *
 * DISPLAY-ONLY — the app owns `selected` and drives it; Menu highlights the row
 * and scrolls (via the inner Column's `moveBy` — the device-proven Move idiom) to
 * keep it inside the clipping viewport. Hand-builds an outer clipping Container
 * over an inner Column of Label rows; the active row is restyled + skinned, and
 * the list scrolled, by ONE effect when `selected` is a thunk (idiom 5b). See the
 * module header for the composition + scroll + reactivity contract.
 */
export function Menu(props) {
    const items = props.items;
    const width = props.width ?? screen.width;
    const height = props.height ?? DEFAULT_HEIGHT;
    const rowHeight = props.rowHeight ?? DEFAULT_ROW_HEIGHT;
    const color = props.color ?? DEFAULT_COLOR;
    const activeColor = props.activeColor ?? DEFAULT_ACTIVE_COLOR;
    const activeFill = props.activeFill ?? DEFAULT_ACTIVE_FILL;
    const font = props.font ?? MENU_FONT;
    // Two shared Styles cover every row (active vs inactive text color); one Skin
    // backs the active row. Built per-call at runtime — never module scope (a
    // preloaded top-level `new Style/Skin` freezes broken, measured on Badge).
    // ROUND HARMONY (Pebble's own menu convention): center rows on a round screen
    // so the narrowing circle never eats the leading glyphs; left-align on rect.
    // screen.round is valid here (Menu is called during render(), after render()
    // populates the screen dims).
    const hAlign = screen.round ? "center" : "left";
    const activeStyle = new Style({ font, color: activeColor, horizontal: hAlign });
    const inactiveStyle = new Style({ font, color, horizontal: hAlign });
    const activeSkin = new Skin({ fill: activeFill });
    const n = items.length;
    const contentHeight = n * rowHeight;
    // Max scroll offset: how far the content can shift up before its bottom edge
    // reaches the viewport bottom (0 when the list fits — nothing to scroll).
    const maxScroll = contentHeight > height ? contentHeight - height : 0;
    // OUTER clip window: EXPLICIT numeric width + height (gotcha 16 — a size-less
    // container measures 0 and draws nothing). `clip` keeps the overflowing rows
    // inside the viewport (the whole point of a scrolling list).
    const outer = new Container(null, { width, height, clip: true });
    // INNER content column: explicit width + the FULL content height (may exceed
    // the viewport). Pinned to the outer's top-left (top:0,left:0) so offset 0
    // shows items[0] at the top; moveBy shifts it UP from there. A Piu Column
    // (not a bare Container) lays the rows out top-to-bottom (gotcha 16 mirror).
    const column = new Column(null, {
        left: 0,
        top: 0,
        width,
        height: contentHeight,
    });
    const cells = [];
    for (let i = 0; i < n; i++) {
        const cell = new Label(null, {
            width,
            height: rowHeight,
            string: items[i],
        });
        column.add(cell);
        cells.push(cell);
    }
    outer.add(column);
    // Last-applied scroll offset (px the content has shifted UP). Persists across
    // effect runs so each selection change scrolls INCREMENTALLY (like Move's
    // lx/ly) — the offset is state, not recomputed from scratch each time.
    let scroll = 0;
    // Restyle for a clamped index (tabs.ts highlight idiom): point the hot row at
    // the active Style + Skin and the rest at the inactive Style + a null skin.
    // Returns the CLAMPED hot index so the scroll pass reuses the same value.
    const applyActive = (raw) => {
        const hot = raw < 0 ? 0 : raw > n - 1 ? n - 1 : raw;
        for (let i = 0; i < n; i++) {
            const cell = cells[i];
            cell.style = i === hot ? activeStyle : inactiveStyle;
            cell.skin = i === hot ? activeSkin : null;
        }
        return hot;
    };
    // Scroll the hot row into the viewport via the device-proven moveBy delta
    // (Move idiom). Shift only when the row is ABOVE the window (reveal its top)
    // or BELOW it (reveal its bottom); clamp to [0, maxScroll]; apply the delta
    // GUARDED — a still-visible row (next === scroll) issues no moveBy at all.
    const applyScroll = (hot) => {
        if (n === 0)
            return; // no rows -> nothing to scroll (empty-list branch)
        let next = scroll;
        if (hot * rowHeight < next)
            next = hot * rowHeight; // row's top is above the window -> reveal it
        else if ((hot + 1) * rowHeight > next + height)
            next = (hot + 1) * rowHeight - height; // row's bottom is below -> reveal it
        // clamp with Math (always-run, no extra branches): next is already in
        // range for any valid clamped hot, so this is a defensive floor/ceiling.
        next = Math.max(0, Math.min(next, maxScroll));
        if (next !== scroll) {
            // content shifts UP as the offset grows -> negative y delta (Move idiom)
            column.moveBy(0, -(next - scroll));
            scroll = next;
        }
    };
    // Reactive thunk -> ONE effect re-highlights AND re-scrolls on change (idiom
    // 5b, auto-tracks selected's signal); a bare number is applied once (static).
    const selected = props.selected;
    if (typeof selected === "function") {
        effect(() => {
            const hot = applyActive(selected());
            applyScroll(hot);
        });
    }
    else {
        applyScroll(applyActive(selected));
    }
    return outer;
}
