# Chart Guesser

A quiz game built from real charts. The title and the units are blacked out; the numbers on the axes stay visible. Players pick what the chart shows from eight answers, then see the full chart with its title, unit, source and a short explanation.

Everyone gets 10 charts. Eight right unlocks 5 more, and each further round of 5 needs at least 4 right to continue. The first 10 charts come from difficulty levels 1–2, the next 10 from levels 2–3, and after chart 20 only the hardest level is left. Personal bests are saved in the player's browser, and the game prefers charts a player hasn't seen before.

Everything is static files (HTML, CSS, JavaScript), so it runs anywhere, including GitHub Pages, with no server code and no build step.

## Try it on your computer

Unzip the folder and double-click `index.html`. The question builder is `builder.html`.

Some browsers block the custom font when a page is opened straight from your disk; the game then uses a system font. Online, everything loads normally.

## Publish it on GitHub Pages

1. Sign in to GitHub and create a new repository, for example `chart-guesser`. On a free account the repository has to be public for Pages to work.
2. On the empty repository's page, click **uploading an existing file**. Drag in everything inside the `chart-guesser` folder (not the folder itself): `index.html`, `builder.html`, `style.css`, `README.md` and the folders `assets`, `decks`, `js` and `lib`. Click **Commit changes**.
3. Open **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose the `main` branch and the `/ (root)` folder, and click **Save**.
4. After a minute or two the game is live at `https://<your-username>.github.io/chart-guesser/`, and the builder at `.../builder.html`.

Every later change you commit on GitHub goes live the same way, usually within a couple of minutes.

## Add your own questions

### With the builder (easiest)

1. Open `builder.html` (there's a link in the game's footer).
2. Paste two columns from Excel or Google Sheets: years, dates or labels in the first, numbers in the second. Fill in the correct answer, seven wrong answers, the level, the unit, a short explanation and the source. The preview shows the chart as the player sees it and after answering.
3. Click **Copy code**.
4. On GitHub, open `decks/main.js` and click the pencil icon (**Edit this file**). Scroll to the end of the `questions` list, type a comma after the last question's closing `}`, paste on the next line, and click **Commit changes**.

The builder remembers your last form in the browser, so a reload doesn't lose your work.

### By hand

Each question is one block like this. Copy it, change the values, and keep the commas between questions.

```js
    {
      id: "my-first-question",         // unique name: letters, numbers, dashes
      level: 2,                         // 1 (easiest) to 4 (hardest)
      type: "line",                     // "line", "bar" or "scatter"
      answer: "The correct answer",
      wrong: [                          // seven wrong answers; the game shuffles all eight
        "Wrong answer 1", "Wrong answer 2", "Wrong answer 3", "Wrong answer 4",
        "Wrong answer 5", "Wrong answer 6", "Wrong answer 7"
      ],
      unit: "% of electricity",         // revealed after answering
      title: "Full chart title, 1990–2024",
      info: "First paragraph of the explanation.\n\nA blank line (\\n\\n) starts a second one.",
      source: "Where the data comes from",
      sourceUrl: "https://example.org/data",
      x: [2019, 2020, 2021, 2022],
      y: [12.5, 14.1, null, 13.8]      // null leaves a gap
    }
```

| Field | Needed? | What it does |
|---|---|---|
| `id` | yes | Unique within the deck. The game uses it to remember which charts a player has seen. |
| `level` | yes | 1 to 4. See the level guide below. |
| `type` | yes | `"line"`, `"bar"` or `"scatter"` (dots). |
| `answer` | yes | The correct answer. |
| `wrong` | yes | Seven wrong answers. |
| `x` | yes | Years (`1990`), dates written as text (`"2020-04"` or `"2020-04-20"`), or labels (`"Mon"`). Numbers and dates are spaced by value, so gaps between years show correctly. |
| `y` | yes | The numbers, one per `x` value. `null` makes a gap. |
| `unit` | recommended | Shown above the chart after answering. |
| `title` | optional | The chart title revealed after answering. The answer is used if you leave it out. |
| `info` | recommended | The explanation on the answer page. `\n\n` starts a new paragraph. |
| `source`, `sourceUrl` | recommended | Credit and link, shown under the explanation. |
| `yScale` | optional | `"log"` for a log scale. Every value must then be above 0. |
| `yMin`, `yMax`, `xMin`, `xMax` | optional | Fix an axis range, for example `yMin: 0`. Bar charts always start at 0. |
| `points` | optional | `true` or `false`: dots on a line. By default, lines with up to 40 points get dots. |

