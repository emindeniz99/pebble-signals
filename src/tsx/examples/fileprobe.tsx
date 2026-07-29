// fileprobe — device.files round-trip receipt for the opt-in `runtime/files`
// module (the app-private PFS filesystem under `<app-id>xs/`). Three rows,
// each a live device fact, computed at boot before render:
//   files:   write "sp files ok" -> read it back -> compare. "roundtrip-ok"
//            means the whole write/allocate/read/decode path works.
//   rewrite: write DIFFERENT content to the SAME path. This is the row that
//            matters: PFS files are fixed-size and a NOR write may only clear
//            bits, so an in-place rewrite throws "NOR write would fail" —
//            runtime/files deletes and re-creates instead, and this proves it.
//   list:    listFiles().length — the host hands back a bare iterator, so a
//            count on screen is itself proof the drain-to-array works.
// Every probe is wrapped, so a host failure renders as "ERR <message>" instead
// of a crash screen (the hostprobe idiom) — an error row is still a receipt.
// Build: APP=fileprobe node build.mts
import { listFiles, readFile, writeFile } from "runtime/files";
import { render } from "runtime/jsx-runtime";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "18px Gothic", color: "white", horizontal: "left" });

const PATH = "probe.txt";
const p = (fn: () => string): string => {
	try {
		return fn();
	} catch (e) {
		return `ERR ${String((e as Error).message).slice(0, 16)}`;
	}
};

// 1. write -> read -> compare
const first = p(() => {
	const text = "sp files ok";
	writeFile(PATH, text);
	const back = readFile(PATH);
	return back === text ? "roundtrip-ok" : `MISMATCH ${String(back).slice(0, 10)}`;
});

// 2. rewrite the SAME path with LONGER, different content (the NOR trap)
const second = p(() => {
	const text = "rewritten twice";
	writeFile(PATH, text);
	return readFile(PATH) === text ? "ok" : "MISMATCH";
});

// 3. how many entries the app's private root holds now (>= 1: probe.txt)
const count = p(() => String(listFiles().length));

render(() => (
	<Column>
		<Label style={st} string={`files: ${first}`} />
		<Label style={st} string={`rewrite: ${second}`} />
		<Label style={st} string={`list: ${count}`} />
	</Column>
), { skin: bg, style: st });
