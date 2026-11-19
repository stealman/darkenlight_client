const fs = require('node:fs/promises')

const endpoint = '/admin-utils/equipment-modifiers.json'

function validateModifiers(value) {
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v)
    const transform = v => object(v) && ['position', 'rotation', 'scale'].every(key =>
        object(v[key]) && ['x', 'y', 'z'].every(axis => typeof v[key][axis] === 'number' && Number.isFinite(v[key][axis])))
    if (!object(value) || !object(value.equipment) || !object(value.pauldrons)) return false
    if (value.hairPreviewColor !== undefined && (typeof value.hairPreviewColor !== 'string'
        || !/^#[\da-f]{6}$/i.test(value.hairPreviewColor))) return false
    if (value.hairPreviewLightness !== undefined && (typeof value.hairPreviewLightness !== 'number'
        || !Number.isFinite(value.hairPreviewLightness) || value.hairPreviewLightness < -2 || value.hairPreviewLightness > 4)) return false
    if (value.hair !== undefined && (!object(value.hair) || !Object.entries(value.hair).every(([id, v]) =>
        /^[1-9]\d*$/.test(id) && transform(v)))) return false
    if (value.legs !== undefined && (!object(value.legs) || !Object.entries(value.legs).every(([id, v]) =>
        /^\d+$/.test(id) && object(v) && transform(v.left) && transform(v.right)))) return false
    if (value.weaponAttachment !== undefined && (!object(value.weaponAttachment)
        || !Array.isArray(value.weaponAttachment.correction) || value.weaponAttachment.correction.length !== 16
        || !value.weaponAttachment.correction.every(Number.isFinite))) return false
    return Object.entries(value.equipment).every(([id, v]) => /^\d+$/.test(id) && transform(v))
        && Object.entries(value.pauldrons).every(([id, v]) => /^\d+$/.test(id) && object(v) && transform(v.left) && transform(v.right))
}

function adminEquipmentModifiersPlugin(configPath) {
    return {
        name: 'admin-equipment-modifiers',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const requestPath = req.url?.split('?')[0]
                const femaleEndpoint = '/admin-utils/equipment-modifiers-female.json'
                if (![endpoint, femaleEndpoint].includes(requestPath) || req.method !== 'PUT') return next()
                const targetPath = requestPath === femaleEndpoint ? configPath.replace(/\.json$/, '-female.json') : configPath
                if (req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
                    res.writeHead(403).end('Invalid origin')
                    return
                }
                try {
                    let body = ''
                    for await (const chunk of req) {
                        body += chunk
                        if (body.length > 65536) {
                            res.writeHead(413).end('Configuration too large')
                            return
                        }
                    }
                    const config = JSON.parse(body)
                    if (!validateModifiers(config)) {
                        res.writeHead(400).end('Invalid equipment modifiers')
                        return
                    }
                    await fs.writeFile(targetPath + '.tmp', JSON.stringify(config, null, 2) + '\n', 'utf8')
                    await fs.rename(targetPath + '.tmp', targetPath)
                    res.writeHead(204).end()
                } catch (error) {
                    server.config.logger.error(`Could not save equipment modifiers: ${error.message}`)
                    res.writeHead(500).end('Could not save equipment modifiers')
                }
            })
        },
    }
}

module.exports = { adminEquipmentModifiersPlugin, validateModifiers }
