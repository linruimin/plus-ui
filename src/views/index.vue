<template>
  <main class="shop-home">
    <section class="shop-panel">
      <h1 class="shop-title">选择店铺</h1>
      <el-alert v-if="shopStore.error" :title="shopStore.error" type="error" :closable="false" class="shop-error" />
      <el-button v-if="shopStore.error" size="small" @click="loadShops">重试加载店铺</el-button>
      <div v-loading="shopStore.loading" class="shop-list" role="group" aria-label="店铺选择">
        <button v-for="shop in orderedShops" :key="shop.id" type="button" class="shop-option"
          :class="{ selected: shopStore.selectedId === shop.id }" :aria-pressed="shopStore.selectedId === shop.id" @click="selectShop(shop.id)">
          <span class="shop-name">{{ shop.name }}</span>
          <span class="shop-check">✓</span>
        </button>
      </div>
    </section>
  </main>
</template>

<script setup name="Index" lang="ts">
import { computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useOzonShopStore } from '@/store/modules/ozonShop';

const shopStore = useOzonShopStore();
/** 俄1（id=1）固定在最前，其余按 id 升序；无法解析 id 的排最后。 */
const orderedShops = computed(() => [...shopStore.shops].sort((a, b) => {
  const na = Number(a.id), nb = Number(b.id);
  return (Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER) - (Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER);
}));
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
.shop-home { min-height: 60vh; display: flex; align-items: flex-start; justify-content: center; padding: 56px 16px; }
.shop-panel { width: 400px; max-width: 100%; padding: 18px 20px 20px; border: 1px solid var(--el-border-color-lighter); border-radius: 14px; background: var(--el-bg-color); box-shadow: var(--el-box-shadow-light); }
.shop-title { margin: 0 0 14px; font-size: 16px; font-weight: 600; color: var(--el-text-color-primary); }
.shop-error { margin-bottom: 12px; }
.shop-list { display: flex; flex-direction: column; gap: 10px; min-height: 54px; }
.shop-option { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border: 1px solid var(--el-border-color); border-radius: 10px; background: var(--el-fill-color-blank); color: var(--el-text-color-primary); cursor: pointer; font: inherit; text-align: left; transition: border-color .15s, background-color .15s; }
.shop-option:hover { border-color: var(--el-color-primary-light-5); background: var(--el-fill-color-light); }
.shop-option.selected { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.shop-option:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.shop-name { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shop-check { visibility: hidden; flex: none; font-size: 13px; font-weight: 700; color: var(--el-color-primary); }
.selected .shop-check { visibility: visible; }
</style>
