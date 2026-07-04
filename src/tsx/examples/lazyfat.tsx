// LAZYFAT — the 40KB-TOTAL-CODE demo (owner's dream cell). FIVE lazy screen
// modules of ~8KB arithmetic each (~40KB source total) ship as non-preloaded
// modules: bytecode waits in XIP flash; SELECT importNow-loads the next one
// and pushes it; only the visited screens' few function objects ever enter
// RAM. Total code scales far past the ~16-24KB one-shot boot ceiling
// because it never all loads at once. Build: --app lazyfat
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "bold 24px Gothic", color: "white" });

let NAV: any = null;
let next = 1;

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => {
			if (!NAV || next > 5) return;
			const mod =
				next === 1 ? importNow("app/s1") : next === 2 ? importNow("app/s2")
				: next === 3 ? importNow("app/s3") : next === 4 ? importNow("app/s4")
				: importNow("app/s5");
			next++;
			NAV.push(mod.default);
		}}
		onPressBack={() => { if (NAV && NAV.canPop()) { NAV.pop(); return true; } return false; }}>
		<Column>
			<Navigator root={(nav: any) => {
				NAV = nav;
				return (
					<Column>
						<Label string="lazyfat: 40KB total" />
						<Label string="select = next fat screen" />
					</Column>
				);
			}} />
		</Column>
	</Container>
), { skin: bg, style: base });
