const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

function loadModule(path, dependencies) {
    const exports = {}
    new Function('exports', 'require', ts.transpileModule(readFileSync(join(__dirname, '../src', path), 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText)(exports, name => dependencies[name] || {})
    return exports
}

test('monster move/stop packets pass through dispatch and guard forwarding without copies', async () => {
    let movePacket, stopPacket
    const NpcManager = {guards: new Map([[7, {}]]), guardMove(data) {movePacket = data}, guardMoveStop(data) {stopPacket = data}}
    const {MonsterManager} = loadModule('babylon/monsters/monsterManager.ts', {'@/babylon/npc/npcManager': {NpcManager}})
    const {MessageProcessor} = loadModule('network/messageProcessor.ts', {'@/babylon/monsters/monsterManager': {MonsterManager}})
    const move = [7, 1, 2, 3, 4, 2, 5, 6], stop = [7, 3, 4, true]
    await MessageProcessor.processResponse([{t: 4, d: move}, {t: 10, d: stop}])
    assert.equal(movePacket, move)
    assert.equal(stopPacket, stop)
    assert.deepEqual(move, [7, 1, 2, 3, 4, 2, 5, 6])
})

test('monster confirmations reuse points, preserve progress and handle look-ahead and teleport stops', async () => {
    const core = await import('@babylonjs/core/index.js')
    const Utils = {calculateWalkYPos: x => x / 2,
        getAngleBetweenPoints: (a, b) => Math.atan2(-(b.z - a.z), b.x - a.x)}
    const {Monster} = loadModule('babylon/monsters/monster.ts', {'@babylonjs/core': core, '@/utils/utils': {Utils}})
    const {MonsterManager: manager} = loadModule('babylon/monsters/monsterManager.ts', {
        '@/utils/utils': {Utils}, '@/babylon/npc/npcManager': {NpcManager: {guards: new Map()}},
    })
    const mob = Object.create(Monster.prototype)
    Object.assign(mob, {pos: core.Vector3.Zero(), targetPoint: null, nextTargetPoint: null,
        mobType: {boxSize: .8}, model: {initialized: false, setWeaponTrailEnabled() {}, node: {position: core.Vector3.Zero()}}})
    mob.resolveStepMark = () => {}
    manager.monsters.set(1, mob)
    manager.monsterMove([1, 0, 0, 5, 0, 1, 6, 0])
    const target = mob.targetPoint, next = mob.nextTargetPoint
    mob.pos.x = 2
    for (let i = 0; i < 10000; i++) manager.monsterMove([1, 0, 0, 5, 0, 1, 6, 0])
    assert.equal(mob.targetPoint, target)
    assert.equal(mob.nextTargetPoint, next)
    assert.equal(mob.pos.x, 2, 'confirmation must not rewind interpolated motion')
    mob.resolveMovement(3, 0)
    assert.equal(mob.targetPoint, next)
    assert.equal(mob.nextTargetPoint, null)
    manager.monsterMove([1, 5, 0, 6, 0, 1])
    assert.equal(mob.targetPoint, next)
    assert.equal(mob.pos.x, 5)
    mob.model.initialized = true
    manager.monsterMoveStop([1, 20, 4, true])
    assert.equal(mob.targetPoint, null)
    assert.equal(mob.nextTargetPoint, null)
    assert.equal(mob.moveAngle, null)
    assert.deepEqual(mob.model.node.position.asArray(), [20, 10, 4])
    manager.monsterMove([1, 20, 4, 21, 4, 2])
    assert.equal(mob.targetPoint.x, 21)
    assert.equal(mob.nextTargetPoint, null)
})

test('NPC movement reuses its target and guard teleports snap the model', async () => {
    const core = await import('@babylonjs/core/index.js')
    class Character {
        setMoveAngle(angle) {this.angle = angle}
        setActualSpeed(speed) {this.speed = speed}
        setMoveType(type) {this.moveType = type}
        getBoxSize() {return .8}
        stopMovementLocally() {this.angle = null; this.speed = 0}
    }
    const {Npc} = loadModule('babylon/npc/npc.ts', {'@babylonjs/core': core,
        '@/babylon/character/character': {default: Character}})
    const {NpcManager: manager} = loadModule('babylon/npc/npcManager.ts', {
        '@/utils/utils': {Utils: {calculateWalkYPos: () => 3}},
    })
    const npc = Object.create(Npc.prototype)
    npc.pos = core.Vector3.Zero()
    manager.npcs.set(1, npc); manager.guards.set(1, npc)
    manager.npcMove([1, 1, 2, 4, 6, 1])
    const target = npc.movementTarget
    for (let i = 0; i < 100; i++) manager.npcMove([1, 1, 2, 4, 6, 1])
    assert.equal(npc.movementTarget, target)
    assert.equal(npc.angle, Math.atan2(-4, 3))
    let snaps = 0
    npc.model = {snapToParentPosition() {snaps++}}
    manager.guardMoveStop([1, 20, 21, true])
    assert.equal(snaps, 1)
    assert.equal(npc.movementTarget, null)
    assert.equal(npc.speed, 0)
    assert.equal(npc.pos.y, 3)
})

test('authoritative corrections refresh local terrain height while small moving drift stays ignored', () => {
    let stops = 0, heights = 0
    const char = {id: 1, pos: {x: 0, y: 0, z: 0}, logicYpos: 0, getBoxSize: () => .8,
        stopMovementLocally() {stops++}, setMoveAngle() {}, setActualSpeed() {}, setMoveType() {}}
    const MyPlayer = {myChar: char}
    const Utils = {calculateWalkYPos: (x, z) => {heights++; return x + z}}
    const {CharacterManager: manager} = loadModule('babylon/character/characterManager.ts', {
        '@/data/myPlayer': {MyPlayer}, '@/utils/utils': {Utils},
    })
    manager.charMove([1, .2, .2, 1, 2, 'W'])
    assert.equal(heights, 0)
    assert.equal(char.pos.x, 0)
    manager.charMove([1, 3, 4, 1, 2, 'W'])
    assert.equal(char.logicYpos, 7)
    manager.charMove([1, 3.1, 4.1, null, 0, 'N'])
    assert.equal(stops, 1)
    assert.ok(Math.abs(char.logicYpos - 7.2) < 1e-10)
    const {MessageProcessor: processor} = loadModule('network/messageProcessor.ts', {
        '@/data/myPlayer': {MyPlayer}, '@/utils/utils': {Utils},
    })
    processor.charMoveDesynced([1, 10, 20, 1, 2])
    assert.equal(char.logicYpos, 30)
})

test('character interpolation cannot overshoot even during a long push-through frame', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {CharacterModel} = loadModule('babylon/character/characterModel.ts', {})
    for (const dt of [1 / 140, 1 / 30, .1, .25]) {
        const model = Object.create(CharacterModel.prototype)
        model.parent = {pos: new core.Vector3(10, 0, 10), logicYpos: 5, yMoveSpeed: 12,
            isPushThroughVisualActive: () => true}
        model.node = {position: core.Vector3.Zero(), markAsDirty() {}, computeWorldMatrix() {}}
        model.moveModel(dt)
        assert.ok(model.node.position.x > 0 && model.node.position.x <= 10)
        assert.ok(model.node.position.z > 0 && model.node.position.z <= 10)
        assert.ok(model.node.position.y > 0 && model.node.position.y <= 5)
    }
})
