// Milestones and skill details come from the single supported lesson.
const discoveryTitles = {
  input: 'Что передать модели для сравнения наушников',
  evaluate: 'Улучшение проверяют на одинаковых примерах',
  mechanism: 'Обучение и генерация — разные процессы',
  'select-model': 'Модель выбирают под конкретную работу',
  'context-work': 'Модели доступны только переданные сведения',
  actions: 'Предложение модели ещё не действие',
  improve: 'Исправление начинается с причины ошибки',
};

export function authoredDiscoveries(story) {
  const locations = new Map(story.chapters.flatMap(c => [...c.intro, ...c.outro].map(e => [e.id, c.id])));
  const discoveries = story.skills.map(c => ({ ...c, chapter: locations.get(c.after), discoveryTitle: c.discoveryTitle || discoveryTitles[c.id] || c.name }));
  return {
    discoveries,
    discoveryEvents: discoveries.map(c => ({ ...c, discoveryTitle: c.discoveryTitle || discoveryTitles[c.id] || c.name })),
    relationships: [],
  };
}
