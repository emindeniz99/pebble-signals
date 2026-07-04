// Compile-time useState lowering (packed core Stage 2), AST-based.
//
// Replaces the regex tool (tools/lower.py) with a REAL parse + binding
// resolution via the TypeScript compiler API (already required for tsc).
// Every decision is made on the resolved SYMBOL, not on name matching:
// "who is this identifier bound to?" is answered by the checker, so
// shadowing, property access, and aliasing are correct by construction —
// only the genuinely-correct call sites are rewritten.
//
//   const [x, setX] = useState(init)  ->  const x = __sp.sig(init)
//   x()          (getter, 0 args)     ->  __sp.get(x)
//   setX(expr)   (setter)             ->  __sp.set(x, expr)
//   setX()                            ->  __sp.set(x, undefined)
//
// A pair is lowered ONLY when its useState resolves to the import from
// "runtime/signals" AND every reference to both names is a qualifying
// direct call (getter: exactly the call target, zero args; setter: the
// call target). Any other use — value position, extra args, alias,
// shadow — leaves that pair on the object-API useState. Semantics never
// change, only representation. The runtime alias is unique per file.
//
// Usage: node tools/lower/cli.mts FILE...    |    node tools/lower/cli.mts --selftest
import { readFileSync, writeFileSync } from "node:fs";
import { lower } from "./lower.mts";
import { selftest } from "./selftest.mts";

if (import.meta.main) {
	const argv = process.argv.slice(2);
	if (argv[0] === "--selftest") {
		selftest();
	} else {
		for (const path of argv) {
			const src = readFileSync(path, "utf8");
			const { code, lowered, bailed } = lower(src);
			if (code !== src) {
				// Idempotency guard, every prod build: lowering its own output must
				// be a fixed point. If a second pass would change the code again,
				// pass one missed or double-applied something — fail LOUD, don't
				// ship a possibly-corrupt lower.
				const second = lower(code);
				if (second.code !== code) {
					console.error(
						`lower: ${path} NOT IDEMPOTENT — second pass changed the output; refusing to write`,
					);
					process.exit(1);
				}
				writeFileSync(path, code);
			}
			console.log(`lower: ${path}  ${lowered} lowered, ${bailed} bailed`);
		}
	}
}
