// NumberField suite — runtime/numberfield (opt-in big-number stepper display,
// display-only). Proves: NumberField returns an explicit full-width/height Column
// (gotcha 16) of up to three Labels — a '+' hint, the big value(+unit) Label, a
// '-' hint (each with an explicit width + height); the value Label's string is
// the (clamped) number plus the optional unit; `min`/`max` clamp the DISPLAY only
// (below min, above max, both, in-range); the affordance hints are present with
// their font/color when `affordance !== false` and absent when `false`; a
// reactive `value` thunk re-strings the number on signal change (idiom 5b — drive
// the signal, re-read the label) and re-clamps inside the effect; a negative
// value renders verbatim; and every prop branch (width/height/font/color/
// affordanceFont/affordanceColor/unit defaults vs overrides, static number vs
// thunk) is covered -> 100% line/branch/function coverage. `Style` is a host
// compartment global (absent in the Node sandbox) — inject a dict-storing stub
// BEFORE loading numberfield (the tabs/card idiom) so each label's
// `.style.d.font` / `.style.d.color` is assertable. StubContent (load-runtime) is
// the Column, StubLeaf the Labels. NumberField builds NO Skins, so no Skin stub.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();
jsxM.screen.width = 144; // NumberField reads screen.width for its default width (gotcha 16)
// Style stub: store the construction dict so font/color are assertable.
sandbox.Style = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
const { signal, createRoot } = signals;
const { NumberField } = await loadModule("runtime/numberfield");
const { check, done } = makeChecker("numberfield");

// --- defaults + static number: Column, three labels, strings, fonts, layout ---
{
	const [col] = createRoot(() => NumberField({ value: 42 }));
	check("NumberField returns a Column container", col && typeof col.add === "function");
	// explicit default width (screen) + height (gotcha 16) — a measure-0 Column blanks
	check(
		"Column carries explicit default width (screen) + height (120)",
		col.width === 144 && col.height === 120,
	);
	// affordance defaults on -> three rows: '+' hint, value, '-' hint
	check("affordance on by default yields three rows", col.contents.length === 3);
	check(
		"the '+' hint is on top and the '-' hint on the bottom (ASCII, not arrows)",
		col.contents[0].string === "+" && col.contents[2].string === "-",
	);
	check("the value Label sits in the middle with no unit", col.contents[1].string === "42");
	// value Label uses the default value font/color
	check(
		"value Label uses the default font (bold 42px Bitham) + color (white)",
		col.contents[1].style.d.font === "bold 42px Bitham" &&
			col.contents[1].style.d.color === "white",
	);
	// hints use the default affordance font/color
	check(
		"hints use the default affordance font (24px Gothic) + color (#808080)",
		col.contents[0].style.d.font === "24px Gothic" &&
			col.contents[0].style.d.color === "#808080" &&
			col.contents[2].style.d.color === "#808080",
	);
	// height split 1/4 : 1/2 : 1/4 = 30 : 60 : 30 for the default 120
	check(
		"the rows split the height 1/4 : 1/2 : 1/4 (30 / 60 / 30)",
		col.contents[0].height === 30 && col.contents[1].height === 60 && col.contents[2].height === 30,
	);
	check(
		"every row carries the explicit full width (gotcha 16)",
		col.contents[0].width === 144 && col.contents[1].width === 144 && col.contents[2].width === 144,
	);
}

// --- reactive thunk + unit + every override: re-strings on signal change ---
{
	const v = signal(50);
	const [col] = createRoot(() =>
		NumberField({
			value: () => v.value,
			width: 100,
			height: 100,
			unit: "%",
			font: "bold 24px Gothic",
			color: "cyan",
			affordanceColor: "#333",
			affordanceFont: "14px Gothic",
		}),
	);
	check("explicit width/height overrides applied", col.width === 100 && col.height === 100);
	// 1/4 : 1/2 : 1/4 of 100 = 25 : 50 : 25
	check(
		"overridden height splits 25 / 50 / 25",
		col.contents[0].height === 25 && col.contents[1].height === 50 && col.contents[2].height === 25,
	);
	check("override rows carry the explicit width", col.contents[0].width === 100);
	check("the value string carries the unit suffix", col.contents[1].string === "50%");
	check(
		"value font/color overrides applied",
		col.contents[1].style.d.font === "bold 24px Gothic" && col.contents[1].style.d.color === "cyan",
	);
	check(
		"affordance font/color overrides applied",
		col.contents[0].style.d.font === "14px Gothic" && col.contents[0].style.d.color === "#333",
	);
	// drive the signal → the value Label re-strings for free (idiom 5b)
	v.value = 75;
	check("a reactive value thunk updates the number", col.contents[1].string === "75%");
}

// --- affordance:false — a bare value Label, no hints, value fills the height ---
{
	const [col] = createRoot(() => NumberField({ value: 7, affordance: false }));
	check("affordance:false yields a single value row", col.contents.length === 1);
	check("the lone row is the value (no unit)", col.contents[0].string === "7");
	check(
		"with no hints the value Label fills the whole height",
		col.contents[0].height === 120 && col.contents[0].width === 144,
	);
	check(
		"the lone value row still uses the value style, not an affordance style",
		col.contents[0].style.d.font === "bold 42px Bitham",
	);
}

// --- min clamp: a value below min displays as min ---
{
	const [col] = createRoot(() => NumberField({ value: -5, min: 0 }));
	check("a value below min clamps up to min for display", col.contents[1].string === "0");
}

// --- max clamp: a value above max displays as max ---
{
	const [col] = createRoot(() => NumberField({ value: 200, max: 100 }));
	check("a value above max clamps down to max for display", col.contents[1].string === "100");
}

// --- both min+max: an in-range value passes through unchanged (false clamp branches) ---
{
	const [inRange] = createRoot(() => NumberField({ value: 50, min: 0, max: 100 }));
	check("an in-range value with both bounds is unchanged", inRange.contents[1].string === "50");
	const [low] = createRoot(() => NumberField({ value: -10, min: 0, max: 100 }));
	check("below-min with both bounds clamps to min", low.contents[1].string === "0");
	const [high] = createRoot(() => NumberField({ value: 150, min: 0, max: 100 }));
	check("above-max with both bounds clamps to max", high.contents[1].string === "100");
}

// --- negative value with no bounds renders verbatim (with a unit) ---
{
	const [col] = createRoot(() => NumberField({ value: -42, unit: "F" }));
	check("a negative value with no bounds renders verbatim", col.contents[1].string === "-42F");
}

// --- reactive clamp: a thunk value driven out of range still shows the bound ---
{
	const v = signal(50);
	const [col] = createRoot(() => NumberField({ value: () => v.value, min: 0, max: 100 }));
	check("reactive value starts in range", col.contents[1].string === "50");
	v.value = 999;
	check("reactive value over max clamps inside the effect", col.contents[1].string === "100");
	v.value = -999;
	check("reactive value under min clamps inside the effect", col.contents[1].string === "0");
}

done();
