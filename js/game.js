/* Chart Guesser: game logic */
(function () {
  'use strict';
  var CG = window.CG;
  var esc = CG.esc;

  /* Default rules. A deck can override any of these with a "rules" object. */
  var DEFAULT_RULES = {
    firstRound: 10, // charts in the first round
    firstPass: 8,   // correct answers needed to unlock the next round
    nextRound: 5,   // charts in every later round
    nextPass: 4,    // correct answers needed in each later round
    bands: [        // which difficulty levels each stretch of the game draws from
      { until: 10, levels: [1, 2] },
      { until: 20, levels: [2, 3] }
    ]                // after the last band: only the deck's highest level
  };

  var screen = document.getElementById('screen');
  var statsEl = document.getElementById('stats');
  var statN = document.getElementById('stat-n');
  var statScore = document.getElementById('stat-score');
  var announcer = document.getElementById('announcer');

  var params = new URLSearchParams(location.search);
  var deckName = (params.get('deck') || 'main').trim().toLowerCase();
  var SAFE_NAME = /^[a-z0-9][a-z0-9_-]{0,48}$/;

  var deck = null, questions = [], problems = [], rules = DEFAULT_RULES, maxLevel = 1;
  var game = null, chart = null, phase = 'start';

  /* ---------- storage (fails quietly, e.g. in private mode) ---------- */
  function key(k) { return 'chartGuesser:' + deckName + ':' + k; }
  function load(k, fallback) {
    try { var v = localStorage.getItem(key(k)); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function save(k, v) { try { localStorage.setItem(key(k), JSON.stringify(v)); } catch (e) { /* ignore */ } }

  /* ---------- helpers ---------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function countRight(list) { return list.filter(Boolean).length; }
  function announce(text) { announcer.textContent = ''; setTimeout(function () { announcer.textContent = text; }, 30); }

  function posInt(v, fallback) { return Number.isInteger(v) && v > 0 ? v : fallback; }
  function mergeRules(r) {
    r = r || {};
    var out = {
      firstRound: posInt(r.firstRound, DEFAULT_RULES.firstRound),
      firstPass: posInt(r.firstPass, DEFAULT_RULES.firstPass),
      nextRound: posInt(r.nextRound, DEFAULT_RULES.nextRound),
      nextPass: posInt(r.nextPass, DEFAULT_RULES.nextPass),
      bands: DEFAULT_RULES.bands
    };
    if (Array.isArray(r.bands) && r.bands.every(function (b) {
      return b && posInt(b.until, 0) && Array.isArray(b.levels) && b.levels.length;
    })) out.bands = r.bands.slice().sort(function (a, b) { return a.until - b.until; });
    out.firstPass = Math.min(out.firstPass, out.firstRound);
    out.nextPass = Math.min(out.nextPass, out.nextRound);
    return out;
  }

  /* ---------- deck loading ---------- */
  function loadDeck(name) {
    return new Promise(function (resolve, reject) {
      if (window.CG_INLINE_DECK) { resolve(window.CG_INLINE_DECK); return; } // single-file preview build
      if (!SAFE_NAME.test(name)) {
        reject(new Error('"' + name + '" is not a valid deck name. Use lowercase letters, numbers and dashes.'));
        return;
      }
      window.DECK = undefined;
      var s = document.createElement('script');
      s.src = 'decks/' + name + '.js';
      s.onload = function () {
        if (window.DECK && Array.isArray(window.DECK.questions)) resolve(window.DECK);
        else reject(new Error('decks/' + name + '.js loaded, but it does not define window.DECK with a "questions" list. ' +
          'Usually this is a typo such as a missing comma or bracket; your browser console shows the line.'));
      };
      s.onerror = function () {
        reject(new Error('Could not load decks/' + name + '.js. Check that the file exists and the name matches.'));
      };
      document.head.appendChild(s);
    });
  }

  function prepare(d) {
    var ids = {}, ok = [], issues = [];
    d.questions.forEach(function (q, i) {
      var label = q && q.id ? '"' + q.id + '"' : '#' + (i + 1);
      var res = CG.checkQuestion(q);
      if (res.errors.length) { issues.push('Question ' + label + ': ' + res.errors.join('; ')); return; }
      if (ids[q.id]) { issues.push('Question ' + label + ': this id is used more than once'); return; }
      ids[q.id] = true;
      ok.push(q);
      res.warnings.forEach(function (w) { console.info('[Chart Guesser] Question ' + label + ': ' + w); });
    });
    issues.forEach(function (p) { console.warn('[Chart Guesser] Skipped. ' + p); });
    return { ok: ok, issues: issues };
  }

  /* ---------- picking questions ---------- */
  function levelsFor(n) {
    for (var i = 0; i < rules.bands.length; i++) {
      if (n <= rules.bands[i].until) return { levels: rules.bands[i].levels, strict: false };
    }
    return { levels: [maxLevel], strict: true };
  }
  function distance(level, levels) {
    return Math.min.apply(null, levels.map(function (l) { return Math.abs(l - level); }));
  }
  /* Questions allowed at position n. Before the last band ends, fall back to the
     nearest other levels (keeping the top level for last); after it, top level only. */
  function candidatesFor(n) {
    var used = {};
    game.asked.forEach(function (a) { used[a.q.id] = true; });
    var left = questions.filter(function (q) { return !used[q.id]; });
    var want = levelsFor(n);
    var c = left.filter(function (q) { return want.levels.indexOf(q.level) >= 0; });
    if (c.length || want.strict) return c;
    var lower = [];
    left.forEach(function (q) { if (q.level < maxLevel && lower.indexOf(q.level) < 0) lower.push(q.level); });
    lower.sort(function (a, b) { return distance(a, want.levels) - distance(b, want.levels) || a - b; });
    for (var i = 0; i < lower.length; i++) {
      c = left.filter(function (q) { return q.level === lower[i]; });
      if (c.length) return c;
    }
    return left.filter(function (q) { return q.level === maxLevel; });
  }
  function pick(n) {
    var c = candidatesFor(n);
    if (!c.length) return null;
    var seen = load('seen', []);
    var fresh = c.filter(function (q) { return seen.indexOf(q.id) < 0; });
    var pool = fresh.length ? fresh : c;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function markSeen(id) {
    var seen = load('seen', []);
    if (seen.indexOf(id) < 0) { seen.push(id); save('seen', seen); }
  }

  /* ---------- game flow ---------- */
  function startGame() {
    var seen = load('seen', []);
    if (questions.every(function (q) { return seen.indexOf(q.id) >= 0; })) save('seen', []);
    game = { asked: [], score: 0, rounds: [], round: null, current: null, ending: null };
    newRound(rules.firstRound, rules.firstPass);
    statsEl.hidden = false;
    nextQuestion();
  }

  function newRound(size, pass) {
    game.round = { n: game.rounds.length + 1, size: size, pass: pass, results: [] };
    game.rounds.push(game.round);
  }

  function nextQuestion() {
    var n = game.asked.length + 1;
    var q = pick(n);
    if (!q) { endGame('cleared'); return; }
    game.current = { q: q, n: n, options: shuffle([q.answer].concat(q.wrong)), picked: null };
    markSeen(q.id);
    renderPlay();
  }

  function choose(i) {
    var cur = game.current;
    if (phase !== 'question' || !cur || cur.picked !== null) return;
    cur.picked = cur.options[i];
    cur.correct = cur.picked === cur.q.answer;
    if (cur.correct) game.score++;
    var r = game.round;
    r.results.push(cur.correct);
    game.asked.push({ q: cur.q, picked: cur.picked, correct: cur.correct, round: r.n });

    var status;
    var roundDone = r.results.length >= r.size;
    if (roundDone && countRight(r.results) < r.pass) status = 'failed';
    else if (!candidatesFor(game.asked.length + 1).length) status = 'cleared';
    else status = roundDone ? 'unlocked' : 'continue';
    if (status === 'failed' || status === 'cleared') game.ending = status;
    renderReveal(status);
  }

  function next() {
    if (game.ending) { endGame(game.ending); return; }
    if (game.round.results.length >= game.round.size) newRound(rules.nextRound, rules.nextPass);
    nextQuestion();
  }

  function endGame(reason) {
    var prev = load('best', null);
    var isNew = prev === null ? game.score > 0 : game.score > prev;
    if (isNew) save('best', game.score);
    renderFinal(reason, prev, isNew);
  }

  /* ---------- pieces of UI ---------- */
  function squaresHtml(round, currentIndex) {
    var html = '';
    for (var i = 0; i < round.size; i++) {
      var cls = 'sq';
      if (i < round.results.length) cls += round.results[i] ? ' right' : ' wrong';
      else if (i === currentIndex) cls += ' current';
      html += '<li class="' + cls + '"></li>';
    }
    return html;
  }

  function roundHtml(round, currentIndex) {
    var right = countRight(round.results);
    var wrong = round.results.length - right;
    var label = 'Round progress: ' + plural(right, 'right', 'right') + ', ' + plural(wrong, 'wrong', 'wrong') +
      ', ' + (round.size - round.results.length) + ' to go';
    return '<div class="round">' +
      '<div class="round-head"><span class="round-name">Round ' + round.n + '</span>' +
      '<span class="round-need">Need ' + round.pass + ' of ' + round.size + '</span></div>' +
      '<ol class="squares" aria-label="' + esc(label) + '">' + squaresHtml(round, currentIndex) + '</ol>' +
      '</div>';
  }

  function levelHtml(level) {
    var bars = '';
    for (var i = 1; i <= maxLevel; i++) {
      bars += '<i class="' + (i <= level ? 'on' : '') + '" style="height:' + (5 + i * 3) + 'px"></i>';
    }
    return '<span class="level" aria-label="Difficulty level ' + level + ' of ' + maxLevel + '">' +
      '<span class="level-bars" aria-hidden="true">' + bars + '</span><span aria-hidden="true">Level ' + level + '</span></span>';
  }

  function updateStats() {
    statN.textContent = game.current ? game.current.n : game.asked.length;
    statScore.textContent = game.score;
  }

  function drawCurrent() {
    if (!game || !game.current) return;
    var canvas = document.getElementById('chart');
    if (!canvas) return;
    if (chart) { chart.destroy(); chart = null; }
    var cur = game.current;
    chart = CG.drawChart(canvas, cur.q, { revealed: function () { return cur.picked !== null; } });
  }

  /* ---------- screens ---------- */
  function renderStart() {
    phase = 'start';
    statsEl.hidden = true;
    if (chart) { chart.destroy(); chart = null; }
    var best = load('best', null);
    var lastBand = rules.bands[rules.bands.length - 1];
    var rulesText = 'You start with ' + plural(rules.firstRound, 'chart', 'charts') + '. Get ' + rules.firstPass +
      ' right to unlock ' + rules.nextRound + ' more, then keep getting at least ' + rules.nextPass + ' of ' +
      rules.nextRound + ' right to keep going.';
    if (maxLevel > 1 && lastBand) rulesText += ' After chart ' + lastBand.until + ', only the hardest charts are left.';
    var intro = deck.intro || 'Real data, with the title and units blacked out. Read the shape of the line and the numbers on the axes, then pick what the chart shows.';
    var notice = problems.length
      ? '<p class="notice">' + plural(problems.length, 'question in this deck has', 'questions in this deck have') +
        ' a problem and ' + (problems.length === 1 ? 'was' : 'were') + ' skipped. Your browser console lists the details.</p>'
      : '';
    screen.innerHTML =
      '<section class="start">' +
        '<div>' +
          '<h1 class="start-title">' + esc(deck.title || 'Chart Guesser') + '</h1>' +
          '<p class="lede">' + esc(intro) + '</p>' +
          '<p class="rules">' + esc(rulesText) + '</p>' +
          '<div class="start-actions"><button class="btn primary" id="start-btn">Start</button>' +
          (best !== null ? '<span class="best-line">Your best: <b>' + best + '</b></span>' : '') + '</div>' +
          notice +
        '</div>' +
        '<div class="teaser" aria-hidden="true">' + teaserSvg() + '</div>' +
      '</section>';
    document.getElementById('start-btn').addEventListener('click', startGame);
  }

  function renderPlay() {
    phase = 'question';
    var cur = game.current;
    screen.innerHTML =
      '<section class="play">' +
        '<figure class="chart-card" id="card">' +
          '<div class="chart-head">' +
            '<div class="chart-title"><span class="real" id="real-title"></span><span class="redact" aria-hidden="true"></span></div>' +
            '<div class="chart-unit"><span class="real" id="real-unit"></span><span class="redact" aria-hidden="true"></span></div>' +
          '</div>' +
          '<div class="chart-box"><canvas id="chart" role="img" aria-label="' + esc(CG.describeChart(cur.q)) + '"></canvas></div>' +
        '</figure>' +
        '<div class="side" id="side"></div>' +
      '</section>';
    drawCurrent();
    renderAnswers();
    updateStats();
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }

  function renderAnswers() {
    var cur = game.current;
    var side = document.getElementById('side');
    var buttons = cur.options.map(function (text, i) {
      return '<button class="answer" data-i="' + i + '"><span class="key" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="txt">' + esc(text) + '</span></button>';
    }).join('');
    side.innerHTML =
      roundHtml(game.round, game.round.results.length) +
      '<div class="meta-row"><h2 class="prompt">What does this chart show?</h2>' + levelHtml(cur.q.level) + '</div>' +
      '<div class="answers" role="group" aria-label="Answers">' + buttons + '</div>';
    side.querySelectorAll('.answer').forEach(function (b) {
      b.addEventListener('click', function () { choose(+b.getAttribute('data-i')); });
    });
  }

  function statusText(status) {
    var r = game.round;
    var right = countRight(r.results);
    var answered = r.results.length;
    var left = r.size - answered;
    if (status === 'failed') return 'Round over: <b>' + right + ' of ' + r.size + '</b>. You needed ' + r.pass + ' to keep going.';
    if (status === 'cleared') return 'That was the last chart in this deck.';
    if (status === 'unlocked') return 'Round done: <b>' + right + ' of ' + r.size + '</b>. ' + rules.nextRound + ' more charts unlocked.';
    if (right >= r.pass) return '<b>' + right + ' of ' + answered + '</b> right. Next round already unlocked, ' + left + ' to go in this one.';
    if (right + left < r.pass) return '<b>' + right + ' of ' + answered + '</b> right. ' + r.pass + ' of ' + r.size + ' is out of reach now, but every point still counts.';
    return '<b>' + right + ' of ' + answered + '</b> right. Need ' + r.pass + ' of ' + r.size + ' to unlock more charts.';
  }

  function renderReveal(status) {
    phase = 'reveal';
    var cur = game.current, q = cur.q;
    var card = document.getElementById('card');
    document.getElementById('real-title').textContent = q.title || q.answer;
    document.getElementById('real-unit').textContent = q.unit || '';
    card.classList.add('revealed');
    var canvas = document.getElementById('chart');
    canvas.setAttribute('aria-label', CG.describeChart(q, q.title || q.answer));

    var verdict = cur.correct
      ? '<div class="verdict right" id="verdict"><h2 class="verdict-word"><span class="mark" aria-hidden="true">✓</span>Correct</h2>' +
        '<p class="verdict-detail">It\u2019s <strong>' + esc(q.answer) + '</strong>.</p></div>'
      : '<div class="verdict wrong" id="verdict"><h2 class="verdict-word"><span class="mark" aria-hidden="true">✗</span>Not quite</h2>' +
        '<p class="verdict-detail">You picked <span class="picked">' + esc(cur.picked) + '</span>. It\u2019s <strong>' + esc(q.answer) + '</strong>.</p></div>';
    var ending = status === 'failed' || status === 'cleared';
    var side = document.getElementById('side');
    side.innerHTML =
      verdict +
      '<div class="info">' + CG.paragraphs(q.info) + '</div>' +
      (q.source || q.sourceUrl ? '<p class="source">' + CG.sourceHtml(q) + '</p>' : '') +
      roundHtml(game.round, -1) +
      '<p class="status">' + statusText(status) + '</p>' +
      '<div class="next-row"><button class="btn primary" id="next-btn">' + (ending ? 'See final score' : 'Next chart') + '</button></div>';
    updateStats();
    announce((cur.correct ? 'Correct. ' : 'Not quite. ') + 'It\u2019s ' + q.answer + '.');
    var btn = document.getElementById('next-btn');
    btn.addEventListener('click', next);
    try { btn.focus({ preventScroll: true }); } catch (e) { btn.focus(); }
  }

  function renderFinal(reason, prevBest, isNew) {
    phase = 'final';
    if (chart) { chart.destroy(); chart = null; }
    game.current = null;
    updateStats();
    var last = game.rounds[game.rounds.length - 1];
    var title = reason === 'cleared' ? 'You cleared the deck' : 'Game over';
    var why = reason === 'cleared'
      ? 'There are no charts left for you in this deck.'
      : 'Round ' + last.n + ': ' + countRight(last.results) + ' of ' + last.size + '. You needed ' + last.pass + ' to keep going.';
    var best = Math.max(game.score, prevBest || 0);
    var bestHtml = isNew && prevBest !== null
      ? '<span class="new-best">New personal best</span>, up from ' + prevBest + '.'
      : 'Personal best: <b>' + best + '</b>';
    var runRows = game.rounds.filter(function (r) { return r.results.length; }).map(function (r) {
      return '<div class="run-row"><span class="run-label">Round ' + r.n + '</span>' +
        '<ol class="squares" aria-label="Round ' + r.n + ': ' + countRight(r.results) + ' of ' + r.results.length + ' right">' +
        squaresHtml(r, -1) + '</ol><span class="run-score">' + countRight(r.results) + '/' + r.results.length + '</span></div>';
    }).join('');
    var recap = game.asked.map(function (a) {
      return '<li class="' + (a.correct ? 'right' : 'wrong') + '"><span class="mark" aria-hidden="true">' + (a.correct ? '✓' : '✗') + '</span>' +
        '<span class="visually-hidden">' + (a.correct ? 'Right: ' : 'Wrong: ') + '</span>' + esc(a.q.title || a.q.answer) +
        (a.correct ? '' : '<span class="you">You picked: ' + esc(a.picked) + '</span>') + '</li>';
    }).join('');
    screen.innerHTML =
      '<section class="final">' +
        '<h1 class="final-title">' + title + '</h1>' +
        '<p class="final-reason">' + esc(why) + '</p>' +
        '<p class="final-score"><span class="num">' + game.score + '</span>' + (game.score === 1 ? 'point' : 'points') +
        ' from ' + plural(game.asked.length, 'chart', 'charts') + '</p>' +
        '<p class="best-line">' + bestHtml + '</p>' +
        '<div class="run">' + runRows + '</div>' +
        '<div class="actions"><button class="btn primary" id="again-btn">Play again</button>' +
        '<button class="btn" id="copy-btn">Copy result</button></div>' +
        '<div id="copy-slot"></div>' +
        (recap ? '<h2 class="recap-title">Your charts</h2><ol class="recap">' + recap + '</ol>' : '') +
      '</section>';
    document.getElementById('again-btn').addEventListener('click', startGame);
    document.getElementById('copy-btn').addEventListener('click', copyResult);
    announce(title + '. ' + game.score + ' points.');
    window.scrollTo(0, 0);
    document.getElementById('again-btn').focus({ preventScroll: true });
  }

  function resultText() {
    var lines = [(deck.title || 'Chart Guesser') + ': ' + plural(game.score, 'point', 'points')];
    game.rounds.forEach(function (r) {
      if (!r.results.length) return;
      lines.push(r.results.map(function (ok) { return ok ? '🟩' : '🟥'; }).join('') + ' ' + countRight(r.results) + '/' + r.results.length);
    });
    lines.push(location.href.split('#')[0]);
    return lines.join('\n');
  }

  function copyResult() {
    var text = resultText();
    var btn = document.getElementById('copy-btn');
    function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy result'; }, 1800); }
    function fallback() {
      var slot = document.getElementById('copy-slot');
      slot.innerHTML = '<p>Copy this:</p><textarea class="copy-fallback" rows="5" readonly></textarea>';
      var ta = slot.querySelector('textarea');
      ta.value = text; ta.focus(); ta.select();
      try { if (document.execCommand('copy')) done(); } catch (e) { /* manual copy */ }
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function renderError(title, message) {
    phase = 'error';
    statsEl.hidden = true;
    screen.innerHTML = '<div class="error-box" role="alert"><h1>' + esc(title) + '</h1><p>' + esc(message) + '</p>' +
      '<p><a href="./">Open the main deck</a></p></div>';
  }

  function teaserSvg() {
    var pts = [4, 5, 5, 7, 6, 9, 12, 11, 15, 21, 19, 26, 31, 29, 36, 44, 41, 47, 55, 52, 58];
    var x0 = 44, x1 = 468, y0 = 270, y1 = 70;
    var path = pts.map(function (v, i) {
      var x = x0 + (x1 - x0) * i / (pts.length - 1);
      var y = y0 - (y0 - y1) * v / 60;
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    var gridY = [0, 20, 40, 60].map(function (v) {
      var y = y0 - (y0 - y1) * v / 60;
      return '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + y + '" y2="' + y + '" style="stroke:var(--grid)" />' +
        '<text x="' + (x0 - 10) + '" y="' + (y + 4) + '" text-anchor="end">' + v + '</text>';
    }).join('');
    var ticks = [['1900', x0 + 10], ['1950', (x0 + x1) / 2], ['2000', x1 - 14]].map(function (t) {
      return '<text x="' + t[1] + '" y="' + (y0 + 24) + '" text-anchor="middle">' + t[0] + '</text>';
    }).join('');
    return '<svg viewBox="0 0 480 300" role="presentation" style="font-family:var(--font);font-size:12px;fill:var(--ink-2)">' +
      '<rect x="0" y="0" width="290" height="20" rx="3" style="fill:var(--redact)" />' +
      '<rect x="0" y="32" width="96" height="12" rx="2" style="fill:var(--redact)" />' +
      gridY + ticks +
      '<path d="' + path + '" fill="none" style="stroke:var(--plot)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />' +
      '</svg>';
  }

  /* ---------- keyboard & theme ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (phase === 'question' && game && game.current) {
      var k = parseInt(e.key, 10);
      if (k >= 1 && k <= game.current.options.length) { e.preventDefault(); choose(k - 1); }
    }
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var redraw = function () { if (phase === 'question' || phase === 'reveal') drawCurrent(); };
    if (mq.addEventListener) mq.addEventListener('change', redraw);
  }

  /* ---------- boot ---------- */
  var brand = document.getElementById('brand');
  if (deckName !== 'main') brand.href = '?deck=' + encodeURIComponent(deckName);

  loadDeck(deckName).then(function (d) {
    deck = d;
    var prepared = prepare(d);
    questions = prepared.ok;
    problems = prepared.issues;
    if (!questions.length) {
      renderError('This deck has no playable questions', problems.length
        ? 'Every question has a problem. Your browser console lists them; the question builder can help you fix them.'
        : 'Add some questions to decks/' + deckName + '.js.');
      return;
    }
    rules = mergeRules(d.rules);
    maxLevel = Math.max.apply(null, questions.map(function (q) { return q.level; }));
    document.title = d.title || 'Chart Guesser';
    brand.textContent = d.title || 'Chart Guesser';
    renderStart();
  }).catch(function (err) {
    renderError('Could not load the deck', err.message);
  });

  /* exposed for testing */
  window.__cg = {
    state: function () { return { game: game, phase: phase, rules: rules, maxLevel: maxLevel, questions: questions }; },
    choose: function (i) { choose(i); },
    next: function () { next(); },
    start: function () { startGame(); }
  };
})();
