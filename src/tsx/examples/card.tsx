// runtime/card receipt — a titled content box. A static "Weather" card wraps a
// Label body, and a second card's title is REACTIVE: it follows a signal (up/
// down bumps the temperature), proving the title bar repaints for free — a
// `title` thunk is driven by Card's internal effect (idiom 5b) with no bind
// wiring at the call site.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = warmer · down = cooler.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Card } from "runtime/card";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

const [temp, setTemp] = useState(72);
const warmer = () => setTemp(temp() + 1);
const cooler = () => setTemp(temp() - 1);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={warmer} onPressDown={cooler}>
			<Column>
				<Card title="Weather" width={150}>
					<Label string="Sunny skies" />
				</Card>
				<Card title={() => temp() + "°F"} width={150} fill="#003355" bodyColor="#00507f">
					<Label string="tap up/down" />
				</Card>
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
