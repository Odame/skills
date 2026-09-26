---
name: design-prompt-writer
description: Turn a brand, brief, audience, references, and creative standards into a foundation prompt for a new Claude Design project.
disable-model-invocation: true
---

Turn what you already know, brand, brief, audience, references, creative standards, into a **foundation prompt**. It is one Markdown document. Paste it into Claude Design at the start of a new project, so it starts from your standards instead of its defaults.

**Interview for facts, never for taste.** Every question below has a factual answer: a name, a goal, a constraint, a link. Never ask the user to describe a color, a typeface, or a layout aesthetic in words. Those are **perceptual choices**. Looking decides them, not a parsed description, and Claude Design's own visual interview resolves them by showing options. The foundation prompt hands over pointers to references (links, files), never a paraphrase of what they look like. It then tells Claude Design to run its visual interview once the text foundation is set.

1. **Brand.** Ask the brand name, a one-line positioning or mission, and its voice (3-5 adjectives). If a brand-guideline doc or link exists, take it as the source and don't re-ask what it already states. Done when name, positioning, and voice are each either answered or pointed at an existing doc.

2. **Brief.** Ask what's being built (page, app, deck, campaign), the core goal, and what's explicitly out of scope. Done when the goal and the scope boundary are both concrete, not restated in general terms.

3. **Audience.** Ask who uses this, the context they're in, and what they should think, feel, or do afterward. Done when the answer names a specific audience in a situation ("a buyer comparing two insurance plans on their phone before a call"), not a demographic label ("millennials").

4. **References.** Ask for links or files: competitors, inspiration, an existing site or product to extend. Take the pointer itself, never a description of it. "I'll hand this to Claude Design to look at" replaces "what colors does it use?". Done when at least one reference is captured, or the user has explicitly said there is none.

5. **Creative standards.** Ask about accessibility requirements, an existing design system or component library to reuse, brand-guideline constraints (logo use, legal or regulatory limits), and platform or technical constraints. Done when each item is either named or explicitly waived.

6. **Write the foundation prompt.** Assemble steps 1-5 into the template below. List every reference from step 4 with an instruction to open and look at it. End with the line telling Claude Design to run its visual interview for color, typeface, imagery, and layout. Write the result to `design-prompt-writer-<slug>.md` in the current directory (slug from the brand or project name), then report the path. Done when the file exists and every answer from steps 1-5 appears in it.

## Foundation prompt template

<foundation-prompt-template>

# <Project name>: Foundation

## Brand
<name, positioning, voice>

## Brief
<what's being built, the goal, what's out of scope>

## Audience
<who, their context, what they should think, feel, or do afterward>

## References
<one line per link or file: what to take from it>

Look at each of these before proposing a direction.

## Creative standards
<accessibility requirements, design system or components to reuse, brand-guideline constraints, platform or technical constraints>

## Before you start
Everything above is fixed; the visual direction is not. Run your visual interview for color, typeface, imagery style, and layout before you commit to one.

</foundation-prompt-template>
