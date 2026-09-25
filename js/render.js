/* Chart Guesser: shared chart drawing and question checks.
   Used by both the game (index.html) and the question builder (builder.html). */
(function () {
  'use strict';
  var CG = (window.CG = window.CG || {});

  var DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;
  var TYPES = ['line', 'bar', 'scatter'];

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  var compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  var plain = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
  var dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  var monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

  /* "2020-04-20" -> 2020.30 (position within the year), "2020-04" -> mid-month */
  function dateToYear(s) {
    var m = DATE_RE.exec(s);
    if (!m) return NaN;
    var y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 15;
    var start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
    return y + (Date.UTC(y, mo - 1, d) - start) / (end - start);
  }

  function prettyDate(s) {
    var m = DATE_RE.exec(s);
    if (!m) return String(s);
    var dt = new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1));
    return m[3] ? dayFmt.format(dt) : monthFmt.format(dt);
  }

  /* What kind of x values: plain numbers, ISO dates, or text labels */
  function xKind(x) {
    if (x.every(isNum)) return 'number';
    if (x.every(function (v) { return typeof v === 'string' && DATE_RE.test(v); })) return 'date';
    return 'label';
  }
  CG.xKind = xKind;

  function maxAbs(values) {
    var m = 0;
    values.forEach(function (v) { if (isNum(v) && Math.abs(v) > m) m = Math.abs(v); });
    return m;
  }

  /* Axis tick labels: numbers only, never units. 1,234 below 10k; 12K / 3.4M / 5B above. */
  CG.formatTick = function (v, big) {
    if (!isNum(v)) return '';
    return big >= 1e4 ? compact.format(v) : plain.format(v);
  };
  /* Tooltip values: full precision */
  CG.formatValue = function (v) {
    if (!isNum(v)) return 'no data';
    if (Math.abs(v) >= 1e9) return compact.format(v);
    return plain.format(v);
  };

  function isPow10(v) {
    if (!(v > 0)) return false;
    var l = Math.log10(v);
    return Math.abs(l - Math.round(l)) < 1e-9;
  }

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* Draw a question's chart on a canvas.
     opts.revealed: function returning true once the answer is shown (adds the unit to tooltips). */
  CG.drawChart = function (canvas, q, opts) {
    opts = opts || {};
    var revealed = opts.revealed || function () { return false; };
    var type = q.type || 'line';
    var kind = xKind(q.x);
    var ink = cssVar('--ink', '#14213D');
    var ink2 = cssVar('--ink-2', '#4A5775');
    var grid = cssVar('--grid', '#E3E8EF');
    var gridSoft = cssVar('--grid-soft', '#F0F3F7');
    var rule = cssVar('--rule', '#CBD3DF');
    var plot = cssVar('--plot', '#2B59C3');
    var paper = cssVar('--panel', '#FFFFFF');
    var font = cssVar('--font', 'system-ui, sans-serif');
    var big = maxAbs(q.y);
    var n = q.x.length;
    var logY = q.yScale === 'log';
    var numericX = type !== 'bar' && kind !== 'label';
    var xAllInt = kind === 'number' && q.x.every(function (v) { return Number.isInteger(v); });

    var labels, data;
    if (numericX) {
      data = q.x.map(function (xv, i) {
        return { x: kind === 'date' ? dateToYear(xv) : xv, y: q.y[i] };
      });
    } else {
      labels = q.x.map(function (xv) { return kind === 'date' ? prettyDate(xv) : String(xv); });
      data = q.y.slice();
    }

    var showPoints = q.points !== undefined ? !!q.points : (type === 'scatter' || n <= 40);
    var dataset = {
      data: data,
      label: '',
      borderColor: plot,
      backgroundColor: plot,
      borderWidth: type === 'bar' ? 0 : 2,
      pointRadius: showPoints ? (type === 'scatter' ? 3 : 2.5) : 0,
      pointHoverRadius: 5,
      pointBackgroundColor: plot,
      pointBorderWidth: 0,
      spanGaps: false,
      tension: 0,
      borderRadius: type === 'bar' ? 2 : 0,
      barPercentage: 0.86,
      categoryPercentage: 0.92
    };

    var xScale;
    if (numericX) {
      xScale = {
        type: 'linear',
        bounds: 'data',
        min: isNum(q.xMin) ? q.xMin : undefined,
        max: isNum(q.xMax) ? q.xMax : undefined,
        grid: { display: false },
        border: { color: rule },
        ticks: {
          color: ink2,
          font: { family: font, size: 12 },
          maxRotation: 0,
          includeBounds: false,
          callback: function (v) {
            if (kind === 'date' || xAllInt) {
              if (!Number.isInteger(v)) return '';
              return Math.abs(v) < 1e4 ? String(v) : compact.format(v);
            }
            return CG.formatTick(v, maxAbs(q.x));
          }
        }
      };
    } else {
      xScale = {
        type: 'category',
        grid: { display: false },
        border: { color: rule },
        ticks: { color: ink2, font: { family: font, size: 12 }, maxRotation: 0, autoSkipPadding: 10 }
      };
    }

    var yScale = {
      type: logY ? 'logarithmic' : 'linear',
      min: isNum(q.yMin) ? q.yMin : undefined,
      max: isNum(q.yMax) ? q.yMax : undefined,
      beginAtZero: type === 'bar' && !logY,
      border: { display: false },
      grid: {
        color: function (ctx) {
          if (!logY) return grid;
          return ctx.tick && isPow10(ctx.tick.value) ? grid : gridSoft;
        },
        drawTicks: false
      },
      ticks: {
        color: ink2,
        font: { family: font, size: 12 },
        padding: 8,
        callback: function (v) {
          if (logY) return isPow10(v) ? compact.format(v) : '';
          return CG.formatTick(v, big);
        }
      }
    };

    var config = {
      type: type,
      data: { labels: labels, datasets: [dataset] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        normalized: true,
        layout: { padding: { top: 6, right: 8, bottom: 0, left: 0 } },
        interaction: type === 'scatter'
          ? { mode: 'nearest', intersect: true }
          : { mode: 'nearest', axis: 'x', intersect: false },
        scales: { x: xScale, y: yScale },
        plugins: {
          legend: { display: false },
          title: { display: false },
          tooltip: {
            displayColors: false,
            backgroundColor: ink,
            titleColor: paper,
            bodyColor: paper,
            titleFont: { family: font, size: 12, weight: '600' },
            bodyFont: { family: font, size: 13 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: function (items) {
                if (!items.length) return '';
                var i = items[0].dataIndex;
                var xv = q.x[i];
                return kind === 'date' ? prettyDate(xv) : String(xv);
              },
              label: function (item) {
                var v = numericX ? item.raw.y : item.raw;
                var s = CG.formatValue(v);
                return revealed() && q.unit && isNum(v) ? s + ' ' + q.unit : s;
              }
            }
          }
        }
      }
    };
    return new window.Chart(canvas, config);
  };

  /* Short description for screen readers */
  CG.describeChart = function (q, revealedTitle) {
    var type = q.type || 'line';
    var kind = xKind(q.x);
    var nums = q.y.filter(isNum);
    var lo = Math.min.apply(null, nums), hi = Math.max.apply(null, nums);
    var first = kind === 'date' ? prettyDate(q.x[0]) : q.x[0];
    var last = kind === 'date' ? prettyDate(q.x[q.x.length - 1]) : q.x[q.x.length - 1];
    var what = { line: 'Line chart', bar: 'Bar chart', scatter: 'Dot chart' }[type] || 'Chart';
    var head = revealedTitle ? what + ': ' + revealedTitle + '. ' : what + ' with its title hidden. ';
    return head + 'X axis from ' + first + ' to ' + last + '. Values from ' +
      CG.formatValue(lo) + ' to ' + CG.formatValue(hi) + (q.yScale === 'log' ? ', on a log scale.' : '.');
  };

  /* Check one question. Errors mean the game skips it; warnings are just advice. */
  CG.checkQuestion = function (q) {
    var errors = [], warnings = [];
    if (!q || typeof q !== 'object') return { errors: ['This entry is not a question object'], warnings: warnings };
    if (typeof q.id !== 'string' || !q.id.trim()) errors.push('Missing "id"');
    if (typeof q.answer !== 'string' || !q.answer.trim()) errors.push('Missing "answer"');
    if (!Array.isArray(q.wrong) || !q.wrong.length) {
      errors.push('"wrong" needs a list of wrong answers');
    } else {
      if (q.wrong.some(function (w) { return typeof w !== 'string' || !w.trim(); })) {
        errors.push('"wrong" contains an empty answer');
      } else if (q.wrong.length !== 7) {
        warnings.push('"wrong" has ' + q.wrong.length + ' answers; 7 gives the usual 8 options');
      }
      if (typeof q.answer === 'string') {
        var all = [q.answer].concat(q.wrong).map(function (s) { return String(s).trim().toLowerCase(); });
        if (new Set(all).size !== all.length) errors.push('Two answer options are identical');
      }
    }
    if (!Number.isInteger(q.level) || q.level < 1) errors.push('"level" must be a whole number, 1 or more');
    var type = q.type || 'line';
    if (TYPES.indexOf(type) < 0) errors.push('"type" must be "line", "bar" or "scatter"');
    if (!Array.isArray(q.x) || !Array.isArray(q.y)) {
      errors.push('"x" and "y" must both be lists of values');
    } else {
      if (q.x.length !== q.y.length) errors.push('"x" has ' + q.x.length + ' values but "y" has ' + q.y.length);
      if (q.x.length < 2) errors.push('Needs at least 2 data points');
      var bad = -1;
      q.y.some(function (v, i) { if (!(v === null || isNum(v))) { bad = i; return true; } return false; });
      if (bad >= 0) errors.push('"y" value #' + (bad + 1) + ' is not a number (use null for a gap)');
      if (!q.y.some(isNum)) errors.push('"y" has no numbers');
      if (q.yScale === 'log' && q.y.some(function (v) { return isNum(v) && v <= 0; })) {
        errors.push('A log scale needs every "y" value above 0');
      }
      var kind = xKind(q.x);
      if (type === 'scatter' && kind === 'label') errors.push('Dot (scatter) charts need numbers or dates on the x axis');
      if (kind === 'label' && q.x.some(function (v) { return v === null || v === undefined || v === ''; })) {
        errors.push('"x" has an empty value');
      }
    }
    if (q.sourceUrl && !/^https?:\/\//i.test(q.sourceUrl)) errors.push('"sourceUrl" must start with http:// or https://');
    if (!q.info) warnings.push('No "info" text for the answer page');
    if (!q.unit) warnings.push('No "unit" to reveal after answering');
    return { errors: errors, warnings: warnings };
  };

  /* Minimal HTML escaping for text from decks */
  CG.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* Info text: blank lines separate paragraphs */
  CG.paragraphs = function (text) {
    return String(text || '').split(/\n\s*\n/).map(function (p) { return p.trim(); })
      .filter(Boolean).map(function (p) { return '<p>' + CG.esc(p) + '</p>'; }).join('');
  };

  CG.sourceHtml = function (q) {
    if (!q.source && !q.sourceUrl) return '';
    var name = CG.esc(q.source || q.sourceUrl);
    if (q.sourceUrl && /^https?:\/\//i.test(q.sourceUrl)) {
      name = '<a href="' + CG.esc(q.sourceUrl) + '" target="_blank" rel="noopener">' + name + '</a>';
    }
    return 'Source: ' + name;
  };
})();
