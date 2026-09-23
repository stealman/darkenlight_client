import { AxeVertexColorPalettes } from './axes'
import { BowVertexColorPalettes } from './bows'
import { MaceVertexColorPalettes } from './maces'
import { PolearmVertexColorPalettes } from './polearms'
import { SwordVertexColorPalettes } from './swords'

/** Weapon codebook keys that currently have a real vertex-colour runtime GLB. */
export const VertexColorWeaponPalettesByModelKey = {
    LONGSWORD: { palette: SwordVertexColorPalettes.LONGSWORD, inventoryBaseName: 'longsword' },
    BROADSWORD: { palette: SwordVertexColorPalettes.BROADSWORD, inventoryBaseName: 'broadsword' },
    GREATSWORD: { palette: SwordVertexColorPalettes.GREATSWORD, inventoryBaseName: 'greatsword' },
    HAND_AXE: { palette: AxeVertexColorPalettes.HANDAXE, inventoryBaseName: 'hand-axe' },
    BATTLE_AXE: { palette: AxeVertexColorPalettes.BATTLE_AXE, inventoryBaseName: 'battle-axe' },
    GREATAXE: { palette: AxeVertexColorPalettes.GREATAXE, inventoryBaseName: 'great-axe' },
    LARGE_BATTLE_AXE: { palette: AxeVertexColorPalettes.LARGE_BATTLE_AXE, inventoryBaseName: 'large-battle-axe' },
    PICKAXE: { palette: AxeVertexColorPalettes.PICKAXE, inventoryBaseName: 'pickaxe' },
    LIGHT_MACE: { palette: MaceVertexColorPalettes.LIGHT_MACE, inventoryBaseName: 'lightmace' },
    WARMACE: { palette: MaceVertexColorPalettes.WARMACE, inventoryBaseName: 'warmace' },
    WARHAMMER: { palette: MaceVertexColorPalettes.WARHAMMER, inventoryBaseName: 'warhammer' },
    HUNTING_SPEAR: { palette: PolearmVertexColorPalettes.HUNTING_SPEAR, inventoryBaseName: 'hunting-spear' },
    WAR_SPEAR: { palette: PolearmVertexColorPalettes.WAR_SPEAR, inventoryBaseName: 'war-spear' },
    HALBERD: { palette: PolearmVertexColorPalettes.HALBERD, inventoryBaseName: 'halberd' },
    HUNTINGBOW: { palette: BowVertexColorPalettes.HUNTING_BOW, inventoryBaseName: 'hunting-bow' },
}
