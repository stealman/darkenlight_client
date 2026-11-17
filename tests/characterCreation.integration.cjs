const assert = require('node:assert/strict')
const {join, resolve} = require('node:path')
const {chromium} = require('playwright-core')
const {mkdtemp, rm} = require('node:fs/promises')

async function main() {
    const root = resolve(__dirname, '..')
    const coldStart = process.argv.includes('--cold-start')
    const cacheDir = await mkdtemp(join(root, 'node_modules/.vite-character-test-'))
    process.env.VITE_GM_MODE = 'false'
    const {createServer} = await import('vite')
    const vite = await createServer({root, cacheDir, configFile: join(root, 'vite.config.js'), server: {host: '127.0.0.1', port: 0}, logLevel: coldStart ? 'info' : 'warn'})
    let browser
    try {
        await vite.listen()
        browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']})
        const page = await browser.newPage({viewport: {width: 1280, height: 800}})
        page.setDefaultTimeout(90000)
        const errors = []
        const mapRequests = []
        page.on('request', request => { if (/\/world\/assets\/maps\/.*\.png/.test(request.url())) mapRequests.push(request.url()) })
        const reloads = []
        page.on('websocket', socket => socket.on('framereceived', frame => {
            try {
                const message = JSON.parse(String(frame.payload))
                if (message.type === 'full-reload') { reloads.push(message); console.error('Unexpected Vite reload:', message) }
            } catch {}
        }))
        page.on('console', message => {
            if (message.type() === 'error') console.error(message.text())
            if (/updateRawTexture|Failed to process game response/.test(message.text())) errors.push(message.text())
        })
        page.on('pageerror', error => { errors.push(error.stack); console.error(error.stack) })
        await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`)
        await page.locator('#local-character-name').waitFor()
        await page.evaluate(async () => {
            const {WorkerTransport} = await import('/src/local/workerTransport.ts')
            const send = WorkerTransport.prototype.send
            window.__mapRequests = []
            WorkerTransport.prototype.send = function(frame) {
                if (frame.t === 2) window.__mapRequests.push(frame)
                return send.call(this, frame)
            }
        })
        const renderedFrames = async () => {
            const start = await page.evaluate(async () => (await import('/src/babylon/scene/renderer.ts')).Renderer.frame)
            await page.waitForFunction(async start => (await import('/src/babylon/scene/renderer.ts')).Renderer.frame >= start + 30, start)
            assert.deepEqual(errors, [], 'Character rendering raised an error')
            assert.deepEqual(reloads, [], 'Creating or switching characters triggered a development server reload')
            assert.deepEqual(mapRequests, [], 'Ordinary play decoded authoring PNG maps')
            assert.deepEqual(await page.evaluate(() => window.__mapRequests ?? []), [], 'Local play requested terrain chunks from the simulation')
            assert.equal(await page.evaluate(async () => {
                const {Renderer} = await import('/src/babylon/scene/renderer.ts')
                const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
                const {WorldDataManager} = await import('/src/data/worldDataManager.ts')
                const {MyPlayer} = await import('/src/data/myPlayer.ts')
                return WorldDataManager.worldDataMap.get(MyPlayer.worldId).allChunksLoaded
                    && [...EquipManager.equippedItems.keys()].every(type => type.mesh.getScene() === Renderer.scene && !type.mesh.isDisposed())
            }), true, 'Equipment from an old scene survived in the registry')
        }
        const logout = async () => {
            await page.evaluate(async () => {
                window.dispatchEvent(new Event('game:session-ended'))
            })
            await page.locator('#local-character-name').waitFor()
            assert.deepEqual(errors, [], 'Logout raised an error')
            assert.equal(await page.evaluate(async () => (await import('/src/network/connector.ts')).Connector.transport === null), true)
        }
        await page.locator('#local-character-name').fill('CreationHero')
        await page.locator('form button').click()
        await page.waitForFunction(() => {
            const button = document.querySelector('.guest-character-class-option button')
            return button && !button.disabled
        })
        assert.equal(await page.locator('.guest-character-preview canvas').count(), 2)
        assert.deepEqual(errors, [], 'Starter previews raised an error')
        await page.locator('.guest-character-class-option button').first().click()
        await Promise.race([
            page.locator('#renderCanvas.game-session-canvas--visible').waitFor(),
            page.waitForEvent('framenavigated', {predicate: frame => frame === page.mainFrame()}).then(() => {
                throw new Error('Page reloaded after choosing character class')
            }),
        ])
        await renderedFrames()
        const origin = await page.evaluate(async () => {
            const {MyPlayer} = await import('/src/data/myPlayer.ts')
            const {Utils} = await import('/src/utils/utils.ts')
            const char = MyPlayer.myChar
            const origin = char.pos.clone()
            for (let step = 0; step < 8; step++) {
                const angle = step * Math.PI / 4
                const target = origin.clone()
                target.x += Math.cos(angle) * .75
                target.z -= Math.sin(angle) * .75
                if (Utils.isMovementCollision(char.getBoxSize(), origin, target)) continue
                char.startMove('W', angle - Math.PI / 4)
                return {x: origin.x, z: origin.z}
            }
            throw new Error('No clear direction for the movement test')
        })
        await page.waitForFunction(async origin => {
            const {MyPlayer} = await import('/src/data/myPlayer.ts')
            return Math.hypot(MyPlayer.myChar.pos.x - origin.x, MyPlayer.myChar.pos.z - origin.z) >= .25
        }, origin)
        await page.evaluate(async () => (await import('/src/data/myPlayer.ts')).MyPlayer.stopMove())
        await page.waitForFunction(async () => {
            const {Connector} = await import('/src/network/connector.ts')
            return Connector.lastMoveMessage === Connector.lastSentMoveMessage
        })
        const movement = await page.evaluate(async () => {
            const {MyPlayer} = await import('/src/data/myPlayer.ts')
            const {Connector} = await import('/src/network/connector.ts')
            const {listProfiles, loadSave} = await import('/src/local/saveStore.ts')
            await Connector.save()
            const profile = (await listProfiles()).find(profile => profile.name === 'CreationHero')
            const save = JSON.parse(await loadSave(profile.id))
            return {client: {x: MyPlayer.myChar.pos.x, z: MyPlayer.myChar.pos.z}, saved: save.collections.characters[0].gameData}
        })
        assert.ok(Math.hypot(movement.client.x - movement.saved.x, movement.client.z - movement.saved.z) < .1, 'Saved server position differs from the client position')
        await logout()
        if (process.argv.includes('--movement-only')) {
            console.log('PASS: real renderer/player movement, client collision solver, simulation position update, save and logout')
            return
        }
        await page.locator('#local-character-name').fill('SecondHero')
        await page.locator('form button').click()
        await page.locator('.guest-character-class-option button').nth(1).click()
        await page.locator('#renderCanvas.game-session-canvas--visible').waitFor()
        await renderedFrames()
        await logout()
        await page.locator('[data-profile-id]').filter({hasText: 'CreationHero'}).click()
        await page.locator('#renderCanvas.game-session-canvas--visible').waitFor()
        await renderedFrames()
        await logout()
        await page.reload()
        await page.locator('[data-profile-id]').filter({hasText: 'SecondHero'}).click()
        await page.locator('#renderCanvas.game-session-canvas--visible').waitFor()
        await renderedFrames()
        await page.evaluate(async () => (await import('/src/network/connector.ts')).Connector.closeConnection())
        console.log('PASS: fighter and mystic creation, switching profiles without restart, saved profile resume and page reload render without errors')
    } finally {
        await browser?.close()
        await vite.close()
        if (!cacheDir.startsWith(join(root, 'node_modules/.vite-character-test-'))) throw new Error('Unsafe test cache cleanup')
        await rm(cacheDir, {recursive: true, force: true})
    }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