Axis labels never show units. When a chart's values reach 10,000 or more, the axis uses short forms such as 12K, 3.4M and 5B.

If a deck file has a typo, such as a missing comma, the whole deck fails to load and the game says so; the browser console (F12) shows the line. A question with a problem, such as six wrong answers or a duplicate id, is skipped and listed in the console, and the start screen tells you how many were skipped.

## Levels

- Charts 1–10 draw from levels 1–2, charts 11–20 from levels 2–3, and from chart 21 on only the deck's highest level.
- If a level runs out, the game borrows the nearest other level and keeps the highest level for last. When nothing is left, the player sees "You cleared the deck".
- For the full experience, a deck needs at least 10 questions at levels 1–2, another 10 at levels 2–3, and then as many level 4 questions as you like. The 20 samples have five of each level, so a perfect player clears the deck at chart 20.

A rough guide:

1. The shape is famous, and the wrong answers come from other topics.
2. Well-known data. The wrong answers are plausible but differ in shape or scale.
3. You need to know a specific event or number, and some wrong answers have a similar shape.
4. The wrong answers are close relatives: same topic, similar shape. Only the numbers on the axes or a detail give it away.

Good wrong answers fit the look of the chart but not its numbers. Avoid a wrong answer that would produce the same chart, because then nobody can know. Also watch for accidental giveaways, such as a percentage that goes above 100 or a unit hidden in the answer text.

## More decks: work, kids, friends

1. Copy `decks/template.js` and give the copy a new name, such as `decks/kids.js` (lowercase letters, numbers and dashes).
2. Change its `title` and `intro`, and replace the example question with your own.
3. Play it by adding `?deck=kids` to the address: `https://<your-username>.github.io/chart-guesser/?deck=kids`.

Without `?deck=`, the game plays `decks/main.js`. Each deck keeps its own personal best and its own list of seen charts.

## Changing the rules

Add a `rules` object to a deck file. These are the defaults:

```js
  rules: {
    firstRound: 10, firstPass: 8,       // first round: 10 charts, 8 right to continue
    nextRound: 5, nextPass: 4,          // every later round: 5 charts, 4 right to continue
    bands: [                            // which levels each stretch of the game draws from
      { until: 10, levels: [1, 2] },
      { until: 20, levels: [2, 3] }
    ]                                   // after the last band: only the deck's highest level
  },
```

For younger players, something like `firstRound: 8, firstPass: 5` keeps the game going longer.

## Using it at work

A GitHub Pages site is public on the internet, even when the repository is private (only GitHub Enterprise Cloud can limit a Pages site to your organisation). Anyone with the address can play, and anyone can open the deck files, with answers and data in plain text. So don't put confidential numbers, such as real company KPIs, into a deck you publish there.

Safer options for work decks: host the folder on an internal web server your IT team approves, or send the folder round and let colleagues open `index.html` on their own computers, since it needs no server. Turning numbers into an index (for example 2019 = 100) hides the absolute values but can still reveal trends, so check with whoever owns the data.

## What's in the folder

| File | What it is |
|---|---|
| `index.html` | The game |
| `builder.html` | The question builder |
| `decks/main.js` | The 20 sample questions |
| `decks/template.js` | A starter deck to copy |
| `js/render.js` | Chart drawing and question checks, shared by the game and the builder |
| `js/game.js` | Game logic; the default rules are at the top |
| `js/builder.js` | Builder logic |
| `style.css` | All styles, with a dark mode that follows the device setting |
| `lib/chart.umd.min.js` | Chart.js 4, MIT licence (`lib/chart.js-LICENSE.md`) |
| `assets/fonts/` | Archivo, SIL Open Font License (`assets/fonts/OFL.txt`) |

## Data

Each chart's source is credited on its answer page. Most of the sample data comes via Our World in Data (CC BY 4.0), and the rest from public datasets published by NASA, NOAA, the US Energy Information Administration, the US Social Security Administration and others.
