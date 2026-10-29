# Design checks

[Agent prompt README](../README.md)

Shared assessment guidance for review agents and the future hosted evaluator. These instructions explain what to inspect and how to judge a problem; they are not automated tests.

## Architecture

- Keep one set of ten category guides for both review agents and the future hosted evaluator. Categories guide what to look for; they do not require a certain number of findings or run as separate checks.
- The [parent module](../README.md) owns the shared prompt defining the non-interactive review procedure: consume supplied context and return the report plus run warnings or issues without asking the user questions. Executors choose tools, collect evidence, and author findings. The report contract owns the data format; this module owns how to assess problems and explain recommendations.
- Review the product's intended experience, not its strategy. Do not assign an arbitrary overall design score or claim compliance from incomplete inspection.

## Review guidance

- Assign each finding one primary category. Choose the category for the cause most directly addressed by the recommended fix. Mention related concerns in the description without creating duplicate findings.
- Do not invent findings to fill a category.
- Read the relevant guide before checking a category:
  - [Accessibility](accessibility.md): semantics, names, keyboard access, focus, zoom, and assistive technology support.
  - [Color](color.md): meaning, contrast, themes, and information conveyed by color alone.
  - [Typography](typography.md): readability, scale, line length, weight, and text roles.
  - [Layout and spacing](layout-and-spacing.md): grouping, alignment, reading order, density, hierarchy, and responsive behavior.
  - [Components](components.md): reusable controls, modals, forms, and validation.
  - [Interactions and motion](interactions-and-motion.md): predictable behavior, interactive cues, targets, and animation.
  - [Navigation and flows](navigation-and-flows.md): orientation, next steps, detours, onboarding, and unnecessary work.
  - [Content and imagery](content-and-imagery.md): labels, instructions, terminology, error copy, icons, and images.
  - [States and feedback](states-and-feedback.md): empty, loading, disabled, success, error, and offline feedback.
  - [Consistency and polish](consistency-and-polish.md): repeated patterns, design system use, and small visual defects.
- Verify suspected problems. Separate observed defects, evidence-backed concerns, and subjective preferences; explain uncertainty and tradeoffs.
- Include small improvements when they offer a concrete clarity, consistency, or visual quality benefit. Avoid arbitrary aesthetic replacements.
- Prefer reusable fixes when evidence supports a shared cause. Similar-looking components may behave differently.
- Do not claim accessibility compliance from visual inspection.

**Evidence and proposals**

- Require concrete visual or nonvisual evidence supporting each verified issue. Record method, location, relevant state, and observed result. Screenshots alone cannot verify interactions.
- Screenshots and matching before/after proposals are optional. Use actual browser captures, not collages, sketches, generated mockups, or imagined after images.
- Capture route, viewport and image dimensions, scroll position, and relevant UI state. Compare proposals at equivalent framing, content, and state; verify relevant behavior too.
- Retry or discard an unsuccessful proposal. Keep an evidence-backed problem even without an after image. If the problem cannot be verified, record a screenshot-free investigation warning with its concern, uncertainty, and next check.

**Findings and handoff**

- Follow the report contract owned by [core](../../README.md) for required fields and evidence metadata. This module owns the quality of the assessment, not its data format.
- Explain what fails or creates friction, for whom, and whether the conclusion is observed, inferred, or a preference. Prioritize by impact, reach, frequency, and confidence.
- Recommend a specific change consistent with product intent, explain its expected benefit without claiming untested results, and define observable conditions for success. Include unresolved business questions or tradeoffs.
- Merge symptoms sharing a cause; retain affected locations. Keep investigation warnings separate from actionable findings.

---

## Testing

- Review representative findings for evidence, useful priority rationale, actionable recommendations, appropriate categorization, and honest limitations.
- When observations share a cause, check that the combined finding still lists every affected location. Repeated observations must not inflate finding counts.
- Real-product inspection and automated evaluator fixtures belong to the consuming packages. There is no automated test suite for the assessment guidance yet.

---

## TODO

### Personal prototype

- Calibrate finding quality on real products: priority rationale, shared-cause grouping, useful recommendations, and honest coverage. Keep finding quotas and arbitrary design scores out of the review.
- Refine the guidance using existing QA skills, density evaluations, and a real local review.

### Friendly alpha

- Validate that local, CI, and hosted reviews apply the same prompt and rubric while documenting their different inspection capabilities and coverage.
