import { Vector3 } from '@babylonjs/core'
import { TreeManager } from '@/babylon/world/treeManager'
import { GMManager, GmTabs } from '@/gm/GM'
import { MyPlayer } from '@/data/myPlayer'
import { ViewportManager } from '@/utils/viewport'
import { WeaponTags } from '@/data/items/item'

export const TreeLevelOverlay = {
    labelPosition: new Vector3(),

    onFrame(ctx: CanvasRenderingContext2D) {
        const char = MyPlayer.myChar
        const showGmValues = char?.className === 'GM' && GMManager.gmPanelVisible.value && GMManager.tab === GmTabs.BIOME_EDIT
        if (!showGmValues && !char?.getWeapon()?.hasWeaponTag(WeaponTags.GREAT_AXE)) return

        ctx.save()
        ctx.font = 'bold 13px "Roboto", Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'
        ctx.fillStyle = '#ffd45a'

        for (const tree of TreeManager.visibleTrees) {
            const level = tree.level ?? 1
            if (level <= 1) continue
            this.labelPosition.copyFrom(tree.position)
            this.labelPosition.y += 4 * tree.scale
            const screenPosition = ViewportManager.getPositionOnScreen(this.labelPosition)
            if (!screenPosition) continue
            const label = String(level)
            ctx.strokeText(label, screenPosition.x, screenPosition.y)
            ctx.fillText(label, screenPosition.x, screenPosition.y)
        }
        ctx.restore()
    },
}
