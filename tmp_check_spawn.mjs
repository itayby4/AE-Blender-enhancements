import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const workspaceRoot = process.cwd();
const venvRoot = path.join(workspaceRoot, 'apps', 'mcp-davinci', 'venv');
const command = os.platform() === 'win32' ? path.join(venvRoot, 'Scripts', 'python.exe') : path.join(venvRoot, 'bin', 'python');

console.log({ workspaceRoot, command, exists: fs.existsSync(command) });

const child = spawn(command, ['--version']);
child.stdout.on('data', d => console.log('OUT:', d.toString()));
child.stderr.on('data', d => console.log('ERR:', d.toString()));
child.on('error', e => console.error('SPAWN ERROR:', e));
child.on('exit', c => console.log('EXIT:', c));
