const assert = require('node:assert/strict')
const {join, resolve} = require('node:path')
const {chromium} = require('playwright-core')

async function main() {
    const root = resolve(__dirname, '..')
    process.env.VITE_GM_MODE = 'true'
    const {createServer} = await import('vite')
    const vite = await createServer({root, configFile: join(root, 'vite.config.js'), server: {host: '127.0.0.1', port: 0}, logLevel: 'warn'})
    let browser
    try {
        await vite.listen()
        browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']})
        const page = await browser.newPage({viewport: {width: 1280, height: 800}})
        page.setDefaultTimeout(60000)
        const errors = []
        page.on('pageerror', error => errors.push(error.stack))
        await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`)
        await page.locator('#local-character-name').waitFor()
        const profiles = await page.evaluate(async () => {
            const store = await import('/src/local/saveStore.ts')
            const hero = await store.createProfile('DeleteHero', false, 'FIGHTER')
            const gm = await store.createProfile('KeepGM', true, 'MYSTIC')
            await store.writeSave(hero.id, 'hero-save')
            await store.writeSave(gm.id, 'gm-save')
            return {hero, gm}
        })
        await page.reload()
        const remove = page.locator(`[data-delete-profile-id="${profiles.hero.id}"]`)
        await remove.click()
        await page.getByText(/DeleteHero.*trvale smazány/).waitFor()
        await page.getByRole('button', {name: 'Zrušit', exact: true}).click()
        assert.equal(await page.locator(`[data-profile-id="${profiles.hero.id}"]`).count(), 1)
        assert.equal(await page.evaluate(async id => (await import('/src/local/saveStore.ts')).loadSave(id), profiles.hero.id), 'hero-save')
        await remove.click()
        await page.getByRole('button', {name: 'Smazat', exact: true}).click()
        await page.locator(`[data-profile-id="${profiles.hero.id}"]`).waitFor({state: 'detached'})
        const remaining = await page.evaluate(async ({hero, gm}) => {
            const store = await import('/src/local/saveStore.ts')
            return {profiles: await store.listProfiles(), deletedSave: await store.loadSave(hero.id), retainedSave: await store.loadSave(gm.id)}
        }, profiles)
        assert.deepEqual(remaining.profiles.map(profile => profile.id), [profiles.gm.id])
        assert.equal(remaining.deletedSave, null)
        assert.equal(remaining.retainedSave, 'gm-save')
        await page.reload()
        await page.locator(`[data-delete-profile-id="${profiles.gm.id}"]`).click()
        await page.getByRole('button', {name: 'Smazat', exact: true}).click()
        await page.getByText('Zatím nemáš žádnou uloženou postavu.').waitFor()
        assert.equal(await page.evaluate(async id => (await import('/src/local/saveStore.ts')).loadSave(id), profiles.gm.id), null)
        await page.reload()
        await page.getByText('Zatím nemáš žádnou uloženou postavu.').waitFor()
        const nativeCalls = await page.evaluate(async id => {
            const calls = []
            window.__TAURI_INTERNALS__ = {invoke: async (command, args) => { calls.push({command, args}) }}
            try { await (await import('/src/local/saveStore.ts')).deleteProfile(id) }
            finally { delete window.__TAURI_INTERNALS__ }
            return calls
        }, profiles.hero.id)
        assert.deepEqual(nativeCalls, [{command: 'delete_character_profile', args: {id: profiles.hero.id}}])
        assert.deepEqual(errors, [])
        console.log('PASS: cancel preserves save; confirmed player/GM deletion removes profile and save, preserves other characters and survives reload; desktop command dispatch verified')
    } finally {
        await browser?.close()
        await vite.close()
    }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
