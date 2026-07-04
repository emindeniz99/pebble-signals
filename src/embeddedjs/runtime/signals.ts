// Reactive core — Solid-style signals, ownership, and the React-flavored
// hooks layer in ONE module. Logically these are three units (signals,
// owner, hooks); they share a file because every XS module costs RAM and
// the firmware-fixed 32KB arena is tight enough that two extra module
// records were the difference between the combined demo booting or dying
// with "fxAbort memory full" (measured on SDK 4.17 / gabbro).
// XS-safe: closures, arrays, accessors only. No Proxy/Reflect/WeakMap.
//
// WARNING (measured, README gotcha 13): the firmware's alias budget has
// almost zero headroom. Adding top-level `function`/`class` declarations
// to any preloaded module — even never-called ones — kills the app at
// startup. New module-level helpers must be `const` bindings, and every
// export costs runtime RAM: make it earn its keep.

// Optional host/app diagnostic hook: notify() routes reaction errors here so a
// throwing effect can't abort the XS machine. Declared on globalThis (erases).
declare global {
	// eslint-disable-next-line no-var
	var __spError: ((e: unknown) => void) | undefined;
}

// A reaction is a plain thunk; an effect id indexes into the graph below.
type EffectFn = () => void;

// The one lazily-created state record (see the block comment below). Typed as
// an interface so every `G.xxx` access is checked; the runtime keeps it as a
// plain object literal (no class — a class would add a top-level declaration to
// this preloaded module, gotcha 13).
interface Graph {
	eff: (EffectFn | null)[]; // effect id -> reaction (null = disposed)
	val: unknown[]; // packed signal id -> value
	sub: Uint32Array; // subscription matrix, st words per signal row
	st: number; // stride: words per row (= 1 + hi-word count)
	n: number; // rows used
	u: number; // word 0 of the live effect-id set
	q: number; // word 0 of the quarantined effect-id set
	uh: Uint32Array | null; // live-set hi-words (ids 32+)
	qh: Uint32Array | null; // quarantine hi-words
	dep: number; // notification cascade depth
	bat: number; // batch() nesting depth
	pend: number[] | null; // rows whose notify is deferred (settle turns)
	// The three fields below use SINGLE-LETTER property names on purpose:
	// every archive symbol interns at boot (playbook "The boot floor"), and
	// a/z single letters are already in every build's symbol table via the
	// minified runtime — so these cost ZERO new boot symbols.
	y: number; // global write version — lazy computeds validate against it
	// lazy-computed state (SoA triple, one property): x[0][row] fn,
	// x[1][row] last-validated version (-1 = never), x[2][row]
	// forward-effect id. null until the first computed exists.
	x: [(() => unknown)[], number[], number[]] | null;
	// running-owner: w[e] = disposables created while effect e ran — nested
	// effects AND tracked cleanups (this subsumed the old separate cln
	// array: a tracked cleanup closure has the exact same timing). null
	// until some running effect tracks something — most never do.
	w: (Disposable[] | null)[] | null;
}

let current = -1; // id of the running effect, -1 = none

// ---- packed effect graph (task #15 Stage 1 — measured ~2x cheaper) ----
// An effect is an INTEGER ID, not an object. Tables live in ONE lazily
// created state record (a preload-time buffer would be frozen into ROM):
//   eff[id]  reaction fn (null = disposed — doubles as the zombie guard)
//   sub      Uint32Array, `st` words per SIGNAL row (32 effect bits each);
//            subscribe is one OR — and the old per-effect dependency
//            array is GONE: reverse edges are implied by the forward
//            masks, so unsubscribe is one AND-NOT pass over the rows.
//   u/q      word 0 of the used / quarantined effect-id sets (effects
//            0-31, the fast path); uh/qh hold words 1..st-1 and stay null
//            until a 33rd live effect forces the stride to grow (#21).
//   st       stride: words per signal row AND (1 + uh.length). Starts at 1
//            (single-word core, zero overhead); grows lazily so apps with
//            <=32 effects pay nothing.
// Freed ids are QUARANTINED while a notification cascade is running
// (dep > 0): a set() snapshots masks by value, so without quarantine a
// stale bit could run a freshly reused id.
let G: Graph | null = null;

const gi = (): Graph => {
	let g = G;
	if (g === null)
		// lazy: a preload-time table would be frozen in ROM
		G = g = {
			eff: [],
			val: [],
			sub: new Uint32Array(8),
			st: 1,
			n: 0,
			u: 0,
			q: 0,
			uh: null,
			qh: null,
			dep: 0,
			bat: 0,
			pend: null,
			y: 0,
			x: null,
			w: null,
		};
	return g;
};

