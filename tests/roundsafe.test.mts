// RoundSafeArea suite — runtime/roundsafe (opt-in round-screen safe-area inset).
// Proves: on a ROUND screen the returned Container is inset on all sides by
// `inset` (default 18) with an EXPLICIT width/height of screen.{width,height} -
// 2*inset (gotcha 16 — a l/r/t/b-anchored container with no measure draws
// nothing); on a RECT screen it is full-bleed (all edges 0, full screen size) —
// a pass-through; children mount in both shapes; an omitted `inset` falls back
// to 18; and omitted children are a safe no-op. Shape is driven by the sandbox
// jsx screen flag (jsxM.screen.round/width/height), the same handle the draw and
// actionbar suites use. StubContent (load-runtime) records the construction dict
// via Object.assign, so node.left/width/etc. carry the anchors.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();
jsxM.screen.width = 260; // gabbro
jsxM.screen.height = 260;
const { createRoot } = signals;
const { RoundSafeArea } = await loadModule("runtime/roundsafe");
const { check, done } = makeChecker("roundsafe");

// --- ROUND screen: inset on all sides, explicit width/height, child mounts ---
{
	jsxM.screen.round = true;
	const child = new sandbox.Label(null, { string: "hi" });
	const [node] = createRoot(() => RoundSafeArea({ inset: 24, children: child }));
	check("returns a container node", node && typeof node.add === "function");
	check("round: inset on the left edge", node.left === 24);
	check(
		"round: inset on all four sides",
		node.right === 24 && node.top === 24 && node.bottom === 24,
	);
	check("round: explicit width is screen.width - 2*inset", node.width === 260 - 2 * 24);
	check("round: explicit height is screen.height - 2*inset", node.height === 260 - 2 * 24);
	check("round: child mounts inside the safe area", node.contents[0] === child);
}

// --- ROUND screen: omitted inset falls back to the 18px default ---
{
	jsxM.screen.round = true;
	const [node] = createRoot(() => RoundSafeArea({}));
	check("round: default inset is 18", node.left === 18);
	check("round: default inset sizes width to screen - 36", node.width === 260 - 36);
	check("round: omitted children yield an empty area", node.contents.length === 0);
}

// --- RECT screen: full-bleed pass-through (all edges 0, full screen size) ---
{
	jsxM.screen.round = false;
	const child = new sandbox.Label(null, { string: "hi" });
	const [node] = createRoot(() => RoundSafeArea({ inset: 24, children: child }));
	check("rect: no left inset (full-bleed)", node.left === 0);
	check("rect: all edges 0", node.right === 0 && node.top === 0 && node.bottom === 0);
	check("rect: width is the full screen width", node.width === 260);
	check("rect: height is the full screen height", node.height === 260);
	check("rect: child still mounts", node.contents[0] === child);
	// `inset` is ignored on a rect screen — the prop had no effect on the box
	check("rect: inset prop is ignored", node.left === 0 && node.width === 260);
}

done();
