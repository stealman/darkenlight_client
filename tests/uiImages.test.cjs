const assert = require('node:assert/strict')
const {test} = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')
const {createCanvas, loadImage} = require('@napi-rs/canvas')
const {collectUiImages} = require('../build/uiImages.cjs')

test('build emits deterministic PNG variants, retaining transparency and the armor saturation exception', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'darkenlight-ui-images-'))
    t.after(() => {
        assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(), 'darkenlight-ui-images-')))
        fs.rmSync(directory, {recursive: true})
    })
    const canvas = createCanvas(12, 12)
    const context = canvas.getContext('2d')
    context.fillStyle = '#ff0000'
    context.fillRect(3, 3, 6, 6)
    const entries = ['/images/icons/test.png', '/images/items/armor/test.png'].map(imagePath => ({imagePath}))
    for (const {imagePath} of entries) {
        const target = path.join(directory, imagePath.slice(1))
        fs.mkdirSync(path.dirname(target), {recursive: true})
        fs.writeFileSync(target, canvas.toBuffer('image/png'))
    }
    const result = await collectUiImages(directory, entries)
    assert.deepEqual((await collectUiImages(directory, entries)).urls, result.urls)
    for (const {imagePath} of entries) {
        const urls = result.urls[imagePath]
        assert.notEqual(urls.smoothUrl, urls.pixelatedUrl)
        for (const url of Object.values(urls)) {
            assert.match(url, /^\/assets\/ui-images\/[a-f0-9]{64}\.png$/)
            const file = result.files.find(file => `/${file.fileName}` === url)
            const image = await loadImage(file.source)
            assert.equal(image.width, 12)
            context.clearRect(0, 0, 12, 12)
            context.drawImage(image, 0, 0)
            assert.equal(context.getImageData(0, 0, 1, 1).data[3], 0)
        }
        const smooth = result.files.find(file => `/${file.fileName}` === urls.smoothUrl)
        context.clearRect(0, 0, 12, 12)
        context.drawImage(await loadImage(smooth.source), 0, 0)
        assert.deepEqual([...context.getImageData(5, 5, 1, 1).data], imagePath.includes('/armor/') ? [255, 0, 0, 255] : [195, 16, 16, 255])
    }
    await assert.rejects(collectUiImages(directory, [{imagePath: '/missing.png'}]))
})

test('production startup only maps generated URLs and switches styles with relative or absolute URLs', async t => {
    const source = fs.readFileSync(path.join(__dirname, '../src/gui/uiIconManager.ts'), 'utf8').replaceAll('import.meta.env.PROD', 'true')
    const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText
    const exports = {}
    const originalWindow = global.window
    global.window = {location: {href: 'https://example.test/'}}
    t.after(() => { global.window = originalWindow })
    const urls = {smoothUrl: '/assets/ui-images/smooth.png', pixelatedUrl: '/assets/ui-images/pixel.png'}
    new Function('exports', '__UI_IMAGE_URLS__', '__PIXELATED_IMAGE_PATHS__', code)(exports, {'/images/icons/test.png': urls}, ['/images/icons/test.png'])
    const manager = exports.UiIconManager
    manager.applyToSubtree = () => {}
    manager.startDomObserver = () => {}
    manager.createProcessedPngUrls = () => assert.fail('Production must not convert images')
    global.document = {documentElement: {}}
    t.after(() => { delete global.document })
    await manager.initialize(true)
    assert.equal(manager.getUrl('/images/icons/test.png'), urls.pixelatedUrl)
    manager.setPixelated(false)
    assert.equal(manager.getUrl(urls.pixelatedUrl), urls.smoothUrl)
    manager.setPixelated(true)
    assert.equal(manager.getUrl(`https://example.test${urls.smoothUrl}`), urls.pixelatedUrl)
})
