// runtime/image receipt — a single bitmap Image (the RN <Image> analog) centered
// with a caption. assets/sloth.png is a 280×140 sprite SHEET (two 140×140
// frames), so the Image frames ONE frame at natural size: `variants={140}` (the
// per-frame width) + a fixed `variant={0}` selects the open-sloth frame — drawing
// it at width/height 68 without variants would blit only a 68px CROP of the sheet
// (measured — a partial sloth). The build packs the asset automatically from the
// bare "sloth.png" literal (gen-manifest scans it). A fixed variant keeps this a
// STATIC single-frame demo; the reactive-variant animation is in sloth.tsx.
// Centered <Column> on the screen-filling root Container. Build: APP=image ./build.sh
import { render } from "runtime/jsx-runtime";
import { Image } from "runtime/image";

const bg = new Skin({ fill: "black" });
const caption = new Style({ font: "bold 24px Gothic", color: "white", horizontal: "center" });

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<Column>
				<Image src="sloth.png" width={140} height={140} variants={140} variant={0} />
				<Label left={0} right={0} style={caption} string="sloth" />
			</Column>
		</Container>
	),
	{ skin: bg, style: caption },
);
