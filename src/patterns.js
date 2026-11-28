// PII Guard - detection rules. Pure text processing; nothing here talks to anything.
// Each rule can be switched on or off in the Settings page. To add a built-in rule,
// add an entry to RULES at the bottom of this file.
(function (root) {
  'use strict';

  // ---------- settings ----------
  var DEFAULTS = {
    rules: {
      names: true, titled: true, email: true, numbers: true,
      dates: true, addresses: true, urls: true, ips: true, ages: true,
      labeledIds: true, vin: true, mixedIds: true
    },
    minDigits: 5,
    patterns: []        // [{label:'COURSE', regex:'FIN\\d{3}', ignoreCase:true, enabled:true}]
  };
  var config = null;
  var compiledPatterns = [];

  function setConfig(c) {
    c = c || {};
    var rules = {};
    Object.keys(DEFAULTS.rules).forEach(function (k) {
      rules[k] = c.rules && typeof c.rules[k] === 'boolean' ? c.rules[k] : DEFAULTS.rules[k];
    });
    var md = parseInt(c.minDigits, 10);
    config = {
      rules: rules,
      minDigits: md >= 1 && md <= 20 ? md : DEFAULTS.minDigits,
      custom: (c.custom || []).map(String).filter(Boolean),
      ignore: (c.ignore || []).map(String).filter(Boolean)
    };
    compiledPatterns = [];
    (c.patterns || []).forEach(function (p) {
      if (!p || p.enabled === false) return;
      var re = compilePattern(p);
      if (re) compiledPatterns.push({ type: cleanLabel(p.label), re: re });
    });
  }
  function cleanLabel(label) {
    var s = String(label || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    if (!/^[A-Z]/.test(s)) s = 'X' + s;
    return s.length >= 2 ? s : 'CUSTOM';
  }
  // Returns a RegExp, or null if the pattern is invalid.
  function compilePattern(p) {
    try { return new RegExp(String(p.regex), 'gu' + (p.ignoreCase ? 'i' : '')); }
    catch (e) { return null; }
  }

  // ---------- shared pieces ----------
  // Any placeholder this tool writes: [NAME_1], [DATE_3], [COURSE_2] ...
  var PLACEHOLDER = /\[[A-Z][A-Z0-9]{1,15}_\d+\]/g;
  var NW = '(?<![\\p{L}\\p{N}_])';          // not preceded by a letter or digit
  var NE = '(?![\\p{L}\\p{N}_])';           // not followed by a letter or digit

  function key(text) { return text.toLowerCase().replace(/\s+/g, ' ').trim(); }
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function digits(s) { return (s.match(/\d/g) || []).length; }

  function findAll(re, text, type, out, filter) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      var hit = { start: m.index, end: m.index + m[0].length, type: type, text: m[0] };
      if (!filter || filter(hit, m)) out.push(hit);
    }
  }
  // Like findAll, but flags only capture group 1 (used for "label: value").
  function findGroup(re, text, type, out, filter) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (!m[1]) continue;
      var start = m.index + m[0].lastIndexOf(m[1]);
      var hit = { start: start, end: start + m[1].length, type: type, text: m[1] };
      if (!filter || filter(hit)) out.push(hit);
    }
  }

  // ---------- general rules ----------
  var EMAIL = /[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}.\-]+\.\p{L}{2,}/gu;
  // Separators allowed inside one number: . , / with no space (not ':' so times stay out),
  // a dash with optional spaces, or one space.
  var NUMBER = /(?:\+|\(\d+\)[  \-]?)?\d+(?:(?:[.,\/]|[  ]?-[  ]?|[  ])\d+)*/g;

  var TITLES = '(?:Dr|Mr|Mrs|Ms|Mx|Miss|Prof|Professor|Dean|Sir|Madam|Rev|Fr|Sr|Sra|Srta|Don|Doña)';
  var PARTICLES = '(?:de|del|della|da|das|do|dos|di|du|van|von|der|den|ter|la|le|bin|ibn|al|el|y)';
  var CAPWORD = "\\p{Lu}[\\p{L}'’\\-]*\\p{L}";   // ends in a letter, so "GPT-4o" gives "GPT"
  var INITIAL = '\\p{Lu}\\.';
  var GAP = '[ \\t\\u00A0]+';
  var MORE = '(?:' + GAP + '(?:' + PARTICLES + GAP + ')*(?:' + CAPWORD + '|' + INITIAL + '))*';
  var TITLED = new RegExp(NW + TITLES + '\\.?' + GAP + CAPWORD + MORE, 'gu');
  var CAPRUN = new RegExp(NW + CAPWORD + MORE, 'gu');
  var TITLE_WORD = new RegExp('^' + TITLES + '\\.?$', 'u');

  // Capitalized words that are not names: trimmed from the edges of a run, skipped when alone.
  var STOP = new Set(('the a an this that these those there here it its he she we they you i my our your his her their ' +
    'if in on at to of for from by with as is are was were be been and or but so not no yes do does did has have had ' +
    'will would can could should may might must shall when where what who whom whose why how which while after before ' +
    'because since until although though also then than thus however therefore please thanks thank hello hi dear regards ' +
    'sincerely best all any each every some many most more other another both either neither one two three first second ' +
    'last next new now today tomorrow yesterday let lets see note re subject meet ask call email tell send ' +
    'monday tuesday wednesday thursday friday saturday sunday ' +
    'january february march april may june july august september october november december ' +
    // month and weekday names in Spanish, Portuguese, French and German (a capitalised one is not a name)
    'enero febrero marzo abril mayo junio julio agosto septiembre setiembre octubre noviembre diciembre ' +
    'lunes martes mi\u00e9rcoles miercoles jueves viernes s\u00e1bado sabado domingo ' +
    'janeiro fevereiro mar\u00e7o marco maio junho julho setembro outubro novembro dezembro ' +
    'segunda ter\u00e7a terca quarta quinta sexta segunda-feira ter\u00e7a-feira terca-feira quarta-feira quinta-feira sexta-feira ' +
    'janvier f\u00e9vrier fevrier mars avril mai juin juillet ao\u00fbt aout septembre octobre novembre d\u00e9cembre decembre ' +
    'lundi mardi mercredi jeudi vendredi samedi dimanche ' +
    'januar j\u00e4nner janner februar feber m\u00e4rz marz maerz juni juli oktober dezember ' +
    'montag dienstag mittwoch donnerstag freitag samstag sonnabend sonntag').split(' '));

  function isSentenceStart(text, index) {
    var i = index - 1;
    while (i >= 0 && /[ \t "'“‘(\[]/.test(text[i])) i--;
    return i < 0 || /[.!?:;\n\r•\-*]/.test(text[i]);
  }

  function findNames(text, out, ignoreSet) {
    CAPRUN.lastIndex = 0;
    var m;
    while ((m = CAPRUN.exec(text)) !== null) {
      var whole = m[0], start = m.index;
      var words = [], w, wre = /\S+/g;
      while ((w = wre.exec(whole)) !== null) words.push({ t: w[0], s: w.index, e: w.index + w[0].length });
      var isStop = function (x) {
        var bare = x.t.toLowerCase().replace(/['’].*$/, '');
        return TITLE_WORD.test(x.t) || STOP.has(bare) || ignoreSet.has(x.t.toLowerCase()) || ignoreSet.has(bare);
      };
      while (words.length && isStop(words[0])) words.shift();
      while (words.length && isStop(words[words.length - 1])) words.pop();
      if (!words.length) continue;
      var s = start + words[0].s, e = start + words[words.length - 1].e;
      var piece = text.slice(s, e);
      if (words.length === 1) {
        if (/^\p{Lu}+$/u.test(piece)) continue;            // lone acronym: FERPA, PDF
        if (isSentenceStart(text, s)) continue;             // lone word opening a sentence
      }
      out.push({ start: s, end: e, type: 'NAME', text: piece });
    }
  }

  function findTermList(list, type, text, out) {
    var terms = list.map(function (s) { return s.trim(); }).filter(Boolean);
    if (!terms.length) return;
    terms.sort(function (a, b) { return b.length - a.length; });
    findAll(new RegExp(NW + '(?:' + terms.map(escapeRegExp).join('|') + ')' + NE, 'giu'), text, type, out);
  }

  // ---------- HIPAA rules ----------
  // Month and weekday names in English, Spanish, Portuguese, French and German, with and without accents.
  // Case is ignored, so "november", "November" and "NOVEMBER" all count.
  var MONTH_NAME = '(?:' +
    'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?' +
    '|enero|ene|febrero|marzo|abril|abr|mayo|junio|julio|agosto|sept?iembre|setiembre|octubre|noviembre|diciembre|dic' +   // es
    '|janeiro|fevereiro|fev|mar[cç]o|maio|junho|julho|setembro|outubro|novembro|dezembro|dez' +                       // pt
    '|janvier|janv|f[eé]vrier|f[eé]vr|mars|avril|avr|mai|juin|juillet|juil|ao[uû]t|septembre|octobre|novembre|d[eé]cembre|d[eé]c' + // fr
    '|Januar|J[aä]nner|Februar|Feber|M[aä]rz|Maerz|Mär|Juni|Juli|Oktober|Okt|Dezember' +                     // de
    ')';
  var MONTH = MONTH_NAME + '\\.?';
  var WEEKDAY = '(?:' +
    'Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?' +
    '|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo' +                                              // es
    '|(?:segunda|ter[cç]a|quarta|quinta|sexta)(?:-feira)?' +                                                          // pt
    '|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche' +                                                               // fr
    '|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonnabend|Sonntag' +                                             // de
    ')\\.?';
  var ON_DAY = '(?:' + WEEKDAY + ',?\\s+(?:(?:the|el|le|der|den)\\s+)?)?';     // "Monday, ", "lunes ", "Montag, den "
  var DAY = '(?:[12]\\d|3[01]|0?[1-9])(?:st|nd|rd|th|er|º|°)?';      // 3rd, 1er (fr), 1º (es, pt)
  var YEAR = "(?:\\d{4}|'\\d{2})";
  var YEAR_AFTER_DAY = "(?:\\d{4}|'?\\d{2})";                                  // "24 Nov 24" has a two-digit year
  var JOIN_YEAR = '(?:,?\\s+|\\s+(?:of|de|del)\\s+)';                         // "November 2024", "November of 2024", "noviembre de 2024"
  var DATE_WORDS = new RegExp(NW + '(?:' +
    ON_DAY + MONTH + '\\s+' + DAY + '(?:,?\\s+' + YEAR + ')?' +                                   // (Monday,) March 3, 2024 / Mar. 3rd
    '|' + ON_DAY + DAY + '\\.?(?:\\s+(?:of|de))?\\s+' + MONTH + '(?:' + JOIN_YEAR + YEAR_AFTER_DAY + ')?' + // 3 March 2024 / 3rd of March / 24 de noviembre de 2024 / 24. November 2024
    '|' + MONTH + JOIN_YEAR + '\\d{4}' +                                                           // March 2024 / noviembre de 2024
    '|' + DAY + '[\\-\\/]' + MONTH_NAME + '[\\-\\/]' + YEAR_AFTER_DAY +                             // 24-Nov-2024
    '|' + MONTH_NAME + '[\\-\\/]' + DAY + '[\\-\\/]' + YEAR_AFTER_DAY +                             // Nov-24-2024
    ')' + NE, 'giu');
  var DATE_NUMERIC = new RegExp(NW + '(?:' +
    '\\d{4}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\\d|3[01])' +                           // 2024-03-14
    '|(?:0?[1-9]|1[0-2])([\\/\\-.])(?:0?[1-9]|[12]\\d|3[01])\\1(?:\\d{4}|\\d{2})' +      // 3/14/2024, 03-14-24
    '|(?:0?[1-9]|[12]\\d|3[01])([\\/\\-.])(?:0?[1-9]|1[0-2])\\2(?:\\d{4}|\\d{2})' +      // 14/03/2024
    '|(?:0?[1-9]|1[0-2])\\/(?:0?[1-9]|[12]\\d|3[01])' +                               // 3/14
    ')(?![\\p{L}\\p{N}_\\/])', 'gu');

  var STREET_SUFFIX = '(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Parkway|Pkwy|' +
    'Highway|Hwy|Terrace|Ter|Circle|Cir|Square|Sq|Trail|Trl|Pike|Route|Rte|Loop|Alley|Crescent|Close|Walk|Plaza|Turnpike|Tpke)\\.?';
  var STREET_WORD = "(?:\\p{Lu}[\\p{L}'\\-]*|\\d+(?:st|nd|rd|th))";
  var UNIT = '(?:,?\\s*(?:Apt|Apartment|Suite|Ste|Unit|Fl|Floor|Rm|Room|#)\\.?\\s*#?\\s*[A-Za-z0-9\\-]+)?';
  var CITY_STATE_ZIP = '(?:,\\s*\\p{Lu}[\\p{L}\\-]*(?:\\s+\\p{Lu}[\\p{L}\\-]*){0,2})?(?:,?\\s+[A-Z]{2})?(?:\\s+\\d{5}(?:-\\d{4})?)?';
  var ADDRESS = new RegExp(NW + '\\d{1,6}[A-Za-z]?\\s+(?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\\.?\\s+)?' +
    '(?:' + STREET_WORD + '\\s+){0,4}' + STREET_WORD + '\\s+' + STREET_SUFFIX + NE + UNIT + CITY_STATE_ZIP, 'gu');
  var PO_BOX = new RegExp(NW + 'P\\.?\\s?O\\.?\\s*Box\\s+\\d+', 'giu');

  var URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
  var IPV4 = /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.]*\d)/g;
  var IPV6 = /(?<![\w:])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?|::(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})(?![\w:])/gi;

  var AGE = new RegExp(NW + '(?:' +
    '(?:age[ds]?|aged)\\s*:?\\s*(?:9\\d|1[0-4]\\d)' +
    '|(?:9\\d|1[0-4]\\d)[\\s\\-]*(?:years?|yrs?|y\\/o|yo)(?:[\\s\\-]*old)?' +
    ')' + NE, 'giu');

  var ID_LABEL = '(?:MRN|medical\\s+record|record|chart|account|acct|policy|member|subscriber|patient|student|employee|' +
    'beneficiary|health\\s+plan|insurance|claim|case|certificate|license|licence|lic|DL|driver\'?s\\s+license|plate|' +
    'serial|device|NPI|DEA|SSN|SIN|passport|ID)';
  var LABELED_ID = new RegExp(NW + ID_LABEL + '(?:\\s*(?:ID|number|num|no\\.?|#))?\\s*[:#]?\\s*' +
    '([A-Za-z0-9][A-Za-z0-9\\-]{1,24})' + NE, 'giu');
  var VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
  var MIXED_ID = /(?<![\p{L}\p{N}_\-])[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?![\p{L}\p{N}_\-])/gu;

  // ---------- the rule list (order = priority when two findings overlap) ----------
  var RULES = [
    { id: 'email', run: function (t, o) { findAll(EMAIL, t, 'EMAIL', o); } },
    { id: 'urls', run: function (t, o) {
        findAll(URL_RE, t, 'URL', o);
        o.forEach(function (h) {                       // drop trailing punctuation
          var trimmed = h.text.replace(/[.,;:!?)\]}]+$/, '');
          h.end -= h.text.length - trimmed.length; h.text = trimmed;
        });
      } },
    { id: '*patterns', run: function (t, o) {
        compiledPatterns.forEach(function (p) { findAll(p.re, t, p.type, o); });
      } },
    { id: '*custom', run: function (t, o) {
        findTermList((root.PII_GUARD_ROSTER || []).concat(config.custom), 'NAME', t, o);
      } },
    { id: 'ips', run: function (t, o) { findAll(IPV4, t, 'IP', o); findAll(IPV6, t, 'IP', o, function (h) { return /[a-f]|::/i.test(h.text) || h.text.split(':').length === 8; }); } },
    { id: 'dates', run: function (t, o) {
        // lowercase "may 3" / "mar 3" with no year is far more often the verb or a word than a date ("you may 3 times")
        findAll(DATE_WORDS, t, 'DATE', o, function (h) { return !/^(?:may|mar)\.?\s+\d{1,2}(?:st|nd|rd|th)?$/.test(h.text); });
        findAll(DATE_NUMERIC, t, 'DATE', o);
      } },
    { id: 'ages', run: function (t, o) { findAll(AGE, t, 'AGE', o); } },
    { id: 'addresses', run: function (t, o) { findAll(ADDRESS, t, 'ADDRESS', o); findAll(PO_BOX, t, 'ADDRESS', o); } },
    { id: 'labeledIds', run: function (t, o) {
        findGroup(LABELED_ID, t, 'ID', o, function (h) { return /\d/.test(h.text); });
      } },
    { id: 'vin', run: function (t, o) { findAll(VIN, t, 'ID', o, function (h) { return /\d/.test(h.text) && /[A-Z]/.test(h.text); }); } },
    { id: 'numbers', run: function (t, o) { findAll(NUMBER, t, 'NUMBER', o, function (h) { return digits(h.text) >= config.minDigits; }); } },
    { id: 'mixedIds', run: function (t, o) {
        findAll(MIXED_ID, t, 'ID', o, function (h) { return /\p{L}/u.test(h.text) && digits(h.text) >= 4 && h.text.length >= 5; });
      } },
    { id: 'titled', run: function (t, o) { findAll(TITLED, t, 'NAME', o); } },
    { id: 'names', run: function (t, o, ignoreSet) { findNames(t, o, ignoreSet); } }
  ];

  // detect(text, approvedSet) -> [{start, end, type, text}] sorted, non-overlapping.
  function detect(text, approved) {
    if (!config) setConfig(null);
    var protectedSpans = [];
    findAll(PLACEHOLDER, text, 'PLACEHOLDER', protectedSpans);
    var ignoreSet = new Set(config.ignore.map(function (s) { return key(s); }));
    var found = [];
    RULES.forEach(function (rule, priority) {
      if (rule.id[0] !== '*' && !config.rules[rule.id]) return;
      var part = [];
      try { rule.run(text, part, ignoreSet); } catch (e) { return; }
      part.forEach(function (x) { x.priority = priority; found.push(x); });
    });
    var overlaps = function (a, b) { return a.start < b.end && b.start < a.end; };
    found = found.filter(function (x) {
      if (x.end <= x.start) return false;
      var k = key(x.text);
      if (ignoreSet.has(k) || (approved && approved.has(k))) return false;
      return !protectedSpans.some(function (p) { return overlaps(x, p); });
    });
    found.sort(function (a, b) { return a.priority - b.priority || a.start - b.start; });
    var kept = [];
    found.forEach(function (x) { if (!kept.some(function (k) { return overlaps(x, k); })) kept.push(x); });
    kept.sort(function (a, b) { return a.start - b.start; });
    return kept.map(function (x) { return { start: x.start, end: x.end, type: x.type, text: x.text }; });
  }

  // Build the outgoing text. tokenOf(match) returns the placeholder; shouldReplace(match) says whether to use it.
  function applyTokens(text, matches, tokenOf, shouldReplace) {
    var out = '', pos = 0;
    matches.forEach(function (m) {
      out += text.slice(pos, m.start);
      out += shouldReplace(m) ? tokenOf(m) : m.text;
      pos = m.end;
    });
    return out + text.slice(pos);
  }

  root.PIIGuard = {
    detect: detect, applyTokens: applyTokens, key: key, setConfig: setConfig,
    compilePattern: compilePattern, cleanLabel: cleanLabel,
    DEFAULTS: DEFAULTS, PLACEHOLDER_SOURCE: PLACEHOLDER.source
  };
})(globalThis);
