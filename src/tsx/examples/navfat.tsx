// The FAT variant of navmany — the 3-label screens that DIED at boot when all
// code sat in heap-resident main.js (fxAbort, slot 6464/8176 — measured).
// PRELOAD_PURE's measurement vehicle: ./navfat/screens is a PURE submodule the
// build can freeze into ROM instead of bundling into main. Build:
//   --app navfat                 -> everything in main (expected: boot OOM)
//   --app navfat --preload-pure  -> screens.ts in ROM (expected: boots)
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";
import { useState } from "runtime/signals";
import { detail } from "./navfat/screens";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const small = new Style({ font: "18px Gothic", color: "#AAAAAA" });

let NAV: any = null;
const [pings, setPings] = useState(0);
setInterval(() => setPings((p: number) => p + 1), 1000);

const screen = (i: number) => () => (
	<Column>
		<Label style={big} string={"Screen #" + i} />
		<Label style={small} string={detail(i)} />
		<Label style={small} string={() => "tick " + pings()} />
	</Column>
);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => { if (NAV) NAV.push(screen(NAV.depth() + 1)); }}
		onPressBack={() => { if (NAV && NAV.canPop()) { NAV.pop(); return true; } return false; }}>
		<Column>
			<Navigator root={(nav: any) => { NAV = nav; return screen(1)(); }} />
		</Column>
	</Container>
), { skin: bg, style: small });
