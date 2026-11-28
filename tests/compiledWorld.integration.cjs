const assert = require('node:assert/strict')
const {resolve, join} = require('node:path')
const {chromium} = require('playwright-core')

async function main() {
    const root = resolve(__dirname, '..')
    const {preview} = await import('vite')
    const server = await preview({root, configFile: join(root, 'vite.config.js'),
        build: {outDir: process.env.DARKENLIGHT_TEST_DIST ?? 'dist'}, preview: {host: '127.0.0.1', port: 0}, logLevel: 'warn'})
    let browser
    try {
        browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']})
        const page = await browser.newPage({serviceWorkers: 'block', viewport: {width: 1280, height: 800}})
        page.setDefaultTimeout(90000)
        const errors = [], terrain = [], renderAssets = [], png = [], sockets = []
        page.on('pageerror', error => errors.push(error.stack))
        page.on('console', message => {
            if (message.text().startsWith('[POI world=')) errors.push('Production rebuilt navigation: ' + message.text())
            if (message.type() === 'error' && /game|TypeError|Error:/.test(message.text())) errors.push(message.text())
        })
        page.on('request', request => {
            if (/\/world\/assets\/terrain\/.*\.dlm/.test(request.url())) terrain.push(request.url())
            if (/\/world\/assets\/maps\/.*\.png/.test(request.url())) png.push(request.url())
        })
        page.on('response', response => {
            if (response.ok() && new URL(response.url()).pathname.endsWith('.dlr')) renderAssets.push(response.url())
        })
        page.on('websocket', socket => sockets.push(socket.url()))
        const url = `http://127.0.0.1:${server.httpServer.address().port}/`
        await page.goto(url)
        await page.locator('#local-character-name').fill('PackagedHero')
        assert.equal(await page.locator('#local-character-gm').isChecked(), false)
        await page.locator('form button').click()
        await page.locator('.guest-character-class-label').filter({has: page.locator('.guest-character-creation-class--fighter')}).click()
        await page.locator('.guest-character-creation-continue-action').click()
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
        assert.ok(renderAssets.length > 0, 'The release client should fetch precomputed terrain')
        assert.deepEqual(png, [])
        assert.deepEqual(sockets, [])
        assert.deepEqual(errors, [])
        console.log('PASS: production web build loads binary maps and precomputed terrain, renders, saves, logs out and restores a profile without map PNGs or WebSockets')

        const mobile = await browser.newPage({serviceWorkers: 'block', viewport: {width: 844, height: 390},
            deviceScaleFactor: 2, isMobile: true, hasTouch: true})
        mobile.setDefaultTimeout(120000)
        mobile.on('pageerror', error => errors.push(error.stack))
        const authoringRequests = []
        mobile.on('request', request => {
            if (new URL(request.url()).pathname === '/__game_io') authoringRequests.push(request.url())
        })
        await mobile.goto(url)
        await mobile.locator('#local-character-name').fill('PackagedGM')
        await mobile.locator('label[for="local-character-gm"]').tap()
        assert.equal(await mobile.locator('#local-character-authoring').count(), 0)
        await mobile.locator('form button').tap()
        await mobile.locator('#gm-system-buttons').waitFor()
        await mobile.evaluate(() => window.dispatchEvent(new Event('game:session-ended')))
        await mobile.locator('[data-profile-id]').tap()
        await mobile.locator('#gm-system-buttons').waitFor()
        assert.deepEqual(authoringRequests, [])
        assert.deepEqual(errors, [])
        console.log('PASS: packaged GM creation and save reload use the bundled world')
    } finally {
        await browser?.close()
        await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
    }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
