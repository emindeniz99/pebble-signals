// GENERATED: class-pure cell — ONE class with 40 METHODS in a lazy module;
// the instance is created INSIDE the builder (no module-scope `new`).
// Methods live on ONE prototype object: does lazy load survive 40 of them?
const C = class {
	m0(x: number): number { return (x * 7 + 13) % 97; }
	m1(x: number): number { return (x * 8 + 16) % 98; }
	m2(x: number): number { return (x * 9 + 19) % 99; }
	m3(x: number): number { return (x * 10 + 22) % 100; }
	m4(x: number): number { return (x * 11 + 25) % 101; }
	m5(x: number): number { return (x * 12 + 28) % 102; }
	m6(x: number): number { return (x * 13 + 31) % 103; }
	m7(x: number): number { return (x * 14 + 34) % 104; }
	m8(x: number): number { return (x * 15 + 37) % 105; }
	m9(x: number): number { return (x * 16 + 40) % 106; }
	m10(x: number): number { return (x * 17 + 43) % 107; }
	m11(x: number): number { return (x * 18 + 46) % 108; }
	m12(x: number): number { return (x * 19 + 49) % 109; }
	m13(x: number): number { return (x * 20 + 52) % 110; }
	m14(x: number): number { return (x * 21 + 55) % 111; }
	m15(x: number): number { return (x * 22 + 58) % 112; }
	m16(x: number): number { return (x * 23 + 61) % 113; }
	m17(x: number): number { return (x * 24 + 64) % 114; }
	m18(x: number): number { return (x * 25 + 67) % 115; }
	m19(x: number): number { return (x * 26 + 70) % 116; }
	m20(x: number): number { return (x * 27 + 73) % 117; }
	m21(x: number): number { return (x * 28 + 76) % 118; }
	m22(x: number): number { return (x * 29 + 79) % 119; }
	m23(x: number): number { return (x * 30 + 82) % 120; }
	m24(x: number): number { return (x * 31 + 85) % 121; }
	m25(x: number): number { return (x * 32 + 88) % 122; }
	m26(x: number): number { return (x * 33 + 91) % 123; }
	m27(x: number): number { return (x * 34 + 94) % 124; }
	m28(x: number): number { return (x * 35 + 97) % 125; }
	m29(x: number): number { return (x * 36 + 100) % 126; }
	m30(x: number): number { return (x * 37 + 103) % 127; }
	m31(x: number): number { return (x * 38 + 106) % 128; }
	m32(x: number): number { return (x * 39 + 109) % 129; }
	m33(x: number): number { return (x * 40 + 112) % 130; }
	m34(x: number): number { return (x * 41 + 115) % 131; }
	m35(x: number): number { return (x * 42 + 118) % 132; }
	m36(x: number): number { return (x * 43 + 121) % 133; }
	m37(x: number): number { return (x * 44 + 124) % 134; }
	m38(x: number): number { return (x * 45 + 127) % 135; }
	m39(x: number): number { return (x * 46 + 130) % 136; }
};

export default () => {
	const c = new C();
	let sum = 0;
	for (let k = 0; k < 40; k++) sum += (c as unknown as Record<string, (x: number) => number>)["m" + k](3);
	return (
		<Column>
			<Label string="40-method class" />
			<Label string={"sum = " + sum} />
		</Column>
	);
};
