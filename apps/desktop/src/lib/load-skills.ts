export interface Skill {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  hasUI?: boolean;
  triggerCommand?: string;
  compatibleApps?: string[];
  systemInstruction?: string;
  allowedTools?: string[];
  uiHtml?: string;
  filename?: string;
}

const DEFAULT_SKILL: Skill = {
  id: 'default',
  name: 'Default Assistant',
  description: 'General-purpose AI assistant',
  icon: 'bot',
  category: 'general',
};

/**
 * Parse YAML frontmatter and markdown body from a skill .md file.
 * Uses a lightweight regex parser — no external dependencies.
 */
function parseSkillMarkdown(raw: string): Omit<Skill, 'id'> & { id?: string } {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) return { name: 'Unnamed Skill' };

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  const getString = (key: string): string | undefined => {
    const m = frontmatter.match(
      new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm')
    );
    return m ? m[1] : undefined;
  };

  const getBool = (key: string): boolean | undefined => {
    const val = getString(key);
    if (val === undefined) return undefined;
    return val === 'true';
  };

  const getList = (key: string): string[] | undefined => {
    const listMatch = frontmatter.match(
      new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`, 'm')
    );
    if (!listMatch) return undefined;
    return listMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  };

  // Extract HTML UI section if present
  const uiMatch = body.match(/<!--UI-->[\r\n]*([\s\S]*?)[\r\n]*<!--\/UI-->/);
  const uiHtml = uiMatch ? uiMatch[1].trim() : undefined;

  // System instruction is the body minus the UI section
  const systemInstruction = uiMatch
    ? body.replace(/<!--UI-->[\s\S]*?<!--\/UI-->/, '').trim() || undefined
    : body || undefined;

  return {
    id: getString('id'),
    name: getString('name') ?? 'Unnamed Skill',
    description: getString('description'),
    icon: getString('icon'),
    category: getString('category'),
    hasUI: getBool('hasUI'),
    triggerCommand: getString('triggerCommand'),
    compatibleApps: getList('compatibleApps'),
    systemInstruction,
    allowedTools: getList('allowedTools'),
    uiHtml,
  };
}

/**
 * Load all skills from the `skills/` public directory.
 * Reads `skills/index.json` for the list of filenames,
 * then fetches and parses each `.md` file.
 */
export async function loadSkills(): Promise<Skill[]> {
  try {
    const ts = new Date().getTime();
    const indexRes = await fetch(`http://localhost:3001/api/skill-files/index.json?_t=${ts}`);
    if (!indexRes.ok) {
      console.warn('Could not load skills/index.json, using defaults');
      return [DEFAULT_SKILL];
    }

    const filenames: string[] = await indexRes.json();
    const skills: Skill[] = [DEFAULT_SKILL];

    for (const filename of filenames) {
      try {
        const mdRes = await fetch(`http://localhost:3001/api/skill-files/${filename}?_t=${ts}`);
        if (!mdRes.ok) {
          console.warn(`Could not load skill: ${filename}`);
          continue;
        }

        const raw = await mdRes.text();
        const parsed = parseSkillMarkdown(raw);
        if (parsed.id) {
          skills.push({
            id: parsed.id,
            name: parsed.name ?? filename,
            description: parsed.description,
            icon: parsed.icon,
            category: parsed.category,
            hasUI: parsed.hasUI,
            triggerCommand: parsed.triggerCommand,
            compatibleApps: parsed.compatibleApps,
            systemInstruction: parsed.systemInstruction,
            allowedTools: parsed.allowedTools,
            uiHtml: parsed.uiHtml,
            filename: filename,
          });
        }
      } catch (err) {
        console.warn(`Failed to parse skill ${filename}:`, err);
      }
    }

    return skills;
  } catch (err) {
    console.warn('Failed to load skills:', err);
    return [DEFAULT_SKILL];
  }
}

/**
 * Filter skills by the currently active app connector.
 * Skills without `compatibleApps` are shown for all apps (universal).
 */
export function filterSkillsByApp(skills: Skill[], activeApp: string): Skill[] {
  return skills.filter(
    (s) =>
      !s.compatibleApps ||
      s.compatibleApps.length === 0 ||
      s.compatibleApps.includes(activeApp)
  );
}

/**
 * Parse a raw .md file content into a Skill object.
 * Returns null if the file doesn't have valid frontmatter with an id.
 */
export function parseSkillFromContent(raw: string): Skill | null {
  const parsed = parseSkillMarkdown(raw);
  if (!parsed.id) return null;
  return {
    id: parsed.id,
    name: parsed.name,
    description: parsed.description,
    icon: parsed.icon,
    category: parsed.category,
    hasUI: parsed.hasUI,
    triggerCommand: parsed.triggerCommand,
    compatibleApps: parsed.compatibleApps,
    systemInstruction: parsed.systemInstruction,
    allowedTools: parsed.allowedTools,
    uiHtml: parsed.uiHtml,
  };
}
