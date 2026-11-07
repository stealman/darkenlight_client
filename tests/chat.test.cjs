const assert = require('node:assert/strict')
const {test} = require('node:test')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function setup() {
    const stored = new Map()
    const exports = {}
    const source = fs.readFileSync(require('node:path').join(__dirname, '../src/data/chatManager.ts'), 'utf8')
    vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {
        exports, require: () => ({reactive: x => x}), localStorage: {getItem: k => stored.get(k), setItem: (k,v) => stored.set(k,v)},
    })
    return exports.ChatManager
}
const message = (id, channel = 'private', from = 'Alice', to = 'Bob') => ({id, channel, from, to, text: 'Hello', time: Number(id) || 1})
test('history merges concurrent live private messages without duplicates', () => {
    const chat = setup(); chat.initialize(1, 'Alice')
    chat.receive({entry: message('2')})
    chat.receive({history: [message('1'), message('2')]})
    assert.equal(chat.state.messages.length, 2)
    assert.equal(chat.state.unread.private, 1)
    assert.equal(chat.state.recent[0], 'Bob')
})
test('storage is isolated per character and restores public/party/private history', () => {
    const chat = setup(); chat.initialize(1, 'Alice')
    for (const channel of ['private','public','party']) chat.add(message(channel, channel))
    chat.initialize(2, 'Bob'); assert.equal(chat.state.messages.length, 0)
    chat.initialize(1, 'Alice'); assert.equal(chat.state.messages.length, 3)
})
test('recent contacts keep the latest five and incoming correspondents', () => {
    const chat = setup(); chat.initialize(1, 'Alice')
    for (let i = 0; i < 7; i++) chat.add(message(String(i), 'private', 'Person'+i, 'Alice'))
    assert.equal(chat.state.recent.length, 5)
    assert.equal(chat.state.recent[0], 'Person6')
    chat.add(message('8', 'private', 'Alice', 'Person2'))
    assert.equal(chat.state.recent[0], 'Person2')
})
test('public history is bounded and unread counts respect active visible channel', () => {
    const chat = setup(); chat.initialize(1, 'Alice'); chat.visible = true
    for (let i = 0; i < 205; i++) chat.add(message(String(i), 'public'))
    assert.equal(chat.state.messages.length, 200)
    assert.equal(chat.state.unread.public, 0)
    chat.visible = false; chat.add(message('206', 'public'))
    assert.equal(chat.state.unread.public, 1)
})

