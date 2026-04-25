// ── @pipefx/skills/ui — CapabilityPicker ─────────────────────────────────
// Editor for the `requires.capabilities` array of a skill manifest. Shows
// the currently-declared capability rows alongside a list of live tools
// the host app pipes in (typically from `@pipefx/connectors`'s registry
// snapshot). Clicking a live tool appends it as a new row; the user can
// then refine the description or trim connectorId/toolName independently.
//
// We accept `availableTools` as a prop rather than reaching into the
// connectors package directly — `@pipefx/skills` is application-agnostic
// and the connectors registry is a feature package. The host wires the
// two together.

import { useMemo, type CSSProperties } from 'react';
import type { ToolDescriptor } from '@pipefx/connectors-contracts';
import type { DraftCapability, DraftValidation } from './draft.js';

export interface CapabilityPickerProps {
  capabilities: ReadonlyArray<DraftCapability>;
  /** Live tool surface from the connector registry. Typically derived from
   *  the `mcp.tools.changed` event so the picker reflects whatever Resolve
   *  / Premiere is currently connected. Pass an empty array when no host
   *  is connected — the manual-edit path still works. */
  availableTools?: ReadonlyArray<ToolDescriptor>;
  validation: DraftValidation;
  onAdd: (preset?: { connectorId?: string; toolName?: string }) => void;
  onUpdate: (rowId: string, patch: Partial<DraftCapability>) => void;
  onRemove: (rowId: string) => void;
  className?: string;
  style?: CSSProperties;
}

interface ToolGroup {
  connectorId: string;
  tools: ToolDescriptor[];
}

function groupToolsByConnector(
  tools: ReadonlyArray<ToolDescriptor>
): ToolGroup[] {
  const map = new Map<string, ToolDescriptor[]>();
  for (const tool of tools) {
    const existing = map.get(tool.connectorId);
    if (existing) existing.push(tool);
    else map.set(tool.connectorId, [tool]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([connectorId, toolList]) => ({
      connectorId,
      tools: [...toolList].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function isAlreadySelected(
  caps: ReadonlyArray<DraftCapability>,
  tool: ToolDescriptor
): boolean {
  return caps.some(
    (c) => c.connectorId === tool.connectorId && c.toolName === tool.name
  );
}

export function CapabilityPicker(props: CapabilityPickerProps) {
  const {
    capabilities,
    availableTools = [],
    validation,
    onAdd,
    onUpdate,
    onRemove,
    className,
    style,
  } = props;

  const groups = useMemo(
    () => groupToolsByConnector(availableTools),
    [availableTools]
  );

  const errFor = (index: number, field: string): string | undefined =>
    validation.errors[`requires.capabilities.${index}.${field}`];

  return (
    <div
      className={className ?? 'skill-capability-picker'}
      style={style}
      data-section="manifest-capabilities"
    >
      <header className="skill-capability-header">
        <h4>Required capabilities</h4>
        <p className="skill-capability-help">
          Tools this skill needs from a connected host. The library greys out
          the skill when none are satisfied; the runner refuses to fire
          without them.
        </p>
      </header>

      {capabilities.length === 0 ? (
        <p className="skill-capability-empty">
          No requirements declared. The skill will always appear runnable
          regardless of which hosts are connected.
        </p>
      ) : null}

      <ul className="skill-capability-list">
        {capabilities.map((cap, index) => (
          <li
            key={cap.rowId}
            className="skill-capability-row"
            data-row-id={cap.rowId}
          >
            <div className="skill-capability-row-fields">
              <label className="skill-capability-field">
                <span>Connector ID</span>
                <input
                  type="text"
                  value={cap.connectorId}
                  placeholder="resolve"
                  spellCheck={false}
                  onChange={(e) =>
                    onUpdate(cap.rowId, { connectorId: e.target.value })
                  }
                  aria-invalid={Boolean(errFor(index, 'connectorId'))}
                />
              </label>
              <label className="skill-capability-field">
                <span>Tool name</span>
                <input
                  type="text"
                  value={cap.toolName}
                  placeholder="add_marker"
                  spellCheck={false}
                  onChange={(e) =>
                    onUpdate(cap.rowId, { toolName: e.target.value })
                  }
                  aria-invalid={Boolean(errFor(index, 'toolName'))}
                />
              </label>
              <label className="skill-capability-field">
                <span>Description (shown in tooltip)</span>
                <input
                  type="text"
                  value={cap.description}
                  onChange={(e) =>
                    onUpdate(cap.rowId, { description: e.target.value })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="skill-capability-remove"
              onClick={() => onRemove(cap.rowId)}
              aria-label="Remove capability"
              title="Remove"
            >
              ✕
            </button>
            {/* The schema requires at least one of connectorId/toolName.
                Surface that root-level error inline on the offending row. */}
            {validation.errors[`requires.capabilities.${index}`] ? (
              <span className="skill-field-error">
                {validation.errors[`requires.capabilities.${index}`]}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="skill-capability-add"
        onClick={() => onAdd()}
      >
        + Add capability manually
      </button>

      {groups.length > 0 ? (
        <section
          className="skill-capability-live"
          data-section="live-tools"
        >
          <h5>Live tools (click to add)</h5>
          {groups.map((group) => (
            <div
              key={group.connectorId}
              className="skill-capability-live-group"
              data-connector-id={group.connectorId}
            >
              <strong>{group.connectorId}</strong>
              <ul>
                {group.tools.map((tool) => {
                  const used = isAlreadySelected(capabilities, tool);
                  return (
                    <li key={tool.name}>
                      <button
                        type="button"
                        className="skill-capability-live-tool"
                        disabled={used}
                        title={tool.description ?? tool.name}
                        onClick={() =>
                          onAdd({
                            connectorId: tool.connectorId,
                            toolName: tool.name,
                          })
                        }
                      >
                        {tool.name}
                        {used ? ' (added)' : ''}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
