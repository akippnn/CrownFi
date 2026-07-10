const globalForMockStore = globalThis as unknown as { mockTicketsStore?: any[] };
if (!globalForMockStore.mockTicketsStore) {
  globalForMockStore.mockTicketsStore = [];
}
export const mockTicketsStore = globalForMockStore.mockTicketsStore;
