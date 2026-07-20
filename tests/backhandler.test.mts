// backhandler suite — runtime/backhandler (opt-in Back-button intercept, the RN
// BackHandler analog). Proves: useBackHandler(handler) returns a { onPressBack }
// BAG whose onPressBack — the function the focused node's behavior invokes on each
// Back press — returns TRUE when the caller's handler consumes Back (returns true)
// and FALSE when it declines (returns false); that is the truthiness jsx-runtime's
// HandlerBehavior turns into "consume vs bubble". The handler is RE-READ on every
// press (so it can consult live state like nav.canPop()): the invocation counter
// climbs once per press, and a handler that FLIPS its answer between presses is
// honored. Finally, spreading the bag through the REAL jsx() factory onto a focused
// Container and driving node.behavior.onPressBack proves the end-to-end device path
// — a `true` handler CONSUMES Back (the delegate returns truthy), a `false` handler
// lets it BUBBLE (the delegate returns false) — the exact HandlerBehavior seam this
// module targets. The hook owns no signal/node/timer, so there is nothing to leak;
// each block still builds under createRoot and disposes it. Every line/branch/
// function is covered — the hook and its one arrow have no branches, so one call to
// each suffices; both truth values are exercised for INTENT (Rule 9), not coverage.
//
// No host globals are injected: unlike the button/accel suites there is no Skin/
// Style/importNow the module constructs, so loadModule loads it directly. The one
// end-to-end block borrows the sandbox's Container class + the real jsx factory (the
// same StubContent jsx-runtime's isPiu registered), exactly as button.test reaches
// the behavior via node.behavior.onPressSelect.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();
const { createRoot } = signals;
const { useBackHandler } = await loadModule("runtime/backhandler");
const { check, done } = makeChecker("backhandler");

// --- the bag: consume on true, bubble on false, handler re-read on every press ----
{
	let calls = 0;
	let answer = true; // flipped between presses to prove the handler is re-read live
	const [bag, dispose] = createRoot(() =>
		useBackHandler(() => {
			calls++;
			return answer;
		}),
	);
	check("useBackHandler returns an onPressBack bag", typeof bag.onPressBack === "function");
	// handler returns true -> Back is CONSUMED (stay in app, e.g. a Navigator pop)
	check("onPressBack returns true when the handler consumes Back", bag.onPressBack() === true);
	check("the handler ran on the first press", calls === 1);
	// flip live state to false -> Back BUBBLES (its default: leave the app)
	answer = false;
	check("onPressBack returns false when the handler declines Back", bag.onPressBack() === false);
	check("the handler is re-read on every press (ran again, live state honored)", calls === 2);
	dispose();
}

// --- end-to-end: spread the bag on a focused node, drive the REAL HandlerBehavior -
// The device calls onPressBack through the focused content's behavior, whose
// generated delegate returns `handler(content) !== false` (truthy consumes, false
// bubbles). Route the bag through the actual jsx() factory + a Container and invoke
// node.behavior.onPressBack — the same seam button.test drives for onPressSelect.
{
	let consume = true;
	const [node, dispose] = createRoot(() =>
		jsxM.jsx(sandbox.Container, { focus: true, ...useBackHandler(() => consume) }),
	);
	// a true handler: the delegate CONSUMES Back (returns truthy)
	check(
		"bag on a focused node consumes Back when the handler returns true",
		node.behavior.onPressBack(node) === true,
	);
	// a false handler: the delegate lets Back BUBBLE (returns false)
	consume = false;
	check(
		"bag on a focused node lets Back bubble when the handler returns false",
		node.behavior.onPressBack(node) === false,
	);
	dispose();
}

done();
