import type { Router } from '../router.js';
import { readBody, jsonResponse, jsonError } from '../router.js';
import { config } from '../config.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Registers skill file management HTTP routes.
 */
export function registerSkillRoutes(router: Router) {
  const getSkillsDir = () =>
    path.join(config.workspaceRoot, 'apps', 'desktop', 'public', 'skills');

  // GET /api/skills/:filename
  router.get('/api/skills/', async (req, res) => {
    const skillsDir = getSkillsDir();
    const filename = req.url!.replace('/api/skills/', '').split('?')[0];
    const filePath = path.join(skillsDir, filename);
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      res.writeHead(200, {
        'Content-Type': filename.endsWith('.json')
          ? 'application/json'
          : 'text/plain',
      });
      res.end(fileContent);
    } catch (_err) {
      jsonResponse(res, { error: 'File not found' }, 404);
    }
  }, true); // prefix match

  // POST /api/skills/create
  router.post('/api/skills/create', async (req, res) => {
    try {
      const body = await readBody(req);
      const { filename, content } = JSON.parse(body);
      if (!filename || !content) {
        jsonResponse(
          res,
          { error: 'filename and content are required' },
          400
        );
        return;
      }

      const skillsDir = getSkillsDir();
      await fs.mkdir(skillsDir, { recursive: true });

      const filePath = path.join(skillsDir, filename);
      await fs.writeFile(filePath, content, 'utf-8');

      // Add to index.json
      const indexPath = path.join(skillsDir, 'index.json');
      let indexFiles: string[] = [];
      try {
        const indexRaw = await fs.readFile(indexPath, 'utf-8');
        indexFiles = JSON.parse(indexRaw);
      } catch (_e) {
        // ignore
      }

      if (!indexFiles.includes(filename)) {
        indexFiles.push(filename);
        await fs.writeFile(
          indexPath,
          JSON.stringify(indexFiles, null, 2),
          'utf-8'
        );
      }

      jsonResponse(res, { success: true, filePath });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/skills/delete
  router.post('/api/skills/delete', async (req, res) => {
    try {
      const body = await readBody(req);
      const { filename } = JSON.parse(body);
      if (!filename) {
        jsonResponse(res, { error: 'filename is required' }, 400);
        return;
      }

      const skillsDir = getSkillsDir();
      const filePath = path.join(skillsDir, filename);

      try {
        await fs.unlink(filePath);
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }

      // Remove from index.json
      const indexPath = path.join(skillsDir, 'index.json');
      try {
        const indexRaw = await fs.readFile(indexPath, 'utf-8');
        let indexFiles: string[] = JSON.parse(indexRaw);
        indexFiles = indexFiles.filter((f) => f !== filename);
        await fs.writeFile(
          indexPath,
          JSON.stringify(indexFiles, null, 2),
          'utf-8'
        );
      } catch (_e) {
        // ignore
      }

      jsonResponse(res, { success: true });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // ΓöÇΓöÇ Script Skills (Python scripts in data/scripts/) ΓöÇΓöÇ

  const getScriptsDir = () =>
    path.join(config.workspaceRoot, 'data', 'scripts');

  // GET /api/skills/scripts ΓÇö list all script skill files
  router.get('/api/skills/scripts', async (_req, res) => {
    try {
      const scriptsDir = getScriptsDir();
      await fs.mkdir(scriptsDir, { recursive: true });
      const files = await fs.readdir(scriptsDir);
      const scripts = files.filter(
        (f) =>
          f.endsWith('.py') &&
          !f.startsWith('_') &&
          f !== 'skill_template.py'
      );

      // Read metadata from each script
      const skillInfos = await Promise.all(
        scripts.map(async (filename) => {
          try {
            const content = await fs.readFile(
              path.join(scriptsDir, filename),
              'utf-8'
            );
            // Extract SKILL_META name and description via regex
            const nameMatch = content.match(
              /["']name["']\s*:\s*["']([^"']+)["']/
            );
            const descMatch = content.match(
              /["']description["']\s*:\s*["']([^"']+)["']/
            );
            return {
              filename,
              name: nameMatch?.[1] ?? filename.replace('.py', ''),
              description: descMatch?.[1] ?? 'User script skill',
            };
          } catch {
            return { filename, name: filename.replace('.py', ''), description: '' };
          }
        })
      );

      jsonResponse(res, { scripts: skillInfos });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/skills/create-script ΓÇö create a new Python script skill
  router.post('/api/skills/create-script', async (req, res) => {
    try {
      const body = await readBody(req);
      const { name, description, parameters, code } = JSON.parse(body);
      if (!name) {
        jsonResponse(res, { error: 'name is required' }, 400);
        return;
      }

      const scriptsDir = getScriptsDir();
      await fs.mkdir(scriptsDir, { recursive: true });

      const filename = `${name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}.py`;
      const filePath = path.join(scriptsDir, filename);

      // If custom code is provided, write it directly
      if (code) {
        await fs.writeFile(filePath, code, 'utf-8');
        jsonResponse(res, { success: true, filename, filePath });
        return;
      }

      // Generate from template
      const paramLines = parameters
        ? Object.entries(parameters as Record<string, any>)
            .map(
              ([k, v]) =>
                `        "${k}": ${JSON.stringify(v)},`
            )
            .join('\n')
        : '';

      const template = `"""
PipeFX Script Skill: ${name}
${description ?? ''}
"""

SKILL_META = {
    "name": "${name}",
    "description": "${description ?? `Custom skill: ${name}`}",
    "parameters": {
${paramLines}
    },
}


def run(connector, args: dict) -> str:
    '''Execute the skill. Must return a string result.'''
    # TODO: Implement your skill logic here
    # connector.get_project()  ΓÇö current DaVinci Resolve project
    # connector.get_timeline() ΓÇö current timeline
    return "Skill '${name}' executed successfully."
`;

      await fs.writeFile(filePath, template, 'utf-8');
      jsonResponse(res, { success: true, filename, filePath });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/skills/delete-script ΓÇö delete a script skill file
  router.post('/api/skills/delete-script', async (req, res) => {
    try {
      const body = await readBody(req);
      const { filename } = JSON.parse(body);
      if (!filename) {
        jsonResponse(res, { error: 'filename is required' }, 400);
        return;
      }

      const scriptsDir = getScriptsDir();
      const filePath = path.join(scriptsDir, filename);
      try {
        await fs.unlink(filePath);
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
      jsonResponse(res, { success: true });
    } catch (err) {
      jsonError(res, err);
    }
  });
}
