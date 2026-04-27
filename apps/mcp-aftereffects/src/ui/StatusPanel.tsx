import React from 'react';

export type StatusState =
  | { phase: 'starting' }
  | { phase: 'running'; port: number; connected: boolean; aeVersion?: string }
  | { phase: 'error'; message: string };

const styles: Record<string, React.CSSProperties> = {
  shell: {
    height: '100%',
    boxSizing: 'border-box',
    padding: 16,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    color: '#d6d6d6',
    background: '#1f1f1f',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: { fontSize: 14, fontWeight: 600, color: '#fff' },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  dotIdle: { background: '#888' },
  dotConnected: { background: '#3ecf8e' },
  dotError: { background: '#e54b4b' },
  label: { color: '#bbb' },
  value: { color: '#fff', fontFamily: 'ui-monospace, monospace' },
  hint: {
    marginTop: 'auto',
    fontSize: 11,
    color: '#888',
    lineHeight: 1.5,
  },
  err: {
    color: '#ffb4b4',
    background: '#3a1f1f',
    padding: 8,
    borderRadius: 4,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '50%',
    overflow: 'auto',
  },
};

export function StatusPanel({ state }: { state: StatusState }) {
  if (state.phase === 'starting') {
    return (
      <div style={styles.shell}>
        <div style={styles.header}>PipeFX MCP</div>
        <div style={styles.row}>
          <div style={{ ...styles.dot, ...styles.dotIdle }} />
          <span>Starting MCP server…</span>
        </div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div style={styles.shell}>
        <div style={styles.header}>PipeFX MCP</div>
        <div style={styles.row}>
          <div style={{ ...styles.dot, ...styles.dotError }} />
          <span>Server failed to start</span>
        </div>
        <div style={styles.err}>{state.message}</div>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <div style={styles.header}>PipeFX MCP</div>
      <div style={styles.row}>
        <div
          style={{
            ...styles.dot,
            ...(state.connected ? styles.dotConnected : styles.dotIdle),
          }}
        />
        <span>{state.connected ? 'Backend connected' : 'Waiting for backend'}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Listening on</span>
        <span style={styles.value}>127.0.0.1:{state.port}</span>
      </div>
      {state.aeVersion && (
        <div style={styles.row}>
          <span style={styles.label}>After Effects</span>
          <span style={styles.value}>{state.aeVersion}</span>
        </div>
      )}
      <div style={styles.hint}>
        Keep this panel open while you use PipeFX. Closing it disconnects the
        After Effects integration.
      </div>
    </div>
  );
}