const grow = (g: Graph): number => {
	// allocate one subscription row (st words wide). Row capacity is DERIVED
	// (sub.length / st) instead of stored — one division per grow buys back a
	// Graph slot + a boot symbol (CPU for RAM, as always).
	const i = g.n++;
	if ((i + 1) * g.st > g.sub.length) {
		// rows packed contiguously — a flat copy preserves layout
		const s2 = new Uint32Array(g.sub.length << 1);
		s2.set(g.sub);
		g.sub = s2;
	}
	return i;
};

// Widen the stride by one word: every signal row gains a word and the
// used/quarantine hi-word arrays extend. O(rows) copy, run only when the
// live-effect count crosses a 32-bit boundary (32, 64, ...), so amortized
// to nothing. Preserves each row's existing words in place.
const growStride = (g: Graph): void => {
	const os = g.st,
		ns = os + 1;
	const nsub = new Uint32Array((g.sub.length / os) * ns);
	for (let r = 0; r < g.n; r++) for (let w = 0; w < os; w++) nsub[r * ns + w] = g.sub[r * os + w];
	g.sub = nsub;
	if (g.uh === null) {
		g.uh = new Uint32Array(1);
		g.qh = new Uint32Array(1);
	} else {
		const u2 = new Uint32Array(ns - 1);
		u2.set(g.uh);
		g.uh = u2;
		const q2 = new Uint32Array(ns - 1);
		q2.set(g.qh!); // uh non-null (this branch) implies qh non-null (invariant)
		g.qh = q2;
	}
	g.st = ns;
};

const relQ = (g: Graph): void => {
	// cascade over: release quarantined ids. Sole caller is settle()'s
	// finally, which only runs at depth 0 (nested settles bail up front) —
	// so no depth guard is needed here anymore.
	g.u &= ~g.q;
	g.q = 0;
	const uh = g.uh;
	if (uh !== null)
		// uh non-null implies qh non-null (invariant); `!` erases, emit unchanged
		for (let k = 0; k < uh.length; k++) {
			uh[k] &= ~g.qh![k];
			g.qh![k] = 0;
		}
};

// Drain deferred notifications in COALESCED TURNS (the glitch-free half of
// the 2026-07 core round). Each turn unions the subscriber masks of every
// row touched since the last turn, so an effect reached via several paths
// (the diamond) runs ONCE per turn; writes made BY those effects queue the
// next turn instead of cascading recursively. Skips when a batch() or an
// outer settle is active — that drainer owns the queue.
const settle = (g: Graph): void => {
	if (g.bat > 0 || g.dep > 0) return;
	g.dep++;
	try {
		while (g.pend !== null) {
			const rows = g.pend;
			g.pend = null; // writes during this turn queue the NEXT turn
			const st = g.st,
				sub = g.sub;
			for (let wi = 0; wi < st; wi++) {
				// union the touched rows' masks — effect-level dedupe (Solid
				// batch semantics, now on EVERY write)
				let acc = 0;
				for (let k = 0; k < rows.length; k++) acc |= sub[rows[k] * st + wi];
				const off = wi << 5;
				while (acc) {
					const b = acc & -acc;
					acc &= acc - 1;
					notify(off + 31 - Math.clz32(b));
				}
			}
		}
	} finally {
		g.dep--;
		relQ(g);
	}
};

const flush = (g: Graph, i: number): void => {
	// defer + dedupe the row, then drain unless a batch/turn already owns it
	const p = g.pend || (g.pend = []);
	if (p.indexOf(i) < 0)
		// linear: turn queues are few rows (no Set — XS rule)
		p.push(i);
	settle(g);
};

// Signals keep the object API (`.value`) — Stage 1 packs only the graph.
// `i` is the signal's row in G.sub, allocated LAZILY on first subscribe:
// never-watched signals own no row at all.
class Signal<T> {
	v: T;
	i: number;
	constructor(value: T) {
		this.v = value;
		this.i = -1;
	}
	get value(): T {
		// eff[current] check: an effect disposed WHILE RUNNING (its subtree
		// torn down by an outer effect it triggered) must not re-subscribe
		// as a permanent zombie.
		if (current >= 0 && G!.eff[current]) {
			const g = G!;
			let i = this.i;
			if (i < 0) i = this.i = grow(g);
			g.sub[i * g.st + (current >> 5)] |= 1 << (current & 31);
		}
		return this.v;
	}
	set value(value: T) {
		if (value === this.v) return;
		this.v = value;
		const g = G;
		if (g !== null) g.y++; // lazy computeds re-validate on read
		const i = this.i;
		if (i < 0)
			// never subscribed
			return;
		flush(g!, i); // deferred + coalesced (see settle)
	}
}

/**
 * A derived, read-only reactive value — what {@link computed} returns. Reading
 * `.value` inside an effect subscribes; writing it is a type error (a computed
 * is recomputed from its dependencies, never assigned).
 */
