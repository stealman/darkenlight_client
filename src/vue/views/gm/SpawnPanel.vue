<template>
    <div>
      <label>Total Spawns: {{ allSpawns.length }}</label>

      <div v-if='selectedSpawn !== null' style='margin-top: 2vh;'>
          <label>Selected Spawn ID #{{ selectedSpawn.id }}</label>
          <div>
              <label style='font-size: 0.8rem; color: lavender'>Pos. {{ selectedSpawn.x }} , {{ selectedSpawn.z }}</label>
          </div>

          <table style='margin-top: 2vh;'>
                <tr>
                    <td>Max. Count</td>
                    <td><input type='number' v-model.number='selectedSpawn.maxCount' min='1' max='32' style='width: 2vw;'/></td>
                </tr>
                <tr>
                    <td>Spawn Power</td>
                    <td><input type='number' v-model.number='selectedSpawn.power' min='1' max='32' style='width: 2vw;'/></td>
                </tr>
                <tr>
                    <td>Spawn Rng.</td>
                    <td><input type='number' v-model.number='selectedSpawn.spawnRange' min='1' max='32' style='width: 2vw;'/></td>
                </tr>
                <tr>
                    <td>Aggro Rng.</td>
                    <td><input type='number' v-model.number='selectedSpawn.aggroRange' min='1' max='32' style='width: 2vw;'/></td>
                </tr>
                <tr>
                    <td>Wander Rng.</td>
                    <td><input type='number' v-model.number='selectedSpawn.wanderingMoveRange' min='1' max='32' style='width: 2vw;'/></td>
                </tr>
                <tr>
                    <td>Pursue Rng.</td>
                    <td><input type='number' v-model.number='selectedSpawn.pursueRange' min='1' max='128' style='width: 2vw;'/></td>
                </tr>
          </table>

          <div style="margin-top: 2vh;">
              <button style='background-color: darkred; color: white' @click="onClickKill()">Kill All</button>
          </div>
      </div>
    </div>
</template>

<script setup>

import { GMSpawns } from '@/gm/GmSpawns'
import { GmTabs as GMTabs } from '@/gm/GM'

const allSpawns = GMSpawns.allSpawns
const selectedSpawn = GMSpawns.selectedSpawn

const onClickKill = () => {
    GMSpawns.killAllSpawn()
}

</script>
