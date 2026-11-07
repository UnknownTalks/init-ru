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
tabs, full-page navigation, disclosures and player transitions. Selects fade in immediately so a queued lesson animation cannot leave an invisible modal blocking input.
`clock-keys.js` supplies a short 1 px press without spring overshoot or a recessed
background; `clock-layout.js` coordinates content changes. One moving ivory surface follows the active desktop tab. Press/release takes 135 ms, disclosures 337.5 ms. Navigation and
disclosures skip the decorative press/release cycle so content responds promptly.
Content replacement uses 135 ms out, a 75 ms pause, and 165 ms in. Other
movements also have a 75 ms pause. Repeated pending intents are coalesced.
Message entrances are brief, optional feedback and never form a reading backlog.

The watch opens the agent through the ordinary page transition immediately.
Its three turns run independently: 650 ms acceleration and 650 ms deceleration.
Leaving the agent rewinds half the actual travel without sparks. Scroll motion
and the rare sparks on vigorous scrolling retain their selected behavior.
Opening a lesson from the course entrance reveals Chapters and Skills together on desktop.
Mobile header height grows with its text and respects safe areas at every scale.

The conversation has no unread badges, unread shortcut or playback toolbar.
Reading speed remains in Settings; discovery cards still pause progression.
The watch receives playback events directly, independently of visible controls.

The motion preference is separate from progress, under
`unknowntalks:motion:v1`. Reading settings offer system behavior, the clock rhythm,
and no animation. New visitors get the selected clock rhythm; an explicit
"system" choice honors reduced motion. Saved "system" and "off" choices are
preserved. A `?motion=clock` link saves the chosen rhythm and removes that
parameter from the address.
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

## Selected instrument: Balance · Signature

The production watch uses the selected spring drive (inertia 1.1, stiffness 320,
damping 32, friction 3), compliant transmission (400 / 34 / 0.45°), and coupled
25 / 20 / 13 tooth wheels. `mechanism-profile.js` owns the fixed-step physics;
`mechanism.js` owns native scroll input, pointer capture, keyboard control and the
single wakeable animation loop. The rim/marker can be dragged without opening
the agent. The centre/Enter keeps the original agent access path; opening occurs
alongside three revolutions over 1.3 seconds. No laboratory controls or authoring
tools are part of the site.

`mechanism-sound.js` plays one quiet licensed gear texture. Settings offer Off,
Watch interactions, All actions except scroll, and All actions including scroll.
The default is Off; a user gesture is required to create/resume audio. Preferences
are stored alongside scale and agent visibility. The sample and its attribution
ship in `static/sound/`; notices also appear in `static/ui-licenses.txt`.

`page-flow.js`, `page-transitions.js`, and `mechanism-memory.js` preserve native
navigation and the instrument pose. A handoff freezes the departing pose before
capturing it. Recent forward navigation can retain physical momentum; reload and
history restore position at rest. Physical memory does not own lesson or chat UI.

Mobile headers use one safe-area-aware visible-viewport anchor. At normal scale,
the dial has 18 CSS px clearance from the usable top and side edges. Touch
landscape uses the same anchor. `mobile-header.js` observes viewport changes
without changing document scroll; scale changes retain accessible layouts.

## Mobile navigation and magnification

On phones and touch landscape layouts the fixed header contains the breadcrumb
and watch. Navigation moves into the lower gear button and a native modal
`dialog` sheet; desktop uses the same original navigation nodes as tabs. The
sheet supports downward handle dragging, cancellation, Escape, outside taps,
focus return, reduced motion, and releases modal inertness before changing view.
Gear movement is coupled by 24 / 14 / 16 teeth. Opening and closing use the
selected quiet watch feedback and sound preference. There is no idle gear loop.

Fixed headers never add `visualViewport.offsetTop`: elastic Safari scrolling
must not become a persistent header offset. Root overscroll is disabled on
mobile; safe-area insets and viewport height keep lower controls above the home
indicator, browser chrome and keyboard. No document scroll correction is used.
Physical iPhone overscroll still requires verification on a device.

New desktop settings use 125%, phones 100%; each saves its own magnification.
Legacy scale migrates to desktop; phone starts at 100%. CSS zoom belongs to
the body, with a neutral coordinate space for Popper portals and scaling only
their contents. `viewport.js` detects older WebKit's pre-zoom rectangles and
normalizes instrument/player measurements and the Select reference locally. Tab
coordinates use registered numbers, converted to lengths at the element, so
inherited typed lengths cannot apply magnification a second time.
Selects close on scale/viewport changes, history navigation, backgrounding
and bfcache lifecycle events to release their native Radix pointer guard.
