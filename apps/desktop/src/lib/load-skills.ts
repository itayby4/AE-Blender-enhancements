export interface Skill {
  id: string;
  name: string;
  systemInstruction?: string;
  allowedTools?: string[];
}

const DEFAULT_SKILL: Skill = { id: 'default', name: 'Default Assistant' };

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
    const m = frontmatter.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'));
    return m ? m[1] : undefined;
  };

  const getList = (key: string): string[] | undefined => {
    const listMatch = frontmatter.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`, 'm'));
    if (!listMatch) return undefined;
    return listMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  };

  return {
    id: getString('id'),
    name: getString('name') ?? 'Unnamed Skill',
    systemInstruction: body || undefined,
    allowedTools: getList('allowedTools'),
  };
}

/**
 * Load all skills from the `skills/` public directory.
 * Reads `skills/index.json` for the list of filenames,
 * then fetches and parses each `.md` file.
 */
export async function loadSkills(): Promise<Skill[]> {
  try {
    const indexRes = await fetch('/skills/index.json');
    if (!indexRes.ok) {
      console.warn('Could not load skills/index.json, using defaults');
      return [DEFAULT_SKILL];
    }

    const filenames: string[] = await indexRes.json();
    const skills: Skill[] = [DEFAULT_SKILL];

    for (const filename of filenames) {
      try {
        const mdRes = await fetch(`/skills/${filename}`);
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
            systemInstruction: parsed.systemInstruction,
            allowedTools: parsed.allowedTools,
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
