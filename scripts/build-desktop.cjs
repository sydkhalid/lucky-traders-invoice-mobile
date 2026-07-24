const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const electronDistDir = path.join(rootDir, 'node_modules', 'electron', 'dist');
const webDistDir = path.join(rootDir, 'dist');
const desktopDir = path.join(rootDir, 'desktop');
const assetsDir = path.join(rootDir, 'assets');
const outputRoot = path.join(rootDir, 'desktop-release');
const outputAppDir = path.join(outputRoot, 'Lucky Traders Invoice');
const resourcesAppDir = path.join(outputAppDir, 'resources', 'app');

function assertInsideRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(rootDir + path.sep)) {
    throw new Error(`Refusing to write outside project: ${resolved}`);
  }
  return resolved;
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function ensureExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

ensureExists(electronDistDir, 'Electron runtime is missing. Run npm install first.');
ensureExists(path.join(webDistDir, 'index.html'), 'Web export is missing. Run npm run desktop:export first.');
ensureExists(path.join(desktopDir, 'main.cjs'), 'Desktop main file is missing.');

assertInsideRoot(outputRoot);
if (fs.existsSync(outputRoot)) {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}

copyDirectory(electronDistDir, outputAppDir);
copyDirectory(webDistDir, path.join(resourcesAppDir, 'dist'));
copyDirectory(desktopDir, path.join(resourcesAppDir, 'desktop'));
copyDirectory(assetsDir, path.join(resourcesAppDir, 'assets'));

fs.writeFileSync(
  path.join(resourcesAppDir, 'package.json'),
  JSON.stringify(
    {
      name: 'lucky-traders-invoice-desktop',
      version: '1.0.0',
      main: 'desktop/main.cjs',
      private: true,
    },
    null,
    2,
  ),
);

const sourceExe = path.join(outputAppDir, 'electron.exe');
const targetExe = path.join(outputAppDir, 'Lucky Traders Invoice.exe');
if (fs.existsSync(sourceExe)) {
  fs.renameSync(sourceExe, targetExe);
}

console.log(`Desktop app generated at: ${outputAppDir}`);
console.log(`Run: ${targetExe}`);
