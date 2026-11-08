<template>
    <div>
      <label>Total Spawns: {{ allSpawns.length }}</label>

      <div v-if='selectedSpawn !== null' style='margin-top: 2vh;'>
          <label style="display: block; color: rgb(var(--ui-durability-warning)); font-weight: bold;">{{ selectedSpawnName }}</label>
          <label style='color: lightblue' v-if='selectedSpawn.id === 0' > -- NEW --</label>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <label style='font-size: 0.8rem; color: lightblue'>Pos. {{ selectedSpawn.x }} , {{ selectedSpawn.z }}</label>
              <template v-if="selectedSpawn.id > 0">
                  <button v-if="selectedSpawnAction === 'COPY_PENDING'" disabled>Copying...</button>
                  <button v-else-if="selectedSpawnAction === 'MOVE' || selectedSpawnAction === 'COPY'" @click="onClickCancelMove()">Cancel</button>
                  <button v-else @click="onClickMove()">Move</button>
              </template>
          </div>

          <table style='margin-top: 2vh;' class='gmSpawnTable'>
              <tr>
                  <td colspan='2'>
                      <select :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" v-model.number="selectedSpawn.mobGrpId" @change="monsterGroupChanged()">
                          <option v-for="group in monsterGroups" :key="group.id" :value="group.id">
                              {{ group.name }}
                          </option>
                      </select>
                      <select :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" v-model.number="selectedSpawn.mobTypeId" @change="GMSpawns.saveEditedSpawn()" >
                          <option value='0'>-- Random Type --</option>
                          <option v-for="mobType in monsterTypesInGroup" :key="mobType.id" :value="mobType.id">
                              {{ mobType.name }}
                          </option>
                      </select>
                  </td>
              </tr>
                <tr>
                    <td style='padding-top: 2vh;'>Max. Count</td>
                    <td style='padding-top: 2vh;'><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" @input="GMSpawns.saveEditedSpawn()" v-model.number='selectedSpawn.maxCount' min='1' max='32' /></td>
                </tr>
                <tr>
                    <td>Spawn Power</td>
                    <td><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" @input="GMSpawns.saveEditedSpawn()" v-model.number='selectedSpawn.power' min='1' max='32' /></td>
                </tr>
                <tr>
                    <td>Spawn Rng.</td>
                    <td><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" @input="GMSpawns.saveEditedSpawn()" v-model.number='selectedSpawn.spawnRange' min='1' max='32'/></td>
                </tr>
                <tr>
                    <td>Aggro Rng.</td>
                    <td><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" @input="GMSpawns.saveEditedSpawn()" v-model.number='selectedSpawn.aggroRange' min='0' max='32' /></td>
                </tr>
                <tr>
                    <td>Pursue Rng.</td>
                    <td><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" @input="GMSpawns.saveEditedSpawn()" v-model.number='selectedSpawn.pursueRange' min='1' max='128'/></td>
                </tr>
          </table>

          <div style="margin-top: 2vh;">
              <template v-if='selectedSpawn.id > 0'>
                  <button :disabled="selectedSpawnAction === 'COPY_PENDING'" @click="GMSpawns.startCopy()">Copy</button>
                  &nbsp;
                  <button style='background-color: darkred; color: white' @click="onClickKill()">Kill All</button>
                    &nbsp;
                  <button style='background-color: darkred; color: white' @click="onClickDelete()">Delete</button>
              </template>

              <template v-if='selectedSpawn.id === 0'>
                  <button style='background-color: lightblue; color: black' @click="onClickSaveCreate()">Create</button>
                  &nbsp;&nbsp;
                  <button  @click="onClickCancelCreate()">Cancel</button>
              </template>
          </div>
      </div>
    </div>
</template>

<script setup>

import { GMSpawns } from '@/gm/GmSpawns'
import { GmTabs as GMTabs } from '@/gm/GM'
import { MonsterGroups } from '@/babylon/monsters/codebook/monsterCodebook'
import { MonsterCatalog } from '@/data/monsterCatalog'
import { computed, ref, watch } from 'vue'

const allSpawns = GMSpawns.allSpawns
const selectedSpawn = GMSpawns.selectedSpawn
const selectedSpawnAction = GMSpawns.selectedSpawnAction
const monsterGroups = ref(MonsterGroups.getAsArray())
const selectedSpawnName = computed(() => {
    const spawn = selectedSpawn.value
    if (!spawn) return ''
    return spawn.mobTypeId > 0
        ? MonsterCatalog.get(spawn.mobTypeId)?.name ?? `Monster #${spawn.mobTypeId}`
        : MonsterGroups.getById(spawn.mobGrpId)?.name.replace(/_/g, ' ') ?? `Group #${spawn.mobGrpId}`
})


watch(() => {
    const spawn = selectedSpawn.value
    return spawn ? [spawn.id, spawn.x, spawn.z, spawn.spawnRange, spawn.aggroRange] : null
}, () => GMSpawns.renderSpawnRanges())

const onClickKill = () => {
    GMSpawns.killAllSpawn()
}

const onClickDelete = () => {
    GMSpawns.deleteSpawn()
}

const onClickMove = () => {
    selectedSpawnAction.value = 'MOVE'
}

const onClickSaveCreate = () => {
    GMSpawns.saveCreatedSpawn()
    selectedSpawnAction.value = ''
}

const onClickCancelMove = () => {
    selectedSpawnAction.value = 'EDIT'
}

const onClickCancelCreate = () => {
    selectedSpawn.value = null
    selectedSpawnAction.value = ''
}

const monsterTypesInGroup = computed(() => {
    if (selectedSpawn.value === null) {
        return []
    }
    return MonsterGroups.getById(selectedSpawn.value.mobGrpId).getAllTypes()
})

const monsterGroupChanged = () => {
    if (selectedSpawn.value === null) {
        return
    }
    selectedSpawn.value.mobTypeId = 0
    GMSpawns.saveEditedSpawn()
}

</script>