export interface ReadonlySignal<T> {
	readonly value: T;
}

// diagnostic hook: surface subscriber exceptions instead of letting them
// abort the machine (XS kills the app otherwise)
function notify(e: number): void {
	try {
		run(e);
	} catch (err) {
		if (globalThis.__spError) globalThis.__spError(err);
		else throw err;
	}
}

const run = (e: number): void => {
	const fn = G!.eff[e];
	if (!fn)
		// disposed mid-notification — do not resurrect
		return;
	unsubscribe(e);
	const prev = current;
	const po = owner;
	current = e;
	owner = e; // running-owner (B9): trackables created during the run belong
	// to THIS effect and are disposed before its next run / at its disposal
	try {
		fn();
	} finally {
		current = prev;
		owner = po;
	}
};

// Runs the user cleanup (if any) and drops every subscription of effect e
// in ONE masked pass over the signal rows (CPU for RAM: rows are few and
// the pass allocates nothing). Called both before every re-run and on
// disposal, giving useEffect the React contract: cleanup fires before the
// next run and once more at dispose.
function unsubscribe(e: number): void {
	const g = G!;
	// running-owner: dispose everything the PREVIOUS run created — nested
	// effects and tracked cleanups alike (this list replaced the old cln
	// array: a tracked cleanup closure runs at exactly the same moments,
	// before every re-run and once more at disposal)
	const list = g.w !== null && g.w[e];
	if (list) {
		g.w![e] = null;
		for (let i = list.length - 1; i >= 0; i--) dispose(list[i]);
	}
	// effect e lives in word (e>>5) of every row; clear just that word.
	const sub = g.sub,
		st = g.st,
		word = e >> 5,
		m = ~(1 << (e & 31)),
		rows = g.n;
	for (let s = 0; s < rows; s++) sub[s * st + word] &= m;
}

/**
 * Create a reactive value. Reading `.value` inside an {@link effect} (or a JSX
 * binding thunk) subscribes to it; writing `.value` notifies subscribers. The
 * build lowers `const s = signal(v)` to the packed integer {@link S} API.
 * @param value initial value
 */
export function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

// ---- packed signals — the Stage 2 lowering target -------------------------
// A packed signal is an INTEGER: the id doubles as its subscription row and
// indexes G.val (ONE slot per value instead of a ~4-slot Signal object).
// build.mts lowers `const [x, setX] = useState(v)` to this API at compile
// time (tools/lower.py): x() -> S.get(x), setX(e) -> S.set(x, e). Authoring
// DX is unchanged and the per-state getter/setter closures never exist at
// runtime. set() keeps useState's functional-update contract.
/**
 * Packed lowering target — integer-id signals with zero per-signal objects.
 * `build.mts` rewrites `useState`/`signal`/`computed` to this at compile time;
 * you rarely call it by hand.
 */
export const S = {
	/** Allocate a packed signal, return its integer id. */
	sig(v: unknown): number {
		const g = gi();
		const i = grow(g);
		g.val[i] = v;
		return i;
	},
	/** Read packed signal `i` (subscribes the current effect; pulls a stale computed). */
	get<T>(i: number): T {
		const g = G!;
		const cx = g.x;
		if (cx !== null) {
			// lazy computed pull (glitch-free): recompute on READ when any
			// write happened since this row last validated — the recursion
			// through the sources' own S.get reads IS the topological order.
			// A disposed computed (forward effect gone) freezes at its last
			// value instead of recomputing.
			const fn = cx[0][i];
			if (fn !== undefined && cx[1][i] !== g.y && g.eff[cx[2][i]]) {
				cx[1][i] = g.y; // before fn: a re-entrant read sees "current"
				const e = cx[2][i];
				unsubscribe(e); // re-track sources on every recompute
				const prev = current;
				const po = owner;
				current = e;
				owner = e; // trackables created by fn belong to the computed
				try {
					g.val[i] = fn();
				} finally {
					current = prev;
					owner = po;
				}
			}
		}
		if (current >= 0 && g.eff[current]) g.sub[i * g.st + (current >> 5)] |= 1 << (current & 31);
		return g.val[i] as T;
	},
	/** Functional-update write (the `useState` setter contract). */
	set<T>(i: number, v: T | ((prev: T) => T)): void {
		const g = G!;
		if (typeof v === "function") v = (v as (prev: unknown) => unknown)(g.val[i]) as T;
		if (v === g.val[i]) return;
		g.val[i] = v;
		g.y++;
		flush(g, i);
	},
	// RAW write — no functional-update unwrap. The Stage-3 target for direct
	// `s.value = e`: the object API stores a function value verbatim, so the
	// lowered form must too (S.set would CALL it as an updater — measured
	// semantic drift, not a theoretical one).
	/** RAW write — stores a function verbatim (the `signal.value =` contract). */
	put<T>(i: number, v: T): void {
		const g = G!;
		if (v === g.val[i]) return;
		g.val[i] = v;
		g.y++;
		flush(g, i);
	},
	// Packed LAZY computed (glitch-free core round, 2026-07): one value slot
	// + a FORWARD effect that only propagates "something upstream changed" to
	// the row's subscribers — it never recomputes. Recompute happens on READ
	// (S.get above), validated against G.gv, pulling each source first. The
	// forward effect is auto-registered with the current owner (running
	// effect or root), so disposing the subtree freezes the computed.
	/** Packed lazy memo: one value slot + one forward (mark) effect. */
	computed(fn: () => unknown): number {
		const g = gi();
		const i = grow(g);
		const cx = g.x || (g.x = [[], [], []]);
		cx[0][i] = fn;
		cx[1][i] = -1; // never validated — first read computes
		cx[2][i] = effect(() => {
			flush(g, i);
		});
		return i;
	},
};

