const assert = require('node:assert/strict')
const {chromium} = require('playwright-core')
const {createServer} = require('vite')

async function main() {
    let server, browser
    process.env.VITE_GM_MODE = 'false'
    try {
        server = await createServer({server: {host: '127.0.0.1', port: 0}, logLevel: 'warn'})
        await server.listen()
        browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']})
        const page = await browser.newPage(process.argv.includes('--touch')
            ? {viewport: {width: 844, height: 390}, isMobile: true, hasTouch: true}
            : {viewport: {width: 1280, height: 900}})
        page.setDefaultTimeout(90000)
        const errors = []
        page.on('pageerror', error => errors.push(String(error)))
        page.on('console', message => {if (message.type() === 'error') {errors.push(message.text()); console.error(message.text())}})
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
        const waitPreviews = async () => {
            await page.waitForFunction(() => {
                const button = document.querySelector('.guest-character-class-label')
                return button && !button.disabled
            })
            await page.evaluate(async () => {
                const {Renderer} = await import('/src/babylon/scene/renderer.ts')
                await Renderer.scene.whenReadyAsync()
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            })
        }
        const previewTextures = () => page.evaluate(async () => {
            const {Renderer} = await import('/src/babylon/scene/renderer.ts')
            return Renderer.scene.meshes.filter(mesh => mesh.skeleton && mesh.isEnabled() && mesh.getTotalVertices() > 0)
                .map(mesh => mesh.material.albedoTexture.name)
        })
        const chooseGender = async gender => {
            await page.locator('.guest-character-gender button').nth(gender === 'F' ? 1 : 0).click()
            await waitPreviews()
            const textures = await previewTextures()
            assert.equal(textures.length, 2)
            assert.ok(textures.every(texture => texture.includes(gender === 'F' ? 'human_female.png' : 'human_male.png')))
        }
        const waitGame = async () => {
            await page.evaluate(async () => {
                window.__genderRuntime = {MyPlayer: (await import('/src/data/myPlayer.ts')).MyPlayer,
                    GameManager: (await import('/src/GameManager.ts')).GameManager}
            })
            await page.waitForFunction(() => window.__genderRuntime.GameManager.started
                && window.__genderRuntime.MyPlayer.myChar?.model?.initialized === true
                && !!document.querySelector('#renderCanvas.game-session-canvas--visible'))
        }
        const appearance = () => page.evaluate(async () => {
            const {MyPlayer} = await import('/src/data/myPlayer.ts')
            const character = MyPlayer.myChar
            return {gender: character.gender, slots: [...character.model.equipSet.keys()],
                texture: character.model.model.getChildMeshes().find(mesh => mesh.skeleton).material.albedoTexture.name,
                armor: character.model.equipSet.get('BODY')?.type.mesh.name}
        })
        const logout = async () => {
            await page.evaluate(() => window.dispatchEvent(new Event('game:session-ended')))
            await page.locator('#local-character-name').waitFor()
        }
        await page.locator('#local-character-name').fill('FemaleHero')
        await page.locator('form button').click()
        await waitPreviews()
        await chooseGender('F')
        await chooseGender('M')
        await chooseGender('F')
        await page.evaluate(async () => {
            const {EquipManager} = await import('/src/babylon/item/equipManager.ts')
            const owners = [...new Set([...EquipManager.equippedItems.values()].flatMap(set => [...set]).map(item => item.parent))]
                .filter(owner => owner.parent?.id === -9001 || owner.parent?.id === -9002)
            const fitting = (await (await fetch('/admin-utils/equipment-modifiers-female.json')).json()).hair['1']
            if (owners.length !== 2) throw new Error('Missing class preview models')
            for (const owner of owners) {
                const body = owner.model.getChildMeshes().find(mesh => mesh.skeleton).material
                const head = owner.equipSet.get('FACE')?.type.mesh.material
                if (!head?.albedoTexture.name.includes('human_female_head_1.png')) throw new Error('Missing runtime female head in class preview')
                const hair = owner.equipSet.get('HAIR')
                if (!hair?.type.mesh.material.albedoTexture.name.includes('human_female_hair_1_atlas.png') || hair.bone.name !== 'Head') {
                    throw new Error('Missing runtime female hair attached to Head')
                }
                const position = hair.attachmentLocalMatrix.getTranslation()
                for (const axis of ['x', 'y', 'z']) {
                    if (Math.abs(position[axis] - fitting.position[axis]) > 1e-6) throw new Error('Female hair does not use saved fitting')
                }
                if (body.unlit || head.unlit || !body.CustomParts.Fragment_Before_Lights
                    || body.CustomParts.Fragment_Before_Lights !== head.CustomParts.Fragment_Before_Lights) {
                    throw new Error('Preview body/head must use the shared lit character shader')
                }
            }
        })
        await page.locator('.guest-character-class-option').nth(1).hover()
        if (process.env.GENDER_SCREENSHOT) await page.screenshot({path: process.env.GENDER_SCREENSHOT})
        await page.locator('.guest-character-class-label').first().click()
        if (process.argv.includes('--layout-only')) {
            assert.equal(await page.locator('.guest-character-gender button').nth(1).getAttribute('aria-pressed'), 'true')
            assert.ok(await page.locator('.guest-character-creation-continue-action').isVisible())
            assert.deepEqual(errors, [])
            console.log('PASS: touch layout, accessible gender symbols and both live female previews')
            return
        }
        await page.locator('.guest-character-creation-continue-action').click()
        await waitGame()
        let state = await appearance()
        assert.equal(state.gender, 'F')
        assert.match(state.texture, /human_female\.png/)
        assert.ok(state.slots.includes('FACE') && state.slots.includes('HAIR') && !state.slots.includes('HEAD'))
        assert.equal(state.armor, 'character-equipment-F-2000')
        const saved = await page.evaluate(async () => {
            const {Connector} = await import('/src/network/connector.ts')
            const {listProfiles, loadSave} = await import('/src/local/saveStore.ts')
            await Connector.save()
            const profile = (await listProfiles()).find(profile => profile.name === 'FemaleHero')
            return {profile, character: JSON.parse(await loadSave(profile.id)).collections.characters[0]}
        })
        assert.equal(saved.profile.gender, 'F')
        assert.equal(saved.character.gender, 'F')
        // A live bot update exercises both pools in the same scene and stable message 89.
        await page.evaluate(async () => {
            const {CharacterManager} = await import('/src/babylon/character/characterManager.ts')
            const {MyPlayer} = await import('/src/data/myPlayer.ts')
            const {MessageProcessor} = await import('/src/network/messageProcessor.ts')
            const player = MyPlayer.myChar
            const id = -77001
            await CharacterManager.addCharacter({id, name: 'Test bot', gender: 'F', bot: true, cls: 'FIGHTER',
                x: player.pos.x + 1, z: player.pos.z, bsz: 0.8, hp: 100, mhp: 100, st: 100, mst: 100,
                mp: 0, mmp: 0, equipSet: {}})
            const bot = CharacterManager.characters.get(id)
            bot.insideView = true
            await bot.model.initAsync()
            for (const gender of ['M', 'F', 'M', 'F']) {
                await MessageProcessor.processResponse([{t: 89, d: {id, name: 'Test bot', gender}}])
                const texture = bot.model.model.getChildMeshes().find(mesh => mesh.skeleton).material.albedoTexture.name
                if (!texture.includes(gender === 'F' ? 'human_female.png' : 'human_male.png')) throw new Error('Gender pool mixed body meshes')
                if (!bot.model.equipSet.has('FACE')) throw new Error('Wrong detachable head for gender')
            }
            CharacterManager.removeCharacter(id)
        })
        await page.evaluate(async () => {
            const {NpcManager} = await import('/src/babylon/npc/npcManager.ts')
            const {MyPlayer} = await import('/src/data/myPlayer.ts')
            const position = {x: MyPlayer.myChar.pos.x + 1, z: MyPlayer.myChar.pos.z}
            const data = {id: 77002, name: 'Test NPC', gender: 'F', type: 'common', bodyType: 'steve',
                equipment: {}, bsz: 0.8, ...position}
            await NpcManager.addNpc(data)
            const npc = NpcManager.npcs.get(data.id)
            npc.insideView = true
            await npc.model.initAsync()
            if (npc.gender !== 'F' || !npc.model.equipSet.has('FACE')) throw new Error('Female NPC has wrong appearance')
            await NpcManager.addNpc({...data, gender: 'M'})
            if (npc.gender !== 'M' || !npc.model.equipSet.has('FACE')) throw new Error('NPC gender update did not replace the model')
            NpcManager.removeNpc(data.id)
            const guardData = {id: 77003, tp: 1, hpp: 100, ...position,
                guard: {definitionId: 77003, name: 'Test guard', gender: 'F', type: 'guard', bodyType: 'steve', equipment: {}}}
            await NpcManager.addGuard(guardData)
            const guard = NpcManager.guards.get(guardData.id)
            guard.insideView = true
            await guard.model.initAsync()
            if (guard.gender !== 'F' || !guard.model.equipSet.has('FACE')) throw new Error('Female guard has wrong appearance')
            NpcManager.removeGuard(guardData.id, false)
        })
        // Exercise both GM forms without mutating authoring data.
        await page.evaluate(async () => {
            const {Connector} = await import('/src/network/connector.ts')
            const {GMManager} = await import('/src/gm/GM.ts')
            window.__genderMessages = []
            window.__genderOriginalSend = Connector.sendMessage
            Connector.sendMessage = message => window.__genderMessages.push(JSON.parse(JSON.stringify(message)))
            GMManager.processBotDetails({id: -77001, name: 'Test bot', gender: 'M', origin: {worldId: 1, x: 10, z: 10}})
        })
        await page.locator('.bot-details-dialog-window select[aria-label="Gender"]').selectOption('F')
        await page.locator('.bot-details-dialog-window').getByRole('button', {name: 'Save', exact: true}).click()
        assert.equal(await page.evaluate(() => window.__genderMessages.at(-1).d.data.gender), 'F')
        await page.evaluate(async () => {
            const {GMManager} = await import('/src/gm/GM.ts')
            GMManager.processNpcDetails({id: 77001, name: 'Test NPC', gender: 'M', type: 'common',
                bodyType: 'steve', spawn: {x: 10, z: 10}, equipment: {}, features: [], wanderingRange: 0})
        })
        await page.locator('.npc-details-dialog-window select[aria-label="Body type"]').selectOption('F')
        await page.locator('.npc-details-dialog-window').getByRole('button', {name: 'Save', exact: true}).click()
        assert.equal(await page.evaluate(() => window.__genderMessages.at(-1).d.data.gender), 'F')
        await page.evaluate(async () => {
            const {Connector} = await import('/src/network/connector.ts')
            Connector.sendMessage = window.__genderOriginalSend
        })
        await logout()
        await page.locator('#local-character-name').fill('MaleHero')
        await page.locator('form button').click()
        await waitPreviews()
        await page.locator('.guest-character-class-label').nth(1).click()
        await page.locator('.guest-character-creation-continue-action').click()
        await waitGame()
        state = await appearance()
        assert.equal(state.gender, 'M')
        assert.match(state.texture, /human_male\.png/)
        assert.ok(state.slots.includes('FACE') && state.slots.includes('HAIR'))
        await logout()
        await page.locator('[data-profile-id]').filter({hasText: 'FemaleHero'}).click()
        await waitGame()
        assert.equal((await appearance()).gender, 'F')
        await logout()
        await page.reload()
        await page.locator('[data-profile-id]').filter({hasText: 'FemaleHero'}).click()
        await waitGame()
        assert.match((await appearance()).texture, /human_female\.png/)
        assert.deepEqual(errors, [])
        console.log('PASS: gender previews, creation, runtime model pools, GM forms, save/resume and reload')
    } finally {
        await browser?.close()
        await server?.close()
    }
}
main().catch(error => {console.error(error); process.exitCode = 1})
