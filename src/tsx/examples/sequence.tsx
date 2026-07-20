// useSequence / useSpring demo — a box BOUNCES left↔right forever on a looping
// keyframe sequence (yoyo), and SELECT springs it down-and-back with physics.
// Both motions read live getters driven into Move's x()/y() via moveBy (the
// device-safe reactive-position path — coordinate writes crash the port).
// Proves the runtime/anim additions on-device. Build: APP=sequence
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Move } from "runtime/flow";
import { useSequence, useSpring, yoyo } from "runtime/anim";

const bg = new Skin({ fill: "black" });
const box = new Skin({ fill: "#55AAFF" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

// horizontal bounce: 0→110→0 over 1.4s, looping forever (one owned timer).
const x = useSequence(yoyo([{ to: 110, ms: 700 }]), { loop: true });
// vertical drop: springs toward `dropTo`; SELECT toggles it 0↔70 (physics settle).
const [dropTo, setDropTo] = useState(0);
const y = useSpring(() => dropTo(), { stiffness: 180, damping: 14 });

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => setDropTo((d: number) => (d ? 0 : 70))}>
		<Column>
			<Move x={() => x()} y={() => y()} left={20} top={90} width={40} height={40}>
				<Content width={40} height={40} skin={box} />
			</Move>
			<Label style={dim} string="SELECT = spring drop" />
		</Column>
	</Container>
), { skin: bg, style: dim });
