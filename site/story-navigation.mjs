export function cardNavigation(story, scene) {
  const byId = new Map(story.scenes.map((item) => [item.id, item]));
  const basicIndex = story.basics.indexOf(scene.id);
  const backId = scene.parent || story.basics[basicIndex - 1];
  const ids = story.scenes
    .filter((item) => item.parent === scene.id)
    .map((item) => item.id);
  if (basicIndex >= 0 && basicIndex < story.basics.length - 1)
    ids.unshift(story.basics[basicIndex + 1]);
  ids.push(...(scene.links || []));
  const targets = [...new Set(ids)].map((id) => {
    const target = byId.get(id);
    if (!target) throw new Error(`Unknown link from ${scene.id}: ${id}`);
    return { id, title: target.title };
  });
  return {
    back: backId ? { id: backId, title: byId.get(backId).title } : null,
    targets,
    height: Math.max(1020, 868 + Math.ceil(targets.length / 2) * 50),
  };
}

export function storyLayout(story) {
  const levels = [...new Set(story.scenes.map((scene) => scene.level))].sort(
    (a, b) => a - b,
  );
  const rowStep =
    Math.max(
      ...story.scenes.map((scene) => cardNavigation(story, scene).height),
    ) + 260;
  const bands = new Map();
  let height = 0;
  for (const level of levels) {
    bands.set(level, height);
    const rows = Math.max(
      ...story.chapters.map((chapter) =>
        Math.ceil(
          story.scenes.filter(
            (scene) => scene.chapter === chapter.id && scene.level === level,
          ).length / 2,
        ),
      ),
    );
    height += Math.max(1, rows) * rowStep;
  }
  const scenes = [],
    groups = [];
  for (const [column, chapter] of story.chapters.entries()) {
    const baseX = column * 3200;
    groups.push({
      id: "group-" + chapter.id,
      x: baseX - 50,
      y: -120,
      width: 3000,
      height: height + 120,
    });
    for (const level of levels) {
      const row = story.scenes.filter(
        (scene) => scene.chapter === chapter.id && scene.level === level,
      );
      for (const [i, scene] of row.entries())
        scenes.push({
          ...scene,
          number: story.scenes.indexOf(scene) + 1,
          x: baseX + (level === 1 ? 750 : (i % 2) * 1500),
          y: bands.get(level) + Math.floor(i / 2) * rowStep,
          width: 1360,
          height: cardNavigation(story, scene).height,
          navigation: cardNavigation(story, scene),
        });
    }
  }
  scenes.sort((a, b) => a.number - b.number);
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const edges = [];
  for (const scene of scenes)
    for (const target of scene.navigation.targets) {
      const across = scene.y === byId.get(target.id).y;
      edges.push({
        fromNode: scene.id,
        toNode: target.id,
        fromSide: across ? "right" : "bottom",
      });
    }
  return { scenes, groups, edges };
}
