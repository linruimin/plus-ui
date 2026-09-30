<template>
  <main class="shop-home">
    <h1>选择店铺</h1>
    <el-alert v-if="shopStore.error" :title="shopStore.error" type="error" :closable="false" />
    <el-button v-if="shopStore.error" @click="loadShops">重试加载店铺</el-button>
    <div v-loading="shopStore.loading" class="shop-grid" role="group" aria-label="店铺选择">
      <button v-for="shop in shopStore.shops" :key="shop.id" type="button" class="shop-card"
        :class="{ selected: shopStore.selectedId === shop.id }" :aria-pressed="shopStore.selectedId === shop.id" @click="selectShop(shop.id)">
        <span class="shop-name">{{ shop.name }}</span>
        <span class="shop-state">{{ shopStore.selectedId === shop.id ? '已选择' : '选择店铺' }}</span>
      </button>
    </div>
  </main>
</template>

<script setup name="Index" lang="ts">
import { onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useOzonShopStore } from '@/store/modules/ozonShop';

const shopStore = useOzonShopStore();
function loadShops() { void shopStore.loadShops().catch(() => {}); }
function selectShop(id: string) {
  try {
    if (!shopStore.selectShop(id)) ElMessage.warning('当前浏览器无法保存店铺选择');
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '选择店铺失败');
  }
}
onMounted(loadShops);
</script>

<style scoped>
.shop-home { max-width: 960px; margin: 0 auto; padding: 40px 24px; }
h1 { margin: 0 0 28px; font-size: 24px; font-weight: 600; color: var(--el-text-color-primary); }
.shop-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.shop-card { display: flex; flex-direction: column; align-items: flex-start; gap: 24px; min-height: 180px; padding: 30px; border: 2px solid var(--el-border-color); border-radius: 12px; background: var(--el-bg-color); color: var(--el-text-color-primary); cursor: pointer; text-align: left; font: inherit; transition: border-color .15s, background-color .15s; }
.shop-card:hover, .shop-card.selected { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.shop-card:focus-visible { outline: 3px solid var(--el-color-primary); outline-offset: 4px; }
.shop-name { font-size: 28px; font-weight: 600; }
.shop-state { font-size: 14px; color: var(--el-text-color-secondary); }
.selected .shop-state { color: var(--el-color-primary); }
@media (max-width: 560px) { .shop-home { padding: 24px 16px; } .shop-grid { grid-template-columns: 1fr; gap: 16px; } .shop-card { min-height: 150px; padding: 24px; } }
</style>

