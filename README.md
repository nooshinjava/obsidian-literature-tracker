# Literature Tracker

Track your reading, categorize papers, write paper notes, and link papers to your projects.

## Features

- **Reading status**: To read → Reading → Read → Reviewed.
- **Categories**: Theory/Background, Empirical study, Methods/Analysis, Data/Resources, Review/Meta, Other.
- Title, authors, year, journal, DOI or link, importance (1–5 stars), a quick comment and tags for each paper.
- One note per paper with a reference block, your quick comment and sections for key findings, methods and relevance.
- Search and filters in the side panel, plus shortcuts to Idea Vault and Mindful Focus.
- Duplicate check: adding a paper with a DOI or Zotero item that's already tracked asks you first.

When you edit a paper, only the properties you changed are updated, plus
the title, the **📄 Reference** block and the **💬 Quick comment**. If you've
edited those parts in the note, your version is kept and you're told.
Everything else in the note stays as you wrote it. Titles, authors and DOIs
from Zotero are shown literally, so they can't create links. If you rename
or move a paper note, the tracker follows it.

## Commands

| Command | What it does |
| :-- | :-- |
| Add paper | Opens the paper form |
| Import paper from Zotero | Picks an item in Zotero and pre-fills the form |
| Open panel | Shows the side panel (also the 📖 ribbon icon) |

## Zotero import (optional)

Install and enable the **Zotero Bridge** community plugin and keep Zotero running.
An **Import from Zotero** button then appears in the panel. Without it, you
add papers by hand.

## Settings

| Setting | Default | Used for |
| :-- | :-- | :-- |
| Papers folder | `Literature Tracker` | Where paper notes are saved (paths outside the vault are rejected) |

## Your data

The paper list lives in this plugin's `data.json`, and each paper also has a
readable note. New notes never overwrite an existing file: if the name is
taken, a number is added. Links are only created for DOIs and `http(s)` URLs.
When you delete a paper, the tracker asks first, then moves the note to your
Obsidian trash.

## Install

**From Obsidian:** open **Settings → Community plugins → Browse**, search for
**Literature Tracker**, then click **Install** and **Enable**.

**By hand:** download `main.js`, `manifest.json` and `styles.css` from the
[latest release](https://github.com/nooshinjava/obsidian-literature-tracker/releases/latest) into
`<your vault>/.obsidian/plugins/literature-tracker/`, reload Obsidian and enable
**Literature Tracker** under **Settings → Community plugins**.

## Feedback

I'd love to hear how Literature Tracker works for you. Please open an
[issue](https://github.com/nooshinjava/obsidian-literature-tracker/issues) for bugs or ideas.

Literature Tracker is part of [OrbitKit](https://github.com/nooshinjava/OrbitKit),
where I develop it together with my other Obsidian plugins. This repository is
generated from there.

## Acknowledgements

I designed and built Literature Tracker. I used [Claude](https://www.anthropic.com/claude),
an AI assistant by Anthropic, to help with parts of the code, tests and
documentation.

## License

[MIT](LICENSE) © Nooshin Javaheripour
