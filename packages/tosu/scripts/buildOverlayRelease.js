const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function ensureSuccess(result, step) {
    if (result.status !== 0) {
        throw new Error(
            `${step} failed with exit code ${result.status ?? 'unknown'}`
        );
    }
}

function main() {
    if (process.platform !== 'win32') {
        throw new Error('Overlay release build is only supported on Windows');
    }

    const packageDir = path.resolve(__dirname, '..');
    const overlayDir = path.resolve(packageDir, '..', 'ingame-overlay');
    const shimDir = path.join(overlayDir, '.codex-tools');
    const shimPath = path.join(shimDir, 'pnpm.cmd');
    const version = require(path.join(packageDir, 'src', '_version.js'));

    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(shimPath, '@echo off\r\ncorepack pnpm %*\r\n', 'utf8');

    const env = {
        ...process.env,
        PATH: `${shimDir};${process.env.PATH || ''}`
    };

    try {
        const build = spawnSync(
            'cmd.exe',
            ['/d', '/s', '/c', 'corepack pnpm run dist'],
            {
                cwd: overlayDir,
                env,
                stdio: 'inherit'
            }
        );
        ensureSuccess(build, 'Overlay build');

        const packedDir = path.join(overlayDir, 'pack', 'win-unpacked');
        fs.writeFileSync(
            path.join(packedDir, 'version'),
            `${version}\n`,
            'utf8'
        );
    } finally {
        fs.rmSync(shimDir, { recursive: true, force: true });
    }
}

main();
