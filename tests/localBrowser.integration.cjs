const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const {readFileSync} = require('node:fs')
const {join, resolve} = require('node:path')
const {tmpdir} = require('node:os')
const {randomUUID, createHash} = require('node:crypto')
const {chromium} = require('playwright-core')
const serverRoot = resolve(__dirname, '../../../server/darkenlight_server')
const {MongoClient} = require(join(serverRoot, 'node_modules/mongodb'))
const {EJSON} = require(join(serverRoot, 'node_modules/bson'))
const {PNG} = require(join(serverRoot, 'node_modules/pngjs'))

async function waitFor(check, label) {
    const until = Date.now() + 30000
    while (Date.now() < until) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)) }
    throw new Error(`Timed out: ${label}`)
}

async function main() {
    const root = resolve(__dirname, '..')
    const fixture = await fs.mkdtemp(join(tmpdir(), 'darkenlight-runtime-'))
    const databaseName = `darkenlight_runtime_test_${randomUUID().replaceAll('-', '')}`
    const mongo = await new MongoClient('mongodb://localhost:27017', {serverSelectionTimeoutMS: 5000}).connect()
    const database = mongo.db(databaseName)
    let vite, browser, page
    const browserErrors = []
    const gameSockets = []
    try {
        const sourceWorld = EJSON.parse(await fs.readFile(join(root, 'public/world/world.json'), 'utf8'))
        for (const [collection, records] of Object.entries(sourceWorld)) {
            if (records.length) await database.collection(collection).insertMany(records)
        }
        await fs.cp(join(root, 'public/world/assets'), join(fixture, 'assets'), {recursive: true})
        const mainWorld = sourceWorld.worlds.find(world => world.id === 1)
        const mapRelative = `assets/maps/${mainWorld.mapId}_map_height.png`
        const mapFixture = join(fixture, mapRelative)
        const originalSourceHash = createHash('sha256').update(readFileSync(join(serverRoot, mapRelative))).digest('hex')
        process.env.DARKENLIGHT_AUTHORING_ROOT = fixture
        process.env.DARKENLIGHT_AUTHORING_DB = databaseName
        process.env.VITE_GM_MODE = 'true'
        const {createServer} = await import('vite')
        const testHost = process.env.DARKENLIGHT_TEST_HOST || '127.0.0.1'
        vite = await createServer({root, cacheDir: join(fixture, '.vite'), configFile: join(root, 'vite.config.js'), server: {host: testHost, port: 0}, logLevel: 'warn'})
        await vite.listen()
        const url = `http://${testHost}:${vite.httpServer.address().port}/`
        browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']})
        page = await browser.newPage({viewport: {width: 1280, height: 800}})
        page.setDefaultTimeout(90000)
        page.on('pageerror', error => browserErrors.push(error.stack || String(error)))
        page.on('console', message => { if (message.type() === 'error' || /Character|INIT|runtime|Public character|Game started/.test(message.text())) console.error('Browser console:', message.text()) })
        page.on('websocket', socket => { if (/:3000(?:\/|$)|\/ws(?:\?|$)/.test(socket.url())) gameSockets.push(socket.url()) })
        await page.goto(url)
        await page.locator('#local-character-name').waitFor({state: 'visible'})
        assert.equal(await page.locator('input[type="password"]').count(), 0)
        assert.equal(await page.locator('[data-profile-id]').count(), 0)
        const name = 'RuntimeGM'
        await page.locator('#local-character-name').fill(name)
        await page.locator('label[for="local-character-gm"]').click()
        assert.equal(await page.locator('#local-character-gm').isChecked(), true)
        await page.locator('form button').click()
        await page.locator('.gm-panel-button').waitFor({state: 'visible'})
        await page.waitForFunction(async () => (await import('/src/GameManager.ts')).GameManager.started)
        assert.equal(await database.collection('characters').countDocuments(), 0, 'GM character must not be stored in Mongo')
        const empty = await page.evaluate(async () => {
            const {MyPlayer} = await import('/src/data/myPlayer.ts')
            const {Connector} = await import('/src/network/connector.ts')
            await Connector.save()
            const {listProfiles, loadSave} = await import('/src/local/saveStore.ts')
            const profiles = await listProfiles()
            return {profiles, save: await loadSave(profiles[0].id)}
        })
        const gmProfile = empty.profiles[0]
        const gmSave = EJSON.parse(empty.save)
        assert.equal(gmSave.collections.characters[0].class, 'GM')
        assert.equal(gmSave.collections.characters[0].inventory.items.length, 0)
        assert.deepEqual(Object.keys(gmSave.collections).sort(), ['characters', 'counters'])
        await page.evaluate(async () => {
            const {Connector} = await import('/src/network/connector.ts')
            Connector.sendMessage({t: 1006, d: {tp: 'W', codebookId: 3, quality: 25}})
            await Connector.save()
        })
        await page.locator('.gm-panel-button').click({timeout: 15000})
        await page.getByRole('button', {name: 'Biome', exact: true}).click()
        await page.getByRole('button', {name: 'No grass', exact: true}).click()
        await page.waitForFunction(async () => {
            const {TerrainManager} = await import('/src/babylon/world/terrainManager.ts')
            return TerrainManager.outdoorTerrain?.getGrassStats()?.count > 0
        }, undefined, {timeout: 10000})
        const grassTile = await page.evaluate(async () => {
            const {Renderer} = await import('/src/babylon/scene/renderer.ts')
            const {TerrainManager} = await import('/src/babylon/world/terrainManager.ts')
            const {WorldDataManager} = await import('/src/data/worldDataManager.ts')
            const {MyPlayer} = await import('/src/data/myPlayer.ts')
            const world = WorldDataManager.worldDataMap.get(MyPlayer.worldId)
            const scene = Renderer.scene
            const engine = scene.getEngine()
            const canvas = engine.getRenderingCanvas()
            const viewport = scene.activeCamera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
            const outdoor = TerrainManager.outdoorTerrain
            for (const mesh of outdoor.grass.meshes) {
                for (const matrix of mesh.thinInstanceGetWorldMatrices().slice(0, mesh.thinInstanceCount)) {
                    const pos = matrix.getTranslation()
                    const x = Math.round(pos.x), z = Math.round(pos.z)
                    const tile = x * world.worldSize + z
                    if (world.noGrassTiles.has(tile)) continue
                    pos.set(x, world.blockMap[x][z].height, z)
                    const screen = pos.constructor.Project(pos, mesh.getWorldMatrix(), scene.getTransformMatrix(), viewport)
                    const px = screen.x * canvas.clientWidth / engine.getRenderWidth()
                    const py = screen.y * canvas.clientHeight / engine.getRenderHeight()
                    if (document.elementFromPoint(px, py) !== canvas) continue
                    const hit = scene.pick(px, py, candidate => candidate.isEnabled() && outdoor.isSurfaceMesh(candidate)).pickedPoint
                    if (hit && Math.round(hit.x) === x && Math.round(hit.z) === z) return {tile, x, z, px, py}
                }
            }
            throw new Error('No clickable rendered grass tile found')
        })
        const exclusions = database.collection('worlds')
        const isGrassExcluded = async () => (await exclusions.findOne({id: 1})).noGrassTiles?.includes(grassTile.tile) ?? false
        await page.mouse.click(grassTile.px, grassTile.py)
        await waitFor(isGrassExcluded, 'grass exclusion saved in Mongo')
        await page.waitForFunction(async ({x, z}) => {
            const {TerrainManager} = await import('/src/babylon/world/terrainManager.ts')
            const {WorldRenderer} = await import('/src/babylon/world/worldRenderer.ts')
            const includesTile = mesh => mesh.thinInstanceGetWorldMatrices().slice(0, mesh.thinInstanceCount)
                .some(matrix => Math.round(matrix.m[12]) === x && Math.round(matrix.m[14]) === z)
            const markers = WorldRenderer.grassExclusionMarkers
            return markers?.isEnabled() && includesTile(markers) && !TerrainManager.outdoorTerrain.grass.meshes.some(includesTile)
        }, grassTile)
        await page.getByRole('button', {name: 'Overview', exact: true}).click()
        assert.equal(await page.evaluate(async () =>
            (await import('/src/babylon/world/worldRenderer.ts')).WorldRenderer.grassExclusionMarkers.isEnabled()), false)
        await page.getByRole('button', {name: 'Biome', exact: true}).click()
        await page.getByRole('button', {name: 'No grass', exact: true}).click()
        await page.mouse.click(grassTile.px, grassTile.py)
        await waitFor(async () => !await isGrassExcluded(), 'grass exclusion removed from Mongo')
        await page.mouse.click(grassTile.px, grassTile.py)
        await waitFor(isGrassExcluded, 'grass exclusion marked again')
        const areas = mainWorld.areas?.length ? structuredClone(mainWorld.areas)
            : [{id: 1, name: 'Runtime area', points: [1, 1, 11, 1, 11, 11, 1, 11]}]
        areas[0].name = 'Runtime GM area edit'
        await page.evaluate(async ({areas, revision}) => {
            const {Connector} = await import('/src/network/connector.ts')
            Connector.sendMessage({t: 1026, d: {worldId: 1, action: 'save', requestId: 'runtime-test', revision, areas}})
        }, {areas, revision: mainWorld.areasRevision ?? 0})
        await waitFor(async () => (await database.collection('worlds').findOne({id: 1})).areas?.[0]?.name === areas[0].name, 'GM world edit persisted to isolated Mongo')
        const png = PNG.sync.read(await fs.readFile(mapFixture))
        const oldHeight = Math.floor(png.data[(500 * png.width + 500) * 4] / 8)
        const height = oldHeight >= 31 ? 30 : Math.max(1, oldHeight + 1)
        await page.evaluate(async height => {
            const {Connector} = await import('/src/network/connector.ts')
            Connector.sendMessage({t: 1016, d: {worldId: 1, changes: [{x: 500, z: 500, height}]}})
        }, height)
        await waitFor(async () => PNG.sync.read(await fs.readFile(mapFixture)).data[(500 * png.width + 500) * 4] === height * 8, 'GM terrain edit persisted to isolated PNG')
        await page.screenshot({path: resolve(root, '../../artifacts/gm-local-runtime.png')})
        await page.evaluate(async () => { const {Connector} = await import('/src/network/connector.ts'); await Connector.closeConnection() })
        await page.reload()
        await page.locator(`[data-profile-id="${gmProfile.id}"]`).click()
        await page.locator('.gm-panel-button').waitFor({state: 'visible'})
        await page.waitForFunction(async () => (await import('/src/GameManager.ts')).GameManager.started)
        assert.equal(await page.evaluate(async tile => {
            const {WorldDataManager} = await import('/src/data/worldDataManager.ts')
            return WorldDataManager.worldDataMap.get(1)?.noGrassTiles.has(tile)
        }, grassTile.tile), true, 'GM grass exclusion was not restored')
        assert.equal(await database.collection('characters').countDocuments(), 0)
        const resumedGM = EJSON.parse(await page.evaluate(async id => {
            const {Connector} = await import('/src/network/connector.ts'); await Connector.save()
            return (await import('/src/local/saveStore.ts')).loadSave(id)
        }, gmProfile.id))
        assert.equal(resumedGM.collections.characters[0].inventory.items.length, 1, 'GM equipment was not restored')
        assert.deepEqual(resumedGM.collections.characters[0].equipSet, gmSave.collections.characters[0].equipSet)
        await page.evaluate(async () => { const {Connector} = await import('/src/network/connector.ts'); await Connector.closeConnection() })
        require(join(serverRoot, 'node_modules/ts-node')).register({project: join(serverRoot, 'tsconfig.json'), transpileOnly: true})
        const output = join(fixture, 'exported-world')
        await require(join(serverRoot, 'src/runtime/exportWorld.ts')).exportWorld(fixture, output, databaseName)
        const exported = EJSON.parse(await fs.readFile(join(output, 'world.json'), 'utf8'))
        const manifest = JSON.parse(await fs.readFile(join(output, 'manifest.json'), 'utf8'))
        assert.equal(Object.keys(manifest.terrainMaps).length, exported.worlds.length)
        assert.equal(Object.keys(manifest.navigationMaps).length, exported.worlds.length)
        assert.equal(exported.worlds.find(world => world.id === 1).areas[0].name, areas[0].name)
        assert.ok(exported.worlds.find(world => world.id === 1).noGrassTiles.includes(grassTile.tile))
        assert.equal(exported.players.length, 0)
        assert.equal(exported.characters.length, 0)
        // Ordinary characters use the bundle even when GM authoring is enabled in env.
        await page.reload()
        await page.locator('#local-character-name').fill('FirstHero')
        await page.locator('form button').click()
        await page.locator('.guest-character-class-label:has(.guest-character-creation-class--fighter)').click()
        await page.locator('.guest-character-creation-continue-action').click()
        await page.locator('#renderCanvas.game-session-canvas--visible').waitFor()
        await page.evaluate(async () => { const {Connector} = await import('/src/network/connector.ts'); await Connector.save(); await Connector.closeConnection() })
        await page.reload()
        await page.locator('#local-character-name').fill('SecondHero')
        await page.locator('form button').click()
        await page.locator('.guest-character-class-label:has(.guest-character-creation-class--mystic)').click()
        await page.locator('.guest-character-creation-continue-action').click()
        await page.locator('#renderCanvas.game-session-canvas--visible').waitFor()
        await page.evaluate(async () => { const {Connector} = await import('/src/network/connector.ts'); await Connector.save(); await Connector.closeConnection() })
        const local = await page.evaluate(async () => {
            const {listProfiles, loadSave} = await import('/src/local/saveStore.ts')
            const profiles = await listProfiles()
            return Promise.all(profiles.map(async profile => ({profile, save: await loadSave(profile.id)})))
        })
        assert.equal(local.length, 3)
        for (const {profile, save} of local) {
            const parsed = EJSON.parse(save)
            assert.deepEqual(Object.keys(parsed.collections).sort(), ['characters', 'counters'])
            assert.equal(parsed.collections.characters.length, 1)
            assert.equal(parsed.collections.characters[0].name, profile.name)
        }
        assert.equal(await database.collection('characters').countDocuments(), 0, 'Local characters leaked into Mongo')
        assert.equal(createHash('sha256').update(readFileSync(join(serverRoot, mapRelative))).digest('hex'), originalSourceHash, 'Test changed an actual authoring PNG')
        assert.deepEqual(gameSockets, [], 'Local game opened a gameplay WebSocket')
        assert.deepEqual(browserErrors, [], 'Browser runtime errors')
        console.log('PASS: real renderer/login, local GM profile, grass exclusions, Mongo world edit, PNG edit and export without characters; source data untouched')
    } catch (error) {
        if (page) {
            console.error('Browser errors:', browserErrors)
            console.error('Visible page:', (await page.locator('body').innerText()).slice(-1800))
        }
        throw error
    } finally {
        await browser?.close()
        await vite?.close()
        if (!databaseName.startsWith('darkenlight_runtime_test_')) throw new Error('Unsafe test database cleanup')
        await database.dropDatabase()
        await mongo.close()
        if (!fixture.startsWith(join(tmpdir(), 'darkenlight-runtime-'))) throw new Error('Unsafe test fixture cleanup')
        await fs.rm(fixture, {recursive: true, force: true})
    }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
