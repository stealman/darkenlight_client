const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const ts = require('typescript')

function load(path, dependencies = {}) {
    const exports = {}
    const {outputText} = ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    })
    new Function('exports', 'require', outputText)(exports, name => dependencies[name] ?? {})
    return exports
}

function setup(t) {
    t.mock.method(Date, 'now', () => 1000)
    const {MagicArrow} = load('../../server/darkenlight_server/src/game/spells/magicArrow.ts')
    const {HealingSpell} = load('../../server/darkenlight_server/src/game/spells/healingSpell.ts')
    const CharacterActions = Object.fromEntries(['MAGIC_ARROW', 'HEALING_SPELL', 'AUTO_ATTACK'].map(name => [name, {name}]))
    CharacterActions.getActionByName = name => CharacterActions[name]
    const targeting = {selectedTarget: null, isAttackableTarget: () => true}
    const targets = new Map()
    const sent = []
    const noop = () => {}
    const {MyPlayer: player} = load('src/data/myPlayer.ts', {
        vue: {ref: value => ({value})},
        '@game/game/spells/magicArrow': {MagicArrow},
        '@game/game/spells/healingSpell': {HealingSpell},
        '@/data/actions/characterActions': {CharacterActions},
        '@/gui/targettingManager': {TargetingManager: targeting},
        '@/gui/actionButtonsManager': {ActionButtonsManager: {setActiveAction: noop}},
        '@/gui/guiButtonsManager': {GuiButtonsManager: {setActiveAction: noop}},
        '@/network/connector': {Connector: {sendMessage: message => sent.push(message)}},
        '@/network/messages': load('src/network/messages.ts'),
        '@/utils/utils': {Utils: {getAttackTargetByTypeAndId: (type, id) => targets.get(`${type}:${id}`)}},
    })
    player.clearPowerStrikeQueued = noop
    player.clearPreciseShotQueued = noop
    function addTarget(type, id, hpPercent = 100) {
        const target = {id, hpPercent, getObjectType: () => type}
        targets.set(`${type}:${id}`, target)
        return target
    }
    player.myChar = Object.assign(addTarget('C', 1), {hp: 100, maxHp: 100, mp: 10, cancelCombatApproach: noop})
    return {player, targeting, sent, addTarget, targets, CharacterActions}
}

test('Magic Arrow repeats at cooldown on its original target and stops when that target dies', t => {
    const {player, targeting, sent, addTarget, targets, CharacterActions: actions} = setup(t)
    const target = targeting.selectedTarget = addTarget('M', 2)
    player.toggleRepeatingSpell(actions.MAGIC_ARROW)
    player.repeatSpell(1100)
    assert.deepEqual(sent.map(message => message.d), [{id: 2, tp: 'M'}])

    player.setAction(actions.MAGIC_ARROW.name, target)
    player.repeatSpell(2100)
    assert.equal(sent.length, 1)
    player.magicArrowCooldownEnd = 4200
    player.setAction(null)
    targeting.selectedTarget = addTarget('M', 3)
    player.repeatSpell(4199)
    assert.equal(sent.length, 1)
    player.repeatSpell(4200)
    assert.deepEqual(sent.map(message => message.d), [{id: 2, tp: 'M'}, {id: 2, tp: 'M'}])

    targets.delete('M:2')
    player.repeatSpell(4300)
    player.repeatSpell(8000)
    assert.equal(player.repeatingSpell, null)
    assert.equal(sent.length, 2)
})

test('healing waits for missing health and mana, then resumes on the same character until toggled off', t => {
    const {player, targeting, sent, addTarget, CharacterActions: actions} = setup(t)
    const target = targeting.selectedTarget = addTarget('C', 2, 80)
    player.toggleRepeatingSpell(actions.HEALING_SPELL)
    player.setAction(actions.HEALING_SPELL.name)
    player.healingSpellCooldownEnd = 4000
    player.setAction(null)
    player.repeatSpell(3999)
    assert.equal(sent.length, 1)
    target.hpPercent = 100
    targeting.selectedTarget = addTarget('C', 3, 40)
    player.repeatSpell(4000)
    assert.equal(sent.length, 1)

    target.hpPercent = 90
    player.myChar.mp = 0
    player.repeatSpell(4100)
    assert.equal(sent.length, 1)
    player.myChar.mp = 1
    player.repeatSpell(4200)
    assert.deepEqual(sent.map(message => message.d), [{id: 2}, {id: 2}])

    player.toggleRepeatingSpell(actions.HEALING_SPELL)
    player.setAction(null)
    player.repeatSpell(8000)
    assert.equal(player.repeatingSpell, null)
    assert.deepEqual(sent.map(message => message.t), [78, 78, 9])
})

test('self-healing armed at full health resumes after taking damage and clears on world transition', t => {
    const {player, sent, CharacterActions: actions} = setup(t)
    player.stopMovementForTeleport = () => {}
    player.toggleRepeatingSpell(actions.HEALING_SPELL)
    assert.equal(sent.length, 0)
    player.myChar.hp = 99
    player.repeatSpell(1200)
    assert.deepEqual(sent.map(message => message.d), [{id: player.myChar.id}])

    player.beginWorldTransition()
    player.worldTransitionPending = false
    player.repeatSpell(4000)
    assert.equal(player.repeatingSpell, null)
    assert.equal(sent.length, 1)
})
