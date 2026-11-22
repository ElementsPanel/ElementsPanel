import { computed, onMounted, onUnmounted, ref } from "vue";
import { useUserList } from "./useUserList";

export function useDesktopUserList() {
  const searchQuery = ref("");
  const currentPage = ref(1);
  const pageSize = 20;
  const {
    data,
    total,
    users,
    loading,
    fetch: fetchUsers
  } = useUserList({
    query: () => ({
      userName: searchQuery.value || "",
      page: currentPage.value,
      page_size: pageSize,
      role: ""
    }),
    keepMissing: true,
    onError: () => {
      data.value = undefined;
      total.value = 0;
    }
  });
  onMounted(() => {
    fetchUsers();
  });
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  onUnmounted(() => {
    clearTimeout(searchTimer);
  });
  const onSearchInput = () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage.value = 1;
      fetchUsers();
    }, 300);
  };

  const maxPage = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

  const prevPage = () => {
    if (currentPage.value > 1) {
      currentPage.value--;
      fetchUsers();
    }
  };

  const nextPage = () => {
    if (currentPage.value < maxPage.value) {
      currentPage.value++;
      fetchUsers();
    }
  };

  return {
    users,
    total,
    loading,
    fetchUsers,
    searchQuery,
    currentPage,
    pageSize,
    onSearchInput,
    maxPage,
    prevPage,
    nextPage
  };
}
