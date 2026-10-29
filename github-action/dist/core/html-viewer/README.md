# Report viewer

[Core README](../README.md)

Read a saved review, inspect its screenshots, and copy findings as Markdown or open them in an issue tracker. Development previews use fake reports separately from real review evidence. Report packaging includes the viewer files so the finished folder can be opened on another computer.

## Architecture

- Use browser JavaScript compiled from TypeScript, with local CSS and no UI framework. Finished reports contain their JSON data and viewer code in the HTML. Development previews fetch the adjacent `report.json` over HTTP when embedded data is absent. Both paths use the same report validator, and only valid reports are displayed.
- Keep the schema, scripts, validator, styles, and images in the report folder so it works without internet access. Image references stay relative to that folder.
- Keep the report index and finding detail in separate page-rendering modules, apart from reusable UI components. Both use one HTML shell and bookmarkable URLs with a hash fragment.
- Keep the index present while findings open in a desktop side panel or mobile dialog. This preserves its search, filters, disclosures, and scroll position.
- Keep shared timing, interaction state, and navigation under `interactions/`. Components and pages create the visible interface. The report model handles labels, filtering, summaries, and content sent to issue trackers; core build scripts prepare the reusable viewer files.
- Define every viewer and preview UI color in semantic CSS custom properties, including theme, state, focus, overlays, and icon colors. New styles must use these properties or inherit them; SVG controls use variable-colored masks or `currentColor`. Synthetic screenshot illustrations keep their own palette.
- Use shared typography variables matching Tailwind’s default size/line-height pairs, without a Tailwind dependency. Use 14/20px finding titles and body text, 12/16px metadata, badges, captions, actions, tooltips, and code references, 16/24px lead text and subheadings, 18/28px section headings, 20/28px detail/modal titles, and 24/32px report titles at every width. Keep the root at the browser default so text respects reader preferences; screenshots and icons retain their authored sizes.
- Display report content as text rather than interpreting it as HTML. Do not treat a partial or invalid review as valid.

## Files

Production viewer:

- index.html — Viewer shell used by report packaging and previews.
- viewer.ts — Load and validate reports, open findings, adapt panels to screen size, and manage keyboard focus.
- viewer.css — Viewer layout, themes, controls, and responsive styles.
- model.ts — Filter findings, summarize priorities, and format content for copying or issue trackers.

Interactions:

- interactions/gallery.ts — Issue screenshot order and keyboard navigation.
- interactions/navigation.ts — Bookmarkable finding URLs and returning to the report index.
- interactions/copyFeedback.ts — Clipboard feedback timing and cancellation.
- interactions/modalDismissal.ts — Shared closing animations and timing for restoring keyboard focus.
- interactions/tooltipState.ts — Show and dismiss screenshot information on hover or keyboard focus.

Pages:

- pages/ReportIndex.ts — Report overview, search, category filter, and finding list with preserved state.
- pages/FindingDetail.ts — Finding content, copying and issue-tracker actions, evidence, and cleanup when the finding changes.

Reusable components:

- components/ImageModal.ts — Enlarged screenshot gallery with keyboard navigation.
- components/RunDetailsModal.ts — Review information dialog with close controls.
- components/Screenshot.ts — Evidence image, metadata tooltip, and enlargement action.
- components/PriorityBadge.ts — Priority badge with explanation tooltip.
- components/PrioritySummary.ts — Priority distribution chart and counted legend.
- components/InvestigationWarnings.ts — Expandable warnings with a Show more control.
- components/dom.ts — Shared controls and sections that display authored content as plain text.

Development previews:

- preview/build.ts — Viewer assets and synthetic scenario generation.
- preview/index.html — Shell to let testers pick a report to preview
- preview/preview.ts — Scenario selection and embedded viewer navigation.
- preview/serve.json — Static preview server settings for local files and fresh reloads.

Update this list when files are added, moved, or removed.

## User experience

- Show clear errors for loading, fetching data, unsupported versions, and invalid report data. Identify the relevant report fields when possible. Embedded production reports support direct `file://` opening after extraction; development assets without embedded data still explain how to serve their JSON over HTTP.
- Center the copyright footer with the current year and Directed Works LLC linked to the company website.
- Give all tooltips a dark translucent glass background with blur and light text in both themes.
- Show one report index with the overview above the issue list, without category navigation or Top issues. Keep the report independently scrollable on desktop; use document scrolling on mobile, follow the system light/dark preference, keep screenshots prominent, and use sentence case copy.

**Report overview**

- Start at the report index. Show the report title, scan date and time in the reader’s locale and timezone, priority statistics, and investigation warnings above the issue list. Place a Details link beside the timestamp; it opens Run details with area coverage, app context, review timestamp, scope, evidence summary, limitations, and outstanding questions, all expanded.
- Place the title/timestamp and unboxed priority chart beside each other when the report area is wide, stacking the chart below on smaller widths. Keep the issue-list heading accessible without displaying it.

**Priority chart**

