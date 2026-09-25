/*
  Chart Guesser: starter deck
  ---------------------------
  Use this file to start a new deck, for example one for work or one for kids.

  1. Copy this file and rename the copy, for example to decks/work.js
     (lowercase letters, numbers and dashes only).
  2. Change the title and intro below, then replace the example question with your own.
     builder.html writes the code for a question from pasted spreadsheet data.
  3. Play it by adding ?deck=work to the game's address, for example
     https://yourname.github.io/chart-guesser/?deck=work

  How many questions? The first round has 10 charts from levels 1 and 2, the next two rounds
  come from levels 2 and 3, and after chart 20 only the deck's highest level is used. A deck
  with fewer questions still works: the game falls back to other levels, and when a player
  has seen every chart it ends with "You cleared the deck".

  Every question needs: id, level, type, answer, wrong (7 answers), x and y.
  Optional: unit, title, info, source, sourceUrl, yScale: "log", yMin, yMax, xMin, xMax, points.
  README.md explains each field.
*/
window.DECK = {
  title: "My chart quiz",
  intro: "Guess what each chart shows. The title and units stay hidden until you answer.",

  // Optional: change the game rules for this deck. These are the defaults.
  // rules: { firstRound: 10, firstPass: 8, nextRound: 5, nextPass: 4 },

  questions: [
    {
      id: "days-in-month",
      level: 1,
      type: "bar",
      answer: "Number of days in each month",
      wrong: [
        "Hours of daylight in London, by month",
        "Rainy days per month in Manchester",
        "Average daily high temperature in Rome, by month",
        "Public holidays per month in Spain",
        "Full moons per month",
        "Births per month in the UK, in thousands",
        "School days per month in England"
      ],
      unit: "days",
      title: "Days in each month, in a year that is not a leap year",
      info: "Thirty days has September, April, June and November. February has 28, or 29 in a leap year.\n\nOur month lengths come from the Julian calendar, which Julius Caesar introduced in 45 BC.",
      source: "The Gregorian calendar",
      x: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      y: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    }
    // To add the next question, put a comma after the } above and paste the new question here.
  ]
};