// Returns the effect ID (an integer — costs ZERO slots), not an object or
// a disposer closure. Dispose with dispose(id) (or register with track(),
// whose owner terminates closures and ids alike).
/**
 * Run `fn` now and re-run it whenever a signal it READ changes. Dependencies
 * are re-tracked every run (conditional deps work). Returns an integer effect
 * id — dispose with {@link dispose}, or {@link track} it to an owner. A bare
 * `effect()` is NOT auto-owned; the hooks ({@link useEffect}) track for you.
 */
export function effect(fn: EffectFn): number {
	const g = gi();
	let e!: number; // every branch below assigns it before use (definite-assign)
	const m0 = ~(g.u | g.q); // word 0 — the fast path (effects 0-31)
	if (m0) {
		const b = m0 & -m0;
		e = 31 - Math.clz32(b);
		g.u |= b;
	} else {
		// word 0 full: scan hi-words, else widen the stride by one word
		let wi = 1;
		for (; wi < g.st; wi++) {
			const mh = ~(g.uh![wi - 1] | g.qh![wi - 1]);
			if (mh) {
				const b = mh & -mh;
				e = (wi << 5) + 31 - Math.clz32(b);
				g.uh![wi - 1] |= b;
				break;
			}
		}
		if (wi === g.st) {
			// all words full — grow, take bit 0 of the new word
			growStride(g);
			g.uh![wi - 1] |= 1;
			e = wi << 5;
		}
	}
	g.eff[e] = fn;
	// Running-owner (B9): auto-register with the innermost context — the
	// running effect or the current root — BEFORE the first run, so a
	// throwing initial run is still torn down by its root. A top-level
	// effect (no context) stays manual, as before.
	track(e);
	run(e);
	return e;
}

// Terminal disposal for anything an owner can hold: a plain closure (root
// disposers, onCleanup callbacks) or a packed effect id.
/** Terminal disposal for a closure disposer or a packed effect id. */
export function dispose(d: number | EffectFn): void {
	if (typeof d === "function") {
		d();
		return;
	}
	const g = G;
	if (!g || !g.eff[d]) return;
	g.eff[d] = null; // run() becomes a no-op — no resurrection
	unsubscribe(d);
	const word = d >> 5,
		b = 1 << (d & 31);
	if (g.dep > 0) {
		// freed mid-cascade: quarantine until it completes
		if (word === 0) g.q |= b;
		else g.qh![word - 1] |= b;
	} else {
		if (word === 0) g.u &= ~b;
		else g.uh![word - 1] &= ~b;
	}
}

// LAZY computed (2026-07 core round) — a facade over the packed lazy memo:
// recompute happens on READ (validated against the global write version,
// pulling sources first), never on notify, which is what makes the diamond
// glitch-free (conformance law 12 = MATCH). The forward effect registers
// with the current owner via effect()'s auto-tracking, so disposing the
// subtree that created the computed freezes it.
/**
 * Memoized derived signal, LAZY and glitch-free: `fn` re-runs on read when a
 * dependency changed, and its value is cached across reads. Costs one internal
 * effect — prefer a plain thunk `() => a.value + b.value` unless the value is
 * read in many places.
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
	const i = S.computed(fn);
	return {
		get value(): T {
			return S.get(i);
		},
	};
}

// Batch writes: N sets inside fn produce ONE notification pass per touched
// signal, after fn returns — subscribers see final values only. On the 32KB
// arena this is the cheap way to update several signals from one button press
// without re-running shared effects N times. Nests; exception-safe (the
// deferred flushes still run). Values are written eagerly (reads inside the
// batch see the new value); only NOTIFICATION is deferred — Solid's contract.
/**
 * Coalesce writes: N `.value` sets inside `fn` produce ONE notification per
 * subscriber (union of touched signals), after `fn` returns. Reads inside the
 * batch see new values eagerly; only notification defers (Solid semantics).
 */
