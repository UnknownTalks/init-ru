# UI components and static hosting

The lesson stays on Quartz 5 and its existing JavaScript player. shadcn/ui was
installed using the official [manual setup](https://ui.shadcn.com/docs/installation/manual)
and its CLI registry (`components.json`). Components are editable source, with
React 19, Radix and Tailwind CSS 4. No framework or content migration is involved.

```sh
npm ci
npm run build
npm run check
npm test
npm run preview -- --port 8091
```

Open `http://127.0.0.1:8091/init-ru/01-foundations/01-from-data-to-agents/chat.html`.
Node is required only for building and previewing. Upload the contents of `public/`
for static hosting; it contains no mandatory server or backend. The existing
workflow remains manually triggered; nothing is deployed by these commands.

## Component ownership

- Button uses shared CVA variants. Input, Textarea and Native Select retain native
  form semantics. Build-time React rendering supplies their static attributes;
  the player's DOM factories use the same classes without hydration. Existing
  listeners, focus references, disabled states and values remain on those nodes.
- Select replaces the former handwritten combobox and handles all visible selects,
  including reading speed and reset scope. Radio Group handles reading
  preferences and answer choices. Checkbox handles multiple-choice task fields.
  Separator preserves the answer-choice separators. React mounts only these
  interactive controls and disposes removed instances.
- Native fields remain the player/form boundary for named values and existing
  input/change events. Hidden field proxies are excluded from the tab order.
  Updating a preference or restoring a draft explicitly refreshes the component.
- `theme.css` defines the selected Zinc palette and the gold discovery action.
  `lesson-theme.css` binds these tokens to lesson components and the attached navigation tabs. Tailwind
  preflight is intentionally omitted to preserve the lesson's document typography
  and layouts. `lesson.css` owns presentation and responsive layout.
- The approved illustration card is used by discoveries
  and skill details (`site/knowledge-card.js` and `site/knowledge-card.css`). Its
  examples come from `skills[].cardExample` in the lesson JSON.
  Saving still belongs to the existing
  discovery system and keeps the same storage key and event IDs.
- Conversation bubbles, discovery cards, skill journal, story content,
  progress meters and document scrolling stay purpose-built. Existing browser
  title tooltips and Quartz's course-index widgets retain their native behavior.
  Lesson navigation uses full-page routes styled as tabs; informational content follows the document scroll.

## Clock motion

The approved ivory material uses a single motion queue (`motion.js`) for keys,
tabs, full-page navigation, disclosures, select entrances and player transitions.
`clock-keys.js` supplies a short 1 px press without spring overshoot or a recessed
background; `clock-layout.js` coordinates content changes. There is no moving
tab indicator. Press/release takes 135 ms, disclosures 337.5 ms. Navigation and
disclosures skip the decorative press/release cycle so content responds promptly.
Content replacement uses 135 ms out, a 75 ms pause, and 165 ms in. Other
movements also have a 75 ms pause. Repeated pending intents are coalesced.
Message entrances are brief, optional feedback and never form a reading backlog.

The motion preference is separate from progress, under
`unknowntalks:motion:v1`. Reading settings offer system behavior, the clock rhythm,
and no animation. The default honors reduced motion; an explicit `?motion=clock`
link saves the chosen rhythm and removes that parameter from the address.
Disabling motion completes pending visual effects without discarding actions.
Focus loss and viewport resizing do not fast-forward the queue.

Only player-owned action labels receive a material face wrapper. React-owned
selects, radio buttons and checkboxes retain their DOM ownership and use the
same press timing. No lesson, discovery, answer or reading-state schema changes.

## Pages paths and data

The intended project URL is `https://unknowntalks.github.io/init-ru/`, already set
in `site/quartz.config.yaml`. Reader assets and lesson links remain relative.
Secondary sections use `chat.html?view=...` with the existing hash/query router;
refresh requests the same real HTML file, so Pages needs no SPA rewrite or server.
Fonts use the system stack. Radix/lucide assets and styles are bundled locally;
there is no runtime CDN dependency. Notices ship in `static/ui-licenses.txt` in
addition to the existing Quartz and demonstration notices.

Lesson JSON, storage IDs/keys, revisions of educational content and assessments,
progress format, discoveries, answers and workbook data are unchanged. Existing
local data remains scoped to its browser origin. A future move to another origin
(such as from localhost to GitHub Pages) does not move browser storage automatically.

Author review tools and records remain private and outside the repository/output.
They keep their existing local-server workflow. Static hosting does not publish
those tools or make private author reviews available remotely.

Reading speed and motion preferences use compact Select controls. This setup
targets modern browsers supported by Tailwind 4.

## Conversations in the lesson

The reply action below each story message expands a nested discussion in the
same reading column, on desktop and mobile. Collapsing restores the reading
position and leaves a message count; selecting text attaches only that excerpt.
Full source context is kept in the shared chat history. The lesson pauses while
a discussion is open. Disclosures use the same motion queue and respect reduced
motion. There is no separate contextual sidebar.

Chat history and drafts use `unknowntalks:agent-chats:v1` in localStorage. No model
is connected yet, and the interface explicitly says that messages are saved
locally. Interface settings allow disabling the agent without deleting chats.
