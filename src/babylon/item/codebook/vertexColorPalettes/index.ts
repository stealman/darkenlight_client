import { AxeVertexColorPalettes } from './axes'
import { BowVertexColorPalettes } from './bows'
import { MaceVertexColorPalettes } from './maces'
import { SwordVertexColorPalettes } from './swords'

/** Weapon codebook keys that currently have a real vertex-colour runtime GLB. */
export const VertexColorWeaponPalettesByModelKey = {
    LONGSWORD: { palette: SwordVertexColorPalettes.LONGSWORD, inventoryBaseName: 'longsword' },
    BROADSWORD: { palette: SwordVertexColorPalettes.BROADSWORD, inventoryBaseName: 'broadsword' },
    HAND_AXE: { palette: AxeVertexColorPalettes.HANDAXE, inventoryBaseName: 'hand-axe' },
    BATTLE_AXE: { palette: AxeVertexColorPalettes.BATTLE_AXE, inventoryBaseName: 'battle-axe' },
    GREATAXE: { palette: AxeVertexColorPalettes.GREATAXE, inventoryBaseName: 'great-axe' },
    LARGE_BATTLE_AXE: { palette: AxeVertexColorPalettes.LARGE_BATTLE_AXE, inventoryBaseName: 'large-battle-axe' },
    PICKAXE: { palette: AxeVertexColorPalettes.PICKAXE, inventoryBaseName: 'pickaxe' },
    LIGHT_MACE: { palette: MaceVertexColorPalettes.LIGHT_MACE, inventoryBaseName: 'lightmace' },
    HUNTINGBOW: { palette: BowVertexColorPalettes.HUNTING_BOW, inventoryBaseName: 'hunting-bow' },
}