function setupPanel(deviceType = 'DESKTOP', desktopHud = false, storage = new Map()) {
    const {parse} = require('@vue/compiler-sfc')
    const vue = require('vue')
    const ChatManager = setup(); ChatManager.initialize(1, 'Alice')
    const sent = []
    const targetCycles = []
    const deps = {
        vue: {...vue, onMounted() {}, onUnmounted() {}},
        '@/data/chatManager': {ChatManager},
        '@/network/connector': {Connector: {sendMessage: msg => sent.push(msg.d)}},
        '@/network/messages': {ChatSendMsg: class {constructor(d) {this.d = d}}, SayMsg: class {constructor(d) {this.d = d}}},
        '@/controlls/controller': {Controller: {cancelHeldMovement() {}}},
        '@/data/myPlayer': {MyPlayer: {stopMove() {}}},
        '@/i18n': {useI18n: () => ({t: x => x})},
        '@/settings/settings': {Settings: {getDeviceType: () => deviceType, isPhoneOrTablet: () => deviceType !== 'DESKTOP'}},
        '@/gui/targettingManager': {TargetingManager: {cycleThroughClosestTargets: () => targetCycles.push(true)}},
    }
    const path = require('node:path').join(__dirname, '../src/vue/views/character/CharacterChatTab.vue')
    const source = parse(fs.readFileSync(path, 'utf8')).descriptor.scriptSetup.content
        + '\nexport {send, drafts, cyclePerson, onKeyDown, reply, select, input, phoneLayout, focusInput, panel, hudSize, resizing, startResize, moveResize, endResize, restoreHudSize, onViewportResize};'
    const exports = {}
    vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
        exports, require: name => deps[name], defineProps: () => ({visible: true, desktopHud}), defineExpose() {}, setTimeout, clearTimeout,
        window: {innerWidth: 1000, innerHeight: 800},
        document: {documentElement: {style: {setProperty() {}}}},
        localStorage: {getItem: key => storage.get(key), setItem: (key, val) => storage.set(key, val)},
        CustomEvent: class {constructor(type, opts) {this.type = type; this.detail = opts.detail}},
    })
    return {...exports, chat: ChatManager, sent, targetCycles}
}
test('private composer parses recipient and text; arrows cycle contacts preserving body', () => {
    const s = setupPanel()
    s.chat.state.active = 'private'; s.chat.state.recent = ['Bob','Eve']
    s.drafts.private = 'Bob: Hello there'
    s.cyclePerson({preventDefault() {}}, 1)
    assert.equal(s.drafts.private, 'Bob: Hello there')
    s.cyclePerson({preventDefault() {}}, 1)
    assert.equal(s.drafts.private, 'Eve: Hello there')
    s.send()
    assert.equal(s.sent[0].to, 'Eve')
    assert.equal(s.sent[0].text, 'Hello there')
    assert.equal(s.drafts.private, 'Eve: ')
})
test('Tab and Shift+Tab switch chat channels and consume the event', () => {
    const s = setupPanel()
    let prevented = 0, stopped = 0
    const event = {key: 'Tab', preventDefault() {prevented++}, stopPropagation() {stopped++}}
    s.onKeyDown(event); assert.equal(s.chat.state.active, 'private')
    s.onKeyDown({...event, shiftKey: true}); assert.equal(s.chat.state.active, 'public')
    assert.equal(prevented, 2); assert.equal(stopped, 2)
    s.reply('Bob'); assert.equal(s.chat.state.active, 'private'); assert.equal(s.drafts.private, 'Bob: ')
})

test('switching chats focuses input only on desktop and compact layout is phone-only', async () => {
    for (const device of ['DESKTOP', 'PHONE', 'TABLET']) {
        const s = setupPanel(device)
        let focuses = 0
        s.input.value = {focus() {focuses++}}
        s.select('private')
        await require('vue').nextTick()
        assert.equal(focuses, device === 'DESKTOP' ? 1 : 0, device)
        assert.equal(s.phoneLayout.value, device === 'PHONE', device)
    }
})

test('selected-player tooltip offers private chat only for another human player', () => {
    const exports = {}, events = []
    const target = {id: 2, isBot: false, getName: () => 'Bob', getObjectType: () => 'C', getRelationToMyPlayer: () => 'ALLY'}
    const targeting = {selectedTarget: target}
    const deps = {
        '@/data/myPlayer': {MyPlayer: {myChar: {id: 1}}},
        '@/babylon/monsters/monster': {Monster: class {}},
        '@/gui/targettingManager': {TargetingManager: targeting},
        '@/gui/tooltipOverlayManager': {}, '@/data/monsterCatalog': {},
        '@/data/gameClass': {GameClasses: {}}, '@/i18n': {t: key => key},
    }
    const source = fs.readFileSync(require('node:path').join(__dirname, '../src/gui/selectedTargetPanel.ts'), 'utf8')
    vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
        exports, require: name => deps[name], window: {dispatchEvent: event => events.push(event)},
        CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options.detail}},
    })
    const panel = exports.SelectedTargetPanel
    const action = panel.buildTooltipContent().titleAction
    assert.equal(action.icon, '/images/icons/buttons/btn_speech.png')
    action.onClick()
    assert.equal(events[0].type, 'ui:open-private-chat')
    assert.equal(events[0].detail.name, 'Bob')
    target.isBot = true
    assert.equal(panel.buildTooltipContent().titleAction, undefined)
    target.isBot = false; target.id = 1
    assert.equal(panel.buildTooltipContent().titleAction, undefined)
    target.id = 2; target.getObjectType = () => 'N'
    assert.equal(panel.buildTooltipContent().titleAction, undefined)
})

