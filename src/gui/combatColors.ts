// Shared by combat overlays and activity history; keep independent of game managers.
export function getDamageColor(hitQuality: 'P' | 'N' | 'G' | null, defaultColor: string): string {
    if (hitQuality === 'P') return '#ffd45c'
    if (hitQuality === 'G') return '#a9a9a9'
    return defaultColor
}

export function getRelationColor(relation: 'ALLY' | 'ENEMY' | 'NEUTRAL'): string {
    return relation === 'ENEMY' ? '#f08f56' : relation === 'ALLY' ? '#56aaff' : '#aaaaaa'
}
