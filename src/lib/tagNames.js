export function countFittingNames(names, available, measure, gap = 0) {
  for (let shown = names.length; shown > 1; shown -= 1) {
    const hidden = names.length - shown;
    const width = measure(names.slice(0, shown).join(", ")) + (hidden ? gap + measure(`+${hidden}`) : 0);
    if (width <= available) return shown;
  }
  return 1;
}
