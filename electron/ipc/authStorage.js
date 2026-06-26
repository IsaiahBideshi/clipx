import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

let storageQueue = Promise.resolve();

function getAuthStoragePath() {
  return path.join(app.getPath("appData"), "clipx", "auth-storage.json");
}

async function readAuthStorage() {
  try {
    const data = await fs.promises.readFile(getAuthStoragePath(), "utf-8");
    const parsed = data.trim() ? JSON.parse(data) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }

    console.error("ClipX: Failed to read auth storage:", error);
    return {};
  }
}

async function writeAuthStorage(storage) {
  const authStoragePath = getAuthStoragePath();
  await fs.promises.mkdir(path.dirname(authStoragePath), { recursive: true });
  await fs.promises.writeFile(authStoragePath, JSON.stringify(storage, null, 2), "utf-8");
}

function withStorageQueue(operation) {
  const next = storageQueue.then(operation, operation);
  storageQueue = next.catch(() => {});
  return next;
}

export function registerAuthStorageIpcHandlers() {
  ipcMain.handle("auth-storage-get", async (_event, key) => {
    if (typeof key !== "string") {
      return null;
    }

    return await withStorageQueue(async () => {
      const storage = await readAuthStorage();
      const value = storage[key];
      return typeof value === "string" ? value : null;
    });
  });

  ipcMain.handle("auth-storage-set", async (_event, key, value) => {
    if (typeof key !== "string" || typeof value !== "string") {
      return;
    }

    await withStorageQueue(async () => {
      const storage = await readAuthStorage();
      storage[key] = value;
      await writeAuthStorage(storage);
    });
  });

  ipcMain.handle("auth-storage-remove", async (_event, key) => {
    if (typeof key !== "string") {
      return;
    }

    await withStorageQueue(async () => {
      const storage = await readAuthStorage();
      delete storage[key];
      await writeAuthStorage(storage);
    });
  });
}
