import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { listBusiness } from '@/api/ozon/business';
import { useUserStore } from '@/store/modules/user';
import { readPreference, writePreference } from '@/views/ozon/components/preferences';

interface ShopChoice { id: string; name: string }

/** 「全部店铺」哨兵值：selectedId 取它时表示不限定店铺（对外一律把 scopeShopId 撤掉，
 *  后端收到 null 就不加店铺过滤，于是所有店铺的数据一起显示）。 */
export const ALL_SHOPS = 'all';

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
  const selectedName = computed(() => selectedId.value === ALL_SHOPS ? '全部' : (shops.value.find(s => s.id === selectedId.value)?.name || legacyName.value || ''));
  /** 真正下发给后端的店铺 id；选「全部」时为 undefined（= 不加店铺过滤）。 */
  const scopedShopId = computed(() => selectedId.value && selectedId.value !== ALL_SHOPS ? selectedId.value : undefined);
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
        if (selectedId.value && selectedId.value !== ALL_SHOPS && !found.some(shop => shop.id === selectedId.value))
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
    const shop = id === ALL_SHOPS ? undefined : shops.value.find(item => item.id === id);
    if (id !== ALL_SHOPS && !shop) throw new Error('所选店铺不存在');
    selectedId.value = id;
    legacyName.value = '';
    error.value = '';
    return writePreference(storageKey(owner.value), { shopId: id, shop: shop?.name || '全部' });
  }
  return { shops, selectedId, selectedName, scopedShopId, selectionKey, loading, error, loadShops, ensureLoaded, selectShop };
});
