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
                bodyUnlit: owner.model.getChildMeshes().find(mesh => mesh.skeleton)?.material.unlit,
                bodyLights: owner.model.getChildMeshes().find(mesh => mesh.skeleton)?.lightSources.map(light => [light.name, light.intensity]),
                slots: [...owner.equipSet.keys()],
                animation: owner.actualAnim?.name,
                bodyX: owner.equipSet.get('BODY')?.modelModifierMatrix?.getTranslation().x,
                allBonesPresent: [...owner.equipSet.values()].every(item => !!item.bone),
                hair: owner.equipSet.has('HAIR') ? {
                    name: owner.equipSet.get('HAIR').type.mesh.name,
                    texture: owner.equipSet.get('HAIR').type.mesh.material.albedoTexture.name,
                    bone: owner.equipSet.get('HAIR').bone.name,
                    x: owner.equipSet.get('HAIR').attachmentLocalMatrix.getTranslation().x,
                    lights: owner.equipSet.get('HAIR').type.mesh.lightSources.map(light => [light.name, light.intensity]),
                } : null,
                head: owner.equipSet.has('FACE') ? {
                    texture: owner.equipSet.get('FACE').type.mesh.material.albedoTexture.name,
                    unlit: owner.equipSet.get('FACE').type.mesh.material.unlit,
                    lights: owner.equipSet.get('FACE').type.mesh.lightSources.map(light => [light.name, light.intensity]),
                    bone: owner.equipSet.get('FACE').bone.name,
                    x: owner.equipSet.get('FACE').attachmentLocalMatrix.getTranslation().x,
                } : null,
            }))
        })
        const male = await snapshot()
        assert.equal(male.length, 1)
        assert.match(male[0].texture, /human_male\.png/)
        assert.ok(male[0].slots.includes('FACE'))
        assert.deepEqual(male[0].head.lights, male[0].bodyLights)
        assert.ok(male[0].head.lights.some(([name, intensity]) => name === 'adminUtilsFillLight' && intensity === 0.85))
        assert.ok(male[0].head.lights.some(([name, intensity]) => name === 'adminUtilsBackLight' && intensity === 1.4))
        assert.ok(male[0].slots.includes('HEAD'), 'adminUtils keeps helmet authoring available')
        await page.evaluate(async () => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const {CharacterModel} = await import('/src/babylon/character/characterModel.ts')
            const {default: Character} = await import('/src/babylon/character/character.ts')
            const {Npc, Guard} = await import('/src/babylon/npc/npc.ts')
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
            for (const gender of ['M', 'F']) {
                for (const modelId of [1100, 2100]) {
                    for (const role of ['player', 'bot', 'npc', 'guard']) {
                        const data = {id: -3, name: 'Helmet test', gender, x: 1, z: 1, cls: 'FIGHTER', bsz: 0.8,
                            bot: role === 'bot', type: 'common', bodyType: 'steve',
                            equipment: {head: {modelId, materialId: 1}},
                            equipSet: {head: {id: -4, cb: 10, tp: 'A', mId: modelId, matId: 1, img: '', atts: {}}}}
                        const character = role === 'npc' ? new Npc(data) : role === 'guard'
                            ? new Guard({...data, guard: {...data, definitionId: 1}})
                            : new Character(data, false, preview.parent.pos)
                        character.insideView = true
                        await character.createModel(true)
                        try {
                            const visibleHelmet = role === 'npc' || role === 'guard'
                            if (character.model.equipSet.has('HEAD') !== visibleHelmet) throw new Error(`${gender} ${role}: wrong helmet visibility`)
                            if (!character.equipSet.has('HEAD')) throw new Error(`${role}: helmet lost from equipment`)
                            const hairName = character.model.equipSet.get('HAIR')?.type.mesh.name
                            const hideHair = visibleHelmet && (role === 'guard' || modelId === 1100 || gender === 'M')
                            const expected = hideHair ? undefined : gender === 'F' ? 'character-female-hair-1' : 'character-hair-1'
                            if (hairName !== expected) throw new Error(`${gender} ${role}: wrong hair visibility with helmet`)
                            if (visibleHelmet) {
                                character.changeAppearance('steve', {})
                                await character.model.refreshHairAppearance()
                                if (character.model.equipSet.has('HEAD')) throw new Error(`${role}: removed helmet still visible`)
                                character.changeAppearance('steve', data.equipment)
                                await character.model.refreshHairAppearance()
                                if (!character.model.equipSet.has('HEAD')) throw new Error(`${role}: equipped helmet missing`)
                                await character.changeCharacterAppearance({gender: gender === 'F' ? 'M' : 'F'})
                                if (!character.model.equipSet.has('HEAD')) throw new Error(`${role}: gender change hid the helmet`)
                            }
                        } finally {
                            character.model.removeFromScene()
                        }
                    }
                }
            }
        })
        const armorGeometry = (modelId = 2000) => page.evaluate(async modelId => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const item = [...EquipManager.equippedItems.values()].flatMap(set => [...set])
                .find(item => item.type.id === modelId && item.parent.node?.isEnabled())
            return {positions: Array.from(item.type.mesh.getVerticesData('position')), material: item.type.mesh.material.uniqueId}
        }, modelId)
        const checkArmorGeometry = (modelId, file) => page.evaluate(async ([modelId, file]) => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const {loadRawArmorGeometry} = await import('/src/babylon/character/characterEquipmentFitting.ts')
            const item = [...EquipManager.equippedItems.values()].flatMap(set => [...set])
                .find(item => item.type.id === modelId && item.parent.node?.isEnabled())
            const expected = await loadRawArmorGeometry(item.type.mesh.getScene(), file)
            const actual = item.type.mesh.getVerticesData('position')
            if (actual.length !== expected.positions.length || actual.some((v, i) => Math.abs(v - expected.positions[i]) > 1e-6)) {
                throw new Error(`Preview does not use ${file}`)
            }
        }, [modelId, file])
        const checkLeatherMaterial = (modelId, file) => page.waitForFunction(async ([modelId, file]) => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const {type: {mesh}} = [...EquipManager.equippedItems.values()].flatMap(set => [...set])
                .find(item => item.type.id === modelId && item.parent.node?.isEnabled())
            const material = mesh.material
            const orientation = material.sideOrientation ?? mesh.sideOrientation
            const rawMeshOrientation = mesh.getScene().useRightHandedSystem ? 0 : 1
            if (orientation !== rawMeshOrientation) throw new Error(`Reversed front faces on ${mesh.name}`)
            const texture = material.bumpTexture
            if (file == null ? texture != null : !texture?.url.includes('/' + file + '?') || texture.gammaSpace) {
                throw new Error(`Unexpected normal map on ${mesh.name}: ${texture?.url}`)
            }
            return mesh.subMeshes[0].effect?.isReady() && (file == null || texture.isReady())
        }, [Number(modelId), file], {timeout: 10000})
        const malePlateGeometry = await armorGeometry(1000)
        assert.equal(male[0].hair, null, 'plate helmet hides hair in the preview')
        await page.locator('[data-slot="head"]').selectOption('')
        await page.waitForFunction(() => !document.querySelector('[data-hair-gender="M"] select').disabled)
        const maleHair = (await snapshot())[0].hair
        await page.locator('[data-slot="body"]').selectOption('2000')
        const maleChain = (await snapshot())[0]
        const maleChainGeometry = await armorGeometry()
        await variant.selectOption('female')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        let female = await snapshot()
        assert.equal(female.length, 1)
        assert.match(female[0].texture, /human_female\.png/)
        assert.deepEqual(female[0].head.lights, male[0].head.lights, 'female head gets the same studio lighting as the male head')
        assert.deepEqual(female[0].head.lights, female[0].bodyLights)
        assert.ok(female[0].slots.includes('FACE') && female[0].slots.includes('HAIR'))
        assert.match(female[0].hair.texture, /human_female_hair_1_atlas\.png/)
        assert.equal(female[0].hair.bone, 'Head')
        assert.deepEqual(female[0].hair.lights, female[0].head.lights)
        const femaleHair = page.locator('[data-hair-gender="F"]')
        const femaleStyle = femaleHair.locator('select').first()
        assert.equal(await femaleStyle.inputValue(), '1')
        assert.equal(await femaleStyle.locator('option').count(), 4)
        assert.equal(await femaleHair.locator('select').nth(1).locator('option').count(), 16)
        for (const id of [3, 4]) {
            await femaleStyle.selectOption(String(id))
            await page.waitForFunction(() => !document.querySelector('[data-hair-gender="F"] select').disabled)
            assert.equal((await snapshot())[0].hair.name, `character-female-hair-${id}`)
        }
        await femaleStyle.selectOption('2')
        await page.waitForFunction(() => !document.querySelector('[data-hair-gender="F"] select').disabled)
        assert.equal((await snapshot())[0].hair.name, 'character-female-hair-2')
        await femaleHair.locator('[data-modifier-component="position"][data-modifier-axis="x"]').fill('0.3456')
        assert.ok(Math.abs((await snapshot())[0].hair.x - 0.3456) < 1e-6)
        await page.evaluate(async () => {
            const {CharacterModel} = await import('/src/babylon/character/characterModel.ts')
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const preview = [...EquipManager.equippedItems.values()].flatMap(set => [...set]).find(item => item.parent.node?.isEnabled()).parent
            const owner = {...preview.parent, id: -20, hairTypeId: 2, equipSet: new Map()}
            const model = await CharacterModel.create(owner, true)
            try {
                if (model.equipSet.get('HAIR')?.type.mesh.name !== 'character-female-hair-2') throw new Error('Runtime female hairstyle 2 missing')
                for (const id of [3, 4]) {
                    owner.hairTypeId = id
                    await model.refreshHairAppearance()
                    if (model.equipSet.get('HAIR')?.type.mesh.name !== `character-female-hair-${id}`) throw new Error(`Runtime female hairstyle ${id} missing`)
                }
                owner.hairTypeId = 1
                await model.refreshHairAppearance()
                if (model.equipSet.get('HAIR')?.type.mesh.name !== 'character-female-hair-1') throw new Error('Runtime hair switch failed')
            } finally { model.removeFromScene() }
        })
        await femaleStyle.selectOption('1')
        await page.waitForFunction(() => !document.querySelector('[data-hair-gender="F"] select').disabled)
        await femaleHair.locator('[data-modifier-component="position"][data-modifier-axis="x"]').fill('0.2345')
        assert.ok(Math.abs((await snapshot())[0].hair.x - 0.2345) < 1e-6)
        assert.match(female[0].head.texture, /human_female_head_1\.png/)
        assert.equal(female[0].head.bone, 'Head')
        assert.equal(female[0].bodyUnlit, false)
        assert.equal(female[0].head.unlit, false)
        const femaleHead = page.locator('[data-head-gender="F"]')
        await femaleHead.evaluate(panel => {panel.open = true})
        await femaleHead.locator('[data-modifier-component="position"][data-modifier-axis="x"]').fill('0.1234')
        assert.ok(Math.abs((await snapshot())[0].head.x - 0.1234) < 1e-6)
        assert.ok(female[0].allBonesPresent)
        const femaleChainGeometry = await armorGeometry()
        assert.equal(femaleChainGeometry.material, maleChainGeometry.material, 'both armor shapes share the same atlas material')
        assert.notDeepEqual(femaleChainGeometry.positions, maleChainGeometry.positions)
        await checkArmorGeometry(2000, 'female-armor-chain.glb')
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
        assert.equal((await snapshot())[0].head.x, male[0].head.x, 'female head fitting preserves the male head')
        assert.equal((await snapshot())[0].hair.x, maleHair.x, 'female hair fitting preserves male hair')
        await variant.selectOption('female')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        assert.ok(Math.abs((await snapshot())[0].bodyX - 0.123) < 1e-6)
        assert.deepEqual(await armorGeometry(), femaleChainGeometry, 'female geometry survives switching')
        assert.ok(Math.abs((await snapshot())[0].head.x - 0.1234) < 1e-6)
        assert.ok(Math.abs((await snapshot())[0].hair.x - 0.2345) < 1e-6)
        await page.locator('[data-slot="body"]').selectOption('1000')
        const femalePlateGeometry = await armorGeometry(1000)
        assert.equal(femalePlateGeometry.material, malePlateGeometry.material, 'plate variants share the atlas material')
        assert.notDeepEqual(femalePlateGeometry.positions, malePlateGeometry.positions)
        await checkArmorGeometry(1000, 'female-armor-plate.glb')
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
        assert.ok(Math.abs((await snapshot())[0].head.x - 0.1234) < 1e-6, 'female head fitting survives reload')
        const bodySelect = page.locator('[data-slot="body"]')
        const leatherOption = bodySelect.locator('option').filter({hasText: 'Kožená zbroj'})
        const leatherId = await leatherOption.getAttribute('value')
        const femaleModifiers = require('../public/admin-utils/equipment-modifiers-female.json').equipment
        await variant.selectOption('male')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        await bodySelect.selectOption(leatherId)
        const pauldrons = page.locator('[data-slot="pauldrons"]')
        const leatherPauldronId = await pauldrons.locator('option').filter({hasText: 'Kožené nárameníky'}).getAttribute('value')
        const malePauldronDefaults = require('../public/admin-utils/equipment-modifiers.json').pauldrons
        const femalePauldronDefaults = require('../public/admin-utils/equipment-modifiers-female.json').pauldrons
        await pauldrons.selectOption(leatherPauldronId)
        const pauldronGeometry = await armorGeometry(Number(leatherPauldronId))
        await checkArmorGeometry(Number(leatherPauldronId), 'pauldron-leather.glb')
        const legs = page.locator('[data-slot="legs"]')
        const leatherLegId = await legs.locator('option').filter({hasText: 'Kožené náholenice'}).getAttribute('value')
        await legs.selectOption(leatherLegId)
        const leatherLegGeometry = await armorGeometry(Number(leatherLegId))
        await checkArmorGeometry(Number(leatherLegId), 'male-leg-leather.glb')
        const helmets = page.locator('[data-slot="head"]')
        const leatherHelmetId = await helmets.locator('option').filter({hasText: 'Kožená helma'}).getAttribute('value')
        await helmets.selectOption(leatherHelmetId)
        const leatherHelmetGeometry = await armorGeometry(Number(leatherHelmetId))
        await checkArmorGeometry(Number(leatherHelmetId), 'helmet-leather.glb')
        await checkLeatherMaterial(leatherId, 'leather_armor_male_normal.png')
        await checkLeatherMaterial(leatherPauldronId, 'leather_pauldron_normal.png')
        await checkLeatherMaterial(leatherLegId, 'leather_leg_normal.png')
        await checkLeatherMaterial(leatherHelmetId, null)
        assert.equal((await snapshot())[0].hair, null)
        await page.locator('[data-modifier-toggle="head"]').click()
        const helmetX = page.locator('[data-modifier-editor="head"] [data-modifier-component="position"][data-modifier-axis="x"]')
        await helmetX.fill('0.19')
        const leatherMaterial = page.locator('[data-material-slot="body"]')
        assert.deepEqual(await leatherMaterial.locator('option').allTextContents(),
            ['Common Leather', 'Hard Leather', 'Wolf Leather', 'Lizard Leather', 'Dragon Leather'])
        const pauldronMaterial = page.locator('[data-material-slot="pauldrons"]')
        assert.deepEqual(await pauldronMaterial.locator('option').allTextContents(), await leatherMaterial.locator('option').allTextContents())
        await pauldronMaterial.selectOption({label: 'Dragon Leather'})
        const legMaterial = page.locator('[data-material-slot="legs"]')
        assert.deepEqual(await legMaterial.locator('option').allTextContents(), await leatherMaterial.locator('option').allTextContents())
        await legMaterial.selectOption({label: 'Dragon Leather'})
        const helmetMaterial = page.locator('[data-material-slot="head"]')
        assert.deepEqual(await helmetMaterial.locator('option').allTextContents(), await leatherMaterial.locator('option').allTextContents())
        await helmetMaterial.selectOption({label: 'Dragon Leather'})
        await leatherMaterial.selectOption({label: 'Dragon Leather'})
        const maleLeatherGeometry = await armorGeometry(Number(leatherId))
        const dragonControls = page.locator('[data-atlas-family="leather"]').filter({hasText: 'Dragon Leather'})
        const leatherHue = dragonControls.locator('[data-atlas-parameter="hueR"]')
        const leatherAtlasHashes = () => page.evaluate(async id => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const scene = EquipManager.getItemType(id).mesh.getScene()
            return Promise.all([
                'adminUtilsMaleLeatherTorsoAtlas', 'adminUtilsFemaleLeatherTorsoAtlas',
                'adminUtilsLeatherPauldronAtlas', 'adminUtilsLeatherLegAtlas', 'adminUtilsLeatherHelmetAtlas',
            ].map(async name => {
                const texture = scene.getTextureByName(name)
                const context = texture.getContext()
                const {width, height} = texture.getSize()
                const pixels = context.getImageData(0, 0, width, height).data
                return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)))
            }))
        }, Number(leatherId))
        const before = await leatherAtlasHashes()
        await leatherHue.fill('28')
        await dragonControls.locator('[data-confirm-atlas-material]').click()
        const after = await leatherAtlasHashes()
        assert.notDeepEqual(after[0], before[0], 'the shared controls update the male atlas')
        assert.notDeepEqual(after[1], before[1], 'the shared controls update the female atlas')
        assert.notDeepEqual(after[2], before[2], 'the shared controls update the pauldron atlas')
        assert.notDeepEqual(after[3], before[3], 'the shared controls update the leg atlas')
        assert.notDeepEqual(after[4], before[4], 'the shared controls update the helmet atlas')
        const exportAtlas = page.waitForEvent('download')
        await page.locator('[data-export-atlas="body"]').click()
        assert.equal((await exportAtlas).suggestedFilename(), 'leather_armor_male.jpg')
        await page.locator('[data-modifier-toggle="body"]').click()
        await page.locator('[data-modifier-editor="body"] [data-modifier-component="position"][data-modifier-axis="x"]').fill('0.17')
        assert.ok(Math.abs((await snapshot())[0].bodyX - 0.17) < 1e-6)
        await variant.selectOption('female')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        assert.equal(await bodySelect.inputValue(), leatherId)
        assert.equal(await pauldrons.inputValue(), leatherPauldronId)
        assert.equal(await legs.inputValue(), leatherLegId)
        assert.equal(await helmets.inputValue(), leatherHelmetId)
        assert.equal(await pauldronMaterial.locator('option:checked').textContent(), 'Dragon Leather')
        assert.equal(await legMaterial.locator('option:checked').textContent(), 'Dragon Leather')
        assert.equal(await helmetMaterial.locator('option:checked').textContent(), 'Dragon Leather')
        assert.deepEqual(await armorGeometry(Number(leatherPauldronId)), pauldronGeometry)
        assert.deepEqual(await armorGeometry(Number(leatherLegId)), leatherLegGeometry)
        assert.deepEqual(await armorGeometry(Number(leatherHelmetId)), leatherHelmetGeometry)
        assert.equal((await snapshot())[0].hair, null)
        await page.locator('[data-modifier-toggle="head"]').click()
        assert.equal(Number(await helmetX.inputValue()), femaleModifiers[leatherHelmetId].position.x)
        const exportHelmetAtlas = page.waitForEvent('download')
        await page.locator('[data-export-atlas="head"]').click()
        assert.equal((await exportHelmetAtlas).suggestedFilename(), 'leather_helmet.jpg')
        assert.ok((await snapshot())[0].slots.includes('LEFT_PAULDRON'))
        assert.ok((await snapshot())[0].slots.includes('RIGHT_PAULDRON'))
        assert.ok((await snapshot())[0].slots.includes('LEFT_LEG'))
        assert.ok((await snapshot())[0].slots.includes('RIGHT_LEG'))
        const exportPauldronAtlas = page.waitForEvent('download')
        await page.locator('[data-export-atlas="pauldrons"]').click()
        assert.equal((await exportPauldronAtlas).suggestedFilename(), 'leather_pauldron.jpg')
        const exportLegAtlas = page.waitForEvent('download')
        await page.locator('[data-export-atlas="legs"]').click()
        assert.equal((await exportLegAtlas).suggestedFilename(), 'leather_leg.jpg')
        assert.equal(await leatherMaterial.locator('option:checked').textContent(), 'Dragon Leather')
        await checkArmorGeometry(Number(leatherId), 'female-armor-leather.glb')
        await checkLeatherMaterial(leatherId, 'leather_armor_female_normal.png')
        const femaleLeatherGeometry = await armorGeometry(Number(leatherId))
        assert.notEqual(femaleLeatherGeometry.material, maleLeatherGeometry.material)
        assert.ok(Math.abs((await snapshot())[0].bodyX - femaleModifiers[leatherId].position.x) < 1e-6)
        assert.equal(await dragonControls.isVisible(), true)
        assert.equal(await leatherHue.inputValue(), '28')
        await leatherHue.fill('-18')
        await dragonControls.locator('[data-confirm-atlas-material]').click()
        const exportFemaleAtlas = page.waitForEvent('download')
        await page.locator('[data-export-atlas="body"]').click()
        assert.equal((await exportFemaleAtlas).suggestedFilename(), 'leather_armor_female.jpg')
        await page.locator('[data-modifier-toggle="pauldrons"]').click()
        const pauldronX = side => page.locator(`[data-modifier-editor="pauldrons"] [data-modifier-side="${side}"] [data-modifier-component="position"][data-modifier-axis="x"]`)
        for (const side of ['left', 'right']) {
            assert.equal(Number(await pauldronX(side).inputValue()), femalePauldronDefaults[leatherPauldronId][side].position.x)
        }
        await pauldronX('left').fill('0.25')
        await variant.selectOption('male')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        for (const side of ['left', 'right']) {
            assert.equal(Number(await pauldronX(side).inputValue()), malePauldronDefaults[leatherPauldronId][side].position.x)
        }
        assert.equal(await bodySelect.inputValue(), leatherId)
        assert.deepEqual(await armorGeometry(Number(leatherId)), maleLeatherGeometry)
        assert.equal(await leatherHue.inputValue(), '-18')
        assert.ok(Math.abs((await snapshot())[0].bodyX - 0.17) < 1e-6)
        await page.locator('[data-modifier-toggle="head"]').click()
        assert.equal(Number(await helmetX.inputValue()), 0.19)
        const maleLegDefaults = require('../public/admin-utils/equipment-modifiers.json').legs
        const femaleLegDefaults = require('../public/admin-utils/equipment-modifiers-female.json').legs
        await page.locator('[data-modifier-toggle="legs"]').click()
        const legX = side => page.locator(`[data-modifier-editor="legs"] [data-modifier-side="${side}"] [data-modifier-component="position"][data-modifier-axis="x"]`)
        for (const side of ['left', 'right']) {
            assert.equal(Number(await legX(side).inputValue()), maleLegDefaults[leatherLegId][side].position.x)
        }
        await page.locator('[data-modifier-editor="legs"] [data-modifier-side="right"] [data-modifier-component="scale"][data-modifier-axis="x"]').fill('-1.51')
        const mirroredLeg = await page.evaluate(async id => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const rightLeg = [...EquipManager.equippedItems.values()].flatMap(set => [...set])
                .find(item => item.type.id === id && item.parent.node?.isEnabled() && item.parent.equipSet.get('RIGHT_LEG') === item)
            const material = rightLeg.type.mesh.material
            return {
                determinant: rightLeg.modelModifierMatrix.determinant(),
                backFaceCulling: material.backFaceCulling,
                twoSidedLighting: material.twoSidedLighting,
            }
        }, Number(leatherLegId))
        assert.ok(mirroredLeg.determinant < 0)
        assert.equal(mirroredLeg.backFaceCulling, false)
        assert.equal(mirroredLeg.twoSidedLighting, false)
        await legX('left').fill('0.27')
        await variant.selectOption('female')
        await page.waitForFunction(() => !document.querySelector('#adminUtilsBodyVariant').disabled)
        for (const side of ['left', 'right']) {
            assert.equal(Number(await legX(side).inputValue()), femaleLegDefaults[leatherLegId][side].position.x)
        }
        assert.deepEqual(sockets, [], 'adminUtils must remain offline')
        assert.deepEqual(errors, [])
        console.log('PASS: male/female meshes, texture, bones, animations, independent offsets and remembered selection')
    } finally {
        await browser?.close()
        await server?.close()
    }
}

main().catch(error => {console.error(error); process.exitCode = 1})
