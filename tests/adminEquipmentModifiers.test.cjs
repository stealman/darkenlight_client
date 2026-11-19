const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { adminEquipmentModifiersPlugin } = require('../build/adminEquipmentModifiers.cjs')

test('equipment configuration persists transforms and rejects invalid writes', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'darkenlight-modifiers-'))
    const configPath = path.join(directory, 'equipment.json')
    let middleware
    adminEquipmentModifiersPlugin(configPath).configureServer({
        middlewares: { use(handler) { middleware = handler } },
        config: { logger: { error() {} } },
    })
    const server = http.createServer((req, res) => middleware(req, res, () => res.writeHead(404).end()))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const vector = { x: 0.1, y: -0.5, z: 2 }
    const transform = { position: vector, rotation: vector, scale: vector }
    const config = { equipment: { 1000: transform }, pauldrons: { 1200: { left: transform, right: transform } }, hair: { 1: transform, 2: transform }, hairPreviewColor: '#8b5a2b', hairPreviewLightness: 1.5 }
    const put = (body, requestOrigin = origin) => fetch(origin + '/admin-utils/equipment-modifiers.json', {
        method: 'PUT', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    try {
        assert.equal((await put(config)).status, 204)
        assert.deepEqual(JSON.parse(await fs.readFile(configPath, 'utf8')), config)
        const female = {...config, equipment: {1000: {...transform, position: {x: 1, y: 2, z: 3}}}}
        assert.equal((await fetch(origin + '/admin-utils/equipment-modifiers-female.json', {
            method: 'PUT', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: JSON.stringify(female),
        })).status, 204)
        assert.deepEqual(JSON.parse(await fs.readFile(configPath.replace('.json', '-female.json'), 'utf8')), female)
        assert.deepEqual(JSON.parse(await fs.readFile(configPath, 'utf8')), config, 'female saves preserve male tuning')
        assert.equal((await put({...config, hair: {1: {position: vector}}})).status, 400)
        assert.equal((await put({...config, hair: {0: transform}})).status, 400)
        assert.equal((await put({...config, hairPreviewColor: 'red'})).status, 400)
        for (const hairPreviewLightness of [-3, 5, '1', null]) {
            assert.equal((await put({...config, hairPreviewLightness})).status, 400)
        }
        assert.equal((await put({ equipment: { 1000: {} }, pauldrons: {} })).status, 400)
        assert.equal((await put(config, 'https://unrelated.example')).status, 403)
        assert.deepEqual(JSON.parse(await fs.readFile(configPath, 'utf8')), config)
    } finally {
        await new Promise(resolve => server.close(resolve))
        await fs.rm(directory, { recursive: true, force: true })
    }
})
