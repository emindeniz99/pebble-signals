// A scannable QR code — the opt-in `runtime/qrcode` module. OPT-IN & ZERO-COST:
// an app that never imports `runtime/qrcode` never ships it (the manifest prunes
// to the import closure — README tree-shaking), so this module costs non-users
// nothing.
//
// SUBSTRATE (the host `QRCode` Piu content — device-proven: `new QRCode(null,
// { string, width, height })` drew a real code with a quiet zone on gabbro,
// screenshots/qrprobe-gabbro.png). What modules/piu/Pebble/piuQRCode.c forces —
// read BEFORE touching this, Rule 1:
//  * `string` is the ONLY extra dict key (PiuQRCodeDictionary :81). `maxVersion`
//    is MC-only, so Pebble always encodes at the default VERSION_MAX and eats a
//    ~7.8KB c_malloc in the app's C heap (NOT the XS arena) for the duration of
//    the encode.
//  * `string` is REQUIRED: PiuQRCodePlace (:166) dereferences it unconditionally,
//    so a QRCode that is stringless for even ONE layout pass is a null-deref, not
//    a catchable throw. This module therefore ALWAYS passes the initial string in
//    the construction dict — never "in a moment, from an effect".
//  * width/height are REQUIRED. Place passes `fit = min(width,height)` to the
//    encoder, which RangeErrors on `fit <= 0` and throws "can't fit" when fit is
//    below the module count (data/qrcode/qrcode.c:108). Every box here is SQUARE,
//    so fit === side.
//  * NO skin, deliberately (qrprobe's finding): with one, PiuQRCodeDraw (:97-100)
//    assigns fillColor TWICE and never strokeColor (upstream typo), leaving the
//    module tint unset. Skinless takes the else branch — WHITE box fill, BLACK
//    modules — the only sound path in 4.17. That white fill IS the light quiet
//    zone behind the code; no Skin is allocated for it.
//
// REACTIVITY — MUTATE, don't rebuild. The host HAS a post-mount setter
// (`PiuQRCode_set_string` :210) and it does the right thing: it reflows with
// piuSizeChanged, the parent's adjust pass re-measures and re-places the content
// (piuContainer.c:62-76 sets piuPlaced), and PiuQRCodePlace then RE-ENCODES the
// buffer from the new string. So a thunk drives ONE effect that writes
// `node.string` (idiom 5b, exactly like image.ts's `variant`; `string` is on
// jsx-runtime's REACTIVE_PROPS whitelist). Rebuilding the node instead would be
// MORE code (re-parenting through the container) for the same picture and an
// extra encode — mutation is both the simpler and the honest path here.
//
// THE ROUND RULE — the reason this module exists rather than "just call the host
// class". A QR symbol is a SQUARE whose three CORNERS carry the finder patterns a
// scanner locks onto. Fill a ROUND panel with a screen-SIZED square and the bezel
// eats exactly those corners, so the code stops scanning even though it looks
// mostly fine. `fullscreen` therefore means the largest INSCRIBED square:
// side = floor(diameter / √2) = 183 on gabbro's 260 (a rect panel has no such
// problem — there it is min(width, height)). Numbers, for a 20-byte URL (version
// 2 = 25 modules), from data/qrcode/qrcode.c's `scale = floor(fit / size)`:
//   * fullscreen 183 -> 7px modules, a 175px symbol whose corners sit
//     175/2·√2 = 124px from center, INSIDE the 130px radius by ~6px.
//   * naive 260    -> 10px modules, a 250px symbol whose corners sit 177px from
//     center — ~47px outside the glass. src/tsx/examples/qrclip.tsx renders that
//     on purpose as the counter-receipt.
//
// SCANABILITY / QUIET ZONE (the honest caveat, documented not papered over): the
// white margin around the symbol is whatever the box has left over —
// (side mod moduleCount)/2 px per edge, i.e. (side mod count)/(2·scale) MODULES —
// because the encoder scales by whole pixels and the host centers the result
// (piuQRCode.c:133). It is NOT a fixed 4-module border, and this module cannot
// compute one without encoding the string first (a second ~7.8KB encode just to
// count modules — not worth it on this heap). Worked examples for that same
// 25-module code: `size={124}` leaves 12px = 3 modules (the device-proven
// qrprobe tile), `fullscreen` on gabbro leaves 4px = 0.6 modules. So fullscreen
// buys the FATTEST bars (7px) at the cost of the thinnest border; if a scanner
// balks, drop to a `size` that leaves a wider white edge rather than growing the
// code.
//
// ARENA COST (Rule 4 — computed from qrcode.c, not measured): Place keeps the
// 1-bit mask as an ArrayBuffer of `rowBytes · scaledSize` where rowBytes is the
// scaled side rounded up to 32 bits, i.e. ~side²/8 bytes, LIVE for as long as the
// node is bound (PiuQRCodeUnbind drops it). For the 25-module URL: 124px -> 1600B,
// fullscreen 183px -> 4200B, a naive 260px square -> 8000B of a 26.6KB budget.
// A big code is not free — size it for the scanner, not for the pixels.
//
// NO MODULE SCOPE (Rule 5 / gotcha 13): this module constructs NOTHING at top
// level — the node and its one effect are built INSIDE the exported function at
// call time, and the one export is a `function` declaration exactly like
// image.ts's Image.
import { screen } from "runtime/jsx-runtime";
import { effect } from "runtime/signals";
import type { Content as PiuContent } from "../../../types/moddable/piu/MC-types";

