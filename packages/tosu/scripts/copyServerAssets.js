const fs = require('fs');
const path = require('path');

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

const packageDir = path.resolve(__dirname, '..');
const sourceDir = path.join(
    packageDir,
    'node_modules',
    '@tosu',
    'server',
    'assets'
);
const targetDir = path.join(packageDir, 'dist', 'assets');

copyDirectory(sourceDir, targetDir);
