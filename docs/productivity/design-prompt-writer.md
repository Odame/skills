## What it does

`design-prompt-writer` turns what you already know about a new project, brand, brief, audience, references, and creative standards, into a **foundation prompt**: one Markdown document you paste into Claude Design at the start of the project. It interviews for facts only. A color, a typeface, a layout aesthetic: none of these get asked for in words. They are **perceptual choices**, resolved by looking, so the foundation prompt hands Claude Design pointers to references and tells it to run its own visual interview once the text foundation is set.

## When to reach for it

You invoke this by typing `/design-prompt-writer`; the agent won't reach for it on its own.

Reach for it at the start of a new Claude Design project, before the first prompt, so the project starts from your brand and brief instead of Claude Design's defaults. It is not for a single ad-hoc ask ("make me a landing page for this"): it is a one-time setup step for a project that will see many prompts after it.

## The five facts

The interview covers five topics, each answerable in words:

| Topic | What it asks |
| --- | --- |
| Brand | Name, one-line positioning, voice (3-5 adjectives) |
| Brief | What's being built, the goal, what's out of scope |
| Audience | Who uses it, their context, what they should do afterward |
| References | Links or files: competitors, inspiration, an existing product to extend |
| Creative standards | Accessibility, an existing design system, brand-guideline limits, platform constraints |

References are the one topic where the temptation is to describe rather than point: naming the colors or layout of a competitor site talks about a perceptual choice in words. The skill takes the link or file instead, and tells Claude Design to look at it directly.

## Facts versus perceptual choices

The skill's one rule: interview for facts, never for taste. A fact has a right answer the user can type out; a perceptual choice (color, typeface, imagery style, layout) only has a right answer once someone looks at options and picks. Asking a user to describe their preferred blue in words gets a worse answer than showing them three blues. The foundation prompt draws this line explicitly: it fixes every fact, then hands the perceptual choices to Claude Design's visual interview with an instruction to run it.

## Common questions

**Why not just ask about colors and fonts directly?**
Because a described preference is a weaker stand-in for a seen one. Claude Design can show the user real options and read their reaction; a text interview can only ask them to put a look into words, which is the weaker signal of the two.

**What if the project has no existing brand guidelines?**
The brand step still runs. Answer from what exists in the user's head (name, positioning, voice), and skip only what genuinely isn't decided yet, rather than inventing placeholder answers.

## It's working if

- The foundation prompt names every fact from all five topics, and doesn't try to describe how anything should look.
- Claude Design's first visual interview on the project references the foundation prompt's brief and audience rather than starting cold.

## Where it fits

A **reach-for-it-anytime standalone**: run it once per new project, before the first design prompt. See [ask-matt](https://aihero.dev/skills-ask-matt) for how it sits alongside the rest of the set.