export function batch<T>(fn: () => T): T {
	const g = gi();
	g.bat++;
	try {
		return fn();
	} finally {
		--g.bat;
		// settle() owns the coalescing (every write goes through the same
		// union-of-masks turn since the glitch-free round); a batch just
		// holds the turn open until it exits. No-op while nested.
		if (g.pend !== null) settle(g);
	}
}

/** Read signals inside `fn` WITHOUT subscribing to them. */
export function untrack<T>(fn: () => T): T {
	const prev = current;
	current = -1;
	try {
		return fn();
	} finally {
		current = prev;
	}
}

// ---- ownership & disposal ----------------------------------------------
// Every effect created while building a subtree is registered on the
// current owner; disposing the owner disposes the subtree. Leaked effects
// are the #1 correctness risk in this design.

// An owner holds the disposables (effect ids or closures) created in its
// subtree. Since the running-owner round (B9), the owner context is either a
// root's Owner OBJECT or the NUMERIC id of the currently-running effect —
// the numeric form costs nothing per run; its disposables list (G.own[e])
// is only allocated when a run actually tracks something.
type Disposable = number | EffectFn;
interface Owner {
	d: Disposable[];
}
let owner: Owner | number | null = null;

/**
 * Run `fn` under a fresh owner; returns `[result, disposer]`. Calling the
 * disposer tears down every effect/cleanup {@link track}ed during `fn`.
 */
export function createRoot<T>(fn: () => T): [T, () => void] {
	const o: Owner = { d: [] };
	const prev = owner;
	owner = o;
	const disposer = () => {
		for (let i = o.d.length - 1; i >= 0; i--) dispose(o.d[i]);
		o.d.length = 0;
	};
	let result: T;
	try {
		result = fn();
	} catch (e) {
		// build threw: restore the owner, tear down whatever effects it already
		// created (else they leak — the disposer never reaches the caller), rethrow.
		owner = prev;
		disposer();
		throw e;
	}
	owner = prev;
	return [result, disposer];
}

/** Register a cleanup to run when the current owner is disposed. */
export function onCleanup(fn: EffectFn): void {
	track(fn);
}

// Register a disposable (effect id or closure) with the innermost owner
// context: a running effect (numeric — its list lives in G.own, disposed
// before every re-run and at disposal) or a createRoot owner object.
/** Register an effect id / disposer with the current owner; returns it. */
export function track(disposable: Disposable): Disposable {
	const o = owner;
	if (o !== null) {
		if (typeof o === "number") {
			const g = G!; // a numeric owner implies a running effect, so G exists
			const own = g.w || (g.w = []);
			(own[o] || (own[o] = [])).push(disposable);
		} else o.d.push(disposable);
	}
	return disposable;
}

// ---- hooks — React-flavored comfort layer --------------------------------
// Differences from React (see README): components run once; read state by
// CALLING the getter (count()); pass reactive props as thunks.

/**
 * React-style state, Solid semantics: returns `[getter, setter]` where the
 * getter is a CALL — `count()`, not `count`. The setter takes a value or a
 * functional update `setCount(c => c + 1)`. Lowered to the packed {@link S} API.
 */
export function useState<T>(init: T): [() => T, (v: T | ((prev: T) => T)) => void] {
	const s = new Signal(init);
	return [
		() => s.value as T,
		(v: T | ((prev: T) => T)) => {
			s.value = typeof v === "function" ? (v as (prev: T) => T)(s.value as T) : v;
		},
	];
}

// No dependency array — tracking is automatic. An optional returned
// function becomes the cleanup: it runs before every re-run of the effect
// and once more when the owning subtree is disposed (stored on the Effect
// itself — registering with the owner would only capture the FIRST run's
// cleanup, since re-runs happen outside any owner context).
/**
 * Auto-tracked effect (no dependency array). An optional returned function is
 * the cleanup: it runs before every re-run and once more at dispose.
 */
export function useEffect(fn: () => void | EffectFn): void {
	// effect() auto-registers with the innermost owner (running-owner round);
	// a returned cleanup is simply TRACKED on the running effect — the owned
	// list runs it before the next re-run and once more at disposal, which is
	// exactly the React contract the old dedicated cln array implemented.
	effect(() => {
		const out = fn();
		if (typeof out === "function") track(out);
	});
}

// PERF: like computed(), this allocates ONE internal effect to keep the
// derived value live. Cheap (effect ids are integers, and the cap is now
// unlimited — #21), but a screen with dozens of useMemo/computed pays one
// effect each; prefer a plain thunk `() => a() + b()` when you don't need the
// value cached across reads.
/** Memoized getter over {@link computed}: `const total = useMemo(() => a() + b())`. */
export function useMemo<T>(fn: () => T): () => T {
	const c = computed(fn);
	return () => c.value;
}

