// watchinfo suite — runtime/watchinfo (opt-in one-shot device + screen facts,
// the RN Platform / useWindowDimensions analog). Proves: watchInfo() MERGES the
// bare `watch` global's getters (model / firmwareVersion / hour12) with the
// jsx-runtime `screen` subset (width/height/round/color) into one flat object;
// firmwareVersion — which the host reallocates FRESH on every read — is read
// EXACTLY ONCE and flattened into a self-owned { major, minor, patch }; the
// missing-`watch` guard (typeof-probe) degrades model/firmware/hour12 to
// zeros/false yet STILL reads screen; and useDisplayBounds() returns just the
// screen subset as a fresh snapshot that tracks the live `screen` record
// (gabbro round 260x260 vs emery rect 200x228).
//
// One-shot, so DELIBERATELY unlike the sensor/battery suites: no signal, no
// effect, no onCleanup — nothing owner-bound — so the hooks are called BARE
// (no createRoot, nothing to dispose, no timers to tick). `watch` is a host
// compartment global (absent in the Node sandbox) — inject a stub BEFORE
// loading the module, the same idiom tabs.test uses for Style/Skin; no
// importNow stub is needed because the module constructs no host module.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { jsx: jsxM, sandbox, loadModule } = await loadRuntime();

// gabbro-shaped host display (round 260x260 color). watchinfo reads these off
// the shared jsx `screen` record — the module imports the SAME object, so these
// mutations are visible to it.
jsxM.screen.width = 260;
jsxM.screen.height = 260;
jsxM.screen.round = true;
jsxM.screen.color = true;

// Inject the bare `watch` compartment global. firmwareVersion is a GETTER that
// COUNTS reads: on device it allocates a fresh { major, minor, patch } xs object
// on every read (pebble-global.c), so the hook must read it ONCE — asserted below.
let fwReads = 0;
sandbox.watch = {
	model: 12,
	hour12: true,
	get firmwareVersion() {
		fwReads++;
		return { major: 4, minor: 3, patch: 2 };
	},
};

// `device` is reached via globalThis (typed only as a module) — stub it like
// `watch`. QEMU serves serialNumber as undefined (hostprobe receipt), so the
// stub mirrors that shape by default; the "" coercion is what's under test.
sandbox.device = { info: { language: "en_US", serialNumber: undefined } };

const { watchInfo, useDisplayBounds, backlight, exitApp } = await loadModule("runtime/watchinfo");
const { check, done } = makeChecker("watchinfo");

// --- watchInfo() merges watch getters + screen subset; fw read once + flattened ---
{
	fwReads = 0;
	const info = watchInfo();
	check("model comes straight from watch.model", info.model === 12);
	check(
		"firmware is flattened from watch.firmwareVersion",
		info.firmware.major === 4 && info.firmware.minor === 3 && info.firmware.patch === 2,
	);
	check("hour12 comes straight from watch.hour12", info.hour12 === true);
	check(
		"the screen subset is merged in (gabbro round 260 color)",
		info.width === 260 && info.height === 260 && info.round === true && info.color === true,
	);
	// WHY it matters: firmwareVersion reallocates a fresh object on each read on
	// device — reading it more than once would burn scarce arena for nothing.
	check("watch.firmwareVersion is read exactly once", fwReads === 1);
	// self-owned: a LATER host read yields a DIFFERENT object, proving the hook
	// copied the fields into its own literal rather than aliasing the host's
	// per-read object (which the caller must not retain).
	const fresh = sandbox.watch.firmwareVersion; // fwReads -> 2 (a new host object)
	check(
		"firmware is a self-owned copy, not the host's aliased object",
		info.firmware !== fresh &&
			info.firmware.major === 4 &&
			info.firmware.minor === 3 &&
			info.firmware.patch === 2,
	);
}

