const assert = require('node:assert/strict')
const {test} = require('node:test')
const fs = require('node:fs'), ts = require('typescript'), path = require('node:path')
function load(file, dependencies) {
    const exports = {}
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText
    new Function('exports', 'require', code)(exports, name => dependencies[name] || {})
    return exports
}

test('clicking a signpost opens its reading view without selecting a target or sending combat messages', async () => {
    const core = await import('@babylonjs/core/index.js')
    let stopped = false, hidden = false, clicks = 0
    const audio = {playGuiButtonClick: () => clicks++}
    const myPlayer = {isDead: {value: false}, stopMove: () => stopped = true}
    const messages = require('../src/i18n/locales/cs.json')
    class BaseStaticObject {
        constructor(type, position, rotation, material, prefab) {
            Object.assign(this, {type, position, renderPosition: position.clone(), material, prefab})
        }
    }
    const dependencies = {
        '@babylonjs/core': core,
        '@/babylon/audio/audioManager': {AudioManager: audio},
        'vue': {ref: value => ({value})},
        './baseStaticObject': {BaseStaticObject},
        '@/data/myPlayer': {MyPlayer: myPlayer},
        '@/gui/tooltipOverlayManager': {TooltipOverlayManager: {hide: () => hidden = true}},
        '@/i18n': {t: key => key.split('.').reduce((value, part) => value[part], messages)},
        '@/babylon/materials': {MaterialEnum1: {WOOD_3: {uv: core.Vector2.Zero()}}},
        '../staticSurfacePlanes': {StaticSurfacePlanes: {getPrefab: () => ({})}, StaticSurfaceAtlas: {inscriptions: [core.Vector2.Zero(), new core.Vector2(1, 2), new core.Vector2(2, 2)]}},
    }
    const {WoodenSignpost} = load('babylon/world/statics/objects/woodenSignpost.ts', dependencies)
    const sign = new WoodenSignpost(404, core.Vector3.Zero(), {signCount: 2, sign1: '+X', sign2: '-Z', sign1Text: 'Stará cesta; <mlýn>', sign2Text: 'Les\nZa řekou', sign3Text: 'Hidden'})
    assert.equal(sign.intersectsRay(new core.Ray(new core.Vector3(.5, 2.42, -3), new core.Vector3(0, 0, 1))), true)
    assert.equal(sign.intersectsRay(new core.Ray(new core.Vector3(.5, 2.265, -3), new core.Vector3(0, 0, 1))), false)
    const {SignpostReader: reader} = load('gui/signpostReader.ts', dependencies)
    const statics = {visibleStatics: [sign]}
    const sent = []
    Object.assign(dependencies, {
        '@/gui/signpostReader': {SignpostReader: reader},
        '@/babylon/world/statics/staticsManager': {StaticsManager: statics},
        '@/babylon/world/statics/objects/woodenSignpost': {WoodenSignpost},
        '@/network/connector': {Connector: {sendMessage: message => sent.push(message)}},
        '@/babylon/monsters/monsterManager': {MonsterManager: {monsters: new Map(), visibleMonsters: new Set()}},
        '@/babylon/character/characterManager': {CharacterManager: {characters: new Map(), visibleCharacters: new Set()}},
        '@/babylon/npc/npcManager': {NpcManager: {npcs: new Map(), guards: new Map()}},
        '@/babylon/audio/audioManager': {AudioManager: audio},
    })
    const {TargetingManager: targeting} = load('gui/targettingManager.ts', dependencies)
    const ray = new core.Ray(new core.Vector3(2, 1, 0), new core.Vector3(-1, 0, 0))
    const previous = {id: 8}
    targeting.selectedTarget = previous
    targeting.resolvePickRay(ray)
    assert.equal(targeting.selectedTarget, previous, 'opening a reader never changes target selection')
    assert.equal(sent.length, 0)
    assert.equal(clicks, 1, 'opening plays exactly one GUI click')
    assert.equal(stopped, true)
    assert.equal(hidden, true)
    assert.deepEqual(reader.entries.value, [{direction: 'Sever', text: 'Stará cesta; <mlýn>'}, {direction: 'Západ', text: 'Les\nZa řekou'}])
    reader.closeFromBackdrop()
    assert.equal(reader.entries.value.length, 2, 'opening pointer click cannot immediately dismiss the view')
    assert.equal(clicks, 1, 'ignored close does not play a click')
    reader.openedAt = Date.now() - 400
    reader.closeFromBackdrop()
    assert.equal(reader.entries.value.length, 0)
    assert.equal(clicks, 2, 'backdrop close plays one click')
    reader.open(sign)
    reader.close()
    assert.equal(clicks, 4, 'opening and direct close both play a click')
    reader.close()
    assert.equal(clicks, 4, 'repeated close stays silent')
    assert.equal(reader.entries.value.length, 0)
    statics.visibleStatics = []
    targeting.resolvePickRay(ray)
    assert.equal(reader.entries.value.length, 0)
    statics.visibleStatics = [sign]
    myPlayer.isDead.value = true
    targeting.resolvePickRay(ray)
    assert.equal(reader.entries.value.length, 0)
})
