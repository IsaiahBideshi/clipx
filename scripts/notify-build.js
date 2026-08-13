import notifier from "node-notifier";

notifier.notify({
  title: "ClipX",
  message: "Build completed successfully.",
  sound: true,
  wait: false,
});