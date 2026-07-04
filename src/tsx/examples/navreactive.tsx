// #39 probe: swapped screens containing the DOCUMENTED CRASHERS — a live
// reactive binding (nav.depth() read in a string thunk) AND two labels per
// screen. If this renders and survives push/pop, the old "swapped-screen
// reactive crash" was arena pressure (fixed by export pruning), not the port.
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });

let NAV: any = null;
const [pings, setPings] = useState(0);
setInterval(() => setPings((p: number) => p + 1), 1000);

const screen = () => (
	<Column>
		<Label style={big} string={() => "depth " + (NAV ? NAV.depth() : 0)} />
		<Label style={big} string={() => "ping " + pings()} />
	</Column>
);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => { if (NAV) NAV.push(screen); }}
		onPressBack={() => { if (NAV && NAV.canPop()) { NAV.pop(); return true; } return false; }}>
		<Column>
			<Navigator root={(nav: any) => { NAV = nav; return screen(); }} />
		</Column>
	</Container>
), { skin: bg, style: big });
