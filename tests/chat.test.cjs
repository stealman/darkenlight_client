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

function setupPanel(deviceType = 'DESKTOP') {
    const {parse} = require('@vue/compiler-sfc')
    const vue = require('vue')
    const ChatManager = setup(); ChatManager.initialize(1, 'Alice')
    const sent = []
    const deps = {
        vue: {...vue, onMounted() {}, onUnmounted() {}},
        '@/data/chatManager': {ChatManager},
        '@/network/connector': {Connector: {sendMessage: msg => sent.push(msg.d)}},
        '@/network/messages': {ChatSendMsg: class {constructor(d) {this.d = d}}, SayMsg: class {constructor(d) {this.d = d}}},
        '@/controlls/controller': {Controller: {cancelHeldMovement() {}}},
        '@/data/myPlayer': {MyPlayer: {stopMove() {}}},
        '@/i18n': {useI18n: () => ({t: x => x})},
        '@/settings/settings': {Settings: {getDeviceType: () => deviceType, isPhoneOrTablet: () => deviceType !== 'DESKTOP'}},
    }
    const path = require('node:path').join(__dirname, '../src/vue/views/character/CharacterChatTab.vue')
    const source = parse(fs.readFileSync(path, 'utf8')).descriptor.scriptSetup.content
        + '\nexport {send, drafts, cyclePerson, onKeyDown, reply, select, input, phoneLayout};'
    const exports = {}
    vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
        exports, require: name => deps[name], defineProps: () => ({visible: true}), setTimeout, clearTimeout,
        CustomEvent: class {constructor(type, opts) {this.type = type; this.detail = opts.detail}},
    })
    return {...exports, chat: ChatManager, sent}
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
