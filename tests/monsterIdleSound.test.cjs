const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')

test('sheep idle sounds have independent 20–60 second delays and skip dead, unseen and attacking mobs', () => {
    const calls = []
    const AudioManager = {monsterIdleSounds: new Map([[1201, {}]]), playMonsterIdle: (...args) => calls.push(args)}
    let random = 0
    const exports = {}
    vm.runInNewContext(ts.transpileModule(readFileSync(join(__dirname, '../src/babylon/monsters/monster.ts'), 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText, {exports, Math: {random: () => random}, require: name => name === '@/babylon/audio/audioManager' ? {AudioManager} : {}})
    const make = () => Object.assign(Object.create(exports.Monster.prototype), {
        mobType: {id: 1201}, pos: {}, nextIdleSoundAt: 0, killedTime: 0, hpPercent: 100, insideView: true, autoAttackEnd: 0,
    })
    const first = make()
    first.updateIdleSound(1000)
    assert.equal(first.nextIdleSoundAt, 21000)
    assert.equal(calls.length, 0)
    random = 1
    const second = make()
    second.updateIdleSound(1000)
    assert.equal(second.nextIdleSoundAt, 61000)
    first.updateIdleSound(20999)
    assert.equal(calls.length, 0)
    first.updateIdleSound(21000)
    assert.equal(calls.length, 1)
    assert.equal(first.nextIdleSoundAt, 81000)
    for (const overrides of [{killedTime: 1}, {hpPercent: 0}, {insideView: false}, {autoAttackEnd: 999999}, {mobType: {id: 1101}}]) {
        const monster = Object.assign(make(), {nextIdleSoundAt: 1000}, overrides)
        monster.updateIdleSound(1000)
        assert.equal(calls.length, 1)
    }
    second.updateIdleSound(61000)
    assert.equal(calls.length, 2)
})
