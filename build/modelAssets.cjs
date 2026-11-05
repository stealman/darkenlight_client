const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

// Emit immutable, content-addressed copies. glTF dependencies are rewritten
// before hashing the parent, so a changed texture also versions its model.
function collectModelAssets(directory) {
    const sources = new Map()
    const assets = new Map()
    const visiting = new Set()
    function walk(folder, prefix = '/models') {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const file = path.join(folder, entry.name)
            const url = `${prefix}/${entry.name}`
            if (entry.isDirectory()) walk(file, url)
            else if (entry.isFile()) sources.set(url, fs.readFileSync(file))
        }
    }
    walk(directory)

    function emit(url) {
        if (assets.has(url)) return assets.get(url)
        if (visiting.has(url)) throw new Error(`Circular model dependency: ${url}`)
        visiting.add(url)
        let source = sources.get(url)
        if (!source) throw new Error(`Missing model dependency: ${url}`)
        const extension = path.posix.extname(url).toLowerCase()
        if (extension === '.gltf' || extension === '.glb') {
            const binary = extension === '.glb'
            const jsonLength = binary ? source.readUInt32LE(12) : 0
            const json = JSON.parse(binary ? source.subarray(20, 20 + jsonLength).toString() : source.toString())
            let changed = false
            for (const resource of [...(json.buffers || []), ...(json.images || [])]) {
                const uri = resource.uri
                if (!uri || /^(data:|https?:|\/\/)/i.test(uri)) continue
                const resolved = new URL(uri, `https://assets.invalid${url}`)
                const target = emit(decodeURI(resolved.pathname)).url
                const outputDirectory = path.posix.dirname('/model-assets/' + url.slice('/models/'.length))
                resource.uri = path.posix.relative(outputDirectory, target)
                changed = true
            }
            if (changed) {
                const jsonBytes = Buffer.from(JSON.stringify(json))
                if (binary) {
                    const padded = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20)
                    jsonBytes.copy(padded)
                    const header = Buffer.from(source.subarray(0, 20))
                    const tail = source.subarray(20 + jsonLength)
                    header.writeUInt32LE(20 + padded.length + tail.length, 8)
                    header.writeUInt32LE(padded.length, 12)
                    source = Buffer.concat([header, padded, tail])
                } else source = jsonBytes
            }
        }
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 16)
        const relative = url.slice('/models/'.length)
        const ext = path.posix.extname(relative)
        const fileName = `model-assets/${relative.slice(0, relative.length - ext.length)}.${hash}${ext}`
        const asset = { url: `/${fileName}`, fileName, source }
        visiting.delete(url)
        assets.set(url, asset)
        return asset
    }
    for (const url of sources.keys()) emit(url)
    return {
        urls: Object.fromEntries([...assets].map(([url, asset]) => [url, asset.url])),
        files: [...assets.values()],
    }
}

module.exports = { collectModelAssets }
