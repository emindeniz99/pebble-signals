// Class-pure cell: 40 methods on one class in a lazy module.
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "bold 24px Gothic", color: "white" });
let NAV: any = null;

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}>
		<Column>
			<Navigator root={(nav: any) => { NAV = nav; return (
				<Column><Label string="lazyklass" /></Column>
			); }} />
		</Column>
	</Container>
), { skin: bg, style: base });

setTimeout(() => { if (NAV) NAV.push(importNow("app/s1").default); }, 0);
