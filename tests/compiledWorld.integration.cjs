const assert = require('node:assert/strict')
const {resolve, join} = require('node:path')
const {chromium} = require('playwright-core')

async function main() {
    const root = resolve(__dirname, '..')
    const {preview} = await import('vite')
    const server = await preview({root, configFile: join(root, 'vite.config.js'), preview: {host: '127.0.0.1', port: 0}, logLevel: 'warn'})
    let browser
    try {
        browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']})
        const page = await browser.newPage({viewport: {width: 1280, height: 800}})
        page.setDefaultTimeout(90000)
        const errors = [], terrain = [], png = [], sockets = []
        page.on('pageerror', error => errors.push(error.stack))
        page.on('console', message => { if (message.type() === 'error' && /game|TypeError|Error:/.test(message.text())) errors.push(message.text()) })
        page.on('request', request => {
            if (/\/world\/assets\/terrain\/.*\.dlm/.test(request.url())) terrain.push(request.url())
            if (/\/world\/assets\/maps\/.*\.png/.test(request.url())) png.push(request.url())
        })
        page.on('websocket', socket => sockets.push(socket.url()))
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
        await page.locator('#local-character-name').fill('PackagedHero')
        assert.equal(await page.locator('#local-character-gm').count(), 0)
        await page.locator('form button').click()
        await page.getByRole('button', {name: 'FIGHTER', exact: true}).click()
        const rendered = async () => {
            await page.locator('#renderCanvas.game-session-canvas--visible').waitFor()
            await page.evaluate(() => new Promise(resolve => {
                let count = 0
                const frame = () => ++count >= 30 ? resolve() : requestAnimationFrame(frame)
                requestAnimationFrame(frame)
            }))
            assert.deepEqual(errors, [])
        }
        await rendered()
        assert.equal(page.workers().filter(worker => /game\.worker/.test(worker.url())).length, 1)
        await page.evaluate(() => window.dispatchEvent(new Event('game:session-ended')))
        await page.locator('#local-character-name').waitFor()
        const profile = await page.evaluate(() => new Promise((resolve, reject) => {
            const request = indexedDB.open('darkenlight-saves', 2)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
                const db = request.result, tx = db.transaction(['profiles', 'saves'])
                const profiles = tx.objectStore('profiles').getAll(), saves = tx.objectStore('saves').getAll()
                tx.oncomplete = () => { db.close(); resolve({profiles: profiles.result, saves: saves.result}) }
            }
        }))
        assert.equal(profile.profiles.length, 1)
        assert.deepEqual(Object.keys(JSON.parse(profile.saves[0]).collections).sort(), ['characters', 'counters'])
        await page.locator(`[data-profile-id="${profile.profiles[0].id}"]`).click()
        await rendered()
        await page.evaluate(() => window.dispatchEvent(new Event('game:session-ended')))
        await page.locator('#local-character-name').waitFor()
        assert.equal(new Set(terrain).size, 2)
        assert.deepEqual(png, [])
        assert.deepEqual(sockets, [])
        assert.deepEqual(errors, [])
        console.log('PASS: production web build loads two binary terrains without map PNGs or WebSockets, renders, saves, logs out and restores a profile')
    } finally {
        await browser?.close()
        await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
    }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
