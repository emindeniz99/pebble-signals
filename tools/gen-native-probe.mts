// Native-ledger probe: emit an app that builds N imperative Piu Labels in a
// Column. The ONLY thing that varies with N is the loop bound (a few source
// bytes → negligible archive delta), so the drop in the instruments "App
// bytes free" field across N isolates the NATIVE app-heap cost per Piu node
// (the C half — PiuContent struct + layout/draw state — the ledger we budget
// the XS arena around but had never measured). Playbook "Piu native node
// halves". Usage: node tools/gen-native-probe.mts <N>  (writes the example).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "./pkg-root.mts";

const N = Number(process.argv[2] ?? "0");
const src = `// GENERATED (tools/gen-native-probe.mts) — ${N} labels, native-heap probe.
import { render } from "runtime/jsx-runtime";
const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });
render(() => {
	const col = new Column(null, { top: 0, bottom: 0, left: 0, right: 0 });
	for (let i = 0; i < ${N}; i++) col.add(new Label(null, { string: "L" + i }));
	return col;
}, { skin: bg, style: base });
`;
const out = join(packageRoot(import.meta.dirname), "src/tsx/examples/nativeprobe.tsx");
writeFileSync(out, src);
console.log(`gen-native-probe: N=${N} -> ${out}`);
