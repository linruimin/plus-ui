import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { listBusiness } from '@/api/ozon/business';
import { useUserStore } from '@/store/modules/user';
import { readPreference, writePreference } from '@/views/ozon/components/preferences';

interface ShopChoice { id: string; name: string }

export const useOzonShopStore = defineStore('ozonShop', () => {
  const user = useUserStore();
  const owner = ref('');
  const shops = ref<ShopChoice[]>([]);
  const selectedId = ref<string>();
  const legacyName = ref('');
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref('');
  let pending: Promise<void> | undefined;
  let generation = 0;
  const storageKey = (id: string) => 'ozon:selected-shop:v1:' + id;
  function restore(id: string) {
    generation++;
    owner.value = id;
    shops.value = [];
    selectedId.value = undefined;
    legacyName.value = '';
    loaded.value = false;
    loading.value = false;
    error.value = '';
    pending = undefined;
    if (!id) return;
    const saved = readPreference(storageKey(id));
    if (typeof saved.shopId === 'string' && saved.shopId) selectedId.value = saved.shopId;
    else if (typeof saved.shop === 'string' && saved.shop) legacyName.value = saved.shop;
  }
  watch(() => String(user.userId || ''), restore, { immediate: true });
  const selectedName = computed(() => shops.value.find(s => s.id === selectedId.value)?.name || legacyName.value || '');
  const selectionKey = computed(() => owner.value + ':' + (selectedId.value || legacyName.value));
  async function loadShops() {
    if (loaded.value) return;
    if (pending) return pending;
    const current = generation;
    loading.value = true;
    error.value = '';
    pending = (async () => {
      try {
        const found: ShopChoice[] = [];
        for (let pageNum = 1; ; pageNum++) {
          const result = await listBusiness('shop', { pageNum, pageSize: 100 });
          if (current !== generation) return;
          const data = result.data;
          for (const row of data?.rows || []) found.push({ id: String(row.id), name: String(row.name || '') });
          if (found.length >= Number(data?.total || 0) || !(data?.rows || []).length) break;
        }
        if (current !== generation) return;
        shops.value = found;
        loaded.value = true;
        if (legacyName.value) {
          const match = found.find(shop => shop.name === legacyName.value);
          if (!match) throw new Error('已保存的店铺不存在，请回首页重新选择');
          selectedId.value = match.id;
          legacyName.value = '';
          writePreference(storageKey(owner.value), { shopId: match.id, shop: match.name });
        }
        if (selectedId.value && !found.some(shop => shop.id === selectedId.value))
          throw new Error('已选择的店铺不存在，请回首页重新选择');
      } catch (cause) {
        if (current === generation) { loaded.value = false; error.value = cause instanceof Error ? cause.message : '店铺列表加载失败'; }
        throw cause;
      } finally {
        if (current === generation) { loading.value = false; pending = undefined; }
      }
    })();
    return pending;
  }
  async function ensureLoaded() {
    await loadShops();
    if (error.value) throw new Error(error.value);
    return selectedId.value;
  }
  function selectShop(id: string) {
    const shop = shops.value.find(item => item.id === id);
    if (!shop) throw new Error('所选店铺不存在');
    selectedId.value = id;
    legacyName.value = '';
    error.value = '';
    return writePreference(storageKey(owner.value), { shopId: id, shop: shop.name });
  }
  return { shops, selectedId, selectedName, selectionKey, loading, error, loadShops, ensureLoaded, selectShop };
});
