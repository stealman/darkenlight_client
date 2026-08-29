import { AxeVertexColorPalettes } from './axes'
import { BowVertexColorPalettes } from './bows'
import { SwordVertexColorPalettes } from './swords'

/** Weapon codebook keys that currently have a real vertex-colour runtime GLB. */
export const VertexColorWeaponPalettesByModelKey = {
    LONGSWORD: { palette: SwordVertexColorPalettes.LONGSWORD, inventoryBaseName: 'longsword' },
    BROADSWORD: { palette: SwordVertexColorPalettes.BROADSWORD, inventoryBaseName: 'broadsword' },
    GREATAXE: { palette: AxeVertexColorPalettes.GREATAXE, inventoryBaseName: 'great-axe' },
    PICKAXE: { palette: AxeVertexColorPalettes.PICKAXE, inventoryBaseName: 'pickaxe' },
    HUNTINGBOW: { palette: BowVertexColorPalettes.HUNTING_BOW, inventoryBaseName: 'hunting-bow' },
}
