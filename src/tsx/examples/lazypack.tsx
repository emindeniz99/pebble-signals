// Switch-pack cell: lazymany's 70 thin bodies as ONE packed dispatch fn.
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
					<Label string="lazypack: 70->1" />
					<Label string="select = load" />
				</Column>
			); }} />
		</Column>
	</Container>
), { skin: bg, style: base });
