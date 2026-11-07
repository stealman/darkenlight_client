const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

function load(path, dependencies) {
    const source = readFileSync(join(__dirname, '../src', path), 'utf8')
    const compiled = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText
    const exports = {}
    new Function('exports', 'require', compiled)(exports, name => dependencies[name] || {})
    return exports
}

test('old settings enable ingredients by default and preserve explicit checkbox choices', (t) => {
    const previousWindow = globalThis.window
    globalThis.window = {innerWidth: 1280, innerHeight: 720}
    t.after(() => {
        if (previousWindow === undefined) delete globalThis.window
        else globalThis.window = previousWindow
    })
    const {Settings} = load('settings/settings.ts', {
        '@/babylon/audio/audioManager': {AudioManager: {setGlobalVolume() {}, setAmbientSoundVolume() {}}},
    })
    Settings.initialize({})
    assert.equal(Settings.autoPickupIngredients, true)
    assert.equal(Settings.autoPickupPurity, false)
    Settings.initialize({autoPickupIngredients: false, autoPickupPurity: true})
    assert.equal(Settings.autoPickupIngredients, false)
    assert.equal(Settings.autoPickupPurity, true)
    const saved = JSON.parse(JSON.stringify(Settings))
    Settings.initialize(saved)
    assert.equal(Settings.autoPickupIngredients, false)
    assert.equal(Settings.autoPickupPurity, true)
    const defaults = Settings.getDefaultSettings()
    assert.equal(defaults.autoPickupIngredients, true)
    assert.equal(defaults.autoPickupPurity, false)
})

