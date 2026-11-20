import { app } from "electron";
import path from "path";

import { startLogging } from "./services/logService.js";

export const isDev = !app.isPackaged;
if (isDev) {
  app.setPath("userData", path.join(app.getPath("appData"), "clipx-dev"));
}

export const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (hasSingleInstanceLock) {
  startLogging();
}
