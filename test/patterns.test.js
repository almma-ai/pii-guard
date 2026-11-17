// Rule tests: node test/patterns.test.js
const assert = require('assert');
const path = require('path');
globalThis.PII_GUARD_ROSTER = ['Okonkwo', 'jdoe42'];
require(path.join(__dirname, '..', 'src', 'patterns.js'));
const G = globalThis.PIIGuard;
let n = 0;
const found = (t) => G.detect(t, new Set()).map((x) => x.type + ':' + x.text);
const eq = (t, exp) => { assert.deepStrictEqual(found(t), exp, t); n++; };
const set = (c) => G.setConfig(c);

set(null);
// ---- names
eq('Dear Dr. Maria de la Cruz, hello', ['NAME:Dr. Maria de la Cruz']);
eq('I spoke with John Smith today.', ['NAME:John Smith']);
eq('John Smith called.', ['NAME:John Smith']);
eq('Meet Omar Haddad at 3', ['NAME:Omar Haddad']);
eq('We met Priya in Boston on Monday.', ['NAME:Priya', 'NAME:Boston']);
eq('The FERPA rules apply to this PDF.', []);
eq('Prof Smith and Ms. O’Neil-Jones', ['NAME:Prof Smith', 'NAME:Ms. O’Neil-Jones']);
eq('John failed the exam.', []);                                // known miss: lone name opening a sentence
eq('we saw okonkwo and JDOE42', ['NAME:okonkwo', 'NAME:JDOE42']);

// ---- numbers (5+ digits by default)
eq('call (555) 123-4567 now', ['NUMBER:(555) 123-4567']);
eq('SSN 900-12-3456', ['ID:900-12-3456']);                       // labeled, so typed as ID
eq('ZIP 22180, student 1234567', ['NUMBER:22180', 'ID:1234567']);
eq('score 87.5, room 204, invoice 4471, year 2026, 3 students', []);
eq('lists 1, 2, 3, 40, 50 and 2025, 2026', []);
eq('call +1 555 123 4567', ['NUMBER:+1 555 123 4567']);
eq('card 4111 1111 1111 1111', ['NUMBER:4111 1111 1111 1111']);

// ---- email
eq('mail j.smith42@uni.edu please', ['EMAIL:j.smith42@uni.edu']);

// ---- HIPAA: dates
eq('seen on March 3, 2024 and Mar. 14th', ['DATE:March 3, 2024', 'DATE:Mar. 14th']);
eq('born 3rd of March 1950; admitted 14 Feb 2025', ['DATE:3rd of March 1950', 'DATE:14 Feb 2025']);
eq('discharged March 2024', ['DATE:March 2024']);
eq('visit 3/14 and 03/14/2026 and 2026-03-14 and 14.03.26', ['DATE:3/14', 'DATE:03/14/2026', 'DATE:2026-03-14', 'DATE:14.03.26']);
eq('Back in 2024 we may march on.', []);                         // a year alone, "may", "march" are fine
eq('pi is 3.14 and half is 1/2 cup', ['DATE:1/2']);              // known false positive: fractions that look like dates

// ---- HIPAA: addresses
eq('lives at 123 Main Street, Apt 4B, Vienna, VA 22180 now', ['ADDRESS:123 Main Street, Apt 4B, Vienna, VA 22180']);
eq('send to 9 W 42nd St.', ['ADDRESS:9 W 42nd St.']);
eq('mail P.O. Box 4471 today', ['ADDRESS:P.O. Box 4471']);
eq('I have 3 cats on the way', []);

// ---- HIPAA: urls, ips
eq('see https://portal.example.org/p?id=7. Thanks', ['URL:https://portal.example.org/p?id=7']);
eq('www.example.com/patients is down', ['URL:www.example.com/patients']);
eq('from 10.0.0.12 and fe80::1ff:fe23:4567:890a', ['IP:10.0.0.12', 'IP:fe80::1ff:fe23:4567:890a']);
eq('meeting at 10:30:00', []);

// ---- HIPAA: ages
eq('a 92-year-old man, aged 95, and 101 yo woman; she is 45 years old', ['AGE:92-year-old', 'AGE:aged 95', 'AGE:101 yo']);

// ---- HIPAA: labeled and mixed ids
eq('MRN: A4471, policy # XJ-22, member ID 88', ['ID:A4471', 'ID:XJ-22', 'ID:88']);
eq('VIN 1HGCM82633A004352', ['ID:1HGCM82633A004352']);
eq('record AB1234 and code XJ-4492-K', ['ID:AB1234', 'ID:XJ-4492-K']);
eq('COVID-19, GPT-4o, H1N1, B12, MP3', []);

// ---- placeholders are never re-flagged
eq('masked [NAME_1] and [NUMBER_12] and [DATE_3] and [COURSE_2]', []);

// ---- settings: switch rules off, change digit count
set({ rules: { dates: false, numbers: false } });
eq('on March 3, 2024 call 555-123-4567', []);
set({ minDigits: 4 });
eq('invoice 4471 and room 204', ['NUMBER:4471']);
set({ rules: { names: false, titled: false } });
eq('I spoke with John Smith and Dr. Lee', []);

// ---- settings: always-flag and never-flag lists
set({ custom: ['Solidcore'] });
eq('Solidcore class at solidcore', ['NAME:Solidcore', 'NAME:solidcore']);
set({ ignore: ['Boston', 'Claude'] });
eq('We met Priya in Boston and asked Claude.', ['NAME:Priya']);
set({ ignore: ['Claude'] });
eq('we read Claude Shannon today', ['NAME:Shannon']);                     // an ignored word is trimmed off a name

// ---- settings: custom patterns with their own label
set({ patterns: [{ label: 'course', regex: 'FIN\\s?\\d{3}', ignoreCase: true, enabled: true }] });
eq('students in FIN450 and fin 301', ['COURSE:FIN450', 'COURSE:fin 301']);
set({ patterns: [{ label: 'bad', regex: '(unclosed', enabled: true }] });
eq('nothing breaks with a bad pattern', []);
assert.strictEqual(G.compilePattern({ regex: '(unclosed' }), null); n++;
assert.strictEqual(G.cleanLabel('room no.'), 'ROOMNO'); n++;

// ---- applyTokens and approved values
set(null);
assert.deepStrictEqual(G.detect('We met Priya', new Set(['priya'])), []); n++;
const t = 'John Smith (id 44112) wrote to John Smith.';
const out = G.applyTokens(t, G.detect(t, new Set()), (x) => x.type === 'NAME' ? '[NAME_1]' : '[ID_1]', () => true);
assert.strictEqual(out, '[NAME_1] (id [ID_1]) wrote to [NAME_1].'); n++;
assert.deepStrictEqual(G.detect(out, new Set()), []); n++;

console.log('patterns: ' + n + ' assertions passed');
