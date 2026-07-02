// Reactive core — Solid-style signals, ownership, and the React-flavored
// hooks layer in ONE module. Logically these are three units (signals,
// owner, hooks); they share a file because every XS module costs RAM and
// the firmware-fixed 32KB arena is tight enough that two extra module
// records were the difference between the combined demo booting or dying
// with "fxAbort memory full" (measured on SDK 4.17 / gabbro).
// XS-safe: closures, Set, accessors only. No Proxy/Reflect/WeakMap.

let current = null;

class Signal {
	constructor(value) {
		this.v = value;
		this.subs = new Set();
	}
	get value() {
		if (current) {
			this.subs.add(current);
			current.deps.push(this.subs);
		}
		return this.v;
	}
	set value(value) {
		if (value === this.v)
			return;
		this.v = value;
		// Snapshot: subscribers may mutate subs while we notify. run() is a
		// no-op for effects disposed mid-notification (fn === null) —
		// without that guard a disposed effect would resurrect itself by
		// re-subscribing during its final run.
		for (const e of [...this.subs]) {
			// diagnostic hook: surface subscriber exceptions instead of
			// letting them abort the machine (XS kills the app otherwise)
			try {
				e.run();
			} catch (err) {
				if (globalThis.__spError)
					globalThis.__spError(err);
				else
					throw err;
			}
		}
	}
}

class Effect {
	// Fields stay minimal — every slot is arena RAM and effects are the
	// most numerous runtime object. `fn === null` doubles as the disposed
	// flag; the optional useEffect cleanup is only materialized on the
	// instances that actually use it (current.cleanup = ...).
	constructor(fn) {
		this.fn = fn;
		this.deps = [];
		this.cleanup = null;	// optional user cleanup (useEffect)
	}
	run() {
		if (!this.fn)		// disposed mid-notification — do not resurrect
			return;
		unsubscribe(this);
		const prev = current;
		current = this;
		try {
			this.fn();
		} finally {
			current = prev;
		}
	}
}

// Runs the user cleanup (if any) and drops all subscriptions. Called both
// before every re-run and on disposal, giving useEffect the React contract:
// cleanup fires before the next run and once more at dispose.
function unsubscribe(e) {
	if (e.cleanup) {
		const c = e.cleanup;
		e.cleanup = null;
		c();
	}
	for (const s of e.deps)
		s.delete(e);
	e.deps.length = 0;
}

export function signal(value) {
	return new Signal(value);
}

// Returns the Effect itself, NOT a disposer closure: a closure per effect
// costs 3-4 arena slots and effects are the most numerous runtime object.
// Dispose with dispose(e) (or register with track(), whose owner knows how
// to terminate both closures and Effect instances).
export function effect(fn) {
	const e = new Effect(fn);
	e.run();
	return e;
}

// Terminal disposal for anything an owner can hold: a plain closure (root
// disposers, onCleanup callbacks) or an Effect instance.
export function dispose(d) {
	if (typeof d === "function") {
		d();
		return;
	}
	d.fn = null;		// run() becomes a no-op — no resurrection
	unsubscribe(d);
}

// Eager computed. The internal effect is registered with the current owner
// so disposing the subtree that created the computed also stops it —
// otherwise it would keep firing (and leaking) after its UI is gone.
export function computed(fn) {
	const s = new Signal(undefined);
	track(effect(() => { s.value = fn(); }));
	return {
		get value() { return s.value; },
	};
}

// Read a value without creating a dependency.
export function untrack(fn) {
	const prev = current;
	current = null;
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

let owner = null;

export function createRoot(fn) {
	const o = { d: [] };
	const prev = owner;
	owner = o;
	try {
		return [fn(), () => {
			for (let i = o.d.length - 1; i >= 0; i--)
				dispose(o.d[i]);
			o.d.length = 0;
		}];
	} finally {
		owner = prev;
	}
}

export function onCleanup(fn) {
	if (owner)
		owner.d.push(fn);
}

// Register a disposable (Effect instance or closure) with the current
// owner so tearing down the subtree tears it down too.
export function track(disposable) {
	if (owner)
		owner.d.push(disposable);
	return disposable;
}

// ---- hooks — React-flavored comfort layer --------------------------------
// Differences from React (see README): components run once; read state by
// CALLING the getter (count()); pass reactive props as thunks.

export function useState(init) {
	const s = new Signal(init);
	return [
		() => s.value,
		v => { s.value = (typeof v === "function") ? v(s.value) : v; },
	];
}

// No dependency array — tracking is automatic. An optional returned
// function becomes the cleanup: it runs before every re-run of the effect
// and once more when the owning subtree is disposed (stored on the Effect
// itself — registering with the owner would only capture the FIRST run's
// cleanup, since re-runs happen outside any owner context).
export function useEffect(fn) {
	track(effect(() => {
		const out = fn();
		if (typeof out === "function")
			current.cleanup = out;
	}));
}

export function useMemo(fn) {
	const c = computed(fn);
	return () => c.value;
}

export const useRef = current_ => ({ current: current_ });
