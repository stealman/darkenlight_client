import { Scene, PointerEventTypes, Vector3, PointerInfo, Matrix, Ray} from '@babylonjs/core'
import {MyPlayer} from "@/data/myPlayer";
import { Settings } from '@/settings/settings'
import { ViewportManager } from '@/utils/viewport'
import { GMSceneManager } from '@/babylon/gm/GmSceneManager'
import { GMManager } from '@/gm/GM'
import { TargetingManager } from '@/gui/targettingManager'
import { AudioManager } from '@/babylon/audio/audioManager'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { GuiButtonsManager } from '@/gui/guiButtonsManager'
import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { CharacterManager } from '@/babylon/character/characterManager'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { NpcManager } from '@/babylon/npc/npcManager'
import type { Targetable } from '@/gui/targettingManager'

const HOVER_AXES = ['x', 'y', 'z'] as const

export const Controller = {
    leftPressedTime: 0,
    rightMousePressedTime: 0,

    lastDragMove: { x: 0, y: 0 },
    lastPointerMove: { x: 0, y: 0 },
    lastRightPointerPosition: null as { x: number, y: number } | null,
    lastJoystickVector: { dx: 0, dy: 0 },
    movementInputCancelled: false,
    hoverPointer: null as { x: number, y: number } | null,
    nextHoverCheckTime: 0,
    hoverRay: new Ray(Vector3.Zero(), Vector3.Zero()),
    hoverWorld: Matrix.Identity(),
    hoverMin: Vector3.Zero(),
    hoverMax: Vector3.Zero(),

    initializeController(scene: Scene) {
        this.hoverPointer = null
        this.nextHoverCheckTime = 0
        scene.onPointerObservable.add((pointerInfo) => {
            if ((pointerInfo.event as PointerEvent).pointerType === 'mouse' &&
                (pointerInfo.type === PointerEventTypes.POINTERMOVE || pointerInfo.type === PointerEventTypes.POINTERDOWN)) {
                this.hoverPointer = { x: pointerInfo.event.clientX, y: pointerInfo.event.clientY }
            }
            if (MyPlayer.isDead.value) {
                return
            }

            // Touch device
            if (Settings.touchEnabled) {
                if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                    this.leftPressedTime = new Date().getTime()
                    this.resolveLeftPressed(pointerInfo, scene)
                }
                if (pointerInfo.type === PointerEventTypes.POINTERUP) {

                }
            } else {
                // NO BUTTONS PRESSED
                if (GMManager.consumePointerMoveEvents && pointerInfo.event.buttons === 0) {
                    if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
                        this.resolvePointerMove(pointerInfo, scene)
                    }
                }

                // LEFT MOUSE PRESSED
                if (pointerInfo.event.buttons === 1) {
                    if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                        if (GMManager.consumeLeftClickEvents) {
                            GMManager.onLeftClickEvent()
                        } else {
                            this.resolveLeftPressed(pointerInfo, scene)
                        }
                    }
                }

                // MIDDLE MOUSE BUTTON PRESSED
                if (pointerInfo.event.buttons === 4) {
                    if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                        if (GMManager.consumeMiddleClickEvents) {
                            GMManager.onMiddleClickEvent()
                        }
                    }
                }

                // RIGHT MOUSE BUTTON DOWN
                if (pointerInfo.type === PointerEventTypes.POINTERDOWN && pointerInfo.event.button === 2) {
                    this.movementInputCancelled = false
                    this.rightMousePressedTime = new Date().getTime()
                    this.resolveRightPresssed(pointerInfo)
                }

                // RIGHT MOUSE BUTTON UP
                if (pointerInfo.type === PointerEventTypes.POINTERUP && pointerInfo.event.button === 2) {
                    MyPlayer.stopMove()
                    this.rightMousePressedTime = 0
                    this.lastRightPointerPosition = null
                    this.movementInputCancelled = false
                }

                // MOUSE MOVE
                if (!this.movementInputCancelled && pointerInfo.type === PointerEventTypes.POINTERMOVE && pointerInfo.event.buttons === 2) {
                    this.resolveRightDrag(pointerInfo);
                }
            }
        })
    },

    updateHoverNames(scene: Scene, time: number) {
        if (time < this.nextHoverCheckTime) return
        this.nextHoverCheckTime = time + 200
        const pointer = this.hoverPointer
        const canvas = scene.getEngine().getRenderingCanvas()
        if (!pointer || !canvas || !document.hasFocus() || MyPlayer.isDead.value ||
            GMManager.consumePointerMoveEvents || document.elementFromPoint(pointer.x, pointer.y) !== canvas) return

        const rect = canvas.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        // Babylon's picking coordinates are CSS pixels relative to the canvas.
        scene.createPickingRayToRef(pointer.x - rect.left, pointer.y - rect.top,
            this.hoverWorld, this.hoverRay, scene.activeCamera)

        let nearestDistance = Infinity
        let target: Targetable | null = null
        let groundItem: typeof GroundItemsManager.nearbyItem = null
        for (const item of GroundItemsManager.visibleItems) {
            if (item.dropping) continue
            const x = item.pos.x + item.dropOffsetX
            const y = item.pos.y + item.yOffset
            const z = item.pos.z + item.dropOffsetZ
            // Thin instances stay unpickable; give small loot a forgiving hit area.
            this.hoverMin.set(x - 0.35, y - 0.15, z - 0.35)
            this.hoverMax.set(x + 0.35, y + 0.4, z + 0.35)
            const distance = this.getHoverBoxDistance()
            if (distance < nearestDistance) {
                nearestDistance = distance
                groundItem = item
            }
        }

        const checkActor = (actor: Targetable, position: Vector3) => {
            if (actor === MyPlayer.myChar) return
            const halfSize = Math.max(0.35, actor.getBoxSize() / 2)
            this.hoverMin.set(position.x - halfSize, position.y, position.z - halfSize)
            this.hoverMax.set(position.x + halfSize, position.y + actor.getModelHeight(), position.z + halfSize)
            const distance = this.getHoverBoxDistance()
            if (distance < nearestDistance) {
                nearestDistance = distance
                target = actor
                groundItem = null
            }
        }
        for (const id of MonsterManager.visibleMonsters) {
            const monster = MonsterManager.monsters.get(id)
            if (monster?.model?.initialized) checkActor(monster, monster.model.node.position)
        }
        for (const id of CharacterManager.visibleCharacters) {
            const char = CharacterManager.characters.get(id)
            if (char?.model?.initialized) checkActor(char, char.model.node.position)
        }
        for (const id of NpcManager.visibleNpcs) {
            const npc = NpcManager.npcs.get(id)
            if (npc?.model?.initialized) checkActor(npc, npc.model.node.position)
        }
        for (const id of NpcManager.visibleGuards) {
            const guard = NpcManager.guards.get(id)
            if (guard?.model?.initialized) checkActor(guard, guard.model.node.position)
        }
        if (target) {
            const actor = target as Targetable
            actor.nameDisplayTime = Math.max(actor.nameDisplayTime, time + 600)
        }
        if (groundItem) {
            GroundItemsManager.hoveredItem = groundItem
            GroundItemsManager.hoverNameDisplayTime = time + 600
        }
    },

    getHoverBoxDistance(): number {
        // Slab intersection returns the front face, so overlapping objects choose
        // the closest hit rather than whichever collection was visited last.
        let near = 0
        let far = this.hoverRay.length
        for (const axis of HOVER_AXES) {
            const origin = this.hoverRay.origin[axis]
            const direction = this.hoverRay.direction[axis]
            const min = this.hoverMin[axis]
            const max = this.hoverMax[axis]
            if (Math.abs(direction) < 1e-8) {
                if (origin < min || origin > max) return Infinity
            } else {
                const a = (min - origin) / direction
                const b = (max - origin) / direction
                near = Math.max(near, Math.min(a, b))
                far = Math.min(far, Math.max(a, b))
                if (near > far) return Infinity
            }
        }
        return near
    },

    processKeydown(e) {
        if (MyPlayer.isDead.value) {
            return
        }
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.target?.isContentEditable) {
            return
        }

        if (e.key === 'Enter' && !e.repeat && !e.isComposing) {
            e.preventDefault()
            window.dispatchEvent(new CustomEvent('ui:open-speech'))
            return
        }

        // I - open inventory
        if ((e.key && e.key.toLowerCase() === 'i') || e.code === 'KeyI') {
            if (e.repeat) return
            window.dispatchEvent(new CustomEvent('ui:open-inventory'))
            return
        }

        // C - open character dialog
        if ((e.key && e.key.toLowerCase() === 'c') || e.code === 'KeyC') {
            if (e.repeat) return
            window.dispatchEvent(new CustomEvent('ui:open-character'))
            return
        }

        // Space - click first available opportunity action
        if (e.code === 'Space' || e.keyCode === 32) {
            e.preventDefault()
            if (e.repeat) return
            GuiButtonsManager.clickFirstAvailableOpportunityButton()
            return
        }

        // Shift
        if (e.keyCode == 16) {GMManager.shiftPressed(true)}

        // TAB
        if (e.keyCode == 9) {
            AudioManager.playGuiButtonClick()
            e.preventDefault()
            TargetingManager.cycleThroughClosestTargets()
        }

        // F1 to F10
        if (e.keyCode >= 112 && e.keyCode <= 121) {
            e.preventDefault()
            if (e.repeat) return

            const index = e.keyCode - 111
            ActionButtonsManager.externalPressActionButton(index)
        }

        // ESCAPE
        if (e.keyCode == 27) {
            MyPlayer.onClickEscape()
        }
    },

    processKeyup(e) {
        if (MyPlayer.isDead.value) {
            return
        }
        // Shift
        if (e.keyCode == 16) {GMManager.shiftPressed(false)}

        // F1 to F10
        if (e.keyCode >= 112 && e.keyCode <= 121) {
            const index = e.keyCode - 111
            ActionButtonsManager.externalReleaseActionButton(index)
        }
    },

    resolveLeftPressed(pointerInfo, scene) {
        const { clientX, clientY } = pointerInfo.event
        const pick = scene.pick(clientX, clientY)
        if (!pick?.ray) return
        TargetingManager.resolvePickRay(pick.ray)
    },

    resolveRightPresssed(pointerInfo) {
        this.resolveRightMovement(pointerInfo.event.clientX, pointerInfo.event.clientY)
    },

    resolveRightMovement(clientX: number, clientY: number) {
        this.lastRightPointerPosition = { x: clientX, y: clientY }

        const myCharPosition = ViewportManager.getScreenPosition(MyPlayer.myModel!.model)
        const dx = clientX - myCharPosition.x
        const dy = clientY - myCharPosition.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        const angleRadians = Math.atan2(dy, dx)
        MyPlayer.startMove(distance > 150 ? 'R' : 'W', angleRadians)
    },

    resolveRightDrag(pointerInfo: PointerInfo) {
        this.resolveRightPresssed(pointerInfo)
    },

    resolvePointerMove(pointerInfo, scene) {
        const { clientX, clientY } = pointerInfo.event

        // if distance from last pointer move is less than 10px, ignore
        const dx = clientX - this.lastPointerMove.x
        const dy = clientY - this.lastPointerMove.y
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
            return
        }

        const pickResult = scene.pick(clientX, clientY)
        if (pickResult && pickResult.hit && pickResult.pickedPoint) {
            GMSceneManager.updateHoverBlockMarker(pickResult.pickedPoint.x, pickResult.pickedPoint.z)
        } else if (pickResult?.ray) {
            GMSceneManager.updateHoverBlockMarkerFromRay(pickResult.ray)
        }

        this.lastPointerMove = { x: clientX, y: clientY }
    },

    processJoystick(dx: number, dy: number) {
        this.lastJoystickVector = { dx, dy }

        if (dx === 0 && dy === 0) {
            MyPlayer.stopMove()
            this.movementInputCancelled = false
            return
        }

        // A fresh joystick movement is explicit player input, so it must always
        // re-enable movement after a teleport/login cancelled the previous input.
        this.movementInputCancelled = false

        // Translate joystick input to screen position
        const screenX = ViewportManager.viewportWidth / 2 + dx * (ViewportManager.viewportWidth / 2)
        const screenY = ViewportManager.viewportHeight / 2 + dy * (ViewportManager.viewportHeight / 2)

        const myCharPosition = ViewportManager.getScreenPosition(MyPlayer.myModel!.model)
        const deltaX = screenX - myCharPosition.x
        const deltaY = screenY - myCharPosition.y
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

        // If delta is too small, do not move
        if (distance < 10) {
            MyPlayer.stopMove()
            return
        }

        const angleRadians = Math.atan2(-deltaY, deltaX)
        MyPlayer.startMove(distance > 100 ? 'R' : 'W', angleRadians)
    },

    refreshMovementFromHeldInput() {
        if (this.movementInputCancelled) {
            return
        }
        if (this.rightMousePressedTime > 0 && this.lastRightPointerPosition) {
            this.resolveRightMovement(this.lastRightPointerPosition.x, this.lastRightPointerPosition.y)
            return
        }

        if (this.lastJoystickVector.dx !== 0 || this.lastJoystickVector.dy !== 0) {
            this.processJoystick(this.lastJoystickVector.dx, this.lastJoystickVector.dy)
        }
    },

    cancelHeldMovement() {
        this.rightMousePressedTime = 0
        this.lastRightPointerPosition = null
        this.lastJoystickVector = { dx: 0, dy: 0 }
        this.movementInputCancelled = true
    },
}


