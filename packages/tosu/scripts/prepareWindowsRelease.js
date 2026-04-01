const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function copyDirectory(source, target) {
    fs.mkdirSync(target, { recursive: true });

    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const sourcePath = path.join(source, entry.name);
        const targetPath = path.join(target, entry.name);

        if (entry.isDirectory()) {
            copyDirectory(sourcePath, targetPath);
            continue;
        }

        fs.copyFileSync(sourcePath, targetPath);
    }
}

function ensureExists(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} not found: ${filePath}`);
    }
}

function zipRelease(releaseRoot, folderName, zipPath) {
    const tarResult = spawnSync(
        'tar.exe',
        ['-a', '-cf', zipPath, '-C', releaseRoot, folderName],
        { stdio: 'inherit' }
    );

    if (tarResult.status === 0) {
        return;
    }

    const command = `Compress-Archive -Path "${path.join(releaseRoot, folderName, '*')}" -DestinationPath "${zipPath}" -Force`;
    const psResult = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { stdio: 'inherit' }
    );

    if (psResult.status !== 0) {
        throw new Error('Unable to create release zip');
    }
}

function main() {
    if (process.platform !== 'win32') {
        throw new Error(
            'Windows release packaging is only supported on Windows'
        );
    }

    const packageDir = path.resolve(__dirname, '..');
    const distDir = path.join(packageDir, 'dist');
    const releaseRoot = path.join(distDir, 'release');
    const version = require(path.join(packageDir, 'src', '_version.js'));
    const folderName = `tosu-${version}-win-x64`;
    const bundleDir = path.join(releaseRoot, folderName);
    const zipPath = path.join(releaseRoot, `${folderName}.zip`);

    const exePath = path.join(distDir, 'tosu.exe');
    const helperDir = path.join(distDir, 'target');
    const overlayDir = path.resolve(
        packageDir,
        '..',
        'ingame-overlay',
        'pack',
        'win-unpacked'
    );
    const configPath = path.join(packageDir, 'tosu.env');

    ensureExists(exePath, 'tosu executable');
    ensureExists(helperDir, 'official pp helper folder');
    ensureExists(overlayDir, 'overlay folder');

    fs.rmSync(bundleDir, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
    fs.mkdirSync(bundleDir, { recursive: true });

    fs.copyFileSync(exePath, path.join(bundleDir, 'tosu.exe'));
    copyDirectory(helperDir, path.join(bundleDir, 'target'));
    copyDirectory(overlayDir, path.join(bundleDir, 'game-overlay'));
    if (fs.existsSync(configPath)) {
        fs.copyFileSync(configPath, path.join(bundleDir, 'tosu.env'));
    }

    zipRelease(releaseRoot, folderName, zipPath);
}

main();
