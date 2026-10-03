const BIOME_TOOL_LS_KEY = 'worlds-map-biome-tool'

export const BIOME_PRESETS = [
    {id: 'NORTH_WOOD', label: 'North Wood'},
] as const

export type BiomePresetId = typeof BIOME_PRESETS[number]['id']

export const clampBiomeDensity = (density: number) => Number.isFinite(density)
    ? Math.max(1, Math.min(10, Math.round(density)))
    : 5

export const getStoredBiomeTool = () => {
    try {
        const tool = JSON.parse(localStorage.getItem(BIOME_TOOL_LS_KEY) || 'null')
        const preset = BIOME_PRESETS.some((item) => item.id === tool?.preset) ? tool.preset as BiomePresetId : 'NORTH_WOOD'
        return {
            preset,
            density: clampBiomeDensity(tool?.density),
            mode: tool?.mode === 'area' ? 'area' : 'brush',
        }
    } catch {
        return {preset: 'NORTH_WOOD' as BiomePresetId, density: 5, mode: 'brush'}
    }
}

export const storeBiomeTool = (preset: BiomePresetId, density: number, mode: string) => {
    localStorage.setItem(BIOME_TOOL_LS_KEY, JSON.stringify({
        preset,
        density: clampBiomeDensity(density),
        mode: mode === 'area' ? 'area' : 'brush',
    }))
}
