const assert = require('node:assert/strict')
const {test} = require('node:test')
const {createServer} = require('vite')
const {mkdtemp, rm} = require('node:fs/promises')
const {tmpdir} = require('node:os')
const {join} = require('node:path')

test('item definitions initialize without player, networking or rendering dependencies', async () => {
    // Never let a module test replace a running dev server's optimized dependencies.
    const cacheDir = await mkdtemp(join(tmpdir(), 'darkenlight-item-test-'))
    const server = await createServer({cacheDir, optimizeDeps: {noDiscovery: true, include: []},
        server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent'})
    try {
        const {Item, EquipSlotModel, EquipSlotModelsCb} = await server.ssrLoadModule('/src/data/items/item.ts')
        const {ConsumablesCodebook} = await server.ssrLoadModule('/src/data/items/consumablesCodebook.ts')
        const {PartyManager} = await server.ssrLoadModule('/src/data/partyManager.ts')
        PartyManager.receiveState({leaderId: 1, members: []})
        assert.equal(PartyManager.state.value.leaderId, 1)
        PartyManager.receiveInvitation({id: 1, name: 'Test', remainingMs: 10000})
        assert.equal(PartyManager.invitation.value.id, 1)
        PartyManager.reset()
        assert.equal(PartyManager.state.value, null)
        assert.equal(PartyManager.invitation.value, null)
        const party = {leaderId: 1, members: [{id: 1}, {id: 2}]}
        assert.equal(PartyManager.receiveState(party), true, 'joining a party triggers the sound')
        assert.equal(PartyManager.receiveState(party), false, 'ordinary state updates stay silent')
        assert.equal(PartyManager.receiveState({...party, members: [...party.members, {id: 3}]}), true, 'a new member triggers the sound')
        assert.equal(PartyManager.receiveState(party), false, 'member departure stays silent')
        assert.equal(PartyManager.receiveState(null), false, 'leaving the party stays silent')
        const modules = [...server.moduleGraph.idToModuleMap.entries()]
            .filter(([, module]) => module.ssrModule)
            .map(([id]) => id.replaceAll('\\', '/'))
        assert.ok(modules.some(id => id.endsWith('/src/data/items/item.ts')))
        assert.equal(modules.some(id => /\/src\/(babylon\/|network\/connector|data\/myPlayer)/.test(id)), false)
        for (const slot of Object.values(EquipSlotModelsCb)) {
            if (slot instanceof EquipSlotModel) assert.equal(EquipSlotModelsCb.getById(slot.modelId), slot)
        }
        assert.equal(EquipSlotModelsCb.ARMOR_PLATE.modelId, 1000)
        assert.equal(EquipSlotModelsCb.getById(-1), null)
        for (const id of [...ConsumablesCodebook.healingPotionIds, ...ConsumablesCodebook.manaPotionIds,
            ...ConsumablesCodebook.staminaPotionIds, ...ConsumablesCodebook.foodIds]) {
            const item = new Item(id, id, 'R', 0, null, null, null, new Map())
            assert.equal(item.isConsumable(), true)
            assert.equal(ConsumablesCodebook.isItemPotion(id), id !== 351)
        }
        for (const id of [...ConsumablesCodebook.woodIds, 9999]) {
            const item = new Item(id, id, 'R', 0, null, null, null, new Map())
            assert.equal(item.isConsumable(), false)
            assert.equal(ConsumablesCodebook.isItemCampWood(item), id !== 9999)
        }
    } finally {
        await server.close()
        await rm(cacheDir, {recursive: true, force: true})
    }
})
