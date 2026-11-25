import { Vector3 } from '@babylonjs/core'
import { CharacterManager } from '@/babylon/character/characterManager'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { NpcManager } from '@/babylon/npc/npcManager'
import { Lights } from '@/babylon/scene/lights'
import { MyPlayer } from '@/data/myPlayer'
import { TerrainManager } from './terrainManager'
import { GRASS_CONTACT_LIMIT, GRASS_TRAIL_SECONDS } from './grassRenderer'

const SAMPLE_MS = 150
const TRAIL_MS = GRASS_TRAIL_SECONDS * 1000
const CLOCK_ORIGIN = Date.now()

type Actor = {pos: Vector3, hpPercent: number}
type Track = {
    position: Vector3, start: Vector3, end: Vector3, previousStart: Vector3,
    seenAt: number, movedAt: number, previousMovedAt: number, distance: number
}
type Grass = NonNullable<typeof TerrainManager.outdoorTerrain>['grass']

let tracks = new WeakMap<Actor, Track>()
const nearest: Track[] = []
let activeGrass: Grass | undefined
let worldId: number | undefined
let lastSampleAt = 0
let nextSampleAt = 0
let activeUntil = 0

function sampleActor(actor: Actor | undefined, center: Vector3, maxDistanceSquared: number, now: number) {
    if (!actor || actor.hpPercent <= 0) return
    const dx = actor.pos.x - center.x, dz = actor.pos.z - center.z
    const distance = actor === MyPlayer.myChar ? -1 : dx * dx + dz * dz
    if (distance > maxDistanceSquared) return

    let track = tracks.get(actor)
    if (!track) {
        track = {position: actor.pos.clone(), start: Vector3.Zero(), end: Vector3.Zero(), previousStart: Vector3.Zero(),
            seenAt: now, movedAt: -Infinity, previousMovedAt: -Infinity, distance}
        tracks.set(actor, track)
        return
    }
    if (track.seenAt === now) return
    const moveX = actor.pos.x - track.position.x, moveZ = actor.pos.z - track.position.z
    const movementSquared = moveX * moveX + moveZ * moveZ
    if (track.seenAt !== lastSampleAt || now - track.seenAt > SAMPLE_MS * 2
        || movementSquared > 4 || Math.abs(actor.pos.y - track.position.y) > 1.5) {
        // A newly visible actor, a teleport or a missed sample has no continuous path.
        track.movedAt = -Infinity
        track.previousMovedAt = -Infinity
        track.position.copyFrom(actor.pos)
    } else if (movementSquared >= 0.02 ** 2) {
        track.previousStart.copyFrom(track.start)
        track.previousMovedAt = track.movedAt
        track.start.copyFrom(track.position)
        track.end.copyFrom(actor.pos)
        track.position.copyFrom(actor.pos)
        track.movedAt = now
    }
    track.seenAt = now
    if (now - track.movedAt >= TRAIL_MS) return
    if (nearest.length === GRASS_CONTACT_LIMIT && distance >= nearest[nearest.length - 1].distance) return
    track.distance = distance
    let index = Math.min(nearest.length, GRASS_CONTACT_LIMIT - 1)
    while (index > 0 && distance < nearest[index - 1].distance) {
        nearest[index] = nearest[index - 1]
        index--
    }
    nearest[index] = track
}

export function updateGrassInteractions(now: number) {
    if (now < nextSampleAt) {
        // Between samples only the shared shader clock advances, and only during a visible trail.
        if (activeUntil) {
            activeGrass?.setInteractionClock((now - CLOCK_ORIGIN) * 0.001)
            if (now >= activeUntil) activeUntil = 0
        }
        return
    }
    nextSampleAt = now + SAMPLE_MS

    const outdoorGrass = TerrainManager.outdoorTerrain?.grass
    const player = MyPlayer.myChar
    const grass = !Lights.indoor && outdoorGrass?.interactionRadius && player ? outdoorGrass : undefined
    if (grass !== activeGrass || worldId !== MyPlayer.worldId) {
        activeGrass?.clearInteractions()
        activeGrass?.setInteractionClock(0, 0)
        activeGrass = grass
        worldId = MyPlayer.worldId
        activeUntil = 0
        tracks = new WeakMap()
        nearest.length = 0
    }
    if (!grass || !player) return

    nearest.length = 0
    const maxDistanceSquared = grass.interactionRadius ** 2
    const center = player.pos
    if (!MyPlayer.isDead.value) sampleActor(player, center, maxDistanceSquared, now)
    for (const id of CharacterManager.visibleCharacters) {
        const actor = CharacterManager.characters.get(id)
        if (actor !== player) sampleActor(actor, center, maxDistanceSquared, now)
    }
    for (const id of MonsterManager.visibleMonsters) sampleActor(MonsterManager.monsters.get(id), center, maxDistanceSquared, now)
    for (const id of NpcManager.visibleNpcs) sampleActor(NpcManager.npcs.get(id), center, maxDistanceSquared, now)
    for (const id of NpcManager.visibleGuards) sampleActor(NpcManager.guards.get(id), center, maxDistanceSquared, now)
    lastSampleAt = now

    if (!nearest.length && !activeUntil) return
    const seconds = (now - CLOCK_ORIGIN) * 0.001
    activeUntil = 0
    if (nearest.length) grass.setInteractionCenter(center)
    for (let index = 0; index < nearest.length; index++) {
        const {start, end, movedAt, previousStart, previousMovedAt} = nearest[index]
        grass.setMovementContact(index, start, end, (movedAt - CLOCK_ORIGIN) * 0.001,
            previousStart, now - previousMovedAt < TRAIL_MS ? (previousMovedAt - CLOCK_ORIGIN) * 0.001 : undefined)
        activeUntil = Math.max(activeUntil, movedAt + TRAIL_MS)
    }
    grass.clearInteractions(nearest.length)
    grass.setInteractionClock(seconds, activeUntil ? (activeUntil - CLOCK_ORIGIN) * 0.001 : seconds)
}
