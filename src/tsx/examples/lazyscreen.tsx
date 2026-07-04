// #27 — TRUE lazy-loaded screen via the host's global `importNow()`.
// The screen module (./lazyscreen/s2 → shipped as `app/s2`) is in the mod
// archive but NOT preloaded and NOT statically imported: its bytecode loads
// from flash only when SELECT first pushes it. Contrast with multilazy
// (closure-swap: all screen CODE ships inside main.js) — here main.js does
// not contain screen 2 at all.
//
// HONEST BUDGET (v1.5 matrix, playbook "The boot floor"): laziness saves
// ARENA BYTECODE, not boot slots — fxMapArchive interns every archive
// symbol and charges 2 ids per module AT BOOT even for modules never
// imported. That is why this example is deliberately LEANER than the
// navmany-class skeleton (no ticker signal, one label per screen) and why
// the lazy module exports only `default` (a host-known symbol): the whole
// extra boot cost is ~the `app/s2` module id. On a saturated app, +1 module
// is fatal regardless of laziness.
//
// Build: --app lazyscreen. build.mts resolves literal `importNow("app/<x>")`
// calls: ships ./lazyscreen/<x> as a non-preloaded manifest module and keeps
// treeshake/prune ON (the scan CAN follow a literal specifier).
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "bold 28px Gothic", color: "white" });

let NAV: any = null;

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => { if (NAV && !NAV.canPop()) NAV.push(importNow("app/s2").default); }}
		onPressBack={() => { if (NAV && NAV.canPop()) { NAV.pop(); return true; } return false; }}>
		<Column>
			<Navigator root={(nav: any) => {
				NAV = nav;
				return (
					<Column>
						<Label string="screen 1" />
						<Label string="select = lazy s2" />
					</Column>
				);
			}} />
		</Column>
	</Container>
), { skin: bg, style: base });
