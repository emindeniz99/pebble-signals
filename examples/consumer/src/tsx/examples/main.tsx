// The consumer app that actually SHIPS to the watch — built entirely from the
// installed signal-piu package (`npm run build` → node_modules/signal-piu/
// dist/build.mjs → .pbw). Imports use the DEVICE specifiers (`runtime/*`,
// mapped by the mod manifest on the watch); editor/typecheck resolves the same
// names into the installed package via tsconfig.check.json `paths`.
//
// Deliberately counter-class LEAN (one Style, one reactive Label): the 32KB
// arena OOMs at boot for clock-class apps (2 styles + 2 labels + interval) on
// the current runtime — measured during this example's bring-up, tracked with
// issue #29 in docs/roadmap.md. Auto-renders and ticks on its own (no buttons
// needed), so an emulator install alone proves the e2e path: packaged runtime
// + JSX + reactive binding + timer.
//
// Also proves a THIRD-PARTY npm package works in app code (handbook "third-party
// npm packages" section): `just-capitalize` is a tiny, zero-dependency, pure-JS
// registry package — no DOM/node APIs, so it runs fine on XS. esbuild only
// externalizes `runtime/*`; a `node_modules` import like this one INLINES into
// the bundled `main.js` (grep for its error string as proof — see the section
// in docs/handbook.md).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import capitalize from "just-capitalize";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "28px Gothic", color: "white" });

const [ticks, setTicks] = useState(0);
setInterval(() => setTicks((t) => t + 1), 1000);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<Column>
				<Label string={() => capitalize("SIGNAL-PIU " + ticks())} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