// Mutable box that never notifies — React's useRef. (useCallback is
// deliberately absent: components run ONCE here, so a plain closure is
// already stable; there is nothing to memoize against.)
export function useRef<T>(v: T): { current: T } {
	return { current: v };
}

// React's useReducer, trivially over useState. `dispatch(action)` applies the
// reducer as a functional update, so it composes with batching and lowering.
export function useReducer<S, A>(
	reducer: (s: S, a: A) => S,
	init: S,
): [() => S, (action: A) => void] {
	const [get, set] = useState(init);
	return [get, (action: A) => set((s: S) => reducer(s, action))];
}

// onMount(fn): run fn ONCE, untracked. In this run-once model a component body
// already executes a single time as it builds, so this is just "do it once,
// without subscribing" — the place to start a timer or kick a fetch. (There is
// no separate post-layout phase like the DOM's; fn runs during the build.)
export function onMount(fn: () => void): void {
	untrack(fn);
}

// Context — pass a value down the (synchronous, run-once) build without
// threading props. createContext(default) -> ctx; provide(ctx, value, build)
// sets ctx for the duration of build() (children read it via useContext);
// useContext(ctx) reads the current value. No Symbol/Map (XS rule): a context
// is a one-field record and provide() is a save/restore around the subtree,
// which is exactly right because children build synchronously inside build().
export function createContext<T>(defaultValue: T): { v: T } {
	return { v: defaultValue };
}
export function useContext<T>(ctx: { v: T }): T {
	return ctx.v;
}
export function provide<T, R>(ctx: { v: T }, value: T, build: () => R): R {
	const prev = ctx.v;
	ctx.v = value;
	try {
		return build();
	} finally {
		ctx.v = prev;
	}
}

// ---- async resource -------------------------------------------------------
// The RN/Solid "fetch → {loading,error,data}" primitive, sized for 32KB: TWO
// Signal objects total. `v` holds the data; `st` is a TAGGED slot — 0 while
// loading, 1 when ready, and otherwise the error value itself (no third
// signal, no per-transition state records). loading()/error() derive from st
// reactively, so a binding like `string={() => r.loading() ? "…" : r.data()}`
// re-renders exactly on transitions.

/** What {@link createResource} returns — reactive thunks over one in-flight fetch. */
export interface Resource<T> {
	/** Latest fetched value; `undefined` until the first success. Reactive. */
	data: () => T | undefined;
	/** True while a fetch is in flight. Reactive. */
	loading: () => boolean;
	/** Rejection value of the LAST fetch, or `undefined`. Reactive. */
	error: () => unknown;
	/** Start the fetcher again (stale responses from older calls are dropped). */
	refetch: () => void;
}

/**
 * Async data: run `fetcher` now, expose `{loading, error, data, refetch}` as
 * reactive thunks. Out-of-order completions are dropped (only the newest call
 * may settle the resource). On Pebble, `fetch()` proxies through the phone
 * (`@moddable/pebbleproxy`, README gotcha 18) and its Response allocations are
 * heavy for the 32KB arena — keep fetch-using apps lean and prefer decoding
 * into a byte {@link createStore} over retaining parsed objects.
 */
export function createResource<T>(fetcher: () => Promise<T>): Resource<T> {
	const v = new Signal<T | undefined>(undefined);
	// 0 = loading, 1 = ready, anything else = the rejection value. (A fetcher
	// that REJECTS with literal 0 or 1 would be misread — rejections are Error
	// values in practice; two slots instead of three signals is the 32KB trade.)
	const st = new Signal<unknown>(0);
	let gen = 0; // drops stale settlements from superseded refetches
	const start = () => {
		const id = ++gen;
		st.value = 0;
		fetcher().then(
			(value) => {
				if (id !== gen) return; // a newer refetch superseded this one
				v.value = value;
				st.value = 1;
			},
			(err) => {
				if (id !== gen) return;
				st.value = err;
			},
		);
	};
	start();
	return {
		data: () => v.value,
		loading: () => st.value === 0,
		error: () => {
			const s = st.value;
			return s === 0 || s === 1 ? undefined : s;
		},
		refetch: start,
	};
}

// ---- typed byte-record store ---------------------------------------------
// Collections kept as plain JS objects cost ~450B of slots per row and kill
// the arena at 4-5 rows (measured; README). A Store keeps records as BYTES
// in one Uint8Array — [tag][len][payload] — so a record costs its payload
// bytes, not slots. Primitives encode automatically (int32, float64, string
// of ≤255 Latin-1 bytes, boolean, null); custom types register a codec with
// def() and pass their tag to push(). Value semantics: data moves in and
// out BY COPY — this is a serialization store, not an object heap (no live
// references, functions, or Piu nodes).
// Platform rules honored: every binding below is a `const` (gotcha 13 —
// new function/class declarations in a preloaded module kill the machine),
// fields are constructor-initialized (gotcha 10), and the float scratch is
// allocated LAZILY at runtime — a buffer created at preload time would be
// frozen into ROM and unwritable.

