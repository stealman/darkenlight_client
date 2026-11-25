const assert = require('node:assert/strict')
const {test} = require('node:test')
const {createServer} = require('vite')
const {mkdtemp, rm} = require('node:fs/promises')
const {tmpdir} = require('node:os')
const {join, resolve} = require('node:path')

test('adminUtils imports before mounting without entering the runtime equipment/audio cycle', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'darkenlight-admin-boot-test-'))
    const server = await createServer({
        configFile: false,
        root: resolve(__dirname, '..'),
        resolve: {alias: {
            '@': resolve(__dirname, '../src'),
            '@game': resolve(__dirname, '../../../server/darkenlight_server/src'),
        }},
        cacheDir,
        optimizeDeps: {noDiscovery: true, include: []},
        server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
    })
    try {
        const admin = await server.ssrLoadModule('/src/adminUtils/adminUtils.ts')
        assert.equal(typeof admin.mountAdminUtils, 'function')
        // These modules must wait for mountAdminUtils to initialize Renderer.
        const loaded = [...server.moduleGraph.idToModuleMap.entries()]
            .filter(([, module]) => module.ssrModule)
            .map(([id]) => id.replaceAll('\\', '/'))
        for (const file of ['babylon/item/equipManager.ts', 'babylon/audio/audioManager.ts', 'network/connector.ts']) {
            assert.equal(loaded.some(id => id.endsWith('/src/' + file)), false, file)
        }
    } finally {
        await server.close()
        await rm(cacheDir, {recursive: true, force: true})
    }
})
