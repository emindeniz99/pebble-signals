// fetch via @moddable/pebbleproxy (PKJS phone proxy — the correct Alloy
// network mechanism; see src/pkjs/index.js and README gotcha 18). BARE (no
// signal runtime) so fetch has the whole arena — from a normal app fetch
// OOMs the 32KB arena. select = fetch. NOTE: a live round-trip could not be
// completed in this dev sandbox (unstable emulator/pypkjs) — the wiring is
// the documented-correct approach; verify on steadier emu or real hardware.
// Build: APP=fetchtest ./build.sh
declare const fetch: any;

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "16px Gothic", color: "white" });
const label = new Label(null, { width: 190, string: "SELECT to fetch", style: base });

const beh = {
	onPressSelect() {
		label.string = "fetching...";
		try {
			fetch("https://example.com/")
				.then((r: any) => { label.string = "ok status=" + r.status; return r.text(); })
				.then((t: any) => { label.string = "got " + (t ? t.length : 0) + " bytes"; })
				.catch((e: any) => { label.string = "reject: " + e; });
		} catch (e) {
			label.string = "throw: " + e;
		}
		return true;
	},
};

const app = new Application(null, { skin: bg, style: base });
const col = new Column(null, {});
col.add(label);
const root = new Container(null, { left: 0, right: 0, top: 0, bottom: 0, behavior: beh });
root.add(col);
app.add(root);
root.focus();

export default app;
