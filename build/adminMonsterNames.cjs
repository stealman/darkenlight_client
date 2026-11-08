const fs = require('node:fs')
const ts = require('typescript')

function readMonsterNames(sourcePath) {
    // A client-only checkout can still display names derived from its model keys.
    if (!fs.existsSync(sourcePath)) return {}
    const source = ts.createSourceFile(sourcePath, fs.readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true)
    const names = {}
    function visit(node) {
        if (ts.isNewExpression(node) && node.expression.getText(source) === 'MonsterCbInfo') {
            const [id, , name] = node.arguments ?? []
            // Runtime-generated types (such as NPC guards) have no client model entry.
            if (!id || !ts.isNumericLiteral(id)) return
            if (!name || !ts.isStringLiteral(name)) {
                throw new Error('Admin monster names require a literal MonsterCbInfo ID and name')
            }
            names[Number(id.text)] = name.text
        }
        ts.forEachChild(node, visit)
    }
    visit(source)
    return names
}

function adminMonsterNamesPlugin(sourcePath) {
    const id = 'virtual:admin-monster-names'
    const resolved = '\0' + id
    return {
        name: 'admin-monster-names',
        resolveId(request) {
            if (request === id) return resolved
        },
        load(request) {
            if (request !== resolved) return
            this.addWatchFile(sourcePath)
            return `export default ${JSON.stringify(readMonsterNames(sourcePath))}`
        },
    }
}

module.exports = { readMonsterNames, adminMonsterNamesPlugin }
