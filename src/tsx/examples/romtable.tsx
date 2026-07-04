// ROMTABLE — the shipped data half of the smart-split story: a 200-entry
// string table (~10KB) lives as ONE packed blob in the flash resource area
// (assets/stations.tbl, written by tools/pack-table.mts) and costs ZERO
// boot RAM. `romTable()` (runtime/signals) gives typed access; each read
// decodes one transient string. The manifest ships the blob automatically
// because this file mentions romTable("stations.tbl").
// Regenerate the blob: node tools/pack-table.mts stations.tbl <json>
import { render } from "runtime/jsx-runtime";
import { romTable, useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 24px Gothic", color: "white" });
const small = new Style({ font: "18px Gothic", color: "#AAAAAA" });

const t = romTable("stations.tbl");
const [i, setI] = useState(0);
setInterval(() => setI((v: number) => v + 1), 1000);

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			<Label style={big} string={"romTable: " + t.count + " entries"} />
			<Label style={small} string={() => t.get(i())} />
		</Column>
	</Container>
), { skin: bg, style: small });
