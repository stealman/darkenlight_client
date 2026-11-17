const assert = require('node:assert/strict')
const {join, resolve} = require('node:path')
const {chromium} = require('playwright-core')
const {mkdtemp, rm} = require('node:fs/promises')

async function main() {
    const root = resolve(__dirname, '..')
    process.env.VITE_GM_MODE = 'false'
    const cacheDir = await mkdtemp(join(root, 'node_modules/.vite-fullscreen-test-'))
    const {createServer} = await import('vite')
    const vite = await createServer({root, cacheDir, configFile: join(root, 'vite.config.js'), server: {host: '127.0.0.1', port: 0}, logLevel: 'warn'})
    let browser
    try {
        await vite.listen()
        browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']})
        const page = await browser.newPage({viewport: {width: 1280, height: 800}})
        page.setDefaultTimeout(90000)
        const errors = []
        page.on('pageerror', error => errors.push(error.stack))
        await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`)
        await page.locator('#local-character-name').waitFor()
        await page.evaluate(async () => {
            const {Settings} = await import('/src/settings/settings.ts')
            const {Renderer} = await import('/src/babylon/scene/renderer.ts')
            Settings.deviceType = 'PHONE'
            window.__fullscreenCalls = []
            const request = Renderer.requestFullscreen.bind(Renderer)
            Renderer.requestFullscreen = () => {
                window.__fullscreenCalls.push(navigator.userActivation.isActive)
                return request()
            }
        })
        await page.locator('#local-character-name').fill('FullscreenHero')
        await page.locator('form button').click()
        assert.deepEqual(await page.evaluate(() => window.__fullscreenCalls), [], 'Choosing a name must not enter fullscreen yet')
        await page.getByRole('button', {name: 'FIGHTER', exact: true}).click()
        await page.waitForFunction(() => !!document.fullscreenElement)
        assert.deepEqual(await page.evaluate(() => window.__fullscreenCalls), [true], 'Creation lost its user gesture before fullscreen')
        await page.locator('#renderCanvas.game-session-canvas--visible').waitFor()
        const logout = async () => {
            await page.evaluate(async () => {
                if (document.fullscreenElement) await document.exitFullscreen()
                window.dispatchEvent(new Event('game:session-ended'))
            })
            await page.locator('#local-character-name').waitFor()
        }
        await logout()
        await page.locator('[data-profile-id]').click()
        await page.waitForFunction(() => !!document.fullscreenElement)
        assert.deepEqual(await page.evaluate(() => window.__fullscreenCalls), [true, true], 'Saved-character selection lost its user gesture')
        await page.locator('#renderCanvas.game-session-canvas--visible').waitFor()
        await logout()
        await page.evaluate(async () => {
            const {Renderer} = await import('/src/babylon/scene/renderer.ts')
            Renderer.requestFullscreen = () => Promise.reject(new Error('Simulated fullscreen refusal'))
        })
        await page.locator('[data-profile-id]').click()
        await page.locator('#renderCanvas.game-session-canvas--visible').waitFor()
        assert.equal(await page.evaluate(() => document.fullscreenElement === null), true)
        assert.deepEqual(errors, [], 'Fullscreen failure must not interrupt game entry')
        await logout()
        console.log('PASS: character creation and resume enter real fullscreen with an active user gesture; refusal still allows playing')
    } finally {
        await browser?.close()
        await vite.close()
        if (!cacheDir.startsWith(join(root, 'node_modules/.vite-fullscreen-test-'))) throw new Error('Unsafe test cache cleanup')
        await rm(cacheDir, {recursive: true, force: true})
    }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
