// files suite — runtime/files (opt-in wrapper over `device.files`, the
// app-private PFS filesystem). Proves the four helpers against a stub that
// models the PEBBLE host's real semantics, not a friendly in-memory map:
// status() answers absence with mode 0 instead of throwing, openFile allocates
// a FIXED size and refuses a 0-byte new file, write() may only CLEAR bits (the
// NOR verify — the reason writeFile deletes and re-creates), delete() answers
// an absent path with `false`, and scan() returns a bare ITERATOR.
//
// The WHY behind each check (Rule 9): every one of these is a device failure
// mode that a naive wrapper hits — an in-place second write throws "NOR write
// would fail", a file sized from `text.length` truncates non-ASCII, a leaked fd
// holds the file BUSY for the rest of the boot, and `scan(undefined)` scans the
// literal path "undefined". The suite also pins the module's ASYMMETRIC error
// contract: reads/deletes/lists are total, the WRITE is the one that throws.
//
// `device` is a host compartment global reached through globalThis, so it is
// stubbed on the sandbox BEFORE the module loads (the watchinfo idiom); the
// module constructs no host module, so no importNow stub is needed. XS's
// `ArrayBuffer.fromString` / `String.fromArrayBuffer` do not exist in V8 —
// polyfilled here as a real UTF-8 codec (the signals suite's romTable idiom),
// so the byteLength-vs-length distinction stays under test.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { check, done } = makeChecker("files");

// V8 lacks Moddable's XS buffer<->string extensions — polyfill for the test
// only, and make them a genuine UTF-8 codec so a multi-byte character really
// does produce more BYTES than characters (what writeFile's sizing depends on).
const ABX = ArrayBuffer as unknown as { fromString?: (s: string) => ArrayBuffer };
if (!ABX.fromString)
	ABX.fromString = (s: string) => {
		const b = Buffer.from(s, "utf8");
		return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
	};
const SX = String as unknown as { fromArrayBuffer?: (b: ArrayBuffer) => string };
if (!SX.fromArrayBuffer) SX.fromArrayBuffer = (b: ArrayBuffer) => Buffer.from(b).toString("utf8");

// ---- a PFS-faithful `device.files` stub -----------------------------------
// Files are fixed-size Uint8Arrays that start ERASED (0xFF), exactly like a
// freshly allocated NOR sector — so the bit-clearing verify below is a real
// constraint and not decoration.
interface Rec {
	bytes: Uint8Array;
}
function makeFiles() {
	const store = new Map<string, Rec>();
	let opens = 0; // fds handed out
	let closes = 0; // fds released — must match, or a real fd leaks
	const dir = {
		store,
		// when set, the next read fails the way pfs_read does on a bad sector
		// (throwIf -> "operation failed <errno>") — used to prove the fd is still
		// closed on the failure path
		readError: "",
		get leaked() {
			return opens - closes;
		},
		status(path: string) {
			// xs_directorypfs_status: mode 0 for an absent path, and it does NOT
			// throw — this is what readFile's absence gate relies on.
			const rec = store.get(path);
			return { size: rec ? rec.bytes.length : 0, isFile: () => rec !== undefined };
		},
		delete(path: string) {
			// E_DOES_NOT_EXIST maps to `false`, not an error.
			return store.delete(path);
		},
		openFile(options: { path: string; mode?: string; size?: number }) {
			const existing = store.get(options.path);
			if (!existing) {
				// pfs_open throws for a NEW file with no (or zero) size — a fixed-size
				// filesystem cannot allocate "grow later".
				if (!options.size) throw new Error("operation failed -1");
				store.set(options.path, { bytes: new Uint8Array(options.size).fill(0xff) });
			}
			const rec = store.get(options.path) as Rec;
			const writable = options.mode === "w+" || options.mode === "r+";
			opens++;
			let open = true;
			return {
				status: () => ({ size: rec.bytes.length, isFile: () => true }),
				read(count: number, position: number) {
					if (!open) throw new Error("closed");
					if (dir.readError) throw new Error(dir.readError);
					// read() seeks to `position` and truncates to what is there.
					return rec.bytes.slice(position, position + count).buffer as ArrayBuffer;
				},
				write(buffer: ArrayBuffer, position: number) {
					if (!open) throw new Error("closed");
					if (!writable) throw new Error("operation failed -2");
					const src = new Uint8Array(buffer);
					for (let i = 0; i < src.length; i++) {
						const b = src[i];
						// the NOR verify from files-pebble.c: a write may only clear bits
						if (b !== (b & rec.bytes[position + i])) throw new Error("NOR write would fail");
					}
					rec.bytes.set(src, position);
				},
				close() {
					open = false;
					closes++;
				},
			};
		},
		// the host returns a bare ITERATOR (files-pebble.js calls
		// [Symbol.iterator]() on the native array), never an array
		scan(path?: string) {
			const prefix = path === undefined ? "" : `${path}/`;
			const names: string[] = [];
			for (const key of store.keys()) {
				if (!key.startsWith(prefix)) continue;
				const name = key.slice(prefix.length).split("/")[0];
				if (!names.includes(name)) names.push(name); // deduped, top level only
			}
			return names[Symbol.iterator]();
		},
	};
	return dir;
}