- Show a compact donut chart of high, medium, and low priorities with a counted legend. Use medium-weight monospace legend counts. Include every priority in the legend even at zero; show a neutral empty ring when there are no findings.
- Use bright chart colors and background-colored outlines around proportional slices, without subtracting gaps from the data; hovering or focusing a slice shows its priority and issue count, and Escape dismisses the tooltip. Keep warning counts separate from finding priorities and omit repeated finding/warning totals from the report subtitle.

**Opening and closing findings**

- Each issue has a bookmarkable URL using a hash fragment, which also works when the report is opened as a local file. Opening one animates a second panel into the right side on desktop, resizing the report into the remaining space. The detail panel uses half the viewport up to 800px; both panels remain interactive, and selecting another issue replaces the current detail.
- Screens up to 800px use a full-screen modal drawer. Use a plain upper-right Close finding icon on desktop and Back to report in the full-screen mobile detail. Both controls and Escape close the detail. Skip animations for reduced motion.

**Warnings and run details**

- Show warning cards after the header/statistics without a visible Warnings heading. In the Run details modal, use one transparent two-column metadata table without subheadings; Area coverage is a row with a bullet for each area’s name and reviewed status.
- Close with a plain corner icon, Escape, or the backdrop; keep keyboard focus inside the dialog, return it to the Details control on dismissal, and keep long content scrollable on narrow screens. These informational rows have no horizontal padding or hover fill; clickable rows keep subtle horizontal padding.
- Warning cards show category and scope inline beside the title with an outlined chevron on the right; expanded cards show uncertainty, next verification, and ID in a compact key/value table; show three initially and reveal the remainder with a computed Show more count.

**Search and filtering**

- Sort high → medium → low, preserving input order within priorities. Put an issue-type filter beside Search as separate rounded controls, with space between them and above the finding list. Inset the filter chevron from its right edge. Default to all ten categories together. Combine category and text search across user-readable issue content.
- Keep controls available for empty results and distinguish an empty report, empty category, and no search matches.

**Finding list and navigation**

- Enclose finding rows in one rounded border with internal row dividers and medium-weight priority badges. Make each entire finding row a keyboard-accessible issue link with a focus outline around the entire row; secondary text shows category and human-readable scope without the finding ID. Opening a detail preserves index search, filter, disclosures, and scroll; closing restores the initiating link’s focus.
- Browser Back/Forward and direct issue links show the same responsive detail. Keep focus on the initiating list link on desktop; move focus into the full-screen mobile detail. Closing a direct link returns to this report’s index. Show every required detail and its visual or nonvisual evidence, including matched before/after images when supplied.

**Evidence and screenshot gallery**

- Use matching typography and spacing with a hairline underneath each main finding-section heading; keep subordinate headings without hairlines. Present evidence without card wells, with the evidence kind and support headings subordinate to Evidence. Show matched before and proposed-after screenshots side by side, stacked on narrow screens, with their labels above the images.
- Capture route, state, viewport, image dimensions, and scroll metadata appear in an accessible image tooltip after 500ms of hovering, or immediately on keyboard focus. Cancel pending image tooltips on departure, blur, modal opening, and issue changes; other tooltip timing stays unchanged. Escape dismisses it without moving focus.
- Enlarge screenshots edge-to-edge with an overlaid close control using click or keyboard activation; support Escape dismissal, keep keyboard focus inside the dialog, and return focus to the image control after closing. Place Previous image and Next image arrows outside the enlarged image with space reserved inside the viewport. Start at the clicked image and navigate Before → Proposed after without wrapping; support unmodified Left/Right keys while the image dialog is active.
- Disable Previous at the first image and Next at the last; show both disabled for single-image issues. Announce the current image label and position. Image dialogs fade and scale over 150ms when opening and closing; skip transitions when reduced motion is preferred. Use semantic controls, visible focus, accessible names, readable contrast, and priority cues beyond color.

**Finding details**

- Preserve authored finding-ID casing in the header. Order the finding header as monospace ID, title, priority/category/area metadata, then actions. Keep the header without a bottom border; place the larger problem paragraph outside it, directly above Evidence without a heading. Show the authored priority explanation in a hover/focus tooltip on its badge. Let the pointer move onto the tooltip without closing it.
- Keep the priority tooltip inside the viewport, allow Escape to dismiss it, and omit a separate Priority section. Render Locations above Suggested solution as full-row links with a browser icon, medium-weight name, inline smaller/lighter monospace reference, and an upper-right arrow. Resolve root-relative app routes only against the report’s optional app base URL and open the resulting HTTP(S) targets in a new tab without giving the new tab access to the report tab.
- Without app context, show routes as plain rows without arrows. Source paths and full URLs are not valid locations. Nest Expected benefit and Acceptance criteria under Suggested solution with smaller secondary headings matching What this supports. Show acceptance criteria as a semantic list with decorative checkmarks. Label reproduction instructions To reproduce and place them after Locations, before Suggested solution; include all sections in Markdown.

**Copying findings**

