const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const ts = require('typescript')
function load(path, dependencies) {
    const exports = {}
    new Function('exports', 'require', ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText)(exports, name => dependencies[name] || {})
    return exports
}
test('teleport broadcasts before login are harmless and normal teleports still move the player', () => {
    const effects = [], positions = []
    const player = {myChar: null, isDead: {value: false}, stopMovementForTeleport() {}, setAction() {}}
    const {CharacterManager: manager} = load('src/babylon/character/characterManager.ts', {
        '@/data/myPlayer': {MyPlayer: player},
        '@/babylon/gfx/teleportEffect': {TeleportEffect: {create(...pos) {effects.push(pos)}}},
        '@/data/actions/characterActions': {CharacterActions: {HEAL: {name: 'heal'}}},
        '@/babylon/audio/audioManager': {AudioManager: {playTeleport() {}}},
    })
    const data = {id: 1, x: 2, y: 3, z: 4, fx: 5, fy: 6, fz: 7, departure: false}
    manager.characterTeleported(data)
    manager.characterTeleported({...data, departure: true})
    assert.equal(effects.length, 0)
    player.myChar = {id: 1, breakAutoAttack() {}, teleportTo(...pos) {positions.push(pos)}}
    manager.characterTeleported(data)
    assert.deepEqual(positions, [[2, 3, 4]])
    manager.characterTeleported({...data, departure: true})
    assert.deepEqual(effects, [[2, 3, 4], [5, 6, 7]])
})
test('chat and activity packets use distinct routes and wire IDs', async () => {
    const calls = []
    const {MessageProcessor: processor} = load('src/network/messageProcessor.ts', {
        '@/data/activityLogManager': {ActivityLogManager: {receive(data) {calls.push(['log', data])}}},
        '@/data/chatManager': {ChatManager: {receive(data) {calls.push(['chat', data]); return false}}},
    })
    const chat = {history: []}, log = {event: 'campfire'}
    await processor.processResponse([{t: 100, d: chat}, {t: 101, d: log}])
    assert.deepEqual(calls, [['chat', chat], ['log', log]])
    const server = readFileSync('../../server/darkenlight_server/src/network/messages.ts', 'utf8')
    assert.match(server, /class ChatPacket implements Message\s*{\s*t = 100/)
    assert.match(server, /class ActivityLog implements Message\s*{\s*t = 101/)
})
