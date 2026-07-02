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
	constructor(fn) {
		this.fn = fn;
		this.deps = [];
	}
	run() {
		cleanup(this);
		const prev = current;
		current = this;
		try {
			this.fn();
		} finally {
			current = prev;
		}
	}
}

function cleanup(e) {
	for (const s of e.deps)
		s.delete(e);
	e.deps.length = 0;
}

export function signal(value) {
	return new Signal(value);
}

export function effect(fn) {
	const e = new Effect(fn);
	e.run();
	return () => cleanup(e);	// disposer
}

export function computed(fn) {
	const s = new Signal(undefined);
	effect(() => { s.value = fn(); });
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
				o.d[i]();
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

export function track(disposer) {
	if (owner)
		owner.d.push(disposer);
	return disposer;
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
// function becomes the cleanup, run when the owning subtree is disposed.
export function useEffect(fn) {
	track(effect(() => {
		const out = fn();
		if (typeof out === "function")
			onCleanup(out);
	}));
}

export function useMemo(fn) {
	const c = computed(fn);
	return () => c.value;
}

export const useRef = current_ => ({ current: current_ });
