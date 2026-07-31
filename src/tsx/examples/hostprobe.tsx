// hostprobe — one-screen device receipt for the 2026-07-29 bind-coverage
// audit's UNCATALOGUED host surface. Each row is a live presence/behavior
// probe of an API the audit found in the 4.17 host but unbound/undocumented:
//   st    typeof setTimeout + did a scheduled callback actually FIRE
//         (timers.ts claimed "no setTimeout on device" — this settles it)
//   light typeof watch.light, called once with 1 (backlight on; no-throw = ok)
//   exit  typeof watch.exit (presence ONLY — calling it would end the probe)
//   files typeof device.files (embedded:storage/files lazy import)
//   qr    importNow("qrcode") + the QRCode piu global
//   tl    importNow("piu/Timeline") (firmware-preloaded tween engine)
//   sn/lg device.info.serialNumber / device.info.language
//   ev    watch.on("hourchange") + watch.on("willFocus") subscribe no-throw
// Rows render even when a probe throws (try/catch per probe, error message
// as the row) — a crash screen here would itself be a receipt.
// Build: TREESHAKE_ALLOW="qrcode" APP=hostprobe node build.mts — every
// `importNow` below names a HOST module. `piu/Timeline` is covered by build.mts's
// built-in host prefixes (pebble/, embedded:, piu/); the bare `qrcode` is not
// provable by prefix — an unprefixed id could be a manifest.base.json mapping —
// so it takes the KEYED allowlist. Without the key treeshake self-disables and
// the probe ships the full runtime (TREESHAKE_FORCE=1 also builds, but it
// switches the whole safety scan off instead of naming one specifier).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "14px Gothic", color: "white", horizontal: "left" });

const g = globalThis as any;
const p = (fn: () => string): string => {
	try {
		return fn();
	} catch (e) {
		return "ERR " + String((e as Error).message).slice(0, 18);
	}
};

const [fired, setFired] = useState("no");
p(() => {
	g.setTimeout(() => setFired("FIRED"), 500);
	return "";
});

const rows = [
	"st: " + p(() => typeof g.setTimeout),
	"light: " + p(() => {
		const t = typeof g.watch.light;
		if (t === "function") g.watch.light(1);
		return t;
	}),
	"exit: " + p(() => typeof g.watch.exit),
	"files: " + p(() => typeof g.device.files),
	"qr: " + p(() => typeof g.importNow("qrcode")) + "/" + p(() => typeof g.QRCode),
	"tl: " + p(() => typeof g.importNow("piu/Timeline")),
	"sn: " + p(() => String(g.device.info.serialNumber).slice(0, 12)),
	"lg: " + p(() => String(g.device.info.language)),
	"hourchange: " + p(() => {
		g.watch.addEventListener("hourchange", () => {});
		return "ok";
	}),
	"daychange: " + p(() => {
		g.watch.addEventListener("daychange", () => {});
		return "ok";
	}),
	"willFocus: " + p(() => {
		g.watch.addEventListener("willFocus", () => {});
		return "ok";
	}),
];

render(() => (
	<Column>
		<Label style={st} string={() => "setTimeout cb: " + fired()} />
		{rows.map((r) => (
			<Label style={st} string={r} />
		))}
	</Column>
), { skin: bg, style: st });
