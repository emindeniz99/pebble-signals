// QR suite — runtime/qrcode (opt-in QR code on the host `QRCode` content).
// Proves the two things the component exists for. (1) THE ROUND RULE: a QR is a
// square whose three CORNERS carry the finder patterns, so `fullscreen` on a
// ROUND panel must be the largest INSCRIBED square (floor(diameter/√2) = 183 on
// gabbro) — the test pins BOTH that 183·√2 still fits inside the 260px circle
// and that 184 would NOT, i.e. it is the largest one, not just a smaller number;
// on a RECT panel `fullscreen` is min(width,height) and nothing is clipped.
// (2) The host contract from piuQRCode.c: the box is SQUARE (Place feeds
// min(w,h) to the encoder), the initial `string` is in the CONSTRUCTION DICT
// (Place dereferences it unconditionally — a stringless node is a null-deref at
// layout, not a catchable throw) and NO `skin` is passed (the 4.17 skinned draw
// path never sets the module tint; skinless = white box + black modules, and
// that white box IS the quiet zone). Plus: a THUNK string MUTATES the one node
// via the host's post-mount setter instead of rebuilding it, and disposing the
// owner stops that. Every branch — fullscreen round/rect, size given/omitted,
// string static/thunk — is covered for 100% line/branch/function coverage.
//
// The vm sandbox has NO `QRCode`, so — exactly as vectorimage.test injects
// SVGImage — we inject sandbox.QRCode BEFORE loadModule with a stub that keeps
// the construction dict and records every POST-construction `string` write (the
// constructor seeds the backing field directly, so `sets` counts only what the
// component wrote afterwards). Screen shape comes from the jsx screen handle
// (jsxM.screen.*), the same one the roundsafe suite drives.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();

// StubQR: the host QRCode stand-in. Keeps the dict (so the string/width/height/
// skin contract is assertable) and logs post-mount `string` writes in order.
// `_$` is the Piu behaviorData arg (null).
type QRDict = { string: string; width: number; height: number; skin?: unknown };
class StubQR {
	dict: QRDict;
	width: number;
	height: number;
	sets: string[];
	_s: string;
	constructor(_$: unknown, dict: QRDict) {
		this.dict = dict;
		this.width = dict.width;
		this.height = dict.height;
		this.sets = [];
		this._s = dict.string; // seed the backing field: construction is not a "set"
	}
	get string(): string {
		return this._s;
	}
	set string(it: string) {
		this._s = it;
		this.sets.push(it);
	}
}
sandbox.QRCode = StubQR;

const { signal, createRoot } = signals;
const { QR } = await loadModule("runtime/qrcode");
const { check, done } = makeChecker("qrcode");

const URL = "https://repebble.com";

// --- static string + explicit size: one square node, skinless, no effect -----
{
	const [node] = createRoot(() => QR({ string: URL, size: 100 }) as StubQR);
	check("returns a host QRCode node", node instanceof StubQR);
	check("the box is SQUARE at the given size", node.width === 100 && node.height === 100);
	check(
		"the initial string rides the CONSTRUCTION dict (Place derefs it unconditionally)",
		node.dict.string === URL,
	);
	check(
		"NO skin is passed (the 4.17 skinned draw path never sets the module tint)",
		node.dict.skin === undefined,
	);
	check("a static string creates no effect and never re-writes string", node.sets.length === 0);
}

// --- size omitted: the qrprobe-proven 124px tile ----------------------------
{
	const [node] = createRoot(() => QR({ string: URL }) as StubQR);
	check(
		"omitted size defaults to the device-proven 124px tile",
		node.width === 124 && node.height === 124,
	);
}

// --- fullscreen on a ROUND panel: the largest INSCRIBED square --------------
// The finder patterns live in the corners, so the whole square must fit the
// circle: side·√2 <= diameter. 183 does (258.8 <= 260); 184 would not (260.2).
{
	jsxM.screen.width = 260; // gabbro
	jsxM.screen.height = 260;
	jsxM.screen.round = true;
	const [node] = createRoot(() => QR({ string: URL, fullscreen: true }) as StubQR);
	check(
		"round fullscreen is the inscribed square, not the screen (183 on gabbro)",
		node.width === 183,
	);
	check("round fullscreen stays square", node.height === node.width);
	check("the square's corners fit inside the circle", node.width * Math.SQRT2 <= 260);
	check("it is the LARGEST such square (184 would not fit)", (node.width + 1) * Math.SQRT2 > 260);
	check("fullscreen wins over size", node.width !== 100);
}

// --- fullscreen on a RECT panel: the short side, nothing clipped ------------
{
	jsxM.screen.width = 200; // emery
	jsxM.screen.height = 228;
	jsxM.screen.round = false;
	const [node] = createRoot(() => QR({ string: URL, fullscreen: true, size: 100 }) as StubQR);
	check("rect fullscreen is min(width,height) — no bezel to dodge", node.width === 200);
	check("rect fullscreen stays square", node.height === 200);
}

// --- thunk string: MUTATE the one node, never rebuild ----------------------
{
	const s = signal("first");
	const [node, dispose] = createRoot(
		() => QR({ string: () => s.value, fullscreen: false }) as StubQR,
	);
	check(
		"a thunk's initial value still rides the dict (never stringless)",
		node.dict.string === "first",
	);
	check("the effect's first run re-writes that same value", node.sets.length === 1);
	s.value = "second";
	check("a signal change writes the new string on the SAME node", node.string === "second");
	check("the change MUTATES rather than rebuilding", node.sets.length === 2);
	dispose();
	s.value = "third";
	check("disposing the owner stops the string effect", node.string === "second");
}

done();
