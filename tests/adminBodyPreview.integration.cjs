const assert = require('node:assert/strict')
const {chromium} = require('playwright-core')
const {createServer} = require('vite')

async function main() {
    let server, browser
    try {
        server = await createServer({server: {host: '127.0.0.1', port: 0, strictPort: false}, logLevel: 'warn'})
        await server.listen()
        browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']})
        const page = await browser.newPage({viewport: {width: 1440, height: 1000}})
        page.setDefaultTimeout(90000)
        const errors = [], sockets = []
        page.on('pageerror', error => errors.push(String(error)))
        page.on('console', message => {if (message.type() === 'error') errors.push(message.text())})
        page.on('websocket', socket => {if (/:3000(?:\/|$)|\/ws(?:\?|$)/.test(socket.url())) sockets.push(socket.url())})
        page.on('dialog', dialog => dialog.accept())
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/adminUtils`)
        const variant = page.locator('#adminUtilsBodyVariant')
        await variant.waitFor()
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        const snapshot = () => page.evaluate(async () => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const items = [...EquipManager.equippedItems.values()].flatMap(set => [...set])
            const owners = [...new Set(items.map(item => item.parent))].filter(owner => owner.node?.isEnabled())
            return owners.map(owner => ({
                texture: owner.model.getChildMeshes().find(mesh => mesh.skeleton)?.material.albedoTexture.name,
                slots: [...owner.equipSet.keys()],
                animation: owner.actualAnim?.name,
                bodyX: owner.equipSet.get('BODY')?.modelModifierMatrix?.getTranslation().x,
                allBonesPresent: [...owner.equipSet.values()].every(item => !!item.bone),
            }))
        })
        const male = await snapshot()
        assert.equal(male.length, 1)
        assert.match(male[0].texture, /human_male\.png/)
        assert.ok(male[0].slots.includes('FACE'))
        assert.ok(male[0].slots.includes('HEAD'), 'adminUtils keeps helmet authoring available')
        await page.evaluate(async () => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const {CharacterModel} = await import('/src/babylon/character/characterModel.ts')
            const preview = [...EquipManager.equippedItems.values()].flatMap(set => [...set]).find(item => item.parent.node?.isEnabled()).parent
            for (const modelId of [1100, 2100]) {
                const owner = {...preview.parent, id: -2, equipSet: new Map([['HEAD', {modelId, materialId: 1}]])}
                const model = await CharacterModel.create(owner, true)
                try {
                    const check = () => {
                        if (model.equipSet.has('HEAD')) throw new Error('A game character renders a helmet')
                        if (!owner.equipSet.has('HEAD')) throw new Error('Helmet disappeared from equipment data')
                        if (model.equipSet.get('HAIR')?.type.mesh.name !== 'character-hair-1') throw new Error('Hidden helmet changes hair')
                    }
                    check()
                    model.clearAllEquippedItems()
                    model.assignEquippedItems()
                    model.assignHelmet(modelId, 0)
                    await model.refreshHairAppearance()
                    check()
                } finally {
                    model.removeFromScene()
                }
            }
        })
        const armorGeometry = (modelId = 2000) => page.evaluate(async modelId => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const item = [...EquipManager.equippedItems.values()].flatMap(set => [...set])
                .find(item => item.type.id === modelId && item.parent.node?.isEnabled())
            return {positions: Array.from(item.type.mesh.getVerticesData('position')), material: item.type.mesh.material.uniqueId}
        }, modelId)
        const checkFemaleArmor = (modelId, file) => page.evaluate(async ([modelId, file]) => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const {loadRawArmorGeometry} = await import('/src/babylon/character/characterEquipmentFitting.ts')
            const item = [...EquipManager.equippedItems.values()].flatMap(set => [...set])
                .find(item => item.type.id === modelId && item.parent.node?.isEnabled())
            const expected = await loadRawArmorGeometry(item.type.mesh.getScene(), file)
            const actual = item.type.mesh.getVerticesData('position')
            if (actual.length !== expected.positions.length || actual.some((v, i) => Math.abs(v - expected.positions[i]) > 1e-6)) {
                throw new Error(`Female preview does not use ${file}`)
            }
        }, [modelId, file])
        const malePlateGeometry = await armorGeometry(1000)
        await page.locator('[data-slot="body"]').selectOption('2000')
        const maleChain = (await snapshot())[0]
        const maleChainGeometry = await armorGeometry()
        await variant.selectOption('female')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        let female = await snapshot()
        assert.equal(female.length, 1)
        assert.match(female[0].texture, /human_female\.png/)
        assert.ok(!female[0].slots.includes('FACE') && !female[0].slots.includes('HAIR'))
        assert.ok(female[0].allBonesPresent)
        const femaleChainGeometry = await armorGeometry()
        assert.equal(femaleChainGeometry.material, maleChainGeometry.material, 'both armor shapes share the same atlas material')
        assert.notDeepEqual(femaleChainGeometry.positions, maleChainGeometry.positions)
        await checkFemaleArmor(2000, 'female-armor-chain.glb')
        await page.locator('#adminUtilsAnimation').selectOption('walk')
        assert.equal((await snapshot())[0].animation, 'Walk')
        await page.locator('[data-modifier-toggle="body"]').click()
        const offset = page.locator('[data-modifier-editor="body"] [data-modifier-component="position"][data-modifier-axis="x"]')
        await offset.fill('0.123')
        assert.ok(Math.abs((await snapshot())[0].bodyX - 0.123) < 1e-6)
        await variant.selectOption('male')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        assert.ok(Math.abs((await snapshot())[0].bodyX - maleChain.bodyX) < 1e-6)
        assert.deepEqual(await armorGeometry(), maleChainGeometry, 'male chain geometry survives switching')
        await variant.selectOption('female')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        assert.ok(Math.abs((await snapshot())[0].bodyX - 0.123) < 1e-6)
        assert.deepEqual(await armorGeometry(), femaleChainGeometry, 'female geometry survives switching')
        await page.locator('[data-slot="body"]').selectOption('1000')
        const femalePlateGeometry = await armorGeometry(1000)
        assert.equal(femalePlateGeometry.material, malePlateGeometry.material, 'plate variants share the atlas material')
        assert.notDeepEqual(femalePlateGeometry.positions, malePlateGeometry.positions)
        await checkFemaleArmor(1000, 'female-armor-plate.glb')
        await variant.selectOption('male')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        assert.deepEqual(await armorGeometry(1000), malePlateGeometry, 'male plate geometry survives switching')
        await variant.selectOption('female')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        assert.deepEqual(await armorGeometry(1000), femalePlateGeometry, 'female plate geometry survives switching')
        // All preset animations must be selectable with this GLB.
        for (const animation of await page.locator('#adminUtilsAnimation option').evaluateAll(options => options.map(option => option.value))) {
            await page.locator('#adminUtilsAnimation').selectOption(animation)
        }
        await page.locator('#adminUtilsAnimation').selectOption('idle')
        for (const slot of ['body', 'head', 'pauldrons', 'legs', 'shield', 'weapon']) {
            await page.locator(`[data-slot="${slot}"]`).selectOption('')
        }
        if (process.env.ADMIN_PREVIEW_SCREENSHOT) await page.screenshot({path: process.env.ADMIN_PREVIEW_SCREENSHOT})
        await page.reload()
        await page.waitForFunction(() => document.querySelector('#adminUtilsBodyVariant')?.disabled === false)
        assert.equal(await variant.inputValue(), 'female')
        assert.deepEqual(sockets, [], 'adminUtils must remain offline')
        assert.deepEqual(errors, [])
        console.log('PASS: male/female meshes, texture, bones, animations, independent offsets and remembered selection')
    } finally {
        await browser?.close()
        await server?.close()
    }
}

main().catch(error => {console.error(error); process.exitCode = 1})