const T_I32 = 0,
	T_F64 = 1,
	T_STR = 2,
	T_TRUE = 3,
	T_FALSE = 4,
	T_NULL = 5;

// Custom codec: encode writes the payload (returns its byte length, or -1 if it
// needs more than `max`); decode reads it back.
export type Encode = (value: unknown, bytes: Uint8Array, offset: number, max: number) => number;
export type Decode = (bytes: Uint8Array, offset: number, length: number) => unknown;

/**
 * The public surface of a byte-record store — what {@link createStore} returns.
 * Values move in and out BY COPY (serialization store, not an object heap), so
 * `get` is honestly `unknown`: the record's runtime tag decides the type.
 */
export interface ByteStore {
	/** Number of records currently stored. */
	count(): number;
	/** Register a custom codec under tag 8..255 (see {@link Encode}/{@link Decode}). */
	def(tag: number, encode: Encode, decode: Decode): void;
	/** Append a value (pass `tag` for custom types). New count, or -1 if it doesn't fit. */
	push(v: unknown, tag?: number): number;
	/** Decode record `i` by copy; `undefined` when out of range. */
	get(i: number): unknown;
	/** Remove record `i` (tail shifts down). New count, or -1 when out of range. */
	remove(i: number): number;
	/** Persist the raw record bytes under `k` in the host's localStorage. */
	save(k: string): void;
	/** Restore records saved under `k`; false on missing/oversize/corrupt data. */
	load(k: string): boolean;
}

const Store = class {
	b: Uint8Array;
	t: number;
	n: number;
	c: Record<number, [Encode, Decode]> | null;
	f: Float64Array | null;
	fb: Uint8Array | null;
	constructor(size: number) {
		this.b = new Uint8Array(size);
		this.t = 0; // bytes used (records are always compact)
		this.n = 0; // record count
		this.c = null; // custom codecs: tag -> [encode, decode]
		this.f = null; // lazy float64 scratch
		this.fb = null; // byte view over this.f
	}
	count(): number {
		return this.n;
	}
	// Register a custom codec under tag 8..255. encode(value, bytes, offset,
	// max) writes the payload and returns its length, or -1 if it needs more
	// than max; decode(bytes, offset, length) returns the value.
	def(tag: number, encode: Encode, decode: Decode): void {
		if (this.c === null) this.c = {};
		this.c[tag] = [encode, decode];
	}
	// Append a value; pass `tag` only for custom types. Returns the new
	// count, or -1 when the value does not fit (store full or payload >255B).
	push(v: unknown, tag?: number): number {
		const b = this.b,
			off = this.t + 2;
		const max = b.length - off; // may be negative when nearly full
		let len!: number;
		if (tag !== undefined) {
			const codec = this.c && this.c[tag];
			if (!codec)
				// def(tag,...) never registered — fail with a clear signal
				throw new Error("store: no codec for tag " + tag);
			len = codec[0](v, b, off, max < 0 ? 0 : max);
		} else if (typeof v === "number") {
			if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff) {
				tag = T_I32;
				len = 4;
				if (len <= max) {
					b[off] = v & 255;
					b[off + 1] = (v >> 8) & 255;
					b[off + 2] = (v >> 16) & 255;
					b[off + 3] = (v >> 24) & 255;
				}
			} else {
				tag = T_F64;
				len = 8;
				if (len <= max) {
					this.fl();
					this.f![0] = v;
					for (let i = 0; i < 8; i++) b[off + i] = this.fb![i];
				}
			}
		} else if (typeof v === "string") {
			tag = T_STR;
			len = v.length;
			if (len <= max && len <= 255)
				for (let i = 0; i < len; i++) b[off + i] = v.charCodeAt(i) & 255;
		} else if (v === true) {
			tag = T_TRUE;
			len = 0;
		} else if (v === false) {
			tag = T_FALSE;
			len = 0;
		} else if (v === null || v === undefined) {
			tag = T_NULL;
			len = 0;
		} else return -1; // objects need a registered codec + explicit tag
		if (len < 0 || len > 255 || len > max) return -1;
		b[this.t] = tag;
		b[this.t + 1] = len;
		this.t += 2 + len;
		return ++this.n;
	}
	get(i: number): unknown {
		const p = this.o(i);
		if (p < 0) return undefined;
		const b = this.b,
			tag = b[p],
			len = b[p + 1],
			off = p + 2;
		switch (tag) {
			case T_I32:
				return b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24) | 0;
			case T_F64:
				this.fl();
				for (let j = 0; j < 8; j++) this.fb![j] = b[off + j];
				return this.f![0];
			case T_STR:
				// apply over a subarray view: 1 allocation instead of one
				// intermediate string per character
				return len
					? String.fromCharCode.apply(String, b.subarray(off, off + len) as unknown as number[])
					: "";
			case T_TRUE:
				return true;
			case T_FALSE:
				return false;
			case T_NULL:
				return null;
			default: {
				// custom-codec tag: fail with a clear message if none is registered
				// (e.g. corrupt bytes loaded from localStorage), not a raw TypeError.
				const codec = this.c && this.c[tag];
				if (!codec) throw new Error("store: no codec for tag " + tag);
				return codec[1](b, off, len);
			}
		}
	}
	// Remove record i (shifts the tail down); returns the new count or -1.
	remove(i: number): number {
		const p = this.o(i);
		if (p < 0) return -1;
		const b = this.b,
			rec = 2 + b[p + 1],
			end = this.t - rec;
		for (let j = p; j < end; j++) b[j] = b[j + rec];
		this.t = end;
		return --this.n;
	}
	// byte offset of record i, or -1
	o(i: number): number {
		if (i < 0 || i >= this.n) return -1;
		let p = 0;
		while (i--) p += 2 + this.b[p + 1];
		return p;
	}
	// Persist the raw record bytes under a key in the host's localStorage
	// (device key-value store). One byte becomes one Latin-1 char; load()
	// walks the records to rebuild the count and rejects corrupt data.
	save(k: string): void {
		const b = this.b,
			t = this.t;
		// Keep the exact original `globalThis.localStorage` access (byte-identical
		// emit). globalThis's type lacks localStorage; the cast (via the vendored
		// bare-global's type) is erased — no behavior change.
		(globalThis as typeof globalThis & { localStorage: typeof localStorage }).localStorage.setItem(
			k,
			t ? String.fromCharCode.apply(String, b.subarray(0, t) as unknown as number[]) : "",
		);
	}
	load(k: string): boolean {
		const s = (
			globalThis as typeof globalThis & { localStorage: typeof localStorage }
		).localStorage.getItem(k);
		if (s === null || s.length > this.b.length) return false;
		const b = this.b;
		for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
		let n = 0,
			p = 0;
		while (p < s.length) {
			p += 2 + b[p + 1];
			n++;
		}
		if (p !== s.length)
			// truncated/corrupt record stream
			return false;
		this.t = s.length;
		this.n = n;
		return true;
	}
	// lazy float scratch
	fl(): void {
		if (this.f === null) {
			this.f = new Float64Array(1);
			this.fb = new Uint8Array(this.f.buffer);
		}
	}
};