// The host `QRCode` global is NOT in the runtime build's typing surface
// (tsconfig.runtime-build.json lists MC/global/piu only, and the vendored
// types/moddable/piu/QRCode.d.ts hangs its global off a `declare module
// "piu/QRCode"` block), so declare the one shape used here module-locally —
// ambient, so it ERASES from the emit (accel.ts's `declare function importNow`
// idiom). `string` is a real post-mount accessor on the host prototype
// (piuPebble.js :212-213), hence settable on the returned node.
declare const QRCode: {
	new (
		behaviorData: null,
		dictionary: { string: string; width: number; height: number },
	): PiuContent & { string: string };
};

/** Props for {@link QR}. */
export type QRProps = {
	/**
	 * The text to encode — a URL, a pairing token, anything the wearer points a
	 * phone at. A bare string is STATIC; a THUNK (`() => url()`) is REACTIVE:
	 * ONE effect writes `string` on the node and the host re-encodes IN PLACE
	 * (no rebuild — see the module header). Keep it SHORT: every extra byte can
	 * push the code to a higher version, which packs more modules into the same
	 * box and thins every bar.
	 */
	string: string | (() => string);
	/**
	 * Side of the SQUARE content box in px. Defaults to 124 — the tile qrprobe
	 * proved on gabbro (a 25-module code at 4px per module inside a 12px white
	 * border). Ignored when {@link fullscreen} is set. There is no clamp: a size
	 * larger than the panel is drawn and CLIPPED (that is what qrclip.tsx
	 * demonstrates), and a size below the module count throws "can't fit" from
	 * the encoder at layout time.
	 */
	size?: number;
	/**
	 * Size the code to the panel, SHAPE-AWARE. On a ROUND screen that is the
	 * largest INSCRIBED square — `floor(diameter / √2)`, 183 on gabbro — NOT the
	 * screen size, because a screen-sized square loses its corner finder patterns
	 * behind the bezel and stops scanning. On a RECT screen it is
	 * `min(width, height)`. Wins over {@link size}.
	 */
	fullscreen?: boolean;
};

/**
 * QR — a scannable QR code on ONE host `QRCode` content node, sized so it stays
 * scannable on a ROUND panel.
 *
 *   <QR string="https://repebble.com" />                 // 124px tile
 *   <QR string="https://repebble.com" fullscreen />      // 183px inscribed square (gabbro)
 *   <QR string={() => token()} size={100} />             // reactive: re-encodes in place
 *
 * `fullscreen` is the point of the component: a QR is a SQUARE whose three
 * corners carry the finder patterns, so on a round screen the biggest scannable
 * code is the INSCRIBED square (`floor(diameter / √2)`), centered — a
 * screen-sized one has its corners clipped by the bezel and stops scanning
 * (`src/tsx/examples/qrclip.tsx` is that counter-receipt). On a rect screen
 * `fullscreen` is just `min(width, height)`.
 *
 * SCANABILITY: the node is SKINLESS on purpose — the host's skinned path never
 * sets the module tint in 4.17, and skinless gives white box + black modules,
 * where the white box IS the quiet zone. That quiet zone is what the box has
 * left over after whole-pixel scaling — `(side mod moduleCount)/2` px per edge,
 * NOT a guaranteed 4-module border: `size={124}` leaves 3 modules for a 20-byte
 * URL, `fullscreen` on gabbro leaves ~0.6 of one while making every bar 7px
 * wide. Fatter bars, thinner border — if a scanner balks, shrink `size` instead
 * of growing the code. A reactive `string` MUTATES this node (the host re-encodes
 * on reflow); the mask buffer costs ~side²/8 bytes of the XS arena while mounted.
 * Returns the QRCode node (a {@link Content}) — unconstrained content centers
 * itself, so drop it straight into a container or the Application.
 */
export function QR(props: QRProps): PiuContent {
	const str = props.string;
	// A THUNK is reactive (ONE effect mutates `string` below); a bare string is
	// static and needs no effect, no signal, nothing.
	const dyn = typeof str === "function" ? str : null;
	// THE ROUND RULE (module header): on a round panel the largest SCANNABLE
	// square is the INSCRIBED one — side·√2 must fit the diameter — not the
	// screen box; on a rect panel it is simply the short side.
	const d = Math.min(screen.width, screen.height);
	const side = props.fullscreen
		? screen.round
			? Math.floor(d / Math.SQRT2)
			: d
		: (props.size ?? 124);
	// The initial string goes in the DICT: PiuQRCodePlace dereferences it
	// unconditionally, so a node that reaches layout stringless is a null-deref,
	// not a throw we could report. NO skin (the 4.17 skinned path leaves the
	// module tint unset) — skinless is white box, black modules, and that white
	// box is the quiet zone.
	const node = new QRCode(null, {
		string: dyn ? dyn() : (str as string),
		width: side,
		height: side,
	});
	// Reactive string: MUTATE the one node (idiom 5b, image.ts's `variant`). The
	// host setter reflows with piuSizeChanged, and the re-place RE-ENCODES the
	// buffer — a rebuild would churn the node for the same picture. The first
	// (build-time) run rewrites the value the dict already carries: on a
	// container-less node that reflow stops at the first `if (container)`, so it
	// costs one host string and buys the simplest possible shape.
	if (dyn) {
		effect(() => {
			node.string = dyn();
		});
	}
	return node;
}
