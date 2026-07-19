// A round-screen safe-area inset — the opt-in `runtime/roundsafe` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/roundsafe` never
// ships it (the manifest prunes to the import closure — README tree-shaking),
// so this module costs non-users nothing.
//
// WHY (a real device bug — "top strip clipped on gabbro"): a circular panel
// (gabbro, screen.round === true) clips the corners and the top/bottom bands of
// a full-bleed layout behind the bezel, so edge content (a StatusBar strip, a
// title row) is cut off. RoundSafeArea insets its children away from those
// clipped edges on a ROUND screen, and passes through full-bleed on a RECT one
// (emery, screen.round === false) — the same shape-adaptive trick render()'s
// crash screen uses (jsx-runtime's `inset = screen.round ? 26 : 8`).
//
// COMPOSITION (Rule 2 — no new substrate): this is plain layout, one
// `Container`. On round it is anchored `left/right/top/bottom = inset` and given
// an EXPLICIT width/height (screen.{width,height} - 2*inset) so it sits centered
// inside the safe band; on rect it is anchored to all four edges at 0 with the
// full screen width/height. Either way `children` mount via `appendChild` (the
// jsx flatten/skip-nullish rules — an undefined child is a safe no-op).
//
// EXPLICIT WIDTH/HEIGHT (gotcha 16 — a real device blank): a container built off
// opposite-edge anchors (left+right / top+bottom) with NO explicit width/height
// measures 0 in Piu's measure pass and draws NOTHING (measured on StatusBar).
// So this Container ALWAYS carries a real width AND height read from
// screen.{width,height} (valid once render() has started — read at call time,
// inside the component body, never at module scope).
import { appendChild, screen, type JSXNode } from "runtime/jsx-runtime";
import type { Content } from "../../../types/moddable/piu/MC-types";

/** Default inset in px on a round screen — clears gabbro's bezel/corner clip. */
const DEFAULT_INSET = 18;

/** Props for {@link RoundSafeArea}. */
export type RoundSafeAreaProps = {
	/** Children inset into the safe area. May be omitted (an empty area). */
	children?: JSXNode;
	/** Round-screen inset in px on all sides. Defaults to 18. Ignored on a rect screen. */
	inset?: number;
};

/**
 * RoundSafeArea — inset children to the round-screen safe area.
 *
 *   <RoundSafeArea>
 *     <StatusBar title="Inbox" />   // no longer bezel-clipped on gabbro
 *   </RoundSafeArea>
 *
 * On a ROUND screen (gabbro, `screen.round`) returns a Container inset by
 * `inset` (default 18) on all sides — centered, with an explicit width/height
 * of screen.{width,height} - 2*inset. On a RECT screen (emery) returns a
 * full-bleed Container (all edges 0, full screen width/height) — a pass-through.
 * `children` mount in both cases. See the module header for the gotcha-16
 * explicit-size contract.
 */
export function RoundSafeArea(props: RoundSafeAreaProps): Content {
	const inset = screen.round ? (props.inset ?? DEFAULT_INSET) : 0;
	// Symmetric edge anchors + an explicit width/height (gotcha 16): a l/r/t/b-
	// anchored container with no explicit measure draws NOTHING. inset === 0 on a
	// rect screen makes this a full-bleed pass-through.
	const box = new Container(null, {
		left: inset,
		right: inset,
		top: inset,
		bottom: inset,
		width: screen.width - 2 * inset,
		height: screen.height - 2 * inset,
	});
	if (props.children !== undefined) appendChild(box, props.children);
	return box;
}