/** Byte-record store: records live as BYTES in one Uint8Array, not as slots. */
export const createStore = (size: number): ByteStore => new Store(size);

// ---- ROM table — typed accessor over a packed flash-resource blob ----------
// The v2 data path, DEVICE-PROVEN (playbook "v2: data-to-Resource"): big
// static string tables ship as ONE binary blob in the 256KB resource area
// and cost ZERO boot RAM; each get() builds one transient string. Blob
// format (written by tools/pack-table.mts): [u16le count][u16le cumulative
// END offset per entry][latin-1 payload]. Access pattern is the measured
// safe one — ranged resource.slice() + String.fromArrayBuffer (whole-blob
// Uint8Array wraps and fromCharCode.apply both fxAbort on this port).
// `Resource` is the Pebble-host-injected global; looked up lazily so this
// module still loads in Node/V8 test sandboxes that lack it.

/** What {@link romTable} returns — a read-only view over a packed table. */
export interface RomTable {
	/** Number of entries in the table. */
	count: number;
	/** Decode entry `i` (wraps modulo {@link count}); "" on an empty table. */
	get(i: number): string;
}

/**
 * Open a packed string table from the flash resource area (zero boot RAM;
 * one transient string per read). Pack with `tools/pack-table.mts`; the
 * build's manifest derivation ships any `romTable("<name>")` literal's blob
 * automatically.
 */
export function romTable(name: string): RomTable {
	const r = new (globalThis as unknown as { Resource: new (n: string) => unknown }).Resource(
		name,
	) as { slice(b: number, e: number): ArrayBuffer };
	const S2 = String as unknown as { fromArrayBuffer(b: ArrayBuffer): string };
	const u16 = (o: number): number => {
		const b = new Uint8Array(r.slice(o, o + 2));
		return b[0] | (b[1] << 8);
	};
	const count = u16(0);
	const base = 2 + 2 * count;
	return {
		count,
		get(i: number): string {
			if (!count) return "";
			const k = i % count;
			const s = k ? u16(2 * k) : 0;
			return S2.fromArrayBuffer(r.slice(base + s, base + u16(2 * k + 2)));
		},
	};
}
