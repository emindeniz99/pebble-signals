// M0 — static Piu Label to validate the build/run loop and baseline memory.
console.log("signal-piu M0 start");

const whiteOnBlack = new Style({ font: "28px Gothic", color: "white" });

const M0Application = Application.template($ => ({
	skin: new Skin({ fill: "black" }),
	style: whiteOnBlack,
	contents: [
		Label($, { left: 0, right: 0, string: "signal-piu M0" }),
	],
}));

export default new M0Application({});
