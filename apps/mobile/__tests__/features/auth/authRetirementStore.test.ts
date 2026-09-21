import * as SecureStore from "expo-secure-store";
import {
  __resetAuthRetirementStoreForTests,
  activatePersistedAuth,
  isAuthRetired,
  markAuthRetired,
} from "@/features/auth/authRetirementStore";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const getItem = SecureStore.getItemAsync as jest.Mock;
const setItem = SecureStore.setItemAsync as jest.Mock;
const deleteItem = SecureStore.deleteItemAsync as jest.Mock;

describe("auth retirement persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAuthRetirementStoreForTests();
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
    deleteItem.mockResolvedValue(undefined);
  });

  it("persists only a credential-free retirement marker", async () => {
    await markAuthRetired();

    expect(setItem).toHaveBeenCalledWith("beachleague.auth.retired.v1", "1");
    await expect(isAuthRetired()).resolves.toBe(true);
  });

  it("reads a persisted marker on a fresh launch", async () => {
    getItem.mockResolvedValue("1");
    await expect(isAuthRetired()).resolves.toBe(true);
  });

  it("clears retirement only after the caller activates persisted auth", async () => {
    await markAuthRetired();
    await activatePersistedAuth();

    expect(deleteItem).toHaveBeenCalledWith("beachleague.auth.retired.v1");
    await expect(isAuthRetired()).resolves.toBe(false);
  });

  it("repairs a late activation that completes after a newer logout", async () => {
    const delayedDelete = deferred<void>();
    deleteItem.mockReturnValueOnce(delayedDelete.promise);
    const activation = activatePersistedAuth();
    const retirement = markAuthRetired();

    delayedDelete.resolve(undefined);
    await Promise.all([activation, retirement]);

    expect(setItem).toHaveBeenLastCalledWith(
      "beachleague.auth.retired.v1",
      "1",
    );
    await expect(isAuthRetired()).resolves.toBe(true);
  });
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