// --- useDisplayBounds() returns ONLY the screen subset, a fresh live snapshot ---
{
	const g = useDisplayBounds();
	check(
		"useDisplayBounds returns the screen subset (gabbro round 260)",
		g.width === 260 && g.height === 260 && g.round === true && g.color === true,
	);
	check(
		"useDisplayBounds carries no device fields (screen subset only)",
		(g as { model?: number }).model === undefined,
	);
	check("useDisplayBounds is a fresh snapshot, not the live screen record", g !== jsxM.screen);
	// flip the host display to emery-shaped — the fields are READ from `screen`,
	// not baked in, so the subset must follow (both-shapes receipt).
	jsxM.screen.width = 200;
	jsxM.screen.height = 228;
	jsxM.screen.round = false;
	jsxM.screen.color = false;
	const e = useDisplayBounds();
	check(
		"useDisplayBounds reflects the current screen (emery rect 200x228 b/w)",
		e.width === 200 && e.height === 228 && e.round === false && e.color === false,
	);
}

// --- missing-`watch` guard: degrade to zeros/false, but STILL read screen ---
{
	sandbox.watch = undefined; // typeof watch === "undefined" -> guard branch
	const info = watchInfo();
	check(
		"absent watch degrades model/firmware to zero",
		info.model === 0 &&
			info.firmware.major === 0 &&
			info.firmware.minor === 0 &&
			info.firmware.patch === 0,
	);
	check("absent watch degrades hour12 to false", info.hour12 === false);
	// the screen subset is ALWAYS read (screen is a plain module object, present
	// everywhere) — even when the device global is missing. Assert against the
	// live record so it holds whatever shape the previous block left (emery).
	check(
		"screen subset is still merged when watch is absent",
		info.width === jsxM.screen.width &&
			info.height === jsxM.screen.height &&
			info.round === jsxM.screen.round &&
			info.color === jsxM.screen.color,
	);
	// device.info still read on the absent-`watch` guard path (separate guards)
	check("language read from device.info on the degrade path", info.language === "en_US");
	check("QEMU-undefined serialNumber coerces to empty string", info.serialNumber === "");
}

// --- device.info: language/serialNumber pass-through + absent-device degrade ---
{
	sandbox.watch = { model: 1, hour12: false, firmwareVersion: { major: 1, minor: 0, patch: 0 } };
	sandbox.device = { info: { language: "tr_TR", serialNumber: "Q123456789" } };
	const info = watchInfo();
	check(
		"language and a real hardware serial pass through",
		info.language === "tr_TR" && info.serialNumber === "Q123456789",
	);
	sandbox.device = undefined; // absent device global -> both degrade to ""
	const bare = watchInfo();
	check(
		"absent device degrades language/serialNumber to empty strings",
		bare.language === "" && bare.serialNumber === "",
	);
}

// --- backlight(): watch.light pass-through (pulse vs force) + absent no-op ---
{
	const calls: unknown[][] = [];
	sandbox.watch = { light: (...a: unknown[]) => calls.push(a) };
	backlight(); // interaction pulse — must call with NO argument (host arity-checks)
	backlight(true);
	backlight(false);
	check(
		"backlight maps pulse/force onto watch.light's arity",
		calls.length === 3 && calls[0].length === 0 && calls[1][0] === true && calls[2][0] === false,
	);
	sandbox.watch = undefined;
	backlight(); // absent watch -> silent no-op, never a ReferenceError
	check("backlight is a no-op without the watch global", calls.length === 3);
}

// --- exitApp(): watch.exit pass-through (reason vs none) + absent no-op ---
{
	const calls: unknown[][] = [];
	sandbox.watch = { exit: (...a: unknown[]) => calls.push(a) };
	exitApp(); // no reason — must call with NO argument
	exitApp(2); // APP_EXIT reason code passes through
	check(
		"exitApp maps reason/none onto watch.exit's arity",
		calls.length === 2 && calls[0].length === 0 && calls[1][0] === 2,
	);
	sandbox.watch = undefined;
	exitApp();
	check("exitApp is a no-op without the watch global", calls.length === 2);
}

done();
