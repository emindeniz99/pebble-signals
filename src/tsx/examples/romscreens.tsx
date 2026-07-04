// #ROMSCREENS — screens live in ROM (owner's smart-split dream, screen
// half, device-verified). ./romscreens/screens is a PURE module the build
// freezes into the mod archive with --preload-pure: builder code + frozen
// function objects in flash, zero bytes of them in main.js. SELECT pushes
// the next ROM screen, BACK pops. Build:
//   node build.mts --app romscreens --preload-pure
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";
import { one, two, three } from "./romscreens/screens";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "bold 24px Gothic", color: "white" });

const S = [one, two, three];
let NAV: any = null;

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => { if (NAV) NAV.push(S[NAV.depth() % S.length]); }}
		onPressBack={() => { if (NAV && NAV.canPop()) { NAV.pop(); return true; } return false; }}>
		<Column>
			<Navigator root={(nav: any) => { NAV = nav; return one(); }} />
		</Column>
	</Container>
), { skin: bg, style: base });
