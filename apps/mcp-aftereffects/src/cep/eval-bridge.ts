// Promise-wrapped evalScript bridge. CEP's CSInterface.evalScript() takes a
// string of ExtendScript code and a callback that receives the result as a
// string (or "EvalScript error." on failure). We wrap that in a Promise +
// JSON serialization so each MCP tool can do `await evalBridge(name, args)`.
//
// Wire format: every tool dispatched here calls into a single
// `__pipefxDispatch(toolName, argsJson)` ExtendScript function defined in
// host.jsx. The host returns a JSON string with shape:
//   { "ok": true,  "result": <unknown> }
//   { "ok": false, "error": { "name": "...", "message": "..." } }

let csInterface: CSInterface | null = null;

function getCS(): CSInterface {
  if (csInterface) return csInterface;
  if (typeof CSInterface === 'undefined') {
    throw new Error(
      'CSInterface not loaded — this build only runs inside a CEP host (AE).'
    );
  }
  csInterface = new CSInterface();
  return csInterface;
}

/**
 * Explicitly load host.jsx via $.evalFile. CEP's ScriptPath auto-load is
 * unreliable in AE specifically — many panels see the file declared in
 * manifest but it never executes. Calling evalFile from JS at boot is the
 * portable fix every CEP boilerplate uses (bolt-cep, etc.).
 */
export async function loadHostScript(): Promise<void> {
  const cs = getCS();
  // CSInterface gives us the absolute path to the extension folder; host.jsx
  // sits at the root next to index.html.
  const env = cs.getHostEnvironment();
  if (!env) throw new Error('Could not get CEP host environment');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extPath = (cs as any).getSystemPath
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cs as any).getSystemPath('extension')
    : null;
  if (typeof extPath !== 'string' || !extPath) {
    throw new Error(
      'Could not resolve extension path via CSInterface.getSystemPath("extension")'
    );
  }
  // Backslashes in the path need escaping for the ExtendScript string literal.
  const hostJsxPath = `${extPath}/host.jsx`.replace(/\\/g, '/');
  const probe = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('evalFile timeout')), 10_000);
    cs.evalScript(`$.evalFile("${hostJsxPath}")`, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
  if (probe === 'EvalScript error.') {
    throw new Error(
      `Failed to evaluate host.jsx at ${hostJsxPath}. Check the file exists and parses cleanly.`
    );
  }
  // Confirm the dispatcher actually got defined.
  const check = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('typeof check timeout')), 5000);
    cs.evalScript('typeof __pipefxDispatch', (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
  if (check !== 'function') {
    throw new Error(
      `host.jsx loaded but __pipefxDispatch is "${check}". Check host.jsx for syntax errors that aborted parsing.`
    );
  }
}

interface EvalSuccess {
  ok: true;
  result: unknown;
}
interface EvalError {
  ok: false;
  error: { name: string; message: string };
}
type EvalEnvelope = EvalSuccess | EvalError;

const PENDING_TIMEOUT_MS = 30_000;

export async function evalBridge<T = unknown>(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const cs = getCS();
  // Embed args as a JSON literal so we don't need to worry about escaping
  // identifiers / paths inside the ExtendScript source. The host parses
  // the literal back via JSON.parse (polyfilled in host.jsx).
  const argsLiteral = JSON.stringify(JSON.stringify(args));
  const script = `__pipefxDispatch(${JSON.stringify(toolName)}, ${argsLiteral})`;

  const raw = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `evalScript timeout after ${PENDING_TIMEOUT_MS}ms for tool "${toolName}"`
        )
      );
    }, PENDING_TIMEOUT_MS);
    cs.evalScript(script, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });

  if (raw === 'EvalScript error.') {
    throw new Error(
      `ExtendScript threw before reaching the dispatcher for "${toolName}". This usually means host.jsx did not load.`
    );
  }

  let parsed: EvalEnvelope;
  try {
    parsed = JSON.parse(raw) as EvalEnvelope;
  } catch {
    throw new Error(
      `ExtendScript returned non-JSON for "${toolName}": ${raw.slice(0, 500)}`
    );
  }

  if (!parsed.ok) {
    const err = new Error(parsed.error.message);
    err.name = parsed.error.name || 'AeError';
    throw err;
  }
  return parsed.result as T;
}

/**
 * Probe variant used by `bridge-health`. Avoids the dispatcher and just
 * pings AE for its version, so a missing host.jsx is still survivable
 * (the panel reports "host script failed to load" instead of erroring).
 */
export async function probeAeVersion(): Promise<{
  aeVersion: string;
  projectPath: string | null;
}> {
  const cs = getCS();
  const raw = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('probe timeout')), 5000);
    cs.evalScript(
      `JSON.stringify({ aeVersion: app.version, projectPath: app.project && app.project.file ? app.project.file.fsName : null })`,
      (result) => {
        clearTimeout(timer);
        resolve(result);
      }
    );
  });
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`AE probe returned non-JSON: ${raw}`);
  }
}
