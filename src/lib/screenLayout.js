export function getScreenViews(files) {
  const primary = files.find((file) => file.role === "primary");
  const screens = files
    .filter((file) => file.screen && !(file.role === "primary" && file.follows))
    .sort((a, b) => a.screen.number - b.screen.number);
  const hasPositions = screens.every((file) => Number.isFinite(file.screen.x) && Number.isFinite(file.screen.y));
  const primaryScreen = screens.find((file) => file.screen.primary) || screens.find((file) => file.role === "primary") || screens[0];
  const secondaryScreens = screens.filter((file) => file !== primaryScreen);

  let nextX = 0;
  const views = screens.map((file) => {
    const { width, height } = file.screen;
    const rect = { x: hasPositions ? file.screen.x : nextX, y: hasPositions ? file.screen.y : 0, width, height };
    nextX += width;
    if (file === primaryScreen) {
      return { path: file.path, label: "Primary screen", windowsPrimary: true, rect };
    }
    const label = secondaryScreens.length > 1 ? `Secondary screen ${secondaryScreens.indexOf(file) + 1}` : "Secondary screen";
    return { path: file.path, label, windowsPrimary: false, rect };
  });

  if (primary?.follows) {
    views.unshift({ path: primary.path, label: "Auto switch", auto: true, rect: null });
  }
  return views;
}

export function getHomeView(views, primaryPath) {
  const fixedPrimary = views.find((view) => view.path === primaryPath && view.rect);
  return fixedPrimary || views.find((view) => view.windowsPrimary) || views.find((view) => view.rect) || views[0] || null;
}

export function getSwipeDirection(fromView, toView) {
  if (!fromView?.rect || !toView?.rect) {
    return { x: 0, y: 0 };
  }

  const dx = toView.rect.x + toView.rect.width / 2 - (fromView.rect.x + fromView.rect.width / 2);
  const dy = toView.rect.y + toView.rect.height / 2 - (fromView.rect.y + fromView.rect.height / 2);
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}
