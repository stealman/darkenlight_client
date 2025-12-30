<template>
    <div>
      <label>Total Spawns: {{ allSpawns.length }}</label>

      <div v-if='selectedSpawn !== null' style='margin-top: 2vh;'>
          <label>Selected Spawn</label>
          <label v-if='selectedSpawn.id > 0' > ID #{{ selectedSpawn.id }}</label>
          <label style='color: lightblue' v-if='selectedSpawn.id === 0' > -- NEW --</label>
          <div>
              <label style='font-size: 0.8rem; color: lightblue'>Pos. {{ selectedSpawn.x }} , {{ selectedSpawn.z }}</label>
          </div>

          <div style="margin-top: 2vh;">

              <template v-if='selectedSpawn.id > 0'>
                  <template v-if="selectedSpawnAction ===''">
                  <button @click="onClickEdit()">Edit</button>
                      &nbsp;
                  <button @click="onClickMove()">Move</button>
                  </template>

                  <template v-if="selectedSpawnAction ==='EDIT'">
                      <button style='background-color: lightblue; color: black' @click="onClickSaveEdit()">Save</button>
                      &nbsp;
                      <button  @click="onClickCancelEdit()">Cancel</button>
                  </template>

                  <template v-if="selectedSpawnAction ==='MOVE'">
                      <button  @click="onClickCancelMove()">Cancel</button>
                  </template>
              </template>
          </div>

          <table style='margin-top: 2vh;' class='gmSpawnTable'>
              <tr>
                  <td>Mob Group / Type</td>
              </tr>
              <tr>
                  <td colspan='2'>
                      <select :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" v-model.number="selectedSpawn.mobGrpId" @change="monsterGroupChanged()">
                          <option v-for="group in monsterGroups" :key="group.id" :value="group.id">
                              {{ group.name }}
                          </option>
                      </select>
                      <br/><br/>
                      <select :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" v-model.number="selectedSpawn.mobTypeId" style='margin-left: 0px;' >
                          <option value='0'>-- Random Type --</option>
                          <option v-for="mobType in monsterTypesInGroup" :key="mobType.id" :value="mobType.id">
                              {{ mobType.name }}
                          </option>
                      </select>
                  </td>
              </tr>
                <tr>
                    <td style='padding-top: 2vh;'>Max. Count</td>
                    <td style='padding-top: 2vh;'><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" v-model.number='selectedSpawn.maxCount' min='1' max='32' /></td>
                </tr>
                <tr>
                    <td>Spawn Power</td>
                    <td><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" v-model.number='selectedSpawn.power' min='1' max='32' /></td>
                </tr>
                <tr>
                    <td>Spawn Rng.</td>
                    <td><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" v-model.number='selectedSpawn.spawnRange' min='1' max='32'/></td>
                </tr>
                <tr>
                    <td>Aggro Rng.</td>
                    <td><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" v-model.number='selectedSpawn.aggroRange' min='1' max='32' /></td>
                </tr>
                <tr>
                    <td>Wander Rng.</td>
                    <td><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" v-model.number='selectedSpawn.wanderingMoveRange' min='1' max='32'/></td>
                </tr>
                <tr>
                    <td>Pursue Rng.</td>
                    <td><input type='number' @focus="$event.target.select()" :disabled="selectedSpawn.id > 0 && selectedSpawnAction !=='EDIT'" v-model.number='selectedSpawn.pursueRange' min='1' max='128'/></td>
                </tr>
          </table>

          <div style="margin-top: 2vh;">
              <template v-if='selectedSpawn.id > 0'>
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
import { computed, ref } from 'vue'

const allSpawns = GMSpawns.allSpawns
const selectedSpawn = GMSpawns.selectedSpawn
const selectedSpawnAction = GMSpawns.selectedSpawnAction
const monsterGroups = ref(MonsterGroups.getAsArray())

const onClickKill = () => {
    GMSpawns.killAllSpawn()
}

const onClickDelete = () => {
    GMSpawns.deleteSpawn()
}

const onClickMove = () => {
    selectedSpawnAction.value = 'MOVE'
}

const onClickEdit = () => {
    selectedSpawnAction.value = 'EDIT'
}

const onClickSaveEdit = () => {
    GMSpawns.saveEditedSpawn()
    selectedSpawnAction.value = ''
}

const onClickSaveCreate = () => {
    GMSpawns.saveCreatedSpawn()
    selectedSpawnAction.value = ''
}

const onClickCancelEdit = () => {
    selectedSpawnAction.value = ''
}

const onClickCancelMove = () => {
    selectedSpawnAction.value = ''
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
}

</script>
