export async function fetchLocalOptions() {
  if (typeof window.clipx?.getOptions !== "function") {
    throw new Error("window.clipx.getOptions is not available (preload not wired?)");
  }

  return await window.clipx.getOptions();
}
