/* ==========================================================================
   Understanding NMR Spectroscopy · 阅读器应用
   1. 学习进度：自动记录 / 恢复 / 可视化
   2. 书签 + 划词高亮与笔记（SQLite 落库，无服务时回退 localStorage）
   3. 索引：书后索引（A–Z 术语 → 原书页码 → 正文定位）、标题索引、倒排全文检索
   ========================================================================== */
(function () {
  'use strict';

  var B = window.NMR_BOOK;
  var LS_STATE = 'nmr.reader.state.v2';
  var LS_UI = 'nmr.reader.ui.v2';
  var LS_LAST = 'nmr.reader.last';
  /* 原书印刷页码 + 15 = data.js 的 page 字段（取 76 条索引条目抽验，72 命中） */
  var PRINT_OFFSET = 15;
  var COLORS = ['yellow', 'green', 'blue', 'pink'];
  var COLOR_NAME = { yellow: '黄', green: '绿', blue: '蓝', pink: '粉' };

  /* --------------------------------------------------------------- utils */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function strip(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, ''); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nowISO() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function fmtDate(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '/' + m[2] + '/' + m[3] : '';
  }
  function truncate(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  /* data.js 的 page 是 0 基 PDF 页序；原书印刷页码 = page - PRINT_OFFSET。
     统一对外只讲「原书页码」，PDF 页序仅用于「原页对照」链接。 */
  function pageLabel(dataPage) {
    if (dataPage == null) return { txt: '—', printed: null };
    var printed = dataPage - PRINT_OFFSET;
    return printed >= 1
      ? { txt: 'p.' + printed, printed: printed }
      : { txt: '前言', printed: null };
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }
  function svg(path, size) {
    return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  }
  var ICON = {
    bookmark: svg('<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>'),
    note: svg('<path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h5"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>'),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    left: svg('<path d="M15 5l-7 7 7 7"/>'),
    right: svg('<path d="M9 5l7 7-7 7"/>'),
    ext: svg('<path d="M14 4h6v6"/><path d="M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', 13),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>', 14),
    check: svg('<path d="M20 6L9 17l-5-5"/>', 14),
    trash: svg('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>', 14),
    edit: svg('<path d="M4 20h4L20 8l-4-4L4 16z"/>', 14),
    download: svg('<path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M5 20h14"/>', 14),
    reset: svg('<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/>', 14),
    highlight: svg('<path d="M12 3l3 6h-6z"/><path d="M5 21h14"/>', 14),
    cancel: svg('<path d="M6 6l12 12M18 6L6 18"/>', 13),
    compare: svg('<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/>', 15),
    zen: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>', 15),
    font: svg('<path d="M4 19l5-14h2l5 14"/><path d="M6.5 13h7"/><path d="M17 19h4"/>', 15),
    back: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-3"/>', 14),
    quote: svg('<path d="M7 7h4v6H7a3 3 0 0 1 0-6z"/><path d="M15 7h4v6h-4a3 3 0 0 1 0-6z"/><path d="M6 17h12"/>', 14),
    pin: svg('<path d="M9 3h6l-1 6 3 3H7l3-3z"/><path d="M12 12v8"/>', 14),
    cards: svg('<rect x="3" y="5" width="12" height="14" rx="1.5"/><path d="M17 7h4v12h-4"/>', 14),
    cmd: svg('<path d="M8 6h8v12H8z"/><path d="M8 9h8M8 15h8"/>', 14)
  };

  /* ------------------------------------------------------------- storage */
  var state = { progress: {}, bookmarks: [], notes: [], meta: {} };

  function normalize(s) {
    var out = { progress: {}, bookmarks: [], notes: [], meta: {} };
    if (!s || typeof s !== 'object') return out;
    var p = s.progress || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (!v || typeof v !== 'object') return;
      out.progress[k] = {
        pct: clamp(Number(v.pct) || 0, 0, 1),
        block: Math.max(0, Number(v.block) || 0),
        ratio: clamp(Number(v.ratio) || 0, 0, 1),
        updated: v.updated || null
      };
    });
    (s.bookmarks || []).forEach(function (b) {
      if (!b || b.id == null) return;
      out.bookmarks.push({
        id: String(b.id),
        chapter: Number(b.chapter) || 0,
        block: Math.max(0, Number(b.block) || 0),
        page: Number(b.page) || 0,
        label: String(b.label || ''),
        ratio: clamp(Number(b.ratio) || 0, 0, 1),
        created: b.created || nowISO()
      });
    });
    (s.notes || []).forEach(function (n) {
      if (!n || n.id == null) return;
      out.notes.push({
        id: String(n.id),
        chapter: Number(n.chapter) || 0,
        block: Math.max(0, Number(n.block) || 0),
        page: Number(n.page) || 0,
        start: Math.max(0, Number(n.start) || 0),
        end: Math.max(0, Number(n.end) || 0),
        quote: String(n.quote || ''),
        body: String(n.body || ''),
        color: COLORS.indexOf(n.color) >= 0 ? n.color : 'yellow',
        created: n.created || nowISO(),
        updated: n.updated || nowISO()
      });
    });
    out.meta = (s.meta && typeof s.meta === 'object') ? s.meta : {};
    return out;
  }

  function countOf(s) {
    return Object.keys(s.progress || {}).length + (s.bookmarks || []).length + (s.notes || []).length;
  }

  var Store = {
    mode: 'local',
    file: '',
    _pushLater: null,
    init: function (done) {
      var self = this;
      var cached = null;
      try { cached = normalize(JSON.parse(localStorage.getItem(LS_STATE) || 'null')); } catch (e) { }
      var finish = function () {
        self._pushLater = debounce(function () { self.push(); }, 700);
        done();
      };
      if (!window.fetch) { state = cached || normalize(null); return finish(); }

      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 3000);
      fetch('api/state', { headers: { 'Accept': 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (remote) {
          clearTimeout(timer);
          self.mode = 'sqlite';
          self.file = remote.storage || 'nmr-reader.db';
          var rn = normalize(remote);
          if (countOf(rn) === 0 && cached && countOf(cached) > 0) {
            state = cached;              /* 首次启用数据库：把浏览器里的旧数据迁移进去 */
            self.push();
          } else {
            state = rn;
          }
          finish();
        })
        .catch(function () {
          clearTimeout(timer);
          self.mode = 'local';
          state = cached || normalize(null);
          finish();
        });
    },
    save: function () {
      try { localStorage.setItem(LS_STATE, JSON.stringify(state)); } catch (e) { }
      if (this.mode === 'sqlite' && this._pushLater) this._pushLater();
    },
    flush: function () {
      try { localStorage.setItem(LS_STATE, JSON.stringify(state)); } catch (e) { }
      if (this.mode === 'sqlite') this.push();
    },
    push: function () {
      if (this.mode !== 'sqlite' || !window.fetch) return;
      try {
        fetch('api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        }).catch(function () { });
      } catch (e) { }
    },
    clear: function () {
      if (this.mode === 'sqlite' && window.fetch) {
        try { fetch('api/state', { method: 'DELETE' }).catch(function () { }); } catch (e) { }
      }
      try { localStorage.removeItem(LS_STATE); } catch (e) { }
    }
  };

  /* --------------------------------------------------------------- toast */
  function toast(msg, opts) {
    opts = opts || {};
    var d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = (opts.icon || '') + '<span>' + esc(msg) + '</span>';
    if (opts.action) {
      var b = document.createElement('button');
      b.className = 'pbtn';
      b.style.color = 'inherit';
      b.style.textDecoration = 'underline';
      b.textContent = opts.action;
      b.onclick = function () { if (opts.onAction) opts.onAction(); d.remove(); };
      d.appendChild(b);
    }
    $('#toasts').appendChild(d);
    setTimeout(function () {
      d.classList.add('out');
      setTimeout(function () { d.remove(); }, 320);
    }, opts.ms || 2400);
  }

  /* --------------------------------------------------------------- 索引层 */
  var SEARCH = null, TOKENS = null, PAGE_MAP = null, BOOK_INDEX = null,
    HEAD_INDEX = null, INDEX_CH = -1;
  var termPagesCache = Object.create(null);

  (function () {
    for (var i = 0; i < B.chapters.length; i++) {
      if (/^index$/i.test(String(B.chapters[i].title || '').trim())) { INDEX_CH = i; break; }
    }
  })();

  function tokenize(s) {
    var out = [], re = /[a-z0-9][a-z0-9'\-]*/g, m;
    s = String(s || '').toLowerCase();
    while ((m = re.exec(s))) { if (m[0].length >= 2) out.push(m[0]); }
    var cj = s.match(/[\u3400-\u9fff]+/g);
    if (cj) {
      for (var i = 0; i < cj.length; i++) {
        var seg = cj[i];
        for (var k = 0; k < seg.length; k++) {
          out.push(seg.substr(k, 1));
          if (k < seg.length - 1) out.push(seg.substr(k, 2));
        }
      }
    }
    return out;
  }
  function uniq(arr) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < arr.length; i++) if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
    return out;
  }

  function buildSearchIndex() {
    if (SEARCH) return SEARCH;
    var docs = [], post = Object.create(null);
    for (var ci = 0; ci < B.chapters.length; ci++) {
      var c = B.chapters[ci];
      for (var j = 0; j < c.blocks.length; j++) {
        var b = c.blocks[j];
        if (b.t === 'img') continue;
        var text = strip(b.text || '').trim();
        if (text.length < 2) continue;
        var di = docs.length;
        docs.push({ ci: ci, j: j, ch: c.title, title: c.title, text: text, head: b.t === 'h' ? 1 : 0, page: b.page });
        var toks = uniq(tokenize(text));
        for (var k = 0; k < toks.length; k++) {
          var t = toks[k];
          (post[t] || (post[t] = [])).push(di);
        }
      }
    }
    SEARCH = { docs: docs, post: post };
    return SEARCH;
  }
  function tokenList() {
    if (!TOKENS) { buildSearchIndex(); TOKENS = Object.keys(SEARCH.post).sort(); }
    return TOKENS;
  }

  function intersect(cand, list) {
    var set = Object.create(null);
    for (var i = 0; i < list.length; i++) set[list[i]] = 1;
    var out = [];
    for (var k = 0; k < cand.length; k++) if (set[cand[k]]) out.push(cand[k]);
    return out;
  }

  function searchBook(qstr, limit) {
    limit = limit || 60;
    var I = buildSearchIndex();
    var raw = String(qstr || '').trim();
    if (!raw) return [];
    var phrase = raw.toLowerCase();
    var toks = uniq(tokenize(raw)).filter(function (t) { return I.post[t]; });
    if (!toks.length) return fuzzy(raw, limit);

    var lists = toks.map(function (t) { return I.post[t]; })
      .sort(function (a, b) { return a.length - b.length; });

    var cand = lists[0].slice(0, 5000), i;
    for (i = 1; i < lists.length; i++) {
      cand = intersect(cand, lists[i]);
      if (!cand.length) break;
    }
    if (!cand.length && lists.length > 1) {           /* AND 无结果 → 并集兜底 */
      var seen = Object.create(null);
      cand = [];
      for (i = 0; i < lists.length; i++) {
        for (var m = 0; m < lists[i].length && cand.length < 5000; m++) {
          var d0 = lists[i][m];
          if (!seen[d0]) { seen[d0] = 1; cand.push(d0); }
        }
      }
    }
    if (!cand.length) return fuzzy(raw, limit);

    var out = [];
    for (i = 0; i < cand.length; i++) {
      var doc = I.docs[cand[i]];
      var low = doc.text.toLowerCase();
      var score = 0;
      if (low.indexOf(phrase) >= 0) score += 12;
      for (var q = 0; q < toks.length; q++) if (low.indexOf(toks[q]) >= 0) score += 2;
      if (doc.head) score += 7;
      out.push({ doc: doc, score: score });
    }
    out.sort(function (a, b) {
      return b.score - a.score || a.doc.ci - b.doc.ci || a.doc.j - b.doc.j;
    });
    return out.slice(0, limit);
  }

  function fuzzy(qstr, limit) {
    var low = qstr.toLowerCase(), toks = tokenList();
    if (low.length < 2) return [];
    var lo = 0, hi = toks.length, mid;
    while (lo < hi) { mid = (lo + hi) >> 1; if (toks[mid] < low) lo = mid + 1; else hi = mid; }
    var I = buildSearchIndex(), seen = Object.create(null), cand = [], i;
    for (i = lo; i < toks.length && toks[i].indexOf(low) === 0; i++) {
      var l = I.post[toks[i]];
      for (var k = 0; k < l.length; k++) if (!seen[l[k]] && cand.length < 3000) { seen[l[k]] = 1; cand.push(l[k]); }
    }
    var out = cand.map(function (d) { return { doc: I.docs[d], score: 1 }; });
    out.sort(function (a, b) {
      return b.doc.head - a.doc.head || a.doc.ci - b.doc.ci || a.doc.j - b.doc.j;
    });
    return out.slice(0, limit);
  }

  function buildPageMap() {
    if (PAGE_MAP) return PAGE_MAP;
    PAGE_MAP = Object.create(null);
    for (var ci = 0; ci < B.chapters.length; ci++) {
      if (ci === INDEX_CH) continue;
      var blocks = B.chapters[ci].blocks;
      for (var j = 0; j < blocks.length; j++) {
        if (blocks[j].page == null) continue;
        var key = blocks[j].page + 1;
        (PAGE_MAP[key] || (PAGE_MAP[key] = [])).push({ ch: ci, block: j });
      }
    }
    return PAGE_MAP;
  }

  /* 书后索引。原书 Index 章的文本抽取有损（160 条里 80 条丢了页码），
     所以：① 按术语首字母重新分组（抽取结果的字母标题顺序是错的）
           ② 缺页码的条目用倒排索引回正文补出「出现页」 */
  function buildBookIndex() {
    if (BOOK_INDEX) return BOOK_INDEX;
    if (INDEX_CH < 0) { BOOK_INDEX = { groups: [], byTerm: Object.create(null) }; return BOOK_INDEX; }
    var byTerm = Object.create(null), order = [];
    B.chapters[INDEX_CH].blocks.forEach(function (b) {
      if (b.t !== 'p') return;
      var raw = strip(b.text || '').trim();
      if (!raw) return;
      var term, pages = [];
      var mm = raw.match(/^(.*?)[\s,]*((?:\d{1,3})(?:\s*,\s*\d{1,3})*)$/);
      if (mm) {
        term = mm[1].trim().replace(/[\s,;.]+$/, '');
        pages = uniq(mm[2].split(',').map(function (x) { return x.trim(); }))
          .map(function (x) { return parseInt(x, 10); })
          .filter(function (n) { return n > 0; });
      } else {
        term = raw;
      }
      if (!term) return;
      var key = term.toLowerCase();
      if (!byTerm[key]) {
        byTerm[key] = { term: term, pages: [], see: null };
        order.push(key);
      }
      var e = byTerm[key];
      /* 交叉引用条目：把 "xxx see yyy" 拆成 主词 + 指向词，避免重复显示 */
      var sm = term.match(/^(.*?)\s+see\s+(.+)$/i);
      if (sm) {
        e.term = sm[1].trim();
        e.see = sm[2].trim();
        e.pages = [];
      }
      if (pages.length && !e.see) {
        e.pages = uniq(e.pages.concat(pages)).sort(function (a, b) { return a - b; });
      }
    });

    var groups = Object.create(null);
    order.forEach(function (key) {
      var e = byTerm[key];
      var c0 = e.term.charAt(0).toUpperCase();
      var g = /[A-Z]/.test(c0) ? c0 : '#';
      (groups[g] || (groups[g] = [])).push(e);
    });
    var sorted = Object.keys(groups).sort(function (a, b) {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a < b ? -1 : 1;
    }).map(function (g) {
      groups[g].sort(function (a, b) { return a.term.toLowerCase() < b.term.toLowerCase() ? -1 : 1; });
      return { letter: g, entries: groups[g] };
    });
    BOOK_INDEX = { groups: sorted, byTerm: byTerm };
    return BOOK_INDEX;
  }

  function pagesForTerm(term, cap) {
    cap = cap || 8;
    var ck = term.toLowerCase();
    if (termPagesCache[ck]) return termPagesCache[ck];
    var toks = uniq(tokenize(term));
    var out = [];
    do {
      if (!toks.length) break;
      var I = buildSearchIndex(), lists = [], i;
      for (i = 0; i < toks.length; i++) {
        var l = I.post[toks[i]];
        if (!l || !l.length) { lists = null; break; }
        lists.push(l);
      }
      if (!lists) break;
      lists.sort(function (a, b) { return a.length - b.length; });
      var idx = lists[0].slice(0, 1500);
      for (i = 1; i < lists.length; i++) {
        idx = intersect(idx, lists[i]);
        if (!idx.length) break;
      }
      if (!idx.length) break;
      var seen = Object.create(null);
      for (i = 0; i < idx.length; i++) {
        var doc = I.docs[idx[i]];
        if (doc.ci === INDEX_CH || doc.page == null) continue;
        var printed = doc.page + 1;
        if (seen[printed]) continue;
        seen[printed] = 1;
        out.push(printed);
      }
      out.sort(function (a, b) { return a - b; });
      out = out.slice(0, cap);
    } while (false);
    termPagesCache[ck] = out;
    return out;
  }

  function buildHeadIndex() {
    if (HEAD_INDEX) return HEAD_INDEX;
    HEAD_INDEX = [];
    B.chapters.forEach(function (c, ci) {
      c.blocks.forEach(function (b, j) {
        if (b.t !== 'h') return;
        var t = strip(b.text || '').trim();
        if (!t) return;
        if (j === 0 && t === String(c.title).trim()) return;
        HEAD_INDEX.push({ ch: ci, block: j, text: t, lvl: b.lvl });
      });
    });
    HEAD_INDEX.sort(function (a, b) {
      return a.text.toLowerCase() < b.text.toLowerCase() ? -1 : 1;
    });
    return HEAD_INDEX;
  }

  /* --------------------------------------------------------------- DOM */
  var doc, article, chapterBar, crumb, posEl, selbar, tocList, panel, resultsEl, qEl,
    pgnoEl, pgopenEl, paneProg;
  var cur = 0, lastRendered = -1, activeHead = -1, lastPage = -1;
  var pendingSelection = null, lastColor = 'yellow';
  var dialogSave = null, dialogDelete = null;
  var idxLetter = 'ALL', idxMode = 'book';
  var searchResults = [], searchSel = -1;

  /* ------------------------------------------------------------ 渲染正文 */
  function chapterMeta(c) {
    var t = String(c.title || '');
    var m = t.match(/^\s*([0-9]+|[A-Z])\s+(.*)$/);
    return m ? { num: m[1], text: m[2] } : { num: '', text: t };
  }

  var PAGE_LINK_RE = /(^|[\s(>])((?:pages?|pp\.)\s?\d{1,3}(?:\s?(?:,|and|\u2013|-)\s?\d{1,3})*)/g;
  /* 图/表引用内链。公式编号印在图片内部、数据里拿不到，故只链 Fig./Table. */
  var REF_LINK_RE = /\b(Fig(?:ure)?\.?|Table)\s?(\d{1,2}\.\d{1,2})\b/g;

  function linkify(html, ci) {
    if (ci === INDEX_CH) return html;
    var s = String(html == null ? '' : html);
    s = s.replace(PAGE_LINK_RE, function (all, pre, seg) {
      return pre + seg.replace(/(\d{1,3})/g, function (num) {
        var page = parseInt(num, 10);
        if (page < 1 || page > 600) return num;
        return '<a class="inlink" data-printed="' + page + '" href="#">' + num + '</a>';
      });
    });
    s = s.replace(REF_LINK_RE, function (all, label, num) {
      var key = (label.charAt(0).toLowerCase() === 't' ? 'tbl' : 'fig') + ':' + num;
      return buildRefs().map[key]
        ? '<a class="inlink" data-ref="' + key + '" title="跳到 ' + key.replace(':', ' ') + '">' + all + '</a>'
        : all;
    });
    return s;
  }

  function renderChapter(ci, opts) {
    opts = opts || {};
    cur = clamp(ci, 0, B.chapters.length - 1);
    var c = B.chapters[cur];
    lastRendered = cur;
    activeHead = -1;

    var out = ['<h1 id="c' + cur + '">' + esc(c.title) + '</h1>'];
    c.blocks.forEach(function (b, j) {
      var id = 'c' + cur + 'b' + j;
      if (b.t === 'h') {
        if (j === 0 && strip(b.text).trim() === String(c.title).trim()) return;
        var L = Math.min(4, Math.max(2, b.lvl));
        out.push('<h' + L + ' id="' + id + '">' + esc(b.text) + '</h' + L + '>');
      } else if (b.t === 'p') {
        var body = linkify(b.text, cur);
        out.push(b.bullet ? '<ul><li id="' + id + '">' + body + '</li></ul>'
          : '<p id="' + id + '">' + body + '</p>');
      } else if (b.t === 'cap') {
        out.push('<p class="cap" id="' + id + '">' + b.text + '</p>');
      } else {
        var cls = b.kind === 'eq' ? 'eq' : (b.kind === 'tbl' ? 'tbl' : 'fig');
        out.push('<figure class="' + cls + '" id="' + id + '">' +
          '<img loading="lazy" src="../images/' + b.src + '" alt="">' +
          '<br><a class="pglink" data-page="' + b.page + '" href="#">' + ICON.ext +
          '原书 ' + pageLabel(b.page).txt + '</a></figure>');
      }
    });
    article.innerHTML = out.join('');
    applyAnnotations(cur);
    applyGlossary(cur);
    renderChapterFoot();
    buildToc();
    hideGCard();
    dismissSelbar();
    doc.scrollTop = 0;

    if (opts.anchorId) {
      var el = document.getElementById(opts.anchorId);
      if (el) { scrollToEl(el, 'start'); if (opts.flash !== false) flashEl(el); }
    } else if (typeof opts.anchorBlock === 'number') {
      var el2 = document.getElementById('c' + cur + 'b' + opts.anchorBlock);
      if (el2) scrollToEl(el2, 'start');
    }
    try { localStorage.setItem(LS_LAST, String(cur)); } catch (e) { }
    updateChapterBar();
    tick(true);
  }

  function renderChapterFoot() {
    var prev = cur > 0 ? B.chapters[cur - 1] : null;
    var next = cur < B.chapters.length - 1 ? B.chapters[cur + 1] : null;
    var h = '';
    h += prev
      ? '<button class="l" data-go="' + (cur - 1) + '"><span>' + ICON.left + ' 上一章</span>' + esc(prev.title) + '</button>'
      : '<button class="l" disabled style="opacity:.45"><span>已是第一章</span>—</button>';
    h += next
      ? '<button class="r" data-go="' + (cur + 1) + '"><span>下一章 ' + ICON.right + '</span>' + esc(next.title) + '</button>'
      : '<button class="r" disabled style="opacity:.45"><span>已是最后一章</span>—</button>';
    $('#chap-foot').innerHTML = h;
  }

  /* ------------------------------------------------------- 高亮 / 笔记渲染 */
  function wrapOffsets(root, start, end, make) {
    var nodes = [];
    (function walk(n) {
      for (var ch = n.firstChild; ch; ch = ch.nextSibling) {
        if (ch.nodeType === 3) nodes.push(ch);
        else if (ch.nodeType === 1) walk(ch);
      }
    })(root);
    var off = 0, ops = [], i;
    for (i = 0; i < nodes.length; i++) {
      var nd = nodes[i], s = off, e = off + nd.nodeValue.length;
      off = e;
      var a = Math.max(s, start), b = Math.min(e, end);
      if (b > a) ops.push({ n: nd, ls: a - s, le: b - s });
    }
    for (i = ops.length - 1; i >= 0; i--) {
      var o = ops[i], target = o.n;
      try {
        if (o.le < target.nodeValue.length) target.splitText(o.le);
        if (o.ls > 0) target = target.splitText(o.ls);
        var mark = make();
        target.parentNode.insertBefore(mark, target);
        mark.appendChild(target);
      } catch (err) { /* 偏移异常时跳过，不影响正文 */ }
    }
  }

  function applyAnnotations(ci) {
    var list = state.notes.filter(function (n) { return n.chapter === ci && n.end > n.start; });
    if (!list.length) return;
    var byBlock = Object.create(null);
    list.forEach(function (n) { (byBlock[n.block] || (byBlock[n.block] = [])).push(n); });
    Object.keys(byBlock).forEach(function (j) {
      var elx = document.getElementById('c' + ci + 'b' + j);
      if (!elx) return;
      var total = elx.textContent.length, last = 0;
      byBlock[j].sort(function (a, b) { return a.start - b.start; }).forEach(function (n) {
        var s = clamp(n.start, 0, total), e = clamp(n.end, 0, total);
        if (e <= s || s < last) return;
        last = e;
        wrapOffsets(elx, s, e, function () {
          var m = document.createElement('mark');
          m.className = 'hl c-' + n.color + (n.body ? ' has-note' : '');
          m.dataset.nid = n.id;
          m.title = n.body ? truncate(n.body, 160) : '高亮 · 点击编辑';
          return m;
        });
      });
    });
  }

  /* -------------------------------------------------------------- 目录 */
  function buildToc() {
    var h = '';
    B.chapters.forEach(function (c, i) {
      var meta = chapterMeta(c), p = state.progress[String(i)], pct = p ? p.pct : 0;
      h += '<div class="ch-item' + (i === cur ? ' on' : '') + '" data-ch="' + i + '">' +
        '<button class="ch-row" data-ch="' + i + '">' +
        '<span class="num">' + esc(meta.num || '·') + '</span>' +
        '<span class="ttl">' + esc(meta.text) + '</span>' +
        (pct >= 0.97 ? '<span class="done">' + ICON.check + '</span>'
          : (pct > 0 ? '<span class="pct">' + Math.round(pct * 100) + '%</span>' : '')) +
        '</button><div class="ch-meter"><i style="width:' + (pct * 100) + '%"></i></div>';
      if (i === cur) {
        h += '<div class="ch-sub">';
        c.blocks.forEach(function (b, j) {
          if (b.t !== 'h' || b.lvl < 2 || b.lvl > 3) return;
          if (j === 0 && strip(b.text).trim() === String(c.title).trim()) return;
          var t = strip(b.text).trim();
          if (!t) return;
          h += '<a href="#c' + i + 'b' + j + '" class="' + (b.lvl === 3 ? 'l3' : '') +
            '" data-ch="' + i + '" data-b="' + j + '">' + esc(t) + '</a>';
        });
        h += '</div>';
      }
      h += '</div>';
    });
    tocList.innerHTML = h;
  }

  function refreshTocProgress() {
    $$('#toc-list .ch-item').forEach(function (item) {
      var i = +item.dataset.ch, p = state.progress[String(i)], pct = p ? p.pct : 0;
      var meter = $('.ch-meter i', item);
      if (meter) meter.style.width = (pct * 100) + '%';
      var row = $('.ch-row', item);
      if (!row) return;
      var old = $('.pct', row) || $('.done', row);
      var want = pct >= 0.97 ? 'done' : (pct > 0 ? Math.round(pct * 100) + '%' : '');
      var have = old ? ($('.done', row) ? 'done' : old.textContent) : '';
      if (String(want) === String(have)) return;
      if (old) old.remove();
      if (want === 'done') row.insertAdjacentHTML('beforeend', '<span class="done">' + ICON.check + '</span>');
      else if (want) row.insertAdjacentHTML('beforeend', '<span class="pct">' + want + '</span>');
    });
  }

  function markActiveHead() {
    if (lastRendered !== cur) return;
    var bar = chapterBar.offsetHeight + 12;
    var blocks = B.chapters[cur].blocks, best = -1;
    for (var j = 0; j < blocks.length; j++) {
      if (blocks[j].t !== 'h' || blocks[j].lvl < 2 || blocks[j].lvl > 3) continue;
      var el = document.getElementById('c' + cur + 'b' + j);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= bar + 8) best = j;
      else break;
    }
    if (best === activeHead) return;
    activeHead = best;
    $$('#toc-list .ch-sub a').forEach(function (a) { a.classList.toggle('on', +a.dataset.b === best); });
  }

  function updateChapterBar() {
    var c = B.chapters[cur], meta = chapterMeta(c);
    crumb.innerHTML = '<b>' + esc(meta.num ? '第 ' + meta.num + ' 章' : '') + '</b>' +
      (meta.num ? ' · ' : '') + esc(meta.text);
  }

  /* ------------------------------------------------------- 滚动 / 进度 */
  function scrollToEl(el, mode) {
    var top = mode === 'center'
      ? el.offsetTop - doc.clientHeight / 2
      : el.offsetTop - (chapterBar.offsetHeight + 14);
    doc.scrollTop = Math.max(0, top);
  }
  function flashEl(el) {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(function () { el.classList.remove('flash'); }, 1600);
  }

  function currentBlockIndex() {
    if (lastRendered !== cur) return 0;
    var blocks = B.chapters[cur].blocks, bar = chapterBar.offsetHeight + 14, best = 0;
    for (var j = 0; j < blocks.length; j++) {
      var el = document.getElementById('c' + cur + 'b' + j);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= bar) best = j;
      else break;
    }
    return best;
  }

  function depthNow() {
    var max = doc.scrollHeight - doc.clientHeight;
    if (max <= 4) return 1;                 /* 一屏装得下 → 视为已读完 */
    return clamp(doc.scrollTop / max, 0, 1); /* 否则按已滚过的比例计 */
  }

  var slowTick = debounce(function () { tick(false); }, 260);
  var saving = debounce(function () { Store.save(); }, 900);

  function tick(force) {
    if (lastRendered !== cur) return;
    var max = doc.scrollHeight - doc.clientHeight;
    var ratio = max > 4 ? clamp(doc.scrollTop / max, 0, 1) : 0;
    var depth = depthNow();
    var key = String(cur), prev = state.progress[key];
    var pct = prev ? Math.max(prev.pct, depth) : depth;
    state.progress[key] = { pct: pct, block: currentBlockIndex(), ratio: ratio, updated: nowISO() };

    $('#hdr-progress').style.width = (depth * 100).toFixed(2) + '%';
    if (force) { paintProgress(); refreshTocProgress(); updatePager(); }
    else slowTick();
    saving();
  }

  function paintProgress() {
    var C = 2 * Math.PI * 15, o = overallPct();
    $('#ring-bar').setAttribute('stroke-dashoffset', String(C * (1 - o)));
    $('#ring-pct').textContent = Math.round(o * 100) + '%';
    if (paneProg && paneProg.classList.contains('on')) renderProgressPane();
  }

  function overallPct() {
    var totalW = 0, sum = 0;
    B.chapters.forEach(function (c, i) {
      var w = Math.max(1, c.blocks.length);
      totalW += w;
      var p = state.progress[String(i)];
      sum += w * (p ? p.pct : 0);
    });
    return totalW ? sum / totalW : 0;
  }

  function renderProgressPane() {
    if (!paneProg) return;
    var o = overallPct(), readCh = 0, totalBlocks = 0;
    B.chapters.forEach(function (c, i) {
      var p = state.progress[String(i)];
      if (p && p.pct >= 0.97) readCh++;
      totalBlocks += c.blocks.length;
    });
    var st = statCards();
    var h = '<div class="card"><h4>学习进度</h4><div class="kpis">' +
      '<div class="kpi"><b>' + Math.round(o * 100) + '%</b><span>总进度</span></div>' +
      '<div class="kpi"><b>' + readCh + '/' + B.chapters.length + '</b><span>已读完</span></div>' +
      '<div class="kpi"><b>' + state.bookmarks.length + '</b><span>书签</span></div>' +
      '<div class="kpi"><b>' + state.notes.length + '</b><span>笔记</span></div>' +
      '</div><div class="hintline">按各章篇幅加权；滚到章末即计为读完。</div></div>';

    h += '<div class="card"><h4>阅读打卡</h4>' +
      '<div class="kpis">' +
      '<div class="kpi"><b id="stat-today">' + st.today + ' 分钟</b><span>今日</span></div>' +
      '<div class="kpi"><b>' + st.streak + ' 天</b><span>连续</span></div>' +
      '<div class="kpi"><b>' + (st.total >= 60 ? (st.total / 60).toFixed(1) + ' 小时' : st.total + ' 分钟') + '</b><span>累计</span></div>' +
      '</div>' +
      '<div class="hm">' + heatHTML() + '</div>' +
      '<div class="hm-lg"><span>浅</span><i class="lv0"></i><i class="lv1"></i><i class="lv2"></i><i class="lv3"></i><i class="lv4"></i><span>深</span></div>' +
      '<div class="hintline">页面保持打开且未切走时自动计时，无需手动打卡。</div></div>';

    h += '<div class="card"><h4>各章进度</h4><div class="bars">';
    B.chapters.forEach(function (c, i) {
      var meta = chapterMeta(c), p = state.progress[String(i)], pct = p ? p.pct : 0;
      h += '<div class="bar-row" data-ch="' + i + '"><span class="n">' + esc(meta.num || '·') + '</span>' +
        '<span class="t" title="' + esc(c.title) + '">' + esc(meta.text) + '</span>' +
        '<span class="bar"><i style="width:' + (pct * 100) + '%"></i></span>' +
        '<span class="v">' + Math.round(pct * 100) + '%</span></div>';
    });
    h += '</div></div>';

    h += '<div class="card"><h4>存储</h4><div class="hintline" style="margin:0 0 8px">' +
      (Store.mode === 'sqlite'
        ? 'SQLite 数据库 · <code>' + esc(Store.file) + '</code>'
        : '浏览器本地缓存（localStorage）') + '</div>' +
      (Store.mode === 'sqlite'
        ? '<div class="hintline">进度 / 书签 / 笔记实时写入数据库文件，清缓存也不会丢。</div>'
        : '<div class="hintline">直接双击打开无法落库。双击 <b>start-reader.bat</b> 启动本地服务后即可写入 SQLite。</div>') +
      '<div class="hintline" style="margin-top:8px">' + B.chapters.length + ' 章 · ' +
      totalBlocks.toLocaleString() + ' 个内容块</div></div>';

    paneProg.innerHTML = h + '<div class="pane-foot" style="flex-wrap:wrap">' +
      '<button class="btn" data-act="export-md" style="flex:1 1 30%" title="导出为 Markdown 笔记">' + ICON.download + ' 导出 MD</button>' +
      '<button class="btn" data-act="anki" style="flex:1 1 30%" title="把带正文的笔记导出为 Anki 卡片（TSV）">' + ICON.cards + ' Anki</button>' +
      '<button class="btn" data-act="export-json" style="flex:1 1 30%" title="导出 JSON 备份">备份</button>' +
      '<button class="btn" data-act="import" style="flex:1 1 30%" title="从 JSON 备份导入">导入</button>' +
      '<button class="btn" data-act="reset-progress" style="flex:1 1 46%" title="进度清零，保留书签与笔记">重置进度</button>' +
      '<button class="btn danger" data-act="reset" style="flex:1 1 46%" title="清空进度、书签与笔记">' + ICON.trash + ' 清空全部</button></div>';
  }

  /* ------------------------------------------------------------- 原页对照 */
  function pdfURL(page) { return encodeURI(B.pdf || 'book.pdf') + '#page=' + (page + 1) + '&zoom=page-width'; }
  function updatePager() {
    if (lastRendered !== cur) return;
    var blocks = B.chapters[cur].blocks, best = B.chapters[cur].page0, bar = chapterBar.offsetHeight + 14;
    for (var k = 0; k < blocks.length; k++) {
      var el = document.getElementById('c' + cur + 'b' + k);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= bar) best = blocks[k].page != null ? blocks[k].page : best;
      else break;
    }
    if (best !== lastPage) {
      lastPage = best;
      if (pgnoEl) pgnoEl.textContent = pageLabel(best).txt;
      if (pgopenEl) pgopenEl.href = pdfURL(best);
    }
    if (posEl) {
      var cp = state.progress[String(cur)];
      posEl.textContent = '本章 ' + Math.round((cp ? cp.pct : 0) * 100) + '%';
    }
    syncCompareSoon();
    markActiveHead();
  }

  /* --------------------------------------------------------------- 跳转 */
  function jumpTo(ch, block, opt) {
    opt = opt || {};
    if (ch !== lastRendered) pushBack();
    var target = 'c' + ch + 'b' + block;
    if (ch === lastRendered) {
      var el = document.getElementById(target);
      if (el) { scrollToEl(el, opt.center ? 'center' : 'start'); if (opt.flash !== false) flashEl(el); }
      if (opt.noteId) setTimeout(function () { highlightNoteMark(opt.noteId); }, 60);
      tick(true);
    } else {
      renderChapter(ch, { anchorId: target, flash: opt.flash });
    }
    if (window.innerWidth <= 1080) {
      $('#side').classList.remove('on');
      document.body.classList.remove('panel-on');
    }
  }

  function jumpToPrintedPage(printed, term) {
    pushBack();
    buildPageMap();
    var dataPage = printed + PRINT_OFFSET, best = null, i, j;
    var cands = PAGE_MAP[printed] || [];
    for (i = 0; i < cands.length && !best; i++) {
      if (cands[i].ch === INDEX_CH) continue;
      var bb = B.chapters[cands[i].ch].blocks[cands[i].block];
      if (term && bb && strip(bb.text || '').toLowerCase().indexOf(String(term).toLowerCase()) >= 0) {
        best = cands[i];
      }
    }
    if (!best) {
      for (i = 0; i < B.chapters.length && !best; i++) {
        if (i === INDEX_CH) continue;
        var bl = B.chapters[i].blocks;
        for (j = 0; j < bl.length; j++) {
          if (bl[j].page !== dataPage) continue;
          if (!best) best = { ch: i, block: j };
          if (term && String(strip(bl[j].text || '')).toLowerCase().indexOf(String(term).toLowerCase()) >= 0) {
            best = { ch: i, block: j };
            break;
          }
        }
      }
    }
    if (!best && cands.length) best = cands[0];
    if (!best) { toast('原书 p.' + printed + ' 没有对应正文'); return; }
    jumpTo(best.ch, best.block, { flash: true });
  }

  function jumpToRef(key) {
    var e = buildRefs().map[key];
    if (!e) { toast('没有找到 ' + key.replace(':', ' ')); return; }
    jumpTo(e.ch, e.block, { flash: true });
  }

  function highlightNoteMark(id) {
    var m = document.querySelector('mark.hl[data-nid="' + id + '"]');
    if (m) {
      scrollToEl(m, 'center');
      m.classList.add('flash');
      setTimeout(function () { m.classList.remove('flash'); }, 1600);
    }
  }

  /* --------------------------------------------------------------- 面板 */
  function switchPane(root, name) {
    $$('.tabs .tab', root).forEach(function (t) { t.classList.toggle('on', t.dataset.pane === name); });
    $$('.pane', root).forEach(function (p) { p.classList.toggle('on', p.id === 'pane-' + name); });
  }
  function openPanel(pane) {
    document.body.classList.add('panel-on');
    switchPane(panel, pane || 'prog');
    syncHeaderBtns();
    if (pane === 'prog') renderProgressPane();
  }
  function closePanel() {
    document.body.classList.remove('panel-on');
    syncHeaderBtns();
    $$('#panel .tabs .tab').forEach(function (t) { t.classList.remove('on'); });
    $$('#panel .pane').forEach(function (p) { p.classList.remove('on'); });
  }
  /* 顶栏按钮的高亮状态与右栏当前面板保持一致 */
  function syncHeaderBtns() {
    var on = document.body.classList.contains('panel-on');
    var active = '';
    $$('#panel .tabs .tab').forEach(function (t) { if (t.classList.contains('on')) active = t.dataset.pane; });
    $('#btn-bm').classList.toggle('on', on && active === 'bm');
    $('#btn-note').classList.toggle('on', on && active === 'nt');
    $('#ring').classList.toggle('on', on && active === 'prog');
  }
  function renderCounts() {
    $('#bm-count').textContent = state.bookmarks.length;
    $('#bm-count2').textContent = state.bookmarks.length;
    $('#nt-count').textContent = state.notes.length;
    $('#nt-count2').textContent = state.notes.length;
  }

  function renderBookmarks() {
    var box = $('#bm-list');
    var list = state.bookmarks.slice().sort(function (a, b) {
      return (a.created || '') < (b.created || '') ? 1 : -1;
    });
    if (!list.length) {
      box.innerHTML = '<div class="blankslate"><b>还没有书签</b>读到关键处按 <kbd>B</kbd>，或点顶栏书签按钮<br>把当前位置连同所属小节一起存下来</div>';
      return;
    }
    box.innerHTML = list.map(function (b) {
      var c = B.chapters[b.chapter] || { title: '?' }, meta = chapterMeta(c);
      return '<div class="item" data-id="' + esc(b.id) + '">' +
        '<div class="meta"><span class="tag" title="' + esc(c.title) + '">' + esc(truncate(meta.text, 22)) + '</span>' +
        pageLabel(b.page).txt + ' · ' + fmtDate(b.created) +
        '<span class="go" data-act="jump">定位</span></div>' +
        '<div class="lbl">' + esc(b.label || '（无标题）') + '</div>' +
        '<div class="acts"><button data-act="rename">' + ICON.edit + ' 重命名</button>' +
        '<button data-act="del" class="del">' + ICON.trash + ' 删除</button></div></div>';
    }).join('');
  }

  function renderNotes() {
    var box = $('#nt-list');
    var list = state.notes.slice().sort(function (a, b) {
      return (a.updated || '') < (b.updated || '') ? 1 : -1;
    });
    if (!list.length) {
      box.innerHTML = '<div class="blankslate"><b>还没有笔记</b>在正文里选中文字会浮出工具条<br>可直接高亮，也可以写笔记</div>';
      return;
    }
    box.innerHTML = list.map(function (n) {
      var c = B.chapters[n.chapter] || { title: '?' }, meta = chapterMeta(c);
      return '<div class="item" data-id="' + esc(n.id) + '">' +
        '<span class="swatch c-' + n.color + '"></span>' +
        '<div class="meta"><span class="tag" title="' + esc(c.title) + '">' + esc(truncate(meta.text, 22)) + '</span>' +
        pageLabel(n.page).txt + ' · ' + fmtDate(n.updated) +
        '<span class="go" data-act="jump">定位</span></div>' +
        (n.quote ? '<div class="quote">' + esc(n.quote) + '</div>' : '') +
        (n.body ? '<div class="body">' + esc(n.body) + '</div>'
          : '<div class="body" style="color:var(--ink-3)">（仅高亮）</div>') +
        '<div class="acts"><button data-act="edit">' + ICON.edit + ' 编辑</button>' +
        '<button data-act="copy">' + ICON.copy + ' 复制</button>' +
        '<button data-act="del" class="del">' + ICON.trash + ' 删除</button></div></div>';
    }).join('');
  }

  /* -------------------------------------------------------------- 书签 */
  function nearestHeading(blockIdx) {
    var blocks = B.chapters[cur].blocks;
    for (var j = Math.min(blockIdx, blocks.length - 1); j >= 0; j--) {
      if (blocks[j].t === 'h') return strip(blocks[j].text).trim();
    }
    return '';
  }

  function addBookmark() {
    var bi = currentBlockIndex();
    var blk = B.chapters[cur].blocks[bi] || {};
    var max = doc.scrollHeight - doc.clientHeight;
    var bm = {
      id: uid(),
      chapter: cur,
      block: bi,
      page: blk.page != null ? blk.page : (B.chapters[cur].page0 || 0),
      label: truncate(nearestHeading(bi) || B.chapters[cur].title, 90),
      ratio: max > 4 ? clamp(doc.scrollTop / max, 0, 1) : 0,
      created: nowISO()
    };
    state.bookmarks.push(bm);
    Store.save();
    renderCounts(); renderBookmarks();
    openPanel('bm');
    toast('已添加书签 · 原书 ' + pageLabel(bm.page).txt, {
      icon: ICON.check, action: '重命名',
      onAction: function () { renameBookmark(bm.id); }
    });
  }

  function renameBookmark(id) {
    var bm = null;
    state.bookmarks.forEach(function (b) { if (b.id === id) bm = b; });
    if (!bm) return;
    openDialog({
      title: '重命名书签',
      body: '<div class="field"><label>标题</label><input type="text" id="dlg-label" value="' + esc(bm.label) + '"></div>' +
        '<div class="hintline">位置：' + esc(B.chapters[bm.chapter].title) + ' · 原书 ' + pageLabel(bm.page).txt + '</div>',
      save: function () {
        bm.label = $('#dlg-label').value.trim() || bm.label;
        Store.save(); renderBookmarks();
        toast('已更新书签');
        return true;
      }
    });
  }

  /* -------------------------------------------------------------- 笔记 */
  function currentRatio() {
    var max = doc.scrollHeight - doc.clientHeight;
    return max > 4 ? clamp(doc.scrollTop / max, 0, 1) : 0;
  }

  function saveNote(n) {
    var found = null;
    state.notes.forEach(function (x) { if (x.id === n.id) found = x; });
    if (found) { found.body = n.body; found.color = n.color; found.updated = nowISO(); }
    else state.notes.push(n);
    Store.save();
    renderCounts(); renderNotes();
    if (lastRendered === n.chapter) renderChapter(n.chapter, { anchorBlock: n.block });
  }

  function deleteNote(id) {
    var n = null;
    state.notes.forEach(function (x) { if (x.id === id) n = x; });
    state.notes = state.notes.filter(function (x) { return x.id !== id; });
    Store.save(); renderCounts(); renderNotes();
    if (n && lastRendered === n.chapter) renderChapter(n.chapter, { anchorBlock: n.block });
    toast('已删除笔记');
  }

  function openNoteDialog(note, isNew) {
    openDialog({
      title: isNew ? '添加笔记' : '编辑笔记',
      body:
        (note.quote ? '<div class="field"><label>选中的文字</label><div class="quote-box">' + esc(note.quote) + '</div></div>' : '') +
        '<div class="field"><label>笔记</label><textarea id="dlg-body" placeholder="写下理解、疑问或推导…">' + esc(note.body) + '</textarea></div>' +
        '<div class="field"><label>颜色</label><div class="swatches" id="dlg-colors">' +
        COLORS.map(function (c) {
          return '<button type="button" class="c-' + c + (c === note.color ? ' on' : '') + '" data-color="' + c +
            '" title="' + COLOR_NAME[c] + '"></button>';
        }).join('') + '</div></div>',
      onMount: function (root) {
        var box = $('#dlg-colors', root);
        if (box) {
          box.addEventListener('click', function (e) {
            var b = e.target.closest('button[data-color]');
            if (!b) return;
            note.color = b.dataset.color;
            lastColor = note.color;
            $$('button', box).forEach(function (x) { x.classList.toggle('on', x === b); });
          });
        }
        var ta = $('#dlg-body', root);
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      },
      save: function () {
        note.body = $('#dlg-body').value.trim();
        if (!note.body && !note.quote) { toast('内容为空'); return false; }
        note.updated = nowISO();
        saveNote(note);
        toast(isNew ? '笔记已保存' : '已更新笔记', { icon: ICON.check });
        return true;
      },
      onDelete: isNew ? null : function () { deleteNote(note.id); },
      saveLabel: isNew ? '保存' : '更新'
    });
  }

  /* -------------------------------------------------------- 划词工具条 */
  function offsetsIn(blockEl, range) {
    var pre = range.cloneRange();
    pre.selectNodeContents(blockEl);
    try { pre.setEnd(range.startContainer, range.startOffset); }
    catch (e) { return { start: 0, end: 0 }; }
    var start = pre.toString().length;
    return { start: start, end: start + range.toString().length };
  }

  function blockElOf(node) {
    var el = node && node.nodeType === 1 ? node : (node ? node.parentNode : null);
    while (el && el !== article) {
      if (el.id && /^c\d+b\d+$/.test(el.id)) return el;
      el = el.parentNode;
    }
    return null;
  }
  function blockIndexOfEl(el) {
    var m = el && el.id ? el.id.match(/^c\d+b(\d+)$/) : null;
    if (m) return +m[1];
    var p = el && el.closest ? el.closest('[id^="c"]') : null;
    m = p && p.id ? p.id.match(/^c\d+b(\d+)$/) : null;
    return m ? +m[1] : 0;
  }

  /* 划词工具条：默认固定（不会自己消失），✕ / Esc / 执行动作后才收起 */
  var selPinned = true;
  function hideSelbar() {
    if (selPinned) return;
    selbar.classList.remove('on');
    pendingSelection = null;
  }
  function dismissSelbar() {
    selPinned = false;
    selbar.classList.remove('pin');
    selbar.classList.remove('on');
    pendingSelection = null;
  }

  function showSelbar(range, blockEl) {
    var off = offsetsIn(blockEl, range);
    var quote = range.toString().replace(/\s+/g, ' ').trim();
    if (off.end - off.start < 1 || !quote) { dismissSelbar(); return; }
    var bi = blockIndexOfEl(blockEl);
    var blk = B.chapters[cur].blocks[bi] || {};
    pendingSelection = {
      chapter: cur, block: bi,
      page: blk.page != null ? blk.page : (B.chapters[cur].page0 || 0),
      start: off.start, end: off.end, quote: truncate(quote, 400)
    };
    selbar.dataset.color = lastColor;
    $$('#selbar .dot').forEach(function (d) { d.classList.toggle('on', d.dataset.color === lastColor); });
    /* 每次新划词都回到固定态：不会自己消失，✕ / Esc / 执行动作后才收起 */
    selPinned = true;
    selbar.classList.add('pin');
    selbar.classList.add('on');
    placeSelbar(range);
  }

  /* 工具条定位：随选区走。滚动/缩放时若选区仍在就重新锚定，不会自己消失 */
  function placeSelbar(range) {
    var docRect = doc.getBoundingClientRect();
    var rect = range.getBoundingClientRect();
    var w = selbar.offsetWidth, h = selbar.offsetHeight;
    var left = clamp(rect.left - docRect.left + rect.width / 2 - w / 2, 10, Math.max(10, doc.clientWidth - w - 10));
    var top = rect.top - docRect.top - h - 10;
    if (top < 4) top = rect.bottom - docRect.top + 10;
    selbar.style.left = left + 'px';
    selbar.style.top = Math.max(4, doc.scrollTop + top) + 'px';
  }
  function selectionAlive() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    try {
      var r = sel.getRangeAt(0);
      return article.contains(r.startContainer) && article.contains(r.endContainer);
    } catch (e) { return false; }
  }
  function reanchorSelbar() {
    if (!selbar.classList.contains('on')) return;
    if (!selectionAlive() && !selPinned) { hideSelbar(); return; }
    if (!selectionAlive()) return;            /* 已固定：选区没了也停在原位 */
    try { placeSelbar(window.getSelection().getRangeAt(0)); } catch (e) { }
  }

  function createFromSelection(color, withDialog) {
    if (!pendingSelection) return;
    var n = {
      id: uid(),
      chapter: pendingSelection.chapter,
      block: pendingSelection.block,
      page: pendingSelection.page,
      start: pendingSelection.start,
      end: pendingSelection.end,
      quote: pendingSelection.quote,
      body: '',
      color: color || 'yellow',
      created: nowISO(),
      updated: nowISO()
    };
    lastColor = n.color;
    dismissSelbar();
    try { window.getSelection().removeAllRanges(); } catch (e) { }
    if (withDialog) { openNoteDialog(n, true); return; }
    state.notes.push(n);
    Store.save();
    renderCounts(); renderNotes();
    renderChapter(cur, { anchorBlock: n.block });
    toast('已高亮 · 可在右侧笔记里补充内容', {
      icon: ICON.check, action: '写笔记',
      onAction: function () { openNoteDialog(n, false); }
    });
  }

  /* -------------------------------------------------------------- 对话框 */
  function openDialog(opts) {
    var modal = $('#modal');
    var extra = typeof opts.extra === 'function' ? opts.extra() : (opts.extra || '');
    modal.innerHTML =
      '<div class="dialog" role="dialog" aria-modal="true">' +
      '<div class="dh"><h3>' + esc(opts.title) + '</h3><button class="x" data-close aria-label="关闭">✕</button></div>' +
      '<div class="db">' + (opts.body || '') + '</div>' +
      '<div class="df">' + extra +
      '<button class="btn" data-close>取消</button>' +
      '<button class="btn primary" id="dlg-save">' + esc(opts.saveLabel || '保存') + '</button>' +
      '</div></div>';
    modal.classList.add('on');
    dialogSave = opts.save || null;
    dialogDelete = opts.onDelete || null;
    if (opts.onMount) opts.onMount(modal);
    var del = $('#dlg-del', modal);
    if (del) {
      del.style.marginRight = 'auto';
      del.onclick = function () { if (dialogDelete) dialogDelete(); closeDialog(); };
    }
    var first = $('input[type="text"]', modal);
    setTimeout(function () { if (first) { first.focus(); first.select(); } }, 40);
  }
  function closeDialog() {
    $('#modal').classList.remove('on');
    $('#modal').innerHTML = '';
    dialogSave = null; dialogDelete = null;
  }

  /* ---------------------------------------------------------- 导入导出 */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 600);
  }

  function exportMarkdown() {
    var L = ['# ' + (B.title || 'Reading notes') + ' · 学习笔记', '',
      '> 导出时间：' + nowISO() + ' · 总进度 ' + Math.round(overallPct() * 100) + '%', ''];
    B.chapters.forEach(function (c, i) {
      var bms = state.bookmarks.filter(function (b) { return b.chapter === i; });
      var nts = state.notes.filter(function (n) { return n.chapter === i; });
      if (!bms.length && !nts.length) return;
      var meta = chapterMeta(c);
      L.push('## ' + (meta.num ? meta.num + ' ' : '') + meta.text, '');
      if (bms.length) {
        L.push('### 书签', '');
        bms.forEach(function (b) {
          L.push('- **' + pageLabel(b.page).txt + '** ' + (b.label || '') + '  <sub>' + fmtDate(b.created) + '</sub>');
        });
        L.push('');
      }
      if (nts.length) {
        L.push('### 笔记', '');
        nts.forEach(function (n) {
          L.push('**' + pageLabel(n.page).txt + '** · ' + fmtDate(n.updated) + ' · ' + COLOR_NAME[n.color], '');
          if (n.quote) L.push('> ' + n.quote.replace(/\n/g, ' '), '');
          if (n.body) L.push(n.body, '');
        });
      }
      L.push('---', '');
    });
    L.push('## 各章进度', '', '| 章 | 进度 |', '| --- | --- |');
    B.chapters.forEach(function (c, i) {
      var meta = chapterMeta(c), p = state.progress[String(i)];
      L.push('| ' + meta.num + ' ' + meta.text + ' | ' + Math.round((p ? p.pct : 0) * 100) + '% |');
    });
    download('NMR-notes-' + nowISO().slice(0, 10) + '.md', L.join('\n'), 'text/markdown;charset=utf-8');
    toast('已导出 Markdown');
  }

  function exportJSON() {
    download('NMR-reader-backup-' + nowISO().slice(0, 10) + '.json',
      JSON.stringify(state, null, 2), 'application/json;charset=utf-8');
    toast('已导出 JSON 备份');
  }

  function importJSON() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var n;
        try { n = normalize(JSON.parse(String(rd.result))); }
        catch (e) { toast('不是有效的备份 JSON'); return; }
        openDialog({
          title: '导入备份',
          body: '<div class="hintline" style="margin:0">将用备份覆盖当前数据：进度 ' +
            Object.keys(n.progress).length + ' 条 · 书签 ' + n.bookmarks.length +
            ' 条 · 笔记 ' + n.notes.length + ' 条。</div>',
          saveLabel: '覆盖导入',
          save: function () {
            state = n;
            Store.save(); Store.flush();
            renderCounts(); renderBookmarks(); renderNotes(); buildToc(); paintProgress();
            renderChapter(0, { anchorBlock: 0 });
            toast('导入完成', { icon: ICON.check });
            return true;
          }
        });
      };
      rd.readAsText(f, 'utf-8');
    };
    inp.click();
  }

  function resetAll() {
    openDialog({
      title: '清空学习数据',
      body: '<div class="hintline" style="margin:0">将删除全部阅读进度、书签与笔记' +
        (Store.mode === 'sqlite' ? '，并清空数据库中的记录' : '') + '。此操作不可撤销。</div>',
      saveLabel: '确认清空',
      save: function () {
        state = normalize(null);
        Store.clear();
        renderCounts(); renderBookmarks(); renderNotes(); buildToc(); paintProgress();
        renderChapter(0, { anchorBlock: 0 });
        toast('已清空');
        return true;
      }
    });
    var sv = $('#dlg-save');
    if (sv) { sv.classList.remove('primary'); sv.classList.add('danger'); }
  }

  /* 只清进度，保留书签与笔记 —— 用于「重新读一遍」 */
  function resetProgress() {
    openDialog({
      title: '重置阅读进度',
      body: '<div class="hintline" style="margin:0">总进度与各章进度清零，回到第一章重新计；' +
        '<b>书签与笔记会保留</b>。此操作不可撤销。</div>',
      saveLabel: '重置进度',
      save: function () {
        state.progress = {};
        Store.save(); Store.flush();
        try { localStorage.removeItem(LS_LAST); } catch (e) { }
        renderChapter(0, { anchorBlock: 0 });
        buildToc(); paintProgress(); renderProgressPane();
        toast('进度已重置，从头开始', { icon: ICON.check });
        return true;
      }
    });
    var sv = $('#dlg-save');
    if (sv) { sv.classList.remove('primary'); sv.classList.add('danger'); }
  }

  /* ------------------------------------------------------------ 索引面板 */
  function renderIndexPane() {
    var host = $('#idx-letters'), qv = ($('#idx-q').value || '').trim().toLowerCase();
    var modeBtns = $$('#idx-modes button');
    modeBtns.forEach(function (b) { b.classList.toggle('on', b.dataset.mode === idxMode); });

    if (idxMode === 'head') {
      host.innerHTML = '';
      host.style.display = 'none';
      renderHeadIndexPane(qv);
      return;
    }
    host.style.display = '';

    var bi = buildBookIndex();
    var letters = bi.groups.map(function (g) { return g.letter; });
    var sig = letters.join('') + '|' + idxLetter;
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      host.innerHTML = '<button data-l="ALL" class="' + (idxLetter === 'ALL' ? 'on' : '') + '" style="width:auto;padding:0 8px">全部</button>' +
        letters.map(function (l) {
          return '<button data-l="' + l + '" class="' + (idxLetter === l ? 'on' : '') + '">' + l + '</button>';
        }).join('');
    }

    var out = [];
    bi.groups.forEach(function (g) {
      if (idxLetter !== 'ALL' && g.letter !== idxLetter) return;
      var rows = g.entries.filter(function (e) { return !qv || e.term.toLowerCase().indexOf(qv) >= 0; });
      if (!rows.length) return;
      out.push('<div class="idx-hd">' + g.letter + '</div>');
      rows.forEach(function (e) {
        /* 交叉引用：不编页码，直接给一个跳到目标条目的入口 */
        if (e.see) {
          out.push('<div class="idx-entry">' +
            '<button class="term" data-term="' + esc(e.term) + '">' + esc(e.term) + '</button>' +
            '<span class="pages"><button data-see="' + esc(e.see) + '" title="跳到条目「' + esc(e.see) + '」">see ' +
            esc(e.see) + ' →</button></span></div>');
          return;
        }
        var pages = e.pages.slice(), derived = false;
        if (!pages.length) { pages = pagesForTerm(e.term, 6); derived = pages.length > 0; }
        var h = '<div class="idx-entry">' +
          '<button class="term" data-term="' + esc(e.term) + '">' + esc(e.term) + '</button>' +
          '<span class="pages">';
        if (pages.length) {
          var shown = pages.slice(0, 12);
          h += shown.map(function (p) {
            return '<button data-page="' + p + '" data-term="' + esc(e.term) + '" title="原书 p.' + p +
              (derived ? '（按正文出现位置匹配）' : '') + '">' + p + '</button>';
          }).join('');
          if (pages.length > shown.length) {
            h += '<button data-term="' + esc(e.term) + '" data-all="1" title="还有 ' + (pages.length - shown.length) +
              ' 处，点击在全文里检索" style="color:var(--ink-3)">+' + (pages.length - shown.length) + '</button>';
          }
        } else {
          h += '<button data-term="' + esc(e.term) + '" data-all="1" title="在全文里检索" style="color:var(--ink-3)">全文</button>';
        }
        out.push(h + '</span></div>');
      });
    });
    $('#idx-list').innerHTML = out.length ? out.join('') : '<div class="blankslate">没有匹配的索引条目</div>';
  }

  function renderHeadIndexPane(qv) {
    var rows = buildHeadIndex().filter(function (x) { return !qv || x.text.toLowerCase().indexOf(qv) >= 0; });
    if (!rows.length) { $('#idx-list').innerHTML = '<div class="blankslate">没有匹配的标题</div>'; return; }
    $('#idx-list').innerHTML = rows.slice(0, 400).map(function (x) {
      var c = B.chapters[x.ch], meta = chapterMeta(c);
      var pg = c.blocks[x.block].page;
      return '<button class="idx-head-entry" data-ch="' + x.ch + '" data-b="' + x.block + '">' +
        esc(strip(x.text)) + '<span>' + esc(meta.num + ' ' + truncate(meta.text, 42)) +
        ' · p.' + (pg != null ? pg + 1 : '—') + '</span></button>';
    }).join('');
  }

  /* -------------------------------------------------------------- 检索 */
  function snippet(text, low) {
    var idx = text.toLowerCase().indexOf(low);
    if (idx < 0) {
      var toks = tokenize(low);
      for (var i = 0; i < toks.length; i++) {
        idx = text.toLowerCase().indexOf(toks[i]);
        if (idx >= 0) break;
      }
    }
    if (idx < 0) idx = 0;
    var a = Math.max(0, idx - 55), b = Math.min(text.length, idx + Math.max(low.length, 8) + 95);
    var seg = esc(text.slice(a, b));
    if (low) {
      try {
        seg = seg.replace(new RegExp('(' + low.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
      } catch (e) { }
    }
    return (a > 0 ? '…' : '') + seg + (b < text.length ? '…' : '');
  }

  function runSearch() {
    var v = qEl.value.trim();
    if (!v) { resultsEl.classList.remove('on'); resultsEl.innerHTML = ''; searchResults = []; return; }
    var t0 = (window.performance || Date).now();
    var hits = searchBook(v, 60);
    var ms = Math.round(((window.performance || Date).now()) - t0);
    searchResults = hits; searchSel = -1;
    if (!hits.length) {
      resultsEl.innerHTML = '<div class="empty">没有匹配结果<br><span style="font-size:11px">换个更短的关键词试试</span></div>';
      resultsEl.classList.add('on');
      return;
    }
    var low = v.toLowerCase();
    resultsEl.innerHTML = '<div class="rhd"><span>' + hits.length + ' 条结果</span><span>' + ms + ' ms · 倒排索引</span></div>' +
      hits.map(function (h, i) {
        var d = h.doc;
        return '<div class="hit" data-i="' + i + '">' +
          '<div class="rc"><span>' + esc(String(d.title)) + '</span>' +
          '<em>p.' + (d.page != null ? d.page + 1 : '—') + '</em></div>' +
          '<div class="sn">' + snippet(d.text, low) + '</div></div>';
      }).join('');
    resultsEl.classList.add('on');
  }

  function activateHit(i) {
    var h = searchResults[i];
    if (!h) return;
    resultsEl.classList.remove('on');
    qEl.value = '';
    qEl.blur();
    jumpTo(h.doc.ci, h.doc.j, { flash: true });
  }

  function moveSel(dir) {
    if (!searchResults.length) return;
    searchSel = clamp(searchSel + dir, 0, searchResults.length - 1);
    var items = $$('#results .hit');
    items.forEach(function (d, i) { d.classList.toggle('sel', i === searchSel); });
    if (items[searchSel]) items[searchSel].scrollIntoView({ block: 'nearest' });
  }

  /* -------------------------------------------------------------- 主题 */
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    $('#btn-theme').innerHTML = t === 'dark' ? ICON.sun : ICON.moon;
    var ui = readUI(); ui.theme = t; writeUI(ui);
  }

  /* ================================================================
     网页特有功能
     A. 对照分屏 / 图表内链 / 图集
     B. 术语悬浮卡 + 术语表
     C. 命令面板 / 返回 / 排版 / 专注
     D. 阅读统计打卡 / Anki 导出 / 引用复制
     ================================================================ */

  /* ---------- 图表引用索引（由题注块反查图块） ---------- */
  var REFS = null;
  function nearestImg(ci, at, kind) {
    var blocks = B.chapters[ci].blocks, best = null, bd = 99;
    for (var d = -5; d <= 5; d++) {
      var j = at + d;
      if (j < 0 || j >= blocks.length) continue;
      if (blocks[j].t === 'img' && blocks[j].kind === kind && Math.abs(d) < bd) { best = j; bd = Math.abs(d); }
    }
    return best;
  }
  function buildRefs() {
    if (REFS) return REFS;
    var map = Object.create(null), figs = [];
    for (var ci = 0; ci < B.chapters.length; ci++) {
      var blocks = B.chapters[ci].blocks;
      for (var j = 0; j < blocks.length; j++) {
        var b = blocks[j];
        if (b.t !== 'cap') continue;
        var m = String(b.text || '').match(/\**\s*(Fig(?:ure)?|Table)\.?\s*(\d{1,2}\.\d{1,2})/i);
        if (!m) continue;
        var kind = m[1].charAt(0).toLowerCase() === 't' ? 'tbl' : 'fig';
        var key = kind + ':' + m[2];
        if (map[key]) continue;
        var e = {
          ch: ci, block: j, num: m[2], cap: strip(b.text || '').replace(/\*\*/g, ''),
          img: nearestImg(ci, j, kind), page: b.page
        };
        map[key] = e;
        if (e.img != null) figs.push(e);
      }
    }
    REFS = { map: map, figs: figs };
    return REFS;
  }

  /* ---------- 对照分屏 ---------- */
  var cmpPage = -1, cmpFollow = true;
  var syncCompareSoon = debounce(function () { syncCompare(); }, 450);

  function setCompare(on) {
    document.body.classList.toggle('compare-on', !!on);
    $('#btn-cmp').classList.toggle('on', !!on);
    if (on) {
      closePanel();
      cmpPage = -1;
      syncCompare();
      toast('已开启对照分屏 · 右侧跟随当前阅读位置', { icon: ICON.compare });
    }
    var ui = readUI(); ui.cmp = !!on; writeUI(ui);
  }
  function syncCompare() {
    if (!document.body.classList.contains('compare-on')) return;
    if (!cmpFollow) return;
    if (lastRendered !== cur || lastPage < 0) return;
    if (cmpPage === lastPage) return;
    cmpPage = lastPage;
    $('#cmp-no').textContent = pageLabel(lastPage).txt;
    $('#cmp-frame').src = pdfURL(lastPage);
  }

  /* ---------- 返回上次位置 ---------- */
  var backStack = [], suppressBack = false;
  function pushBack() {
    if (suppressBack || lastRendered < 0) return;
    var pos = { ch: cur, block: currentBlockIndex() };
    var last = backStack[backStack.length - 1];
    if (last && last.ch === pos.ch && last.block === pos.block) return;
    backStack.push(pos);
    if (backStack.length > 80) backStack.shift();
    updateBackBtn();
  }
  function goBack() {
    if (!backStack.length) { toast('没有更早的阅读位置了'); return; }
    var p = backStack.pop();
    suppressBack = true;
    if (p.ch === lastRendered) {
      var el = document.getElementById('c' + p.ch + 'b' + p.block);
      if (el) { scrollToEl(el, 'start'); flashEl(el); }
      tick(true);
    } else renderChapter(p.ch, { anchorBlock: p.block });
    suppressBack = false;
    updateBackBtn();
  }
  function updateBackBtn() {
    var b = $('#btn-back');
    if (!b) return;
    b.classList.toggle('on', backStack.length > 0);
    b.disabled = backStack.length === 0;
  }

  /* ---------- 术语表 ---------- */
  var GLOSS = null, GLOSS_MAP = Object.create(null);
  function glossary() {
    if (GLOSS) return GLOSS;
    var list = (window.NMR_GLOSSARY || []).slice();
    list.forEach(function (g) { GLOSS_MAP[String(g.t).toLowerCase()] = g; });
    list.sort(function (a, b) { return String(b.t).length - String(a.t).length; });
    var alts = list.map(function (g) {
      return String(g.t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|');
    var re = null;
    try { re = new RegExp('(?<![A-Za-z0-9])(' + alts + ')(?![A-Za-z0-9])', 'gi'); }
    catch (e) { re = new RegExp('\\b(' + alts + ')\\b', 'gi'); }
    GLOSS = { list: list, re: re };
    return GLOSS;
  }

  function applyGlossary(ci) {
    var G = glossary();
    if (!G.list.length) return;
    var blocks = B.chapters[ci].blocks;
    for (var j = 0; j < blocks.length; j++) {
      var b = blocks[j];
      if (b.t !== 'p' && b.t !== 'cap') continue;
      if (strip(b.text || '').length < 40) continue;
      var el = document.getElementById('c' + ci + 'b' + j);
      if (el) wrapGlossary(el, G, 8);
    }
  }
  /* 在文本节点层面包覆术语；只加元素不加文字，因此不破坏笔记/高亮的字符偏移 */
  function wrapGlossary(root, G, budget) {
    var nodes = [];
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) nodes.push(c);
        else if (c.nodeType === 1 && c.nodeName !== 'MARK') walk(c);
      }
    })(root);
    for (var i = nodes.length - 1; i >= 0 && budget > 0; i--) {
      var nd = nodes[i], v = nd.nodeValue;
      if (!v || v.length < 5) continue;
      G.re.lastIndex = 0;
      var ms = [], m;
      while ((m = G.re.exec(v)) != null && ms.length < budget) {
        ms.push({ s: m.index, e: m.index + m[0].length, term: m[0] });
        if (m.index === G.re.lastIndex) G.re.lastIndex++;
      }
      for (var k = ms.length - 1; k >= 0 && budget > 0; k--) {
        var o = ms[k];
        if (o.e < v.length) nd.splitText(o.e);
        var mid = o.s > 0 ? nd.splitText(o.s) : nd;
        var sp = document.createElement('span');
        sp.className = 'gterm';
        sp.dataset.term = o.term.toLowerCase();
        sp.title = '';
        mid.parentNode.insertBefore(sp, mid);
        sp.appendChild(mid);
        budget--;
      }
    }
  }

  var gcardTimer = null;
  function hideGCard() {
    var c = $('#gcard');
    if (c) c.classList.remove('on');
    clearTimeout(gcardTimer);
  }
  function showGCard(el) {
    var g = GLOSS_MAP[String(el.dataset.term || '').toLowerCase()];
    if (!g) return;
    var card = $('#gcard');
    card.innerHTML =
      '<div class="gt"><b>' + esc(g.t) + '</b><span>' + esc(g.zh) + '</span></div>' +
      '<div class="gd">' + esc(g.d) + '</div>' +
      '<div class="ga"><button data-act="gsearch">在书中检索</button></div>';
    card.dataset.term = g.t;
    card.classList.add('on');
    var r = el.getBoundingClientRect();
    var w = Math.min(370, window.innerWidth - 24);
    card.style.width = w + 'px';
    var left = clamp(r.left + r.width / 2 - w / 2, 10, Math.max(10, window.innerWidth - w - 10));
    var h = card.offsetHeight || 110;
    var top = r.top - h - 10;
    if (top < 66) top = r.bottom + 12;
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function openGlossPane(term) {
    switchPane($('#side'), 'gloss');
    var inp = $('#gloss-q');
    inp.value = term || '';
    renderGlossPane();
    if (window.innerWidth <= 1080) $('#side').classList.add('on');
  }

  /* 从命令面板/索引跳到「书后索引」并按术语过滤 */
  function filterIndexTo(term) {
    switchPane($('#side'), 'index');
    idxMode = 'book';
    idxLetter = /[A-Za-z]/.test(term.charAt(0)) ? term.charAt(0).toUpperCase() : '#';
    $('#idx-q').value = term;
    renderIndexPane();
    if (window.innerWidth <= 1080) $('#side').classList.add('on');
  }

  function renderGlossPane() {
    var qv = ($('#gloss-q').value || '').trim().toLowerCase();
    var list = glossary().list.filter(function (g) {
      return !qv || (g.t + ' ' + g.zh + ' ' + g.d).toLowerCase().indexOf(qv) >= 0;
    });
    $('#gloss-count').textContent = list.length + ' 条';
    $('#gloss-list').innerHTML = list.length ? list.map(function (g) {
      return '<button class="gloss-item" data-term="' + esc(g.t) + '">' +
        '<span class="gt2"><b>' + esc(g.t) + '</b><em>' + esc(g.zh) + '</em></span>' +
        '<span class="gd2">' + esc(g.d) + '</span></button>';
    }).join('') : '<div class="blankslate">没有匹配的术语</div>';
  }

  /* ---------- 图集 ---------- */
  function renderGallery() {
    var qv = ($('#gal-q').value || '').trim().toLowerCase();
    var figs = buildRefs().figs.filter(function (e) { return e.img != null; });
    var rows = figs.filter(function (e) { return !qv || (e.cap + ' ' + e.num).toLowerCase().indexOf(qv) >= 0; });
    $('#gal-count').textContent = rows.length + ' / ' + figs.length;
    $('#gal-list').innerHTML = rows.length ? rows.slice(0, 500).map(function (e) {
      var b = B.chapters[e.ch].blocks[e.img];
      var meta = chapterMeta(B.chapters[e.ch]);
      return '<button class="gal-item" data-ch="' + e.ch + '" data-b="' + e.img + '" title="' + esc(e.cap) + '">' +
        '<span class="ph"><img loading="lazy" src="../images/' + b.src + '" alt=""></span>' +
        '<span class="gc"><b>' + esc(e.num) + '</b> ' + esc(truncate(e.cap, 46)) + '</span>' +
        '<span class="gm">' + esc(meta.num) + ' · ' + pageLabel(e.page).txt + '</span></button>';
    }).join('') : '<div class="blankslate">没有匹配的图表</div>';
  }

  /* ---------- 命令面板 ---------- */
  var PAL = null, palItems = [], palSel = 0;
  function fzScore(q, s) {
    q = String(q).toLowerCase(); s = String(s).toLowerCase();
    if (!q) return 1;
    var i = -2, score = 0;
    for (var k = 0; k < q.length; k++) {
      var p = s.indexOf(q.charAt(k), i + 1);
      if (p < 0) return -1;
      score += (p === i + 1 ? 3 : 1) + (p === 0 ? 5 : 0) + (/\W/.test(s.charAt(p - 1) || '') ? 1 : 0);
      i = p;
    }
    return score / Math.log(2 + s.length);
  }
  function paletteEntries() {
    if (PAL) return PAL;
    var L = [];
    B.chapters.forEach(function (c, i) {
      L.push({ k: '章', label: c.title, sub: '', act: function () { renderChapter(i); } });
    });
    buildHeadIndex().slice(0, 600).forEach(function (h) {
      var meta = chapterMeta(B.chapters[h.ch]);
      L.push({ k: '节', label: strip(h.text), sub: meta.num + ' ' + meta.text, act: function () { jumpTo(h.ch, h.block, { flash: true }); } });
    });
    buildBookIndex().groups.forEach(function (g) {
      g.entries.forEach(function (e) {
        L.push({ k: '索引', label: e.term, sub: '书后索引', act: function () { filterIndexTo(e.term); } });
      });
    });
    glossary().list.forEach(function (g) {
      L.push({ k: '术语', label: g.t + ' · ' + g.zh, sub: g.d, act: function () { openGlossPane(g.t); } });
    });
    buildRefs().figs.slice(0, 500).forEach(function (e) {
      L.push({
        k: e.num.charAt(0).toLowerCase() === 't' ? '表' : '图',
        label: e.num + '  ' + truncate(e.cap, 56), sub: pageLabel(e.page).txt,
        act: function () { jumpTo(e.ch, e.block, { flash: true }); }
      });
    });
    PAL = L;
    return PAL;
  }
  function openPalette() {
    var items = paletteEntries().slice();
    state.bookmarks.forEach(function (b) {
      items.push({
        k: '书签', label: b.label || '(书签)', sub: pageLabel(b.page).txt + ' · ' + B.chapters[b.chapter].title,
        act: function () { jumpTo(b.chapter, b.block, { flash: true }); }
      });
    });
    state.notes.forEach(function (n) {
      items.push({
        k: '笔记', label: truncate(n.body || n.quote, 60), sub: pageLabel(n.page).txt + ' · ' + B.chapters[n.chapter].title,
        act: function () { jumpTo(n.chapter, n.block, { noteId: n.id, flash: true }); }
      });
    });
    [
      { k: '指令', label: '切换 浅色 / 深色 主题', act: function () { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); } },
      { k: '指令', label: '开启 / 关闭 原书对照分屏', act: function () { setCompare(!document.body.classList.contains('compare-on')); } },
      { k: '指令', label: '专注模式（隐藏两侧栏）', act: function () { toggleZen(); } },
      { k: '指令', label: '排版设置（字号 / 行距 / 版心）', act: function () { toggleTypePop(true); } },
      { k: '指令', label: '导出学习笔记 (Markdown)', act: function () { exportMarkdown(); } },
      { k: '指令', label: '导出 Anki 卡片', act: function () { exportAnki(); } },
      { k: '指令', label: '导出 JSON 备份', act: function () { exportJSON(); } },
      { k: '指令', label: '重置阅读进度（保留书签笔记）', act: function () { resetProgress(); } },
      { k: '指令', label: '回到第一章', act: function () { renderChapter(0); } }
    ].forEach(function (x) { items.push(x); });

    palItems = items; palSel = 0;
    $('#palette').classList.add('on');
    var inp = $('#pal-q');
    inp.value = '';
    runPalette();
    setTimeout(function () { inp.focus(); }, 30);
  }
  function closePalette() {
    $('#palette').classList.remove('on');
    $('#pal-q').value = '';
  }
  function runPalette() {
    var q = ($('#pal-q').value || '').trim();
    var scored = [];
    for (var i = 0; i < palItems.length; i++) {
      var it = palItems[i];
      var s = fzScore(q, it.label + ' ' + (it.sub || ''));
      if (s > 0) scored.push({ it: it, s: s });
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    var rows = scored.slice(0, 30);
    palSel = clamp(palSel, 0, Math.max(0, rows.length - 1));
    $('#pal-list').innerHTML = rows.length ? rows.map(function (r, i) {
      return '<div class="pal-item' + (i === palSel ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="pk">' + esc(r.it.k) + '</span>' +
        '<span class="pl">' + esc(r.it.label) + '</span>' +
        '<span class="ps">' + esc(truncate(r.it.sub || '', 52)) + '</span></div>';
    }).join('') : '<div class="blankslate" style="padding:26px">没有匹配项</div>';
    $('#pal-count').textContent = rows.length ? (rows.length + ' / ' + scored.length) : '';
    $('#pal-q').placeholder = palItems.length + ' 个可跳转目标 · 输入以筛选';
  }
  function palRun(i) {
    var rows = $$('#pal-list .pal-item');
    var el = rows[i];
    if (!el) return;
    var idx = +el.dataset.i;
    var s = $('#pal-q').value;
    var scored = [];
    for (var k = 0; k < palItems.length; k++) {
      var it = palItems[k], sc = fzScore(s, it.label + ' ' + (it.sub || ''));
      if (sc > 0) scored.push({ it: it, s: sc });
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    closePalette();
    if (scored[idx]) scored[idx].it.act();
  }

  /* ---------- 专注模式 ---------- */
  function toggleZen() {
    var on = document.body.classList.toggle('zen');
    $('#btn-zen').classList.toggle('on', on);
    if (on) { closePanel(); $('#side').classList.remove('on'); }
    toast(on ? '专注模式：按 F 或 Esc 退出' : '已退出专注模式', { icon: ICON.zen });
  }

  /* ---------- 排版设置 ---------- */
  function readUI() {
    try { return JSON.parse(localStorage.getItem(LS_UI) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeUI(u) {
    try { localStorage.setItem(LS_UI, JSON.stringify(u)); } catch (e) { }
  }
  function applyType(u) {
    u = u || readUI();
    var r = document.documentElement.style;
    r.setProperty('--read-size', u.size || '17.5px');
    r.setProperty('--read-lh', u.lh || '1.78');
    r.setProperty('--measure', u.measure || '43rem');
  }
  function setType(key, val) {
    var u = readUI(); u[key] = val; writeUI(u); applyType(u);
    $$('#typepop [data-key]').forEach(function (b) {
      if (b.dataset.key === key) b.classList.toggle('on', b.dataset.val === val);
    });
  }
  function toggleTypePop(show) {
    var p = $('#typepop');
    var on = show != null ? show : !p.classList.contains('on');
    p.classList.toggle('on', on);
    if (on) {
      var u = readUI();
      $$('#typepop [data-key]').forEach(function (b) {
        b.classList.toggle('on', (u[b.dataset.key] || b.dataset.def) === b.dataset.val);
      });
    }
  }

  /* ---------- 阅读统计 / 打卡 ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayKey() { return fmtKey(new Date()); }
  function calcStreak() {
    var R = state.meta.reading || {}, d = new Date(), n = 0, i = 0;
    if (!((R[fmtKey(d)] || 0) >= 60)) d.setDate(d.getDate() - 1);
    while ((R[fmtKey(d)] || 0) >= 60 && i < 400) { n++; d.setDate(d.getDate() - 1); i++; }
    return n;
  }
  function heatHTML() {
    var R = state.meta.reading || {}, out = '', d = new Date();
    d.setDate(d.getDate() - 76);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    var now = new Date();
    for (var w = 0; w < 11; w++) {
      out += '<div class="hm-col">';
      for (var r = 0; r < 7; r++) {
        var key = fmtKey(d), s = R[key] || 0;
        var lv = s <= 0 ? 0 : (s < 300 ? 1 : s < 900 ? 2 : s < 1800 ? 3 : 4);
        out += '<i class="lv' + lv + (d > now ? ' fut' : '') + '" title="' + key +
          ' · ' + Math.round(s / 60) + ' 分钟"></i>';
        d.setDate(d.getDate() + 1);
      }
      out += '</div>';
    }
    return out;
  }
  function statCards() {
    var R = state.meta.reading || {}, total = 0, k;
    for (k in R) total += R[k] || 0;
    return {
      today: Math.round((R[todayKey()] || 0) / 60),
      total: Math.round(total / 60),
      streak: calcStreak()
    };
  }
  function startReadingTimer() {
    setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (lastRendered < 0) return;
      var m = state.meta.reading || (state.meta.reading = {});
      var k = todayKey();
      m[k] = (m[k] || 0) + 10;
      if (m[k] % 60 === 0) Store.save();
      var el = $('#stat-today');
      if (el) el.textContent = Math.round((m[k] || 0) / 60) + ' 分钟';
    }, 10000);
  }

  /* ---------- 导出 Anki / 引用复制 ---------- */
  function exportAnki() {
    var rows = state.notes.filter(function (n) { return n.body; }).map(function (n) {
      var front = String(n.quote || '').replace(/\s+/g, ' ').trim();
      var back = String(n.body).replace(/\r?\n/g, '<br>');
      var tag = ['NMR', 'ch' + (n.chapter + 1), 'p' + Math.max(0, n.page - PRINT_OFFSET)].join(' ');
      var clean = function (x) { return String(x).replace(/\t/g, ' ').replace(/\r?\n/g, ' '); };
      return clean(front) + '\t' + clean(back) + '\t' + tag;
    });
    if (!rows.length) { toast('还没有带正文的笔记，无法导出卡片'); return; }
    download('NMR-anki-' + todayKey() + '.txt', rows.join('\n'),
      'text/tab-separated-values;charset=utf-8');
    toast('已导出 ' + rows.length + ' 张 Anki 卡片（制表符分隔）', { icon: ICON.cards });
  }
  function copyCitation() {
    if (!pendingSelection) return;
    var meta = chapterMeta(B.chapters[pendingSelection.chapter]);
    var pl = pageLabel(pendingSelection.page).txt;
    var md = '> ' + pendingSelection.quote + '\n\n— Keeler, *Understanding NMR Spectroscopy* 2nd ed., ' +
      pl + (meta.num ? '（第 ' + meta.num + ' 章）' : '');
    if (navigator.clipboard) navigator.clipboard.writeText(md).catch(function () { });
    toast('已复制为 Markdown 引用', { icon: ICON.quote });
    dismissSelbar();
  }

  /* -------------------------------------------------------------- 启动 */
  function boot() {
    doc = $('#doc'); article = $('#article');
    chapterBar = $('#chapter-bar'); crumb = $('#crumb'); posEl = $('#pos');
    selbar = $('#selbar'); tocList = $('#toc-list'); resultsEl = $('#results');
    qEl = $('#q'); panel = $('#panel'); paneProg = $('#pane-prog');

    /* 静态块填充 */
    $('#b-title').textContent = B.title || 'Reader';
    $('#b-sub').textContent = B.subtitle || '';
    $('#burger').innerHTML = ICON.menu;
    $('#btn-bm').innerHTML = ICON.bookmark + '<span class="badge" id="bm-count">0</span>';
    $('#btn-note').innerHTML = ICON.note + '<span class="badge" id="nt-count">0</span>';
    $('#pager').innerHTML = '<span>原书 <b id="pgno">—</b></span>' +
      '<a class="pbtn" id="pgopen" href="#" target="_blank" rel="noopener">' + ICON.ext + ' 原页对照</a>';
    pgnoEl = $('#pgno'); pgopenEl = $('#pgopen');

    $('#btn-back').innerHTML = ICON.back;
    $('#btn-type').innerHTML = ICON.font;
    $('#btn-cmp').innerHTML = ICON.compare;
    $('#btn-zen').innerHTML = ICON.zen;
    $('#btn-cmp').title = '对照分屏：右侧显示原书对应页（C）';
    $('#btn-zen').title = '专注模式：隐藏两侧栏（F）';
    $('#btn-type').title = '排版设置';
    $('#btn-back').title = '返回上次位置（Backspace）';
    $('#typepop').innerHTML =
      '<div class="tp-row"><label>字号</label><span class="tp-seg">' +
      '<button data-key="size" data-val="16px" data-def="17.5px">小</button>' +
      '<button data-key="size" data-val="17.5px" data-def="17.5px" class="on">中</button>' +
      '<button data-key="size" data-val="19.5px" data-def="17.5px">大</button></span></div>' +
      '<div class="tp-row"><label>行距</label><span class="tp-seg">' +
      '<button data-key="lh" data-val="1.62" data-def="1.78">紧</button>' +
      '<button data-key="lh" data-val="1.78" data-def="1.78" class="on">标准</button>' +
      '<button data-key="lh" data-val="1.95" data-def="1.78">松</button></span></div>' +
      '<div class="tp-row"><label>版心</label><span class="tp-seg">' +
      '<button data-key="measure" data-val="38rem" data-def="43rem">窄</button>' +
      '<button data-key="measure" data-val="43rem" data-def="43rem" class="on">标准</button>' +
      '<button data-key="measure" data-val="52rem" data-def="43rem">宽</button></span></div>';

    $('#compare').innerHTML =
      '<div class="cmp-bar">' +
      '<b>原书对照 <span id="cmp-no">—</span></b>' +
      '<label class="cmp-follow"><input type="checkbox" id="cmp-follow" checked> 跟随阅读</label>' +
      '<span class="spacer"></span>' +
      '<a class="pbtn" id="cmp-open" href="#" target="_blank" rel="noopener">' + ICON.ext + ' 整本</a>' +
      '<button class="pbtn" id="cmp-close">✕</button>' +
      '</div>' +
      '<iframe id="cmp-frame" title="原书对照" src="about:blank"></iframe>';

    selbar.innerHTML =
      COLORS.map(function (c) {
        return '<button class="dot c-' + c + '" data-color="' + c + '" title="' + COLOR_NAME[c] + '高亮"></button>';
      }).join('') +
      '<span class="sep"></span>' +
      '<button data-act="highlight">' + ICON.highlight + ' 高亮</button>' +
      '<button data-act="note">' + ICON.note + ' 笔记</button>' +
      '<button data-act="quote" title="复制为 Markdown 引用">' + ICON.quote + ' 引用</button>' +
      '<button data-act="copy">' + ICON.copy + ' 复制</button>' +
      '<span class="sep"></span>' +
      '<button data-act="pin" title="固定 / 取消固定（固定时工具条不会自动消失）">' + ICON.pin + '</button>' +
      '<button data-act="cancel" title="收起（Esc）">' + ICON.cancel + '</button>';

    /* ---- 顶栏 ---- */
    qEl.addEventListener('input', debounce(runSearch, 140));
    qEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { qEl.value = ''; runSearch(); qEl.blur(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); activateHit(searchSel >= 0 ? searchSel : 0); }
    });
    resultsEl.addEventListener('mousedown', function (e) {
      var d = e.target.closest('.hit');
      if (!d) return;
      e.preventDefault();
      activateHit(+d.dataset.i);
    });
    document.addEventListener('click', function (e) {
      if (!resultsEl.contains(e.target) && e.target !== qEl) resultsEl.classList.remove('on');
    });

    $('#burger').onclick = function () { $('#side').classList.toggle('on'); };
    $('#btn-theme').onclick = function () {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    };
    $('#btn-bm').onclick = function () { addBookmark(); };
    $('#btn-note').onclick = function () {
      if (document.body.classList.contains('panel-on') && $('#pane-nt').classList.contains('on')) closePanel();
      else openPanel('nt');
    };
    $('#ring').onclick = function () {
      if (document.body.classList.contains('panel-on') && paneProg.classList.contains('on')) closePanel();
      else openPanel('prog');
    };

    /* ---- 左栏 ---- */
    $('#side').addEventListener('click', function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;
      var tab = t.closest('.tabs .tab');
      if (tab) {
        switchPane($('#side'), tab.dataset.pane);
        if (tab.dataset.pane === 'index') renderIndexPane();
        else if (tab.dataset.pane === 'gloss') renderGlossPane();
        else if (tab.dataset.pane === 'gal') renderGallery();
        return;
      }
      var gloss = t.closest('.gloss-item');
      if (gloss) {
        var gt = gloss.dataset.term;
        $('#q').value = gt;
        runSearch();
        return;
      }
      var gal = t.closest('.gal-item');
      if (gal) { pushBack(); jumpTo(+gal.dataset.ch, +gal.dataset.b, { flash: true }); return; }
      var mode = t.closest('#idx-modes button');
      if (mode) { idxMode = mode.dataset.mode; renderIndexPane(); return; }
      var letter = t.closest('#idx-letters button[data-l]');
      if (letter) { idxLetter = letter.dataset.l; renderIndexPane(); return; }
      var head = t.closest('.idx-head-entry');
      if (head) { jumpTo(+head.dataset.ch, +head.dataset.b, { flash: true }); return; }
      var see = t.closest('#idx-list button[data-see]');
      if (see) {
        var target = see.dataset.see;
        $('#idx-q').value = target;
        idxLetter = /[A-Za-z]/.test(target.charAt(0)) ? target.charAt(0).toUpperCase() : '#';
        renderIndexPane();
        return;
      }
      var pg = t.closest('#idx-list button[data-page]');
      if (pg) { jumpToPrintedPage(+pg.dataset.page, pg.dataset.term); return; }
      var termBtn = t.closest('#idx-list button[data-term]');
      if (termBtn) {
        var term = termBtn.dataset.term;
        $('#idx-q').value = term;
        var letter2 = /[A-Za-z]/.test(term.charAt(0)) ? term.charAt(0).toUpperCase() : '#';
        idxLetter = letter2;
        renderIndexPane();
        return;
      }
      var sub = t.closest('.ch-sub a');
      if (sub) {
        e.preventDefault();
        var ci = +sub.dataset.ch, bj = +sub.dataset.b;
        if (ci === lastRendered) {
          var el = document.getElementById('c' + ci + 'b' + bj);
          if (el) { scrollToEl(el, 'start'); flashEl(el); tick(true); }
        } else renderChapter(ci, { anchorId: 'c' + ci + 'b' + bj });
        return;
      }
      var row = t.closest('.ch-row');
      if (row) {
        var ch = +row.dataset.ch;
        if (ch === lastRendered) doc.scrollTo({ top: 0, behavior: 'smooth' });
        else { pushBack(); renderChapter(ch); }
      }
    });
    $('#idx-q').addEventListener('input', debounce(renderIndexPane, 150));
    $('#gloss-q').addEventListener('input', debounce(renderGlossPane, 140));
    $('#gal-q').addEventListener('input', debounce(renderGallery, 140));
    $('#idx-modes').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (!b) return;
      idxMode = b.dataset.mode;
      renderIndexPane();
    });

    /* ---- 右栏 ---- */
    panel.addEventListener('click', function (e) {
      var tab = e.target.closest('.tabs .tab');
      if (tab) {
        if (tab.classList.contains('on')) { closePanel(); return; }   /* 再点一次收起 */
        switchPane(panel, tab.dataset.pane);
        syncHeaderBtns();
        if (tab.dataset.pane === 'prog') renderProgressPane();
        return;
      }
      var add = e.target.closest('[data-act="add-bm"]');
      if (add) addBookmark();
    });

    /* ---- 正文 ---- */
    doc.addEventListener('click', function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;
      var img = t.closest('figure img');
      if (img) { $('#zoomi').src = img.src; $('#zoom').classList.add('on'); return; }
      var pl = t.closest('.pglink');
      if (pl) { e.preventDefault(); window.open(pdfURL(+pl.dataset.page), '_blank'); return; }
      var il = t.closest('a.inlink');
      if (il) {
        e.preventDefault();
        if (il.dataset.ref) jumpToRef(il.dataset.ref);
        else { pushBack(); jumpToPrintedPage(+il.dataset.printed); }
        return;
      }
      var gterm = t.closest('.gterm');
      if (gterm) { showGCard(gterm); return; }
      var mk = t.closest('mark.hl[data-nid]');
      if (mk) {
        var found = null;
        state.notes.forEach(function (n) { if (n.id === mk.dataset.nid) found = n; });
        if (found) openNoteDialog(found, false);
        return;
      }
      var foot = t.closest('#chap-foot button[data-go]');
      if (foot) { renderChapter(+foot.dataset.go); return; }
      /* 未固定时：点正文其他位置且选区已塌陷 → 收起；固定时保留 */
      if (!t.closest('#selbar') && !selPinned && !selectionAlive()) hideSelbar();
    });

    /* ---- 划词条 ---- */
    selbar.addEventListener('mousedown', function (e) { e.preventDefault(); });
    selbar.addEventListener('click', function (e) {
      var dot = e.target.closest('.dot');
      if (dot) { createFromSelection(dot.dataset.color, false); return; }
      var act = e.target.closest('button[data-act]');
      if (!act) return;
      var a = act.dataset.act;
      if (a === 'pin') {
        selPinned = !selPinned;
        selbar.classList.toggle('pin', selPinned);
        toast(selPinned ? '工具条已固定：不会自动消失（Esc 或 ✕ 收起）'
                        : '已取消固定：点开正文其他位置会自动收起', { icon: ICON.pin });
        return;
      }
      if (a === 'highlight') createFromSelection(selbar.dataset.color || lastColor, false);
      else if (a === 'note') createFromSelection(selbar.dataset.color || lastColor, true);
      else if (a === 'quote') copyCitation();
      else if (a === 'copy') {
        var q = pendingSelection ? pendingSelection.quote : '';
        if (q && navigator.clipboard) navigator.clipboard.writeText(q).catch(function () { });
        toast('已复制');
        dismissSelbar();
      } else dismissSelbar();
    });

    document.addEventListener('selectionchange', debounce(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { hideSelbar(); return; }  /* 固定时保留 */
      var range = sel.getRangeAt(0);
      if (!article.contains(range.startContainer) || !article.contains(range.endContainer)) { hideSelbar(); return; }
      var b1 = blockElOf(range.startContainer), b2 = blockElOf(range.endContainer);
      if (!b1 || b1 !== b2) { hideSelbar(); return; }
      showSelbar(range, b1);
    }, 70));

    $('#zoom').addEventListener('click', function () {
      $('#zoom').classList.remove('on');
      $('#zoomi').src = '';
    });

    $('#modal').addEventListener('click', function (e) {
      if (e.target.id === 'modal' || e.target.closest('[data-close]')) { closeDialog(); return; }
      if (e.target.closest('#dlg-save')) {
        var ok = dialogSave ? dialogSave() : true;
        if (ok !== false) closeDialog();
      }
    });

    $('#bm-list').addEventListener('click', function (e) {
      var item = e.target.closest('.item');
      if (!item) return;
      var id = item.dataset.id, bm = null;
      state.bookmarks.forEach(function (b) { if (b.id === id) bm = b; });
      if (!bm) return;
      var act = e.target.closest('[data-act]');
      var a = act ? act.dataset.act : 'jump';
      if (a === 'jump') jumpTo(bm.chapter, bm.block, { flash: true });
      else if (a === 'rename') renameBookmark(id);
      else if (a === 'del') {
        state.bookmarks = state.bookmarks.filter(function (b) { return b.id !== id; });
        Store.save(); renderBookmarks(); renderCounts();
        toast('已删除书签');
      }
    });

    $('#nt-list').addEventListener('click', function (e) {
      var item = e.target.closest('.item');
      if (!item) return;
      var id = item.dataset.id, n = null;
      state.notes.forEach(function (x) { if (x.id === id) n = x; });
      if (!n) return;
      var act = e.target.closest('[data-act]');
      var a = act ? act.dataset.act : 'jump';
      if (a === 'jump') {
        if (n.chapter === lastRendered) { highlightNoteMark(n.id); tick(true); }
        else renderChapter(n.chapter, { anchorId: 'c' + n.chapter + 'b' + n.block });
        if (n.chapter !== lastRendered) setTimeout(function () { highlightNoteMark(n.id); }, 120);
      } else if (a === 'edit') openNoteDialog(n, false);
      else if (a === 'copy') {
        var txt = (n.quote ? '> ' + n.quote + '\n\n' : '') + n.body;
        if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () { });
        toast('已复制');
      } else if (a === 'del') deleteNote(id);
    });

    paneProg.addEventListener('click', function (e) {
      var row = e.target.closest('.bar-row');
      if (row) { renderChapter(+row.dataset.ch); return; }
      var a = e.target.closest('button[data-act]');
      if (!a) return;
      var act = a.dataset.act;
      if (act === 'export-md') exportMarkdown();
      else if (act === 'anki') exportAnki();
      else if (act === 'export-json') exportJSON();
      else if (act === 'import') importJSON();
      else if (act === 'reset-progress') resetProgress();
      else if (act === 'reset') resetAll();
    });

    /* ---- 滚动 ---- */
    doc.addEventListener('scroll', function () {
      requestAnimationFrame(function () { tick(false); reanchorSelbar(); });
      chapterBar.classList.toggle('stuck', doc.scrollTop > 8);
      hideGCard();
    }, { passive: true });
    window.addEventListener('resize', debounce(function () { updatePager(); reanchorSelbar(); }, 180));

    /* ---- 术语悬浮卡 ---- */
    article.addEventListener('mouseover', function (e) {
      if (!(e.target instanceof Element)) return;
      var g = e.target.closest('.gterm');
      if (g) { clearTimeout(gcardTimer); showGCard(g); }
      else hideGCard();
    });
    article.addEventListener('mouseout', function (e) {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest('.gterm')) {
        clearTimeout(gcardTimer);
        gcardTimer = setTimeout(hideGCard, 220);
      }
    });
    $('#gcard').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act="gsearch"]');
      if (!b) return;
      var term = $('#gcard').dataset.term || '';
      hideGCard();
      $('#q').value = term;
      runSearch();
      qEl.focus();
    });

    /* ---- 排版设置 ---- */
    applyType();
    $('#btn-type').onclick = function (e) { e.stopPropagation(); toggleTypePop(); };
    $('#typepop').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-key]');
      if (b) { setType(b.dataset.key, b.dataset.val); e.stopPropagation(); }
    });
    document.addEventListener('click', function (e) {
      if (e.target instanceof Element && !e.target.closest('#typepop') && !e.target.closest('#btn-type')) {
        toggleTypePop(false);
      }
    });

    /* ---- 对照分屏 ---- */
    $('#btn-cmp').onclick = function () {
      setCompare(!document.body.classList.contains('compare-on'));
    };
    $('#cmp-close').onclick = function () { setCompare(false); };
    $('#cmp-follow').addEventListener('change', function () {
      cmpFollow = $('#cmp-follow').checked;
      if (cmpFollow) { cmpPage = -1; syncCompare(); }
    });
    $('#cmp-open').addEventListener('click', function () {
      $('#cmp-open').href = pdfURL(lastPage >= 0 ? lastPage : (B.chapters[cur].page0 || 0));
    });

    /* ---- 返回 / 专注 ---- */
    $('#btn-back').onclick = goBack;
    $('#btn-zen').onclick = toggleZen;

    /* ---- 命令面板 ---- */
    $('#pal-q').addEventListener('input', function () { palSel = 0; runPalette(); });
    $('#pal-q').addEventListener('keydown', function (e) {
      var rows = $$('#pal-list .pal-item');
      if (e.key === 'Escape') { closePalette(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); palSel = clamp(palSel + 1, 0, rows.length - 1); runPalette(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); palSel = clamp(palSel - 1, 0, rows.length - 1); runPalette(); }
      if (e.key === 'Enter') { e.preventDefault(); palRun(palSel); }
    });
    $('#pal-list').addEventListener('click', function (e) {
      var it = e.target.closest('.pal-item');
      if (it) palRun(+it.dataset.i);
    });
    $('#palette').addEventListener('mousedown', function (e) {
      if (e.target.id === 'palette') closePalette();
    });

    /* ---- 快捷键 ---- */
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if (e.key === 'Escape') {
        if ($('#palette').classList.contains('on')) { closePalette(); return; }
        if ($('#zoom').classList.contains('on')) { $('#zoom').classList.remove('on'); return; }
        if ($('#modal').classList.contains('on')) { closeDialog(); return; }
        if (document.body.classList.contains('zen')) { toggleZen(); return; }
        if (document.body.classList.contains('compare-on')) { setCompare(false); return; }
        toggleTypePop(false);
        if (selbar.classList.contains('on')) { dismissSelbar(); return; }
        return;
      }
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if ($('#palette').classList.contains('on')) closePalette(); else openPalette();
        return;
      }
      if (e.key === '/' && !typing) { e.preventDefault(); qEl.focus(); qEl.select(); return; }
      if (e.key === 'Backspace' && !typing) { e.preventDefault(); goBack(); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); addBookmark(); return; }
      if (e.key === 'n' || e.key === 'N') { openPanel('nt'); return; }
      if (e.key === 'c' || e.key === 'C') { setCompare(!document.body.classList.contains('compare-on')); return; }
      if (e.key === 'f' || e.key === 'F') { toggleZen(); return; }
      if (e.key === 'p' || e.key === 'P') { openPalette(); return; }
      if (e.key === 't' || e.key === 'T') {
        setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
        return;
      }
      if (e.key === 'i' || e.key === 'I') { openPanel('prog'); switchPane($('#side'), 'index'); renderIndexPane(); return; }
      if (e.key === 'ArrowLeft') { pushBack(); renderChapter(cur - 1); return; }
      if (e.key === 'ArrowRight') { pushBack(); renderChapter(cur + 1); return; }
      if (e.key === 'g') { doc.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (e.key === 'G') { doc.scrollTo({ top: doc.scrollHeight, behavior: 'smooth' }); return; }
    });

    window.addEventListener('pagehide', function () { Store.flush(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) Store.flush(); });

    /* ---- 载入 ---- */
    Store.init(function () {
      var startCh = 0;
      try {
        var s = localStorage.getItem(LS_LAST);
        if (s != null && +s < B.chapters.length && state.progress[s]) startCh = +s;
        else if (s != null && +s < B.chapters.length) startCh = +s;
      } catch (e) { }
      var p = state.progress[String(startCh)];
      var anchor = p ? p.block : 0;
      renderChapter(startCh, { anchorBlock: anchor });
      renderCounts(); renderBookmarks(); renderNotes();
      renderProgressPane(); paintProgress();
      $('#boot').classList.add('out');
      setTimeout(function () { var b = $('#boot'); if (b) b.remove(); }, 400);
      if (anchor > 2) {
        toast('已回到上次阅读位置 · ' + truncate(chapterMeta(B.chapters[startCh]).text, 26), { ms: 2800 });
      }
      /* 后台预热索引，避免首次检索卡顿 */
      setTimeout(function () {
        try { buildHeadIndex(); buildPageMap(); buildRefs(); } catch (e) { }
      }, 400);
      setTimeout(function () { try { buildSearchIndex(); } catch (e) { } }, 1600);
      startReadingTimer();
      var ui0 = readUI();
      if (ui0.cmp) setCompare(true);
    });
  }

  if (!B || !B.chapters || !B.chapters.length) {
    var fail = function () {
      var b = document.getElementById('boot');
      if (b) b.innerHTML = '<div class="empty-state">未找到 <code>data.js</code><br>请确认它与本页面在同一目录。</div>';
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fail);
    else fail();
    return;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
