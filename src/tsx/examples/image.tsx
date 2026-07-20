// runtime/image receipt — a single bitmap Image (the RN <Image> analog) centered
// with a caption. The sloth is assets/sloth.png at 68x68; the build packs it
// automatically because the bare "sloth.png" string LITERAL appears in this app
// source (gen-manifest scans it). The SCREENSHOT demo is the STATIC bitmap; the
// sprite-sheet path (`variants` + a reactive `variant` thunk) is covered in the
// module JSDoc and the Node suite (tests/image.test.mts), not shown here — a
// static frame is the honest, screenshot-verifiable single-component demo.
// Centered <Column> on the screen-filling root Container so it reads on both the
// 260x260 round (gabbro) and 200x228 rect (emery) panels. Build: APP=image ./build.sh
import { render } from "runtime/jsx-runtime";
import { Image } from "runtime/image";

const bg = new Skin({ fill: "black" });
const caption = new Style({ font: "bold 24px Gothic", color: "white" });

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<Column>
				<Image src="sloth.png" width={68} height={68} />
				<Label style={caption} string="sloth" />
			</Column>
		</Container>
	),
	{ skin: bg, style: caption },
);