test('opening settings refreshes checkbox state after settings were loaded outside the Vue proxy', () => {
    const {ref, computed, triggerRef} = require('vue')
    const {parse} = require('@vue/compiler-sfc')
    const {descriptor} = parse(readFileSync(join(__dirname, '../src/vue/views/settingsDialog.vue'), 'utf8'))
    const ast = ts.createSourceFile('settings.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true)
    const declaration = ast.statements.filter(ts.isVariableStatement)
        .flatMap(statement => [...statement.declarationList.declarations])
        .find(declaration => declaration.name.getText(ast) === 'openDialog')
    const settings = {autoPickupIngredients: true, autoPickupPurity: false}
    const storedSettings = ref(settings)
    const ingredientCheckbox = computed(() => storedSettings.value.autoPickupIngredients)
    const purityCheckbox = computed(() => storedSettings.value.autoPickupPurity)
    assert.equal(ingredientCheckbox.value, true)
    assert.equal(purityCheckbox.value, false)
    settings.autoPickupIngredients = false
    settings.autoPickupPurity = true
    assert.equal(ingredientCheckbox.value, true, 'reproduces the stale checkbox before refresh')
    const open = new Function('triggerRef', 'storedSettings', 'graphicSettingsChanged', 'syncSelectedDeviceType',
        'return ' + ts.transpileModule(declaration.initializer.getText(ast), {}).outputText)(
        triggerRef, storedSettings, {value: false}, () => {})
    open()
    assert.equal(ingredientCheckbox.value, settings.autoPickupIngredients)
    assert.equal(purityCheckbox.value, settings.autoPickupPurity)
    storedSettings.value.autoPickupIngredients = true
    assert.equal(settings.autoPickupIngredients, true, 'checkbox still changes the setting used by auto pickup')
})

test('auto pickup respects proximity, falling animation, category, death and request throttling', async () => {
    const core = await import('@babylonjs/core/index.js')
    const settings = {autoPickupIngredients: true, autoPickupPurity: false}
    const player = {myChar: {pos: core.Vector3.Zero()}, isDead: {value: false}}
    const sent = []
    const {GroundItemsManager: manager} = load('babylon/world/groundItemsManager.ts', {
        '@babylonjs/core': core,
        '@/settings/settings': {Settings: settings},
        '@/data/myPlayer': {MyPlayer: player},
        '@/network/connector': {Connector: {sendMessage: message => sent.push(message)}},
        '@/network/messages': {PickItemMsg: class {constructor(id) {this.t = 15; this.d = {id}}}},
    })
    const item = (id, cbId, distance, extra = {}) => ({
        item: {id, cbId, cbType: 'R'}, pos: new core.Vector3(distance, 0, 0),
        dropping: false, nextAutoPickupTime: 0, ...extra,
    })
    const ingredient = item(1, 401, 1, {item: {id: 1, cbId: 401, cbType: 'R', atts: new Map([['qty', 2]])}})
    const purity = item(2, 51, 0.1)
    manager.items = [purity, ingredient]
    manager.detectNearestItemProximity(100)
    assert.equal(manager.nearbyItem, purity, 'manual pickup target stays nearest')
    assert.deepEqual(sent.map(m => m.d.id), [1], 'unselected nearest item does not block auto pickup')
    manager.detectNearestItemProximity(200)
    manager.detectNearestItemProximity(400)
    assert.equal(sent.length, 1, 'same stack waits for server confirmation')
    settings.autoPickupPurity = true
    manager.detectNearestItemProximity(500)
    manager.detectNearestItemProximity(1099)
    assert.equal(sent.length, 1, 'other nearby stacks also wait one full second')
    manager.detectNearestItemProximity(1100)
    assert.deepEqual(sent.map(m => m.d.id), [1, 2])
    manager.items = [item(3, 402, 1.01), item(4, 403, 0.2, {dropping: true}),
        item(5, 1001, 0.1), item(6, 401, 0.1, {item: {id: 6, cbId: 401, cbType: 'W'}})]
    manager.detectNearestItemProximity(2200)
    assert.equal(sent.length, 2)
    manager.items = [ingredient]
    player.isDead.value = true
    manager.detectNearestItemProximity(3000)
    assert.equal(sent.length, 2)
    player.isDead.value = false
    manager.detectNearestItemProximity(3100)
    assert.equal(sent.length, 3, 'unconfirmed stack can be retried')
    settings.autoPickupIngredients = false
    manager.detectNearestItemProximity(6000)
    assert.equal(sent.length, 3)
    settings.autoPickupIngredients = true
    manager.ignoredAutoPickupItemIds.add(1)
    manager.detectNearestItemProximity(7000)
    assert.equal(sent.length, 3, 'locally excluded drops remain available for manual pickup only')
    assert.equal(manager.nearbyItem, ingredient)
    manager.removeItems([1])
    assert.equal(manager.ignoredAutoPickupItemIds.has(1), false, 'forget when leaving the item visibility area')
    manager.items = [ingredient]
    manager.detectNearestItemProximity(8000)
    assert.equal(sent.length, 4, 'returning to the item allows auto pickup again')
})

test('only animated drops from visible party member positions are locally excluded', () => {
    const party = {state: {value: {members: [{id: 2}]}}}
    const characters = new Map([[2, {insideView: true, pos: {x: 10, z: 20}}],
        [3, {insideView: true, pos: {x: 30, z: 40}}]])
    const {GroundItemsManager: manager} = load('babylon/world/groundItemsManager.ts', {
        '@babylonjs/core': {Matrix: class {}, Quaternion: {Identity: () => ({})}, Color4: class {}},
        '@/data/partyManager': {PartyManager: party},
        '@/babylon/character/characterManager': {CharacterManager: {characters}},
    })
    const drop = {item: {id: 123}, dropFrom: {x: 10, y: 0, z: 20}}
    assert.equal(manager.isVisiblePartyDrop(drop), true)
    assert.equal(manager.isVisiblePartyDrop({...drop, item: {id: -123}}), false, 'monster loot is never excluded')
    assert.equal(manager.isVisiblePartyDrop({...drop, dropFrom: undefined}), false, 'old ground items are not excluded')
    assert.equal(manager.isVisiblePartyDrop({...drop, dropFrom: {x: 30, y: 0, z: 40}}), false, 'unrelated players')
    characters.get(2).insideView = false
    assert.equal(manager.isVisiblePartyDrop(drop), false)
    party.state.value = null
    assert.equal(manager.isVisiblePartyDrop(drop), false)
})
