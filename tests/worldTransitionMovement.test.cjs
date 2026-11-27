const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const ts = require('typescript')

function load(path, dependencies) {
    const exports = {}
    new Function('exports', 'require', ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText)(exports, name => dependencies[name] || {})
    return exports
}

test('world transition blocks held input and movement until destination data and its first rendered frame', async () => {
    const calls = [], afterRender = []
    const noop = () => {}
    const {MyPlayer: player} = load('src/data/myPlayer.ts', {
        vue: {ref: value => ({value})},
        '@/controlls/controller': {Controller: {cancelHeldMovement() {calls.push('cancel input')}}},
        '@/network/connector': {Connector: {cancelPendingMoveMessage() {calls.push('cancel packet')}}},
    })
    player.myChar = {id: 1, pos: {x: 96, y: 0, z: 82}, stopMovementLocally() {calls.push('stop')},
        startMove() {calls.push('move')}, stopMove() {calls.push('stop input')},
        cancelCombatApproach() {calls.push('approach')}, getMoveAngle: () => null, getMoveType: () => null,
        onFrame() {throw new Error('Movement tick ran before the destination was ready')}}
    player.worldId = 2
    player.setAction = noop
    const worldRenderer = {block1: null, renderWorld() {calls.push('render world')}}
    const {MessageProcessor: processor} = load('src/network/messageProcessor.ts', {
        '@/data/myPlayer': {MyPlayer: player},
        '@/GameManager': {GameManager: {started: true}},
        '@/babylon/scene/renderer': {Renderer: {environmentType: 'outdoor', scene: {
            onAfterRenderObservable: {addOnce: callback => afterRender.push(callback)},
        }}},
        '@/babylon/world/worldRenderer': {WorldRenderer: worldRenderer},
        '@/babylon/scene/lights': {Lights: {synchronizeDayNightCycle: noop}},
        '@/babylon/world/weather/weatherManager': {WeatherManager: {setEnabled: noop}},
        '@/babylon/world/terrainManager': {TerrainManager: {setSeaWaterLevel: noop}},
        '@/utils/minimap': {MiniMap: {setEnvironmentType: noop}},
        '@/data/worldDataManager': {WorldDataManager: {replaceWorldData: noop, prepareTerrainRenderData: noop, worldDataMap: new Map()}},
        '@/data/worldAreaManager': {WorldAreaManager: {setWorld: noop}},
        '@/babylon/world/foggyAreaManager': {FoggyAreaManager: {setAreas: noop}},
        '@/data/actions/characterActions': {CharacterActions: {HEAL: {name: 'heal'}}},
        '@/babylon/character/characterManager': {CharacterManager: {characterTeleported(data) {
            if (!data.departure && data.id === player.myChar.id) Object.assign(player.myChar.pos, data)
        }}},
    })
    processor.clearWorldForTransition = noop
    let release
    processor.addNpc = () => new Promise(resolve => {release = resolve})
    processor.processWorldChunkData = () => calls.push('destination collisions')
    const processing = processor.processResponse([
        {t: 7, d: {id: 1, name: 'Main Continent', size: 1024, environment: {type: 'outdoor'}}},
        {t: 51, d: {}}, // Slow asset loading yields to joystick and render events.
        {t: 9, d: {}},
        {t: 60, d: {id: 1, x: 966, y: 0, z: 1004, departure: false}},
    ])
    assert.equal(player.worldTransitionPending, true)
    player.startMove('R', 0)
    player.stopMove()
    player.onFrame(2, Date.now())
    assert.equal(calls.includes('move'), false)
    assert.equal(calls.includes('stop input'), false)
    assert.deepEqual(player.myChar.pos, {x: 96, y: 0, z: 82})
    release()
    await processing
    assert.equal(player.worldTransitionPending, true)
    assert.equal(player.myChar.pos.x, 966)
    assert.ok(calls.indexOf('destination collisions') < calls.indexOf('render world'))
    player.startMove('R', 0)
    assert.equal(calls.includes('move'), false)
    afterRender.shift()()
    assert.equal(player.worldTransitionPending, false)
    player.startMove('R', 0)
    assert.equal(calls.at(-1), 'move')

    // A callback from an earlier transition must not unlock a newer one.
    processor.processCharacterTeleport({id: 1, x: 967, y: 0, z: 1004, departure: false})
    player.beginWorldTransition()
    afterRender.shift()()
    assert.equal(player.worldTransitionPending, true)
})
