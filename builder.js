/* Chart Guesser: question builder.
   Turns pasted spreadsheet data plus a few text fields into a question you can paste into a deck file.
   Everything happens in the browser; nothing is uploaded. */
(function () {
  'use strict';
  var CG = window.CG;
  var esc = CG.esc;
  var STORE = 'chartGuesser:builder';
  var DATE_RE = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/;

  function $(id) { return document.getElementById(id); }
  var form = $('bform');
  var card = $('card');
  var canvas = $('chart');
  var chartEmpty = $('chart-empty');
  var chart = null;
  var mode = 'player';
  var idTouched = false;
  var lastQuestion = null;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  var EXAMPLE = {
    data: 'Month\tDays\nJan\t31\nFeb\t28\nMar\t31\nApr\t30\nMay\t31\nJun\t30\nJul\t31\nAug\t31\nSep\t30\nOct\t31\nNov\t30\nDec\t31',
    type: 'bar', decimal: 'auto', points: 'auto', log: false, zero: false, level: '1',
    answer: 'Number of days in each month',
    w1: 'Hours of daylight in London, by month',
    w2: 'Rainy days per month in Manchester',
    w3: 'Average daily high temperature in Rome, by month',
    w4: 'Public holidays per month in Spain',
    w5: 'Full moons per month',
    w6: 'Births per month in the UK, in thousands',
    w7: 'School days per month in England',
    title: 'Days in each month, in a year that is not a leap year',
    unit: 'days',
    info: 'Thirty days has September, April, June and November. February has 28, or 29 in a leap year.\n\n' +
      'Our month lengths come from the Julian calendar, which Julius Caesar introduced in 45 BC.',
    source: 'The Gregorian calendar',
    sourceUrl: '',
    id: 'days-in-month',
    _idTouched: false
  };

  /* ---------- reading pasted data ---------- */
  function cleanNumber(raw) {
    return String(raw).replace(/[\s\u00a0\u202f'\u2019%$€£¥]/g, '').replace(/\u2212/g, '-');
  }

  /* Decide whether "12,5" style or "12.5" style decimals are used */
  function detectDecimal(values) {
    var comma = 0, dot = 0;
    values.forEach(function (raw) {
      var s = cleanNumber(raw);
      var c = s.indexOf(','), d = s.indexOf('.');
      if (c >= 0 && d >= 0) { if (s.lastIndexOf(',') > s.lastIndexOf('.')) comma++; else dot++; }
      else if (c >= 0 && !/^-?\d{1,3}(,\d{3})+$/.test(s)) comma++;
      else if (d >= 0 && !/^-?\d{1,3}(\.\d{3})+$/.test(s)) dot++;
    });
    return comma > dot ? ',' : '.';
  }

  /* null for an empty cell, NaN for text that is not a number */
  function parseNum(raw, dec) {
    var s = cleanNumber(raw);
    if (s === '') return null;
    if (dec === ',') s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return parseFloat(s);
  }

  function splitRows(text, decSetting) {
    var lines = String(text || '').replace(/\r/g, '').split('\n')
      .map(function (l) { return l.replace(/\s+$/, ''); })
      .filter(function (l) { return l.trim() !== ''; });
    var delim;
    if (lines.some(function (l) { return l.indexOf('\t') >= 0; })) delim = '\t';
    else if (lines.some(function (l) { return l.indexOf(';') >= 0; })) delim = ';';
    else if (decSetting !== ',' && lines.some(function (l) { return l.indexOf(',') >= 0; })) delim = ',';
    else delim = null;
    return lines.map(function (l) {
      var cells = delim ? l.split(delim) : l.trim().split(/\s+/);
      return cells.map(function (c) { return c.trim().replace(/^"(.*)"$/, '$1'); });
    });
  }

  function normaliseDate(s) {
    var m = DATE_RE.exec(s);
    if (!m) return null;
    var mo = +m[2], d = m[3] ? +m[3] : null;
    if (mo < 1 || mo > 12 || (d !== null && (d < 1 || d > 31))) return null;
    return m[1] + '-' + (mo < 10 ? '0' : '') + mo + (d !== null ? '-' + (d < 10 ? '0' : '') + d : '');
  }

  function parseData(text, decSetting) {
    var out = { ok: false, x: [], y: [], errors: [], warnings: [], kind: null, dec: '.' };
    var rows = splitRows(text, decSetting);
    if (!rows.length) { out.errors.push('Paste your data to see the chart.'); return out; }

    var first = rows[0];
    if (first.length > 1 && first[1] !== '' && isNaN(parseNum(first[1], '.')) && isNaN(parseNum(first[1], ','))) {
      rows.shift();
      out.header = first;
    }
    if (!rows.length) { out.errors.push('Only a header row was found. Paste the data rows too.'); return out; }
    if (rows.every(function (r) { return r.length < 2; })) {
      out.errors.push('Only one column was found. Paste two columns: the x values and the numbers.');
      return out;
    }
    if (rows.some(function (r) { return r.length > 2 && r.slice(2).some(function (c) { return c !== ''; }); })) {
      out.warnings.push('Only the first two columns are used.');
    }

    var skipped = 0;
    rows = rows.filter(function (r) { if (r[0] === '') { skipped++; return false; } return true; });
    if (skipped) out.warnings.push(skipped + (skipped === 1 ? ' row has' : ' rows have') + ' no x value and ' + (skipped === 1 ? 'was' : 'were') + ' left out.');

    var rawY = rows.map(function (r) { return r[1] === undefined ? '' : r[1]; });
    var dec = decSetting === 'auto' ? detectDecimal(rawY) : decSetting;
    out.dec = dec;

    var y = [];
    for (var i = 0; i < rawY.length; i++) {
      var v = parseNum(rawY[i], dec);
      if (v !== null && isNaN(v)) {
        out.errors.push('Row ' + (i + 1 + (out.header ? 1 : 0)) + ': "' + rawY[i] + '" is not a number.');
        if (out.errors.length >= 4) break;
      }
      y.push(v === null || isNaN(v) ? null : v);
    }
    if (out.errors.length) return out;

    var rawX = rows.map(function (r) { return r[0]; });
    var xNums = rawX.map(function (s) { return parseNum(s, dec); });
    var x;
    if (xNums.every(isNum)) {
      x = xNums; out.kind = 'number';
    } else {
      var dates = rawX.map(normaliseDate);
      if (dates.every(Boolean)) { x = dates; out.kind = 'date'; }
      else {
        x = rawX; out.kind = 'label';
        if (rawX.some(function (s) { return /\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(s); })) {
          out.warnings.push('Dates like 20/04/2020 are treated as text labels. Write them as 2020-04-20 (or 2020-04 for months) so the axis spaces them by time.');
        }
      }
    }

    if (out.kind !== 'label') {
      var key = function (v) { return out.kind === 'date' ? v : v; };
      var sortedAlready = true;
      for (var j = 1; j < x.length; j++) { if (key(x[j]) < key(x[j - 1])) { sortedAlready = false; break; } }
      if (!sortedAlready) {
        var idx = x.map(function (_, k) { return k; }).sort(function (a, b) {
          return key(x[a]) < key(x[b]) ? -1 : key(x[a]) > key(x[b]) ? 1 : a - b;
        });
        x = idx.map(function (k) { return x[k]; });
        y = idx.map(function (k) { return y[k]; });
        out.warnings.push('The rows were sorted from lowest to highest x.');
      }
    }
    if (x.length > 4000) out.warnings.push('That is a lot of points. Charts stay smooth up to a few thousand; consider monthly or weekly values.');

    out.x = x; out.y = y; out.ok = true;
    return out;
  }

  /* ---------- form state ---------- */
  function getState() {
    var s = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      s[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    s._idTouched = idTouched;
    return s;
  }
  function setState(s) {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || !(el.name in s)) return;
      if (el.type === 'checkbox') el.checked = !!s[el.name];
      else el.value = s[el.name];
    });
    idTouched = !!s._idTouched;
  }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(getState())); } catch (e) { /* ignore */ } }
  function restore() {
    try { var s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s) setState(s); } catch (e) { /* ignore */ }
  }

  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  }

  function buildQuestion(parsed) {
    var s = getState();
    var q = {
      id: (s.id || '').trim() || slug(s.answer) || 'my-question',
      level: parseInt(s.level, 10) || 1,
      type: s.type || 'line'
    };
    if (s.log) q.yScale = 'log';
    if (s.zero && !s.log) q.yMin = 0;
    if (s.points === 'yes') q.points = true;
    if (s.points === 'no') q.points = false;
    q.answer = (s.answer || '').trim();
    q.wrong = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7']
      .map(function (k) { return (s[k] || '').trim(); })
      .filter(Boolean);
    ['unit', 'title', 'info', 'source', 'sourceUrl'].forEach(function (k) {
      var v = (s[k] || '').replace(/\r/g, '').trim();
      if (v) q[k] = v;
    });
    q.x = parsed.x;
    q.y = parsed.y;
    return q;
  }

  /* ---------- output ---------- */
  function toCode(q) {
    var s = JSON.stringify;
    var L = ['    {'];
    L.push('      id: ' + s(q.id) + ',');
    L.push('      level: ' + q.level + ',');
    L.push('      type: ' + s(q.type) + ',');
    if (q.yScale) L.push('      yScale: ' + s(q.yScale) + ',');
    if (q.yMin !== undefined) L.push('      yMin: ' + q.yMin + ',');
    if (q.points !== undefined) L.push('      points: ' + q.points + ',');
    L.push('      answer: ' + s(q.answer) + ',');
    L.push('      wrong: [');
    q.wrong.forEach(function (w, i) { L.push('        ' + s(w) + (i < q.wrong.length - 1 ? ',' : '')); });
    L.push('      ],');
    ['unit', 'title', 'info', 'source', 'sourceUrl'].forEach(function (k) {
      if (q[k]) L.push('      ' + k + ': ' + s(q[k]) + ',');
    });
    L.push('      x: ' + JSON.stringify(q.x) + ',');
    L.push('      y: ' + JSON.stringify(q.y));
    L.push('    }');
    return L.join('\n');
  }

  function range(values) {
    var nums = values.filter(isNum);
    return [Math.min.apply(null, nums), Math.max.apply(null, nums)];
  }

  function renderSummary(parsed) {
    var el = $('data-summary');
    if (!parsed.ok) { el.textContent = ''; return; }
    var n = parsed.x.length;
    var xr;
    if (parsed.kind === 'number') { var r = range(parsed.x); xr = 'x from ' + CG.formatValue(r[0]) + ' to ' + CG.formatValue(r[1]); }
    else if (parsed.kind === 'date') xr = 'dates from ' + parsed.x[0] + ' to ' + parsed.x[n - 1];
    else xr = 'labels ' + parsed.x.slice(0, 3).join(', ') + (n > 3 ? ', …' : '');
    var yr = range(parsed.y);
    var gaps = parsed.y.filter(function (v) { return v === null; }).length;
    el.textContent = n + ' rows read: ' + xr + ', values from ' + CG.formatValue(yr[0]) + ' to ' + CG.formatValue(yr[1]) +
      (gaps ? ', ' + gaps + (gaps === 1 ? ' gap' : ' gaps') : '') + '. First values: ' +
      parsed.y.slice(0, 3).map(function (v) { return v === null ? 'gap' : CG.formatValue(v); }).join(', ') + '.';
  }

  function renderChecks(parsed, check) {
    var items = [];
    parsed.errors.forEach(function (e) { items.push(['err', e]); });
    check.errors.forEach(function (e) { items.push(['err', e]); });
    parsed.warnings.forEach(function (w) { items.push(['warn', w]); });
    check.warnings.forEach(function (w) { items.push(['warn', w]); });
    var errors = parsed.errors.length + check.errors.length;
    if (!errors) items.unshift(['ok', 'Ready to paste into a deck.']);
    $('checklist').innerHTML = items.map(function (it) {
      var label = { err: 'Problem: ', warn: 'Note: ', ok: '' }[it[0]];
      return '<li class="' + it[0] + '"><span class="visually-hidden">' + label + '</span>' + esc(it[1]) + '</li>';
    }).join('');
    $('code-status').textContent = errors
      ? 'Fix the problems listed under Checks first. The game skips questions that have problems.'
      : '';
  }

  /* Stable pseudo-shuffle so the preview doesn't reshuffle on every keystroke */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function renderPreview(parsed, q) {
    if (chart) { chart.destroy(); chart = null; }
    $('real-title').textContent = q.title || q.answer || 'Your chart title';
    $('real-unit').textContent = q.unit || 'Your unit';
    card.classList.toggle('revealed', mode === 'after');
    var drawable = parsed.ok && q.x.length >= 2 && q.y.some(isNum) &&
      !(q.yScale === 'log' && q.y.some(function (v) { return isNum(v) && v <= 0; })) &&
      !(q.type === 'scatter' && parsed.kind === 'label');
    chartEmpty.hidden = drawable;
    canvas.hidden = !drawable;
    if (drawable) {
      try {
        chart = CG.drawChart(canvas, q, { revealed: function () { return mode === 'after'; } });
      } catch (e) {
        chartEmpty.hidden = false; canvas.hidden = true;
        chartEmpty.textContent = 'This data could not be drawn: ' + e.message;
      }
    } else {
      chartEmpty.textContent = parsed.ok
        ? 'Fix the problems under Checks to see the chart.'
        : 'Your chart appears here once you paste data.';
    }

    var extra = $('preview-extra');
    if (mode === 'after') {
      var opts = '<ul class="option-list">' +
        '<li class="right"><span class="mark" aria-hidden="true">✓</span>' + esc(q.answer || 'Correct answer') + '</li>' +
        q.wrong.map(function (w) { return '<li><span class="mark" aria-hidden="true">✗</span>' + esc(w) + '</li>'; }).join('') +
        '</ul>';
      extra.innerHTML =
        '<div class="info">' + (q.info ? CG.paragraphs(q.info) : '<p class="hint">Your explanation appears here.</p>') + '</div>' +
        (q.source || q.sourceUrl ? '<p class="source">' + CG.sourceHtml(q) + '</p>' : '') + opts;
    } else {
      var options = [q.answer].concat(q.wrong).filter(Boolean);
      options.sort(function (a, b) { return hash(a) - hash(b); });
      extra.innerHTML =
        '<div class="meta-row"><h2 class="prompt">What does this chart show?</h2>' +
        '<span class="level">Level ' + q.level + '</span></div>' +
        (options.length
          ? '<div class="answers preview-answers">' + options.map(function (t, i) {
              return '<div class="answer"><span class="key" aria-hidden="true">' + (i + 1) + '</span><span class="txt">' + esc(t) + '</span></div>';
            }).join('') + '</div>'
          : '<p class="hint">Your answers appear here, shuffled.</p>');
    }
  }

  function update() {
    if (!idTouched) form.elements.id.value = slug(form.elements.answer.value);
    var s = getState();
    var parsed = parseData(s.data, s.decimal);
    var q = buildQuestion(parsed);
    var check = parsed.ok ? CG.checkQuestion(q) : { errors: [], warnings: [] };
    lastQuestion = q;
    renderSummary(parsed);
    renderChecks(parsed, check);
    renderPreview(parsed, q);
    $('code').value = parsed.ok ? toCode(q) : '';
    persist();
  }

  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 180); }

  /* ---------- events ---------- */
  form.addEventListener('input', function (e) {
    if (e.target.name === 'id') idTouched = e.target.value.trim() !== '';
    schedule();
  });
  form.addEventListener('change', schedule);
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.getAttribute('data-mode');
      document.querySelectorAll('.seg button').forEach(function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      update();
    });
  });

  $('example-btn').addEventListener('click', function () { setState(EXAMPLE); update(); });
  $('clear-btn').addEventListener('click', function () {
    if (!window.confirm('Clear every field in the form?')) return;
    form.reset();
    idTouched = false;
    update();
  });

  $('copy-btn').addEventListener('click', function () {
    var ta = $('code');
    var msg = $('copy-msg');
    if (!ta.value) { msg.textContent = 'Nothing to copy yet.'; return; }
    function done() { msg.textContent = 'Copied. Paste it into your deck file.'; setTimeout(function () { msg.textContent = ''; }, 4000); }
    function fallback() {
      ta.focus(); ta.select();
      try { if (document.execCommand('copy')) { done(); return; } } catch (e) { /* manual copy */ }
      msg.textContent = 'Select the code and copy it with Ctrl+C or Cmd+C.';
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(ta.value).then(done, fallback);
    else fallback();
  });

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', update);
  }

  restore();
  update();

  /* exposed for testing */
  window.__builder = { parseData: parseData, toCode: toCode, current: function () { return lastQuestion; }, update: update };
})();
