// Pack a JSON array of strings into a romTable blob (assets/<name>) —
// the data half of the smart-split story. Format (device-proven, playbook
// "v2: data-to-Resource"): [u16le count][u16le cumulative END offset per
// entry][latin-1 payload]. Read on-device with `romTable("<name>")` from
// runtime/signals; the manifest derivation ships the blob automatically
// for any `romTable("<name>")` literal in the app source.
//
// Usage (run from the PROJECT root): node tools/pack-table.mts <name> <strings.json>
//   node tools/pack-table.mts stations.tbl data/stations.json
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function packTable(texts: string[]): Buffer {
	const payload = Buffer.from(texts.join(""), "latin1");
	const head = Buffer.alloc(2 + 2 * texts.length);
	head.writeUInt16LE(texts.length, 0);
	let end = 0;
	texts.forEach((t, k) => {
		end += t.length;
		head.writeUInt16LE(end, 2 + 2 * k);
	});
	return Buffer.concat([head, payload]);
}

if (import.meta.main) {
	const [name, jsonPath] = process.argv.slice(2);
	const texts = JSON.parse(readFileSync(jsonPath, "utf8")) as string[];
	const blob = packTable(texts);
	// cwd, NOT packageRoot: from a scaffolded app this tool runs as
	// node_modules/pebble-signals/dist/tools/pack-table.mjs, and packageRoot
	// resolved to the INSTALLED package — the blob landed under node_modules
	// while the manifest's `../../assets/<name>` entry reads the project's
	// assets/ (missing/stale resource on device; codex P2). The project root
	// is where builds run from, in this repo and in a consumer app alike.
	const dir = join(process.cwd(), "assets");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, name), blob);
	console.log(`pack-table: ${texts.length} entries, ${blob.length}B -> assets/${name}`);
}
