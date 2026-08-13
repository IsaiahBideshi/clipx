import { spawn } from "node:child_process";
import notifier from "node-notifier";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: true, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

function notify(title, message) {
  notifier.notify({ title, message, sound: true, wait: false });
}

try {
  await run("vite", ["build"]);
  await run("electron-builder", ["build", "--win", "--publish", "never"]);
  notify("ClipX", "Build completed successfully.");
} catch (error) {
  notify("ClipX", `Build failed: ${error.message}`);
  process.exit(1);
}