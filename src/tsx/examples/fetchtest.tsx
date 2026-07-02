// Investigation: BARE fetch probe — NO signal runtime, so fetch gets the
// whole 32KB arena. Isolates "arena too small for fetch" from "no network".
// Plain Piu + the host `fetch` global; result shown by writing label.string
// directly. select = fetch. Build: APP=fetchtest ./build.sh
declare const fetch: any;

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });
const label = new Label(null, { width: 180, string: "SELECT to fetch", style: base });

const beh = {
	onPressSelect() {
		label.string = "fetching...";
		try {
			const p = fetch("http://example.com/");
			if (p && p.then)
				p.then((r: any) => { label.string = "ok status=" + r.status; })
				 .catch((e: any) => { label.string = "reject: " + e; });
			else
				label.string = "no promise";
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
