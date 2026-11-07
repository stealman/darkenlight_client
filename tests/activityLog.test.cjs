const assert = require('node:assert/strict')
const {test} = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
test('history caps at 1000, restores time, isolates characters and survives storage failure', () => {
    const saved = new Map()
    const storage = {getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value)}
    const source = ts.transpileModule(fs.readFileSync('src/data/activityLogManager.ts', 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText
    const exports = {}
    new Function('exports', 'require', 'localStorage', source)(exports, name => ({
        vue: {reactive: state => state}, '@/i18n': {t: key => key}, '@/data/items/item': {},
    }[name]), storage)
    const log = exports.ActivityLogManager
    log.initialize(1)
    log.rememberAttackWeapon({name: 'Sword'})
    assert.equal(log.lastAttackWeaponName, 'Sword')
    for (let i = 0; i < 1005; i++) log.add(`hit ${i}`, '#ffd45c', 123 + i)
    assert.equal(log.state.entries.length, 1000)
    assert.equal(log.state.entries[0].text, 'hit 5')
    assert.equal(new Set(log.state.entries.map(e => e.id)).size, 1000)
    log.initialize(2)
    assert.equal(log.lastAttackWeaponName, '')
    assert.deepEqual(log.state.entries, [])
    log.initialize(1)
    assert.equal(log.state.entries[0].time, 128)
    assert.equal(log.state.entries[999].color, '#ffd45c')
    saved.set('activityLog:3', 'broken JSON')
    log.initialize(3)
    assert.deepEqual(log.state.entries, [])
    log.add('Recovered +25 HP', '#20ff20', 123, {damage: {before: 'Recovered +', value: '25', after: ' HP'}})
    assert.equal(log.state.entries[0].damage.value, '+25 HP')
    assert.equal(log.state.entries[0].damage.before, 'Recovered ')
    assert.equal(log.state.entries[0].damage.after, '')
    log.initialize(4)
    storage.setItem = () => { throw Error('quota') }
    log.add('still works')
    assert.equal(log.state.entries[0].text, 'still works')
})

test('shared damage colors load without rendering or character initialization', () => {
    const source = ts.transpileModule(fs.readFileSync('src/gui/combatColors.ts', 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText
    const exports = {}
    new Function('exports', 'require', source)(exports, name => { throw Error(`Unexpected dependency: ${name}`) })
    assert.equal(exports.getDamageColor('P', '#ff2020'), '#ffd45c')
    assert.equal(exports.getDamageColor('G', '#ff2020'), '#a9a9a9')
    assert.equal(exports.getDamageColor('N', '#ff2020'), '#ff2020')
    assert.equal(exports.getDamageColor(null, '#f08f56'), '#f08f56')
    assert.equal(exports.getRelationColor('ENEMY'), '#f08f56')
    assert.equal(exports.getRelationColor('NEUTRAL'), '#aaaaaa')
    assert.equal(exports.getRelationColor('ALLY'), '#56aaff')
})

test('activity translations preserve Czech diacritics and event symbols', () => {
    const cs = JSON.parse(fs.readFileSync('src/i18n/locales/cs.json', 'utf8')).activityLog
    const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')).activityLog
    assert.equal(cs.empty, 'Zat\u00edm \u017e\u00e1dn\u00e9 ud\u00e1losti.')
    assert.equal(cs.campfire, 'Rozd\u011blal jsi ohe\u0148.')
    assert.equal(cs.pickup, 'Sebr\u00e1no: {item} \u00d7{quantity}')
    for (const locale of [cs, en]) {
        for (const value of Object.values(locale)) assert.equal(value.includes('?'), false)
        assert.ok(locale.outgoing.includes('\u2192'))
        assert.ok(locale.purchase.includes('\u00d7'))
    }
})

test('combat log retains the name of a killed target and identifies guard attackers', () => {
    const entries = []
    const corpse = {id: 7, getName: () => 'Skeleton'}
    const monsters = new Map([[7, corpse]])
    const killedMonsters = new Set()
    let equippedWeapon = null
    const player = {id: 1, getName: () => 'Player', getWeapon: () => equippedWeapon}
    const dependencies = {
        '@/data/myPlayer': {MyPlayer: {myChar: player}},
        '@/babylon/monsters/monsterManager': {MonsterManager: {monsters, killedMonsters}},
        '@/babylon/character/characterManager': {CharacterManager: {characters: new Map(), startAutoAttack() {}}},
        '@/babylon/npc/npcManager': {NpcManager: {guards: new Map([[9, {getName: () => 'Guard'}]])}},
        '@/data/inventoryManager': {InventoryManager: {inventory: []}},
        '@/data/activityLogManager': {ActivityLogManager: {lastAttackWeaponName: '', rememberAttackWeapon(weapon) {this.lastAttackWeaponName = weapon?.name || 'Bare hands'}, add(text, color, time, details) {entries.push({text, color, ...details})}}},
        '@/gui/combatColors': {getDamageColor: () => '#ffd45c'},
        '@/i18n': {t: (key, params = {}) => key === 'items.weapons.steel-sword' ? 'Steel Sword' : key === 'activityLog.unarmed' ? 'Bare hands' : `${key}: ${params.name || ''}: ${params.result || params.amount || ''}`} ,
    }
    const exports = {}
    new Function('exports', 'require', ts.transpileModule(fs.readFileSync('src/network/messageProcessor.ts', 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText)(exports, name => dependencies[name] || {})
    const processor = exports.MessageProcessor
    const hit = {id: 1, tgt: 7, tp: 'M', res: {h: 'h', d: 46, q: 'P'}}
    processor.logAttack(hit, false)
    monsters.delete(7)
    killedMonsters.add(corpse)
    processor.logAttack(hit, false)
    assert.ok(entries[0].text.includes('Skeleton'))
    assert.ok(entries[1].text.includes('Skeleton'))
    assert.ok(entries[1].text.endsWith('46 (Bare hands)'))
    assert.equal(entries[1].damage.value, '46')
    assert.equal(entries[1].damage.after, ' (Bare hands)')
    assert.equal(entries[1].negative, false)
    processor.logAttack({id: 9, tgt: 1, tp: 'C', res: {h: 'm', d: 0, q: null}}, true)
    assert.ok(entries[2].text.includes('Guard'))
    assert.equal(entries[2].damage, undefined)
    assert.equal(entries[2].negative, false)
    processor.logAttack({id: 9, tgt: 1, tp: 'C', res: {h: 'h', d: 12, q: 'G'}}, true)
    assert.equal(entries[3].negative, true)
    assert.equal(entries[3].damage.value, '12')
    processor.logHealing(1, 7, 'M', 15)
    processor.logHealing(2, 1, 'C', 22)
    processor.logHealing(null, 1, 'C', 8)
    assert.ok(entries[4].text.includes('healOutgoing'))
    assert.ok(entries[5].text.includes('healIncoming'))
    assert.ok(entries[6].text.includes('healSelf'))
    assert.equal(entries[6].negative, undefined)
    assert.equal(entries[6].color, '#20ff20')
    assert.equal(entries[6].damage.value, '8')
    assert.equal(entries[4].damage.value, '15')
    equippedWeapon = {name: 'Steel Sword'}
    processor.processCharacterAttack({id: 1})
    equippedWeapon = {name: 'Bow'}
    processor.logAttack(hit, false)
    assert.ok(entries[7].text.endsWith('46 (Steel Sword)'))
    assert.equal(entries[7].damage.value, '46')
    assert.equal(entries[7].damage.after, ' (Steel Sword)')
    equippedWeapon = null
    processor.processCharacterAttack({id: 1})
    processor.logAttack(hit, false)
    assert.ok(entries[8].text.endsWith('46 (Bare hands)'))
    processor.logAttack({id: 9, tgt: 1, tp: 'C', res: {h: 'h', d: 12, q: 'N'}}, true)
    assert.equal(entries[9].text.includes('Steel Sword'), false)
    const count = entries.length
    processor.logHealing(2, 7, 'M', 15)
    processor.logHealing(1, 1, 'C', 0)
    assert.equal(entries.length, count)
    processor.processCharacterAttack({id: 1, ps: true})
    processor.logAttack(hit, false)
    assert.ok(entries[count].text.includes('skills.weapons.powerStrike'))
    processor.processCharacterAttack({id: 1, prs: true})
    processor.logAttack(hit, false)
    assert.ok(entries[count + 1].text.includes('skills.weapons.preciseShot'))
    processor.processCharacterAttack({id: 1})
    processor.logAttack(hit, false)
    assert.equal(entries[count + 2].text.includes('skills.weapons.'), false)
})

test('received effects and confirmed potion uses are logged without expiration spam or duplicates', () => {
    const entries = []
    const player = {myChar: {id: 1}, affectGroups: [], affectGroupChange(data) {
        this.affectGroups = data.af.length ? [{...data, lastUpdatedAt: Date.now()}] : []
    }}
    const definition = {displayDuration: true, adverse: true, getNameLocalized: () => 'Slow'}
    const dependencies = {
        '@/data/myPlayer': {MyPlayer: player},
        '@/data/affects': {AffectGroups: {5: definition, 2: {...definition, adverse: false, getNameLocalized: () => 'Meal'}}},
        '@/data/activityLogManager': {ActivityLogManager: {add(text, color, time, details) {entries.push({text, color, ...details})}}},
        '@/babylon/character/characterManager': {CharacterManager: {potionUsed() {}}},
        '@/i18n': {t: (key, params) => `${key}: ${params.name || params.amount}`},
    }
    const exports = {}
    new Function('exports', 'require', ts.transpileModule(fs.readFileSync('src/network/messageProcessor.ts', 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText)(exports, name => dependencies[name] || {})
    const processor = exports.MessageProcessor
    const slow = {id: 5, p: 20, af: [{data: [5, 4, 20]}]}
    processor.processCharacterAffectGroupChange(slow)
    assert.equal(entries[0].negative, true)
    processor.processCharacterAffectGroupChange({...slow, af: [{data: [5, 3, 20]}]})
    processor.processCharacterAffectGroupChange({...slow, p: 0, af: []})
    assert.equal(entries.length, 1)
    processor.processCharacterAffectGroupChange({id: 2, p: 1, af: [{data: [2, 600, 1]}]})
    assert.equal(entries[1].negative, false)
    for (const add of ['HP', 'MP', 'ST']) processor.processPotionUsed({id: 1, tp: 'C', add, val: 25})
    assert.equal(entries.length, 5)
    assert.equal(entries[2].color, '#20ff20')
    assert.equal(entries[2].damage.value, '25')
    assert.equal(entries[3].color, undefined)
    processor.processPotionUsed({id: 2, tp: 'C', add: 'HP', val: 25})
    processor.processPotionUsed({id: 1, tp: 'C', add: '', val: null})
    assert.equal(entries.length, 5)
})

test('party membership changes log once, ignore status updates and retain green world transitions', () => {
    const exports = {}
    const source = ts.transpileModule(fs.readFileSync('src/data/activityLogManager.ts', 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText
    new Function('exports', 'require', 'localStorage', source)(exports, name => ({
        vue: {reactive: state => state}, '@/i18n': {t: (key, params) => `${key}: ${JSON.stringify(params)}`},
        '@/data/items/item': {},
    }[name]), {getItem: () => null, setItem() {}})
    const log = exports.ActivityLogManager
    log.initialize(1)
    const party = {leaderId: 1, members: [{id: 1, name: 'Me'}, {id: 2, name: 'Friend'}]}
    log.partyChanged(null, party, 1)
    assert.ok(log.state.entries[0].text.includes('partyCreated'))
    assert.ok(log.state.entries[1].text.includes('Friend'))
    log.partyChanged(party, {...party, members: party.members.map(m => ({...m, hp: 20, x: 5}))}, 1)
    assert.equal(log.state.entries.length, 2)
    const expanded = {...party, members: [...party.members, {id: 3, name: 'New member'}]}
    log.partyChanged(party, expanded, 1)
    log.partyChanged(expanded, party, 1)
    assert.ok(log.state.entries[2].text.includes('partyMemberJoined'))
    assert.ok(log.state.entries[3].text.includes('partyMemberLeft'))
    log.partyChanged(party, null, 1)
    assert.ok(log.state.entries[4].text.includes('partyLeft'))
    log.partyChanged(null, party, 3)
    assert.ok(log.state.entries[5].text.includes('partyJoined'))
    log.worldChanged('Forest', 'Dungeon')
    const last = log.state.entries[log.state.entries.length - 1]
    assert.ok(last.text.includes('Forest') && last.text.includes('Dungeon'))
    assert.ok(log.state.entries.every(entry => entry.positive))
})