- Keep copied Markdown in sync with the finding page’s content, section order, and heading hierarchy whenever the page changes, including the shared content sent to Linear and GitHub. Include category, scope, priority and its explanation, reproduction steps when supplied, acceptance criteria, and textual evidence metadata; omit evidence images and their file references from all three handoffs.
- Include app base context, preserve authored location references, and link resolved HTTP(S) destinations in Markdown. Confirm successful copying with “Copied!” in the button for one second, then restore “Copy Markdown”. Show “Copy failed” in the button for one second if clipboard access fails.

**Linear**

- Offer Create in Linear before Copy Markdown, with a black background, white text, and a Linear icon in both themes. Open Linear’s new-issue composer in a new tab without giving the new tab access to the report tab, using [Linear’s documented creation URL](https://linear.app/developers/create-issues-using-linear-new) with the finding title and complete Markdown description. The user chooses the workspace/team and submits the ticket in Linear.

**GitHub**

- When review context includes a GitHub repository, show Create issue with its GitHub icon between Create in Linear and Copy Markdown. Open that repository’s issue composer in a new tab without giving the new tab access to the report tab, prefilling the finding title and complete Markdown body. The viewer needs no GitHub authentication or API token; the user signs in and submits on GitHub.
- Hide this action when the optional repository is absent.

## Development

- Run `pnpm --filter design-review-agent-core preview`, then open `http://127.0.0.1:4175/`. The command builds before serving with the pinned development server; rerun `pnpm --filter design-review-agent-core build:viewer` and reload after editing. Serve only generated previews, accessible from this computer. Disable caching and preserve HTTP errors for missing files instead of returning the main page. An occupied port stops the command instead of choosing another port.
- The separate preview page selects scenarios that can also be opened by URL. It is never included inside a report. Building reusable viewer files is separate from generating fake reports for previews. Keep generated previews out of version control.
- The Complete review preview includes a fake GitHub repository. Visual findings omits it to check that the Create issue action appears only when a GitHub destination is supplied.
- The Complete review preview has five distinct accessibility findings, categories with one finding, and an empty category. The warnings-only preview has eight distinct concerns to exercise individual disclosure and Show more. The smaller contract-test fixtures still cover all ten categories.
- Previews consume shared report fixtures and synthetic screenshots for long content, sparse categories, empty and warnings-only reports, missing images, invalid data, and unsupported versions. The preview builder supplies malformed JSON and missing-report HTTP scenarios.
- Generated assets and scenarios live in ignored `dist/`. `dist/viewer/` contains reusable local viewer assets and schema; it expects an adjacent valid `report.json` and its images. This build does not package user reports or validate image files.
- The report-format module owns shared development fixtures and fake SVG screenshots. The viewer owns the preview page, scenario generation, and static server settings. Keep fixtures separate from real review evidence and from files distributed with the Action.

## Intentionally skipped

- Editing issues
- Issue persistence/memory
- Issue tracking, API integration, and automatic ticket submission

---

## Testing

- Gallery input tests verify empty galleries stay closed and invalid indices fail before browser state changes.

- Test safe text rendering and complete Markdown output; reject the same invalid report fixtures as the generator.
- Browser checks cover index/detail routes, Back/Forward, direct links, animated and reduced-motion dismissal, focus restoration, evidence, empty/warning states, search, issue-type filtering, Markdown copy success/failure, prefilled Linear and optional GitHub links, nested screenshot enlargement, image cycling by arrows and keyboard, and desktop/mobile resizing, keyboard navigation, both themes, narrow layouts, and long content.
- Verify embedded-data parsing and text safety, HTTP fetch/validation failures, unsupported versions, and development HTTP-serving guidance. Confirm relative assets remain intact after moving the production folder and production reports need no network requests.
- Earlier saved reports passed direct-file browser checks for the previous category layout, desktop/mobile layouts, screenshot enlargement, and Escape dismissal, with no page errors or broken images. The viewer now combines overview and issues in one index with bookmarkable issues in a desktop split panel or full-screen mobile drawer; verify the new navigation alongside portable delivery. Downloaded/extracted GitHub artifact acceptance remains pending. Development HTTP error scenarios remain separate from production delivery.

---

## TODO

### Personal prototype

- Restore evidence images in copied Markdown and the Linear/GitHub handoffs when shared image delivery is supported.

### Friendly alpha

- Add a comparison slider for matched before and proposed-after screenshots.
- Verify downloaded/extracted GitHub report folders remain usable after service-side temporary assets expire. Keep extraction/opening instructions with the download; artifacts do not themselves host an interactive website.
- Preserve text safety, shared validation, local assets, keyboard access, and narrow-screen usability when serving reports from the hosted workflow. Hosting and a service dashboard remain separate from this portable viewer.

### Maybe

- Consider choosing a preview fixture at startup, defaulting to Complete review, instead of using a scenario picker. Keep a small preview launcher and the shared viewer build; clear only dedicated preview output when switching fixtures so stale files cannot affect previews.