test('desktop HUD focuses on request, sends and releases typing; Tab cycles targets instead of chats', () => {
    const s = setupPanel('DESKTOP', true)
    let focuses = 0, blurs = 0
    s.input.value = {focus: () => focuses++, blur: () => blurs++}
    s.focusInput()
    assert.equal(focuses, 1)
    assert.equal(s.chat.hudVisible, true)
    assert.equal(s.chat.visible, false)
    s.drafts.public = 'Hello from HUD'
    s.send()
    assert.equal(s.sent[0].text, 'Hello from HUD')
    assert.equal(blurs, 1)
    s.onKeyDown({key: 'Tab', preventDefault() {}, stopPropagation() {}})
    assert.equal(s.chat.state.active, 'public')
    assert.equal(s.targetCycles.length, 1)
    assert.equal(blurs, 2)
    s.onKeyDown({key: 'Escape', preventDefault() {}, stopPropagation() {}})
    assert.equal(blurs, 3)
})

test('visible desktop HUD marks only the selected channel as read', () => {
    const chat = setup(); chat.initialize(1, 'Alice'); chat.hudVisible = true
    chat.add(message('1', 'public'))
    chat.add(message('2', 'private'))
    assert.equal(chat.state.unread.public, 0)
    assert.equal(chat.state.unread.private, 1)
})

test('HUD resizes from top right, persists on release, and restores saved dimensions', () => {
    const storage = new Map()
    const s = setupPanel('DESKTOP', true, storage)
    s.panel.value = {getBoundingClientRect: () => ({width: 300, height: 150})}
    const pointers = new Set()
    const handle = {setPointerCapture: id => pointers.add(id), hasPointerCapture: id => pointers.has(id), releasePointerCapture: id => pointers.delete(id)}
    s.startResize({button: 0, pointerId: 7, clientX: 300, clientY: 500, currentTarget: handle})
    assert.equal(s.resizing.value, true)
    s.moveResize({pointerId: 8, clientX: 999, clientY: 0})
    assert.equal(s.hudSize.value, null)
    s.moveResize({pointerId: 7, clientX: 450, clientY: 400})
    assert.equal(s.hudSize.value.width, 450)
    assert.equal(s.hudSize.value.height, 250)
    assert.equal(storage.size, 0)
    s.endResize({pointerId: 7})
    assert.equal(s.resizing.value, false)
    assert.equal(pointers.size, 0)
    const restored = setupPanel('DESKTOP', true, storage)
    restored.restoreHudSize()
    assert.equal(restored.hudSize.value.width, 450)
    assert.equal(restored.hudSize.value.height, 250)
})

test('HUD stored sizes are validated and constrained to usable screen bounds', () => {
    const storage = new Map([['darkenlight:desktopChatSize', '{broken']])
    const s = setupPanel('DESKTOP', true, storage)
    s.restoreHudSize()
    assert.equal(s.hudSize.value, null)
    storage.set('darkenlight:desktopChatSize', JSON.stringify({width: 9999, height: 9999}))
    s.restoreHudSize()
    assert.equal(s.hudSize.value.width, 1000)
    assert.equal(s.hudSize.value.height, 752)
    storage.set('darkenlight:desktopChatSize', JSON.stringify({width: 1, height: 1}))
    s.restoreHudSize()
    assert.equal(s.hudSize.value.width, 220)
    assert.equal(s.hudSize.value.height, 100)
})

test('only new live messages signal a bubble; history and duplicates do not', () => {
    const chat = setup(); chat.initialize(1, 'Alice')
    assert.equal(chat.receive({history: [message('1')]}), false)
    assert.equal(chat.receive({entry: message('1')}), false)
    assert.equal(chat.receive({entry: message('2')}), true)
    assert.equal(chat.receive({entry: message('2')}), false)
})
