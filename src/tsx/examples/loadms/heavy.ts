// A deliberately non-trivial lazy module (~2KB bytecode): loaded from flash
// on the first importNow — the thing loadms times. Default-only export
// (lazy-module symbol rule); a switch keeps function objects to ONE.
const pick = (x: number): number => {
	switch (x % 8) {
		case 0: return x * 3 + 1;
		case 1: return x * 5 + 2;
		case 2: return x * 7 + 3;
		case 3: return x * 11 + 4;
		case 4: return x * 13 + 5;
		case 5: return x * 17 + 6;
		case 6: return x * 19 + 7;
		default: return x * 23 + 8;
	}
};
let acc = 0;
for (let i = 0; i < 200; i++) acc += pick(i);
export default { acc, label: "heavy loaded" };
