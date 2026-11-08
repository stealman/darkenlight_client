const assert = require('node:assert/strict')
const {test} = require('node:test')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
function evaluate(source, dependencies = {}, document = {}) {
    const exports = {}
    const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText
    new Function('exports', 'require', 'document', code)(exports, name => dependencies[name] || {}, document)
    return exports
}

test('read-signpost opportunity uses the nearest sign within two tiles and rechecks range on activation', () => {
    // Exercise the real lookup and footprint-distance methods without initializing the world renderer.
    const source = read('babylon/world/statics/staticsManager.ts')
    const ast = ts.createSourceFile('statics.ts', source, ts.ScriptTarget.ES2020, true)
    const methods = []
    function visit(node) {
        if (ts.isMethodDeclaration(node) && ['getClosestStaticInDistance', 'getDistanceToStaticFootprint'].includes(node.name.getText(ast))) methods.push(node.getText(ast))
        ts.forEachChild(node, visit)
    }
    visit(ast)
    const {lookup: statics} = evaluate('export const lookup = {' + methods.join(',') + '}')
    const makeSign = x => ({position: {x, z: 0}, getSize: () => 1})
    const near = makeSign(1), edge = makeSign(2)
    statics.staticsByType = new Map([[404, new Set([edge, near])]])
    const player = {isDead: {value: false}, nearFireplace: null, myChar: {id: 1, className: 'Warrior', pos: {x: 0, z: 0}, getBoxSize: () => 1}}
    const ground = {nearbyItem: null}
    let clicks = 0
    const opened = []
    const audio = {playGuiButtonClick: () => clicks++}
    const document = {createElement: () => ({style: {}, attributes: {}, setAttribute(name, value) {this.attributes[name] = value}})}
    const dependencies = {
        '@/data/myPlayer': {MyPlayer: player},
        '@/babylon/world/statics/staticsManager': {StaticsManager: statics},
        '@/babylon/world/groundItemsManager': {GroundItemsManager: ground},
        '@/data/worldDataManager': {WorldDataManager: {getCoveredBlocks: () => []}},
        '@/babylon/world/treeManager': {TreeManager: {isAnyTreeInDistance: () => false}},
        '@/babylon/world/buildings/buildingManager': {BuildingManager: {getClosestDoorIdInDistance: () => null}},
        '@/gui/targettingManager': {TargetingManager: {selectedTarget: null}},
        '@/data/partyManager': {PartyManager: {state: {value: null}}},
        '@/babylon/npc/npcManager': {NpcManager: {getClosestNpcInDistance: () => null}},
        '@/babylon/monsters/monsterManager': {MonsterManager: {monsters: new Map()}},
        '@/babylon/audio/audioManager': {AudioManager: audio},
        '@/gui/signpostReader': {SignpostReader: {open(sign) {opened.push(sign); audio.playGuiButtonClick()}}},
        '@/i18n': {t: key => key},
    }
    const {GuiButtonsManager: gui, GuiOpportunityActions: actions} = evaluate(read('gui/guiButtonsManager.ts'), dependencies, document)
    gui.createOpportunityButtons()
    const button = gui.opportunityButtons.get(actions.READ_SIGNPOST.name)
    assert.match(button.htmlEl.innerHTML, /btn_lupa\.png"/)
    assert.equal(button.htmlEl.attributes['aria-label'], 'signpost.read')
    const refresh = () => {gui.nextOpportunityUpdateAt = 0; gui.onFrame(1000)}
    refresh()
    assert.equal(button.visible, true)
    assert.equal(gui.primaryOpportunityButton, button)
    assert.equal(gui.getOpportunityDistanceSquared(actions.READ_SIGNPOST.name), 1)
    gui.onclickOpportunityButton(actions.READ_SIGNPOST.name)
    assert.equal(opened[0], near)
    assert.equal(clicks, 1, 'reader and opportunity dispatcher must not double-play the sound')
    assert.equal(gui.clickFirstAvailableOpportunityButton(), true)
    assert.equal(opened[1], near, 'normal opportunity hotkey opens the same reader')
    assert.equal(clicks, 2)
    statics.staticsByType.get(404).delete(near)
    refresh()
    assert.equal(button.visible, true, 'two tiles is inclusive')
    assert.equal(gui.getOpportunityDistanceSquared(actions.READ_SIGNPOST.name), 4)
    edge.position.x = 2.001
    gui.onclickOpportunityButton(actions.READ_SIGNPOST.name)
    assert.equal(opened.length, 2, 'stale visible button cannot open a sign outside range')
    assert.equal(clicks, 2)
    refresh()
    assert.equal(button.visible, false)
    assert.equal(gui.primaryOpportunityButton, null)
    edge.position.x = 2
    ground.nearbyItem = {pos: {x: .5, z: 0}}
    refresh()
    assert.equal(button.visible, true)
    assert.equal(gui.primaryOpportunityButton.action.name, actions.PICKUP_ITEM.name, 'closer opportunities keep priority')
    player.isDead.value = true
    refresh()
    assert.equal(button.visible, false)
    gui.onclickOpportunityButton(actions.READ_SIGNPOST.name)
    assert.equal(opened.length, 2)
})
