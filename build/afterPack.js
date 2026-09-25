/**
 * afterPack hook for electron-builder (Linux).
 * Appends [Desktop Action …] sections to the generated .desktop file so the
 * "Nieuw document" / "Nieuw venster" jump-list entries defined via
 * build.linux.desktop.Actions actually have an Exec line. Without these
 * sections GNOME/KDE would see Actions= but silently drop them.
 *
 * electron-builder calls this with context { appOutDir, outDir, arch, ... }.
 * The .desktop file lives in different places depending on the target:
 *   - deb/AppImage staging happens *after* pack, so we also patch the final
 *     artifact in `dist/` via `afterAllArtifactBuild` if needed (see below).
 *   - For a plain unpacked dir (e.g. `build --dir`) it is at
 *     `${appOutDir}/summie.desktop` or `${appOutDir}/com.summie.app.desktop`.
 */
const fs = require('fs');
const path = require('path');

const DESKTOP_ACTIONS = `
[Desktop Action new-document]
Name=Nieuw document
Name[en]=New document
Exec=summie --new-document
Icon=summie

[Desktop Action new-window]
Name=Nieuw venster
Name[en]=New window
Exec=summie --new-window
Icon=summie
`.trimStart();

function patchDesktopFiles(rootDir) {
    if (!rootDir || !fs.existsSync(rootDir)) return;
    // Recursively look for *.desktop files (max depth 4 to stay cheap)
    const queue = [rootDir];
    const visited = new Set();
    while (queue.length) {
        const dir = queue.pop();
        if (visited.has(dir)) continue;
        visited.add(dir);
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                // Don't recurse into node_modules / huge trees, but dist + outDir are shallow
                if (full.includes('node_modules')) continue;
                queue.push(full);
            } else if (e.isFile() && e.name.endsWith('.desktop')) {
                try {
                    let content = fs.readFileSync(full, 'utf8');
                    // Already patched or no Actions line → skip
                    if (content.includes('[Desktop Action new-document]')) continue;
                    if (!content.includes('Actions=')) continue;
                    // Ensure file ends with newline before appending
                    if (!content.endsWith('\n')) content += '\n';
                    content += '\n' + DESKTOP_ACTIONS + '\n';
                    fs.writeFileSync(full, content, 'utf8');
                    console.log(`[afterPack] Patched desktop actions into ${full}`);
                } catch (err) {
                    console.warn(`[afterPack] Could not patch ${full}:`, err.message);
                }
            }
        }
    }
}

exports.default = async function afterPack(context) {
    // context.appOutDir is the unpacked app directory
    patchDesktopFiles(context.appOutDir);
    // Also walk the build output directory in case a .desktop was already staged
    if (context.outDir) patchDesktopFiles(context.outDir);
};

// electron-builder also supports afterAllArtifactBuild for final artifacts.
// If the desktop file only appears inside the .deb/AppImage, this catches it.
exports.afterAllArtifactBuild = async function afterAllArtifactBuild(context) {
    // context.buildOutDir / context.outDir varies by version — try both
    const roots = [context.outDir, context.buildOutDir, path.join(process.cwd(), 'dist')].filter(Boolean);
    for (const r of roots) patchDesktopFiles(r);
};

// Allow running directly: `node build/afterPack.js` patches ./dist
if (require.main === module) {
    patchDesktopFiles(path.join(__dirname, '../dist'));
    // Also walk common unpacked locations
    patchDesktopFiles(path.join(__dirname, '../dist/win-unpacked'));
    patchDesktopFiles(path.join(__dirname, '../dist/linux-unpacked'));
}
