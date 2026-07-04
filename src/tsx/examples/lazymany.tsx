// Runtime-load cell for the 40-component-screen question: ONE lazy module
// carrying 46 THIN function objects (fatal at BOOT) — does a RUNTIME
// importNow survive it? Build: --app lazymany
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "bold 24px Gothic", color: "white" });
let NAV: any = null;

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => { if (NAV && !NAV.canPop()) NAV.push(importNow("app/s1").default); }}
		onPressBack={() => { if (NAV && NAV.canPop()) { NAV.pop(); return true; } return false; }}>
		<Column>
			<Navigator root={(nav: any) => { NAV = nav; return (
				<Column>
					<Label string="lazymany: 46 thin fns" />
					<Label string="select = load" />
				</Column>
			); }} />
		</Column>
	</Container>
), { skin: bg, style: base });