// ---- the device-present sandbox -------------------------------------------
{
	const { sandbox, loadModule } = await loadRuntime();
	const files = makeFiles();
	(sandbox as { device?: unknown }).device = { files };
	// the module builds ArrayBuffers; the vm context's own intrinsic would not
	// carry the outer-realm polyfill, so hand it the patched one
	(sandbox as { ArrayBuffer?: unknown }).ArrayBuffer = ArrayBuffer;
	const fs = (await loadModule("runtime/files")) as {
		readFile(path: string): string | undefined;
		writeFile(path: string, text: string): void;
		deleteFile(path: string): boolean;
		listFiles(path?: string): string[];
	};

	// --- write -> read round trip, and the fd is always released ---
	{
		fs.writeFile("a.txt", "hello");
		check("a written file reads back byte-identical", fs.readFile("a.txt") === "hello");
		check(
			"the file is allocated at EXACTLY the written length",
			files.store.get("a.txt")?.bytes.length === 5,
		);
		// WHY: a leaked PFS fd keeps the file BUSY for the whole boot — the next
		// open fails with E_BUSY and the app looks randomly broken.
		check("no fd is leaked by write+read", files.leaked === 0);
	}

	// --- the NOR trap: a SECOND write of different content must still work ---
	{
		// WHY this is the headline test: NOR flash lets a write only CLEAR bits,
		// so writing "zz" over "hello" in place throws "NOR write would fail" on
		// device. writeFile deletes and re-creates, which is the only way through.
		fs.writeFile("a.txt", "world!");
		check(
			"a second write of changed content succeeds (delete+recreate)",
			fs.readFile("a.txt") === "world!",
		);
		check("the file is RE-sized to the new length", files.store.get("a.txt")?.bytes.length === 6);
		check("no fd is leaked by the rewrite", files.leaked === 0);
	}

	// --- UTF-8: the file is sized from BYTES, not characters ---
	{
		// WHY: XS strings are UTF-8 and ArrayBuffer.fromString copies those bytes.
		// Sizing from text.length would allocate 2 bytes for "°C" and truncate it.
		fs.writeFile("u.txt", "°C");
		check(
			"a multi-byte string allocates its BYTE length, not its char length",
			files.store.get("u.txt")?.bytes.length === 3,
		);
		check("a multi-byte string round-trips intact", fs.readFile("u.txt") === "°C");
	}

	// --- reads are TOTAL: absence is `undefined`, never a throw ---
	{
		check(
			"an absent file reads as undefined, not an exception",
			fs.readFile("nope.txt") === undefined,
		);
		check("the absence probe opens no fd", files.leaked === 0);
	}

	// --- a read that THROWS still closes the fd (the finally) ---
	{
		files.store.set("bad.txt", { bytes: new Uint8Array(4) });
		files.readError = "operation failed -7"; // pfs_read on a bad sector
		let threw = "";
		try {
			fs.readFile("bad.txt");
		} catch (e) {
			threw = (e as Error).message;
		}
		files.readError = "";
		// WHY: swallowing this would hide the only diagnostic there is (module
		// header — the host's message IS the receipt); leaking the fd would wedge
		// every later open of the same path with E_BUSY. The fd IS opened here
		// (the file exists), so `leaked === 0` can only hold via the finally.
		check("a real PFS read failure propagates", threw === "operation failed -7");
		check("the fd is closed even when the read throws", files.leaked === 0);
		files.store.delete("bad.txt");
	}

	// --- delete: true when removed, false when it was never there ---
	{
		check("deleting an existing file reports true", fs.deleteFile("u.txt") === true);
		check("the deleted file is gone", fs.readFile("u.txt") === undefined);
		check("deleting an absent file reports false, not a throw", fs.deleteFile("u.txt") === false);
	}

	// --- list: a real array, deduped top-level names, optional sub-path ---
	{
		fs.writeFile("b.txt", "b");
		fs.writeFile("sub/one", "1");
		fs.writeFile("sub/two", "2");
		const names = fs.listFiles();
		// WHY an array and not the host iterator: an iterator has no `length` and
		// cannot be indexed, so a screen could not show a count.
		check("listFiles returns a real array", Array.isArray(names));
		check(
			"the root listing dedupes a nested path to one entry",
			names.join(",") === "a.txt,b.txt,sub",
		);
		check(
			"a sub-path scan lists that directory's entries",
			fs.listFiles("sub").join(",") === "one,two",
		);
		// WHY the arity branch: the host scan() checks argc, so scan(undefined)
		// would scan the literal path "undefined" instead of the app root.
		check(
			'omitting the path scans the ROOT, not the path "undefined"',
			fs.listFiles().length === 3,
		);
	}

	// --- an empty write is refused by the fixed-size filesystem (documented) ---
	{
		let threw = "";
		try {
			fs.writeFile("empty.txt", "");
		} catch (e) {
			threw = (e as Error).message;
		}
		// WHY it is left to throw rather than special-cased: pfs cannot allocate a
		// 0-byte file, and quietly inventing one (a space, a sentinel) would make
		// readFile lie about what was stored.
		check(
			"writing an empty string throws (pfs refuses a 0-byte new file)",
			threw === "operation failed -1",
		);
	}
}

