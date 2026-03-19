import { spawn } from 'child_process';
import path from 'path';

const venvPath = path.join(process.cwd(), 'apps', 'mcp-davinci', 'venv', 'Scripts', 'python.exe');
const child = spawn(venvPath, ['-m', 'mcp_davinci.server', '--help']);

child.stdout.on('data', d => process.stdout.write('OUT: ' + d));
child.stderr.on('data', d => process.stderr.write('ERR: ' + d));
child.on('exit', c => console.log('\nEXIT:', c));
