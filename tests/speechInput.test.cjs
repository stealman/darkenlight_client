const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const {parse, compileTemplate} = require('@vue/compiler-sfc')
const vue = require('vue')

test('speech input focuses without scrolling and releases the mobile viewport on cancel/unmount', async () => {
    for (const touch of [true, false]) {
        const classes = new Set(), sent = [], cleanup = []
        const descriptor = parse(readFileSync(join(__dirname, '../src/vue/views/SpeechInput.vue'), 'utf8')).descriptor
        assert.equal(compileTemplate({source: descriptor.template.content, filename: 'SpeechInput.vue', id: 'speech'}).errors.length, 0)
        const deps = {
            vue: {...vue, onMounted() {}, onUnmounted: fn => cleanup.push(fn)},
            '@/network/connector': {Connector: {sendMessage: msg => sent.push(msg.d)}},
            '@/network/messages': {SayMsg: class {constructor(d) {this.d = d}}},
            '@/data/myPlayer': {MyPlayer: {isDead: {value: false}, stopMove() {}}},
            '@/controlls/controller': {Controller: {cancelHeldMovement() {}}},
            '@/i18n': {useI18n: () => ({t: x => x})},
            '@/settings/settings': {Settings: {isPhoneOrTablet: () => touch}},
        }
        const exports = {}
        const source = descriptor.scriptSetup.content + '\nexport {open, cancel, input, text, onKeyDown};'
        vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
            exports, require: name => deps[name],
            document: {getElementById: () => ({classList: {add: name => classes.add(name), remove: name => classes.delete(name)}})},
            window: {removeEventListener() {}},
        })
        let preventScroll
        exports.input.value = {focus: opts => {preventScroll = opts.preventScroll}}
        exports.open(); await vue.nextTick()
        assert.equal(preventScroll, true)
        assert.equal(classes.has('speech-viewport-locked'), touch)
        exports.text.value = 'Hello'
        exports.onKeyDown({key: 'Enter', preventDefault() {}})
        assert.equal(sent[0].text, 'Hello')
        assert.equal(classes.size, 0)
        exports.open(); await vue.nextTick()
        cleanup.forEach(fn => fn())
        assert.equal(classes.size, 0)
    }
})

test('keyboard resize and visual viewport panning keep app dimensions and offsets synchronized', () => {
    const source = readFileSync(join(__dirname, '../src/App.vue'), 'utf8').replace(/\r\n/g, '\n')
    const start = source.indexOf('const syncAppViewportSize = () => {')
    const end = source.indexOf('\n}\n', start) + 2
    const styles = {}, wrapper = {style: {}}, app = {style: {}}
    const window = {innerWidth: 900, innerHeight: 420, visualViewport: {width: 900, height: 180, offsetTop: 70}}
    const exports = {}
    const script = source.slice(start, end) + '\nexports.sync = syncAppViewportSize'
    vm.runInNewContext(script, {exports, window, Settings: {isPhoneOrTablet: () => true},
        document: {documentElement: {style: {setProperty: (key, val) => {styles[key] = val}}}, getElementById: id => id === 'app' ? app : wrapper}})
    exports.sync()
    assert.equal(styles['--app-viewport-height'], '180px')
    assert.equal(styles['--app-viewport-top'], '70px')
    assert.equal(wrapper.style.height, '180px')
    window.visualViewport.height = 420; window.visualViewport.offsetTop = 0
    exports.sync()
    assert.equal(app.style.height, '420px')
    assert.equal(styles['--app-viewport-top'], '0px')
})
