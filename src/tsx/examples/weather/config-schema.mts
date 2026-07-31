// The weather face's settings SCHEMA — the single source of truth for both
// halves of the Clay round-trip. `node tools/config-page.mts
// src/tsx/examples/weather/config-schema.mts` reads this file and emits, beside
// it:
//   * config-page.html  — the self-contained settings page the phone opens
//   * config-types.ts   — `WeatherConfig` + `WEATHER_CONFIG_DEFAULTS`, the type
//                         and seed for `useConfig` on the watch
// so the page's keys can never drift from the watch's interface: change a key
// here and BOTH regenerate, or neither does.
//
// NOT WIRED INTO THE BUILD, on purpose. `weather.tsx` still declares its own
// three-string payload and nothing imports this file, so the mod's bytes are
// unchanged and an app that never authors a page pays nothing. To adopt it,
// import the generated type/defaults in the face and point the pkjs
// `showConfiguration` handler at the hosted config-page.html — a phone-side
// edit plus a type import, no runtime change.
//
// `as const satisfies` is what makes the schema TYPED: `satisfies` checks every
// entry against the discriminated `ConfigField` union HERE (a `select` without
// `options`, or a `slider` default outside its range, is a red squiggle in this
// file), while `as const` keeps the literal option strings so the generated
// `units` type is `"metric" | "imperial"` and not a bare `string`.
import type { ConfigField } from "../../../../tools/config-page.mts";

export default [
	{ key: "city", type: "text", label: "City", default: "Berlin" },
	// the option strings ARE the payload values and the generated union members
	{
		key: "units",
		type: "select",
		label: "Units",
		default: "metric",
		options: ["metric", "imperial"],
	},
	// #ffaa55 — the accent weather.tsx already paints its clock line with
	{ key: "accent", type: "color", label: "Accent colour", default: "#ffaa55" },
] as const satisfies readonly ConfigField[];