// ---- no `device.files`: reads/deletes/lists degrade, the WRITE throws ------
{
	const { loadModule } = await loadRuntime(); // fresh sandbox: no `device` at all
	const fs = (await loadModule("runtime/files")) as {
		readFile(path: string): string | undefined;
		writeFile(path: string, text: string): void;
		deleteFile(path: string): boolean;
		listFiles(path?: string): string[];
	};
	check("readFile degrades to undefined without device.files", fs.readFile("a.txt") === undefined);
	check("deleteFile degrades to false without device.files", fs.deleteFile("a.txt") === false);
	check("listFiles degrades to an empty array without device.files", fs.listFiles().length === 0);
	let threw = "";
	try {
		fs.writeFile("a.txt", "x");
	} catch (e) {
		threw = (e as Error).message;
	}
	// WHY the asymmetry (module header): a read that finds nothing is a normal
	// answer, but a WRITE that silently does nothing is data loss — the app must
	// be told, or it will believe it saved.
	check(
		"writeFile THROWS without device.files (silent data loss is worse)",
		threw === "no device.files",
	);
}

// ---- a `device` with no `files` at all (the optional-chain's other leg) ----
{
	const { sandbox, loadModule } = await loadRuntime();
	(sandbox as { device?: unknown }).device = { info: {} }; // device present, files absent
	const fs = (await loadModule("runtime/files")) as { readFile(p: string): string | undefined };
	check(
		"a device without a files provider still degrades cleanly",
		fs.readFile("a.txt") === undefined,
	);
}

done();
