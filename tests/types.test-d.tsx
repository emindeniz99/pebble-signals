// Compile-time type-guard test (#25). Checked by `npm run typecheck`
// (tsconfig.check.json, noCheck OFF). Correct usage must compile; misuse must
// error — the `@ts-expect-error` lines FAIL the build if they ever stop being
// errors, which is how we prove the guards actually bite.
import { Show, For, VirtualList, Navigator } from "runtime/flow";
import { useState, signal, computed } from "runtime/signals";

const data = { count: () => 3, get: (i: number) => "row" + i };

// --- valid usage: all of these must compile clean ---
Show({ when: () => true, children: () => 1, width: 10, height: 10 });
For({ each: () => [1, 2, 3], key: (n) => n, children: (n, i) => n + i });
VirtualList({ data, rows: 3, format: (v, i) => v + ":" + i }); // simple mode
VirtualList({ data, rows: 1, renderRow: (at, d) => d.get(at()) }); // rich mode
Navigator({
	root: (nav) => {
		nav.push(() => 0);
		return nav.depth();
	},
});

// --- misuse: each MUST be a type error (guards biting) ---
// @ts-expect-error — format and renderRow are mutually exclusive
VirtualList({ data, format: (v) => "" + v, renderRow: (at) => at() });
// @ts-expect-error — Show requires `when`
Show({ children: () => 1 });
// @ts-expect-error — For children must be a function, not a node
For({ each: () => [1], children: 5 });
// @ts-expect-error — Navigator requires `root`
Navigator({ width: 100 });

// signals surface stays typed too
const [count, setCount] = useState(0);
setCount((c) => c + 1);
const n: number = count();
const flag = signal(false);
flag.value = true;
const dbl = computed(() => n * 2);
const _d: number = dbl.value;
