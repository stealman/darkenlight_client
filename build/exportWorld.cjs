const path = require('node:path')
const fs = require('node:fs')
const root = path.resolve(__dirname, '../../..')
const serverRoot = path.join(root, 'server/darkenlight_server')
const output = path.resolve(__dirname, '../public/world')

async function main() {
    // CI can build an already exported, immutable bundle without MongoDB access.
    if (process.env.DARKENLIGHT_WORLD_BUNDLE) {
        const source = path.resolve(process.env.DARKENLIGHT_WORLD_BUNDLE)
        const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'))
        if (manifest.schemaVersion !== 1 || !manifest.contentId || !manifest.files || !manifest.terrainMaps || !manifest.navigationMaps) throw new Error('World bundle needs compiled terrain and navigation. Export it again.')
        const {createHash} = require('node:crypto')
        for (const [name, expected] of Object.entries(manifest.files)) {
            const file = path.resolve(source, name)
            if (!file.startsWith(source + path.sep)) throw new Error('Invalid bundle asset path')
            if (createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) throw new Error(`Invalid bundle asset: ${name}`)
        }
        if (source !== output) {
            fs.mkdirSync(output, {recursive: true})
            fs.cpSync(source, output, {recursive: true})
        }
        console.log(`Using exported world ${manifest.contentId.slice(0, 12)}`)
        return
    }
    require(path.join(serverRoot, 'node_modules/ts-node')).register({project: path.join(serverRoot, 'tsconfig.json'), transpileOnly: true})
    const result = await require(path.join(serverRoot, 'src/runtime/exportWorld.ts')).exportWorld(serverRoot, output)
    console.log(`Exported ${result.worlds} worlds and ${result.maps} maps (${result.contentId.slice(0, 12)})`)
}

main().catch(error => { console.error(`World export failed: ${error.message}`); process.exitCode = 1 })
