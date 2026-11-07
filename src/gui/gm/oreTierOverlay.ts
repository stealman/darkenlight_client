import { Vector3 } from '@babylonjs/core'
import { WorldDataManager } from '@/data/worldDataManager'
import { GMManager, GmTabs } from '@/gm/GM'
import { MyPlayer } from '@/data/myPlayer'
import { ViewportManager } from '@/utils/viewport'
import { WeaponTags } from '@/data/items/item'

export const GmOreTierOverlay = {
    orePosition: new Vector3(0, 0, 0),

    onFrame(ctx: CanvasRenderingContext2D) {
        const char = MyPlayer.myChar
        const showGmValues = char?.className === 'GM' && GMManager.gmPanelVisible.value && GMManager.tab === GmTabs.TERRAIN_EDIT
        if (!showGmValues && !char?.getWeapon()?.hasWeaponTag(WeaponTags.PICKAXE)) {
            return
        }

        const blockMap = WorldDataManager.getBlockMap()
        if (ViewportManager.visibleTiles.length === 0) {
            return
        }

        ctx.save()
        ctx.font = 'bold 13px "Roboto", Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'
        ctx.fillStyle = '#ffd45a'

        for (const tile of ViewportManager.visibleTiles) {
            const x = Math.floor(tile.x)
            const z = Math.floor(tile.z)
            const block = blockMap[x]?.[z]
            const oreTier = block?.minableOre
            if (!oreTier) {
                continue
            }

            this.orePosition.set(x + 0.5, block.totalHeight + 0.35, z + 0.5)
            const screenPosition = ViewportManager.getPositionOnScreen(this.orePosition)
            if (!screenPosition) {
                continue
            }

            const label = String(oreTier)
            ctx.strokeText(label, screenPosition.x, screenPosition.y)
            ctx.fillText(label, screenPosition.x, screenPosition.y)
        }

        ctx.restore()
    }
}
