// AI clients: Google Gemini (free tier) or Anthropic Claude. Keys stay on the device.
// cfg = { provider: 'gemini' | 'claude', key, model }
const URL = 'https://api.anthropic.com/v1/messages';
const GEMINI = (m, k) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(k)}`;
// tried in order when a model is rate-limited, overloaded or retired
const GEMINI_FALLBACK = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

class AIError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function post(url, headers, body, ms = 90000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new AIError('AI za długo myśli — spróbuj jeszcze raz (albo z mniejszą liczbą zdjęć).', 408);
    if (!navigator.onLine) throw new AIError('Brak internetu — połącz się i spróbuj ponownie.', 0);
    throw new AIError('Nie udało się połączyć z AI. Sprawdź internet i spróbuj ponownie.', 0);
  } finally { clearTimeout(t); }
}

async function gemini(cfg, parts, system, json, model) {
  const r = await post(GEMINI(model, cfg.key), { 'content-type': 'application/json' }, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: parts.map((p) => (p.image ? { inline_data: { mime_type: 'image/jpeg', data: p.image.split(',')[1] } } : { text: p.text })) }],
    generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), maxOutputTokens: 8192 },
  });
  if (!r.ok) {
    let msg = `Błąd ${r.status}`;
    try { const j = await r.json(); msg = j.error?.message || msg; } catch {}
    if (r.status === 400 && /API key/i.test(msg)) throw new AIError('Zły klucz Gemini — sprawdź go w Ustawieniach.', 401);
    if (r.status === 403) throw new AIError('Klucz Gemini nie ma dostępu — wygeneruj nowy w AI Studio.', 403);
    if (r.status === 429) throw new AIError('Limit darmowych zapytań na teraz wyczerpany — spróbuj za chwilę.', 429);
    throw new AIError(msg, r.status);
  }
  const j = await r.json();
  const cand = j.candidates?.[0];
  if (!cand) throw new AIError(j.promptFeedback?.blockReason ? 'AI odmówiło odpowiedzi na tę treść.' : 'AI nie zwróciło odpowiedzi.', 500);
  const t = (cand.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  if (!t) throw new AIError(cand.finishReason === 'SAFETY' ? 'AI zablokowało tę treść — spróbuj inaczej sformułować.' : 'AI nie zwróciło odpowiedzi.', 500);
  return t;
}
async function geminiSmart(cfg, parts, system, json) {
  const chain = [cfg.model, ...GEMINI_FALLBACK.filter((m) => m !== cfg.model)];
  let last;
  for (const m of chain) {
    try { return await gemini(cfg, parts, system, json, m); }
    catch (e) { last = e; if (![429, 500, 503, 404].includes(e.status)) throw e; }
  }
  throw last;
}
async function run(cfg, parts, system, json, maxTokens) {
  if (cfg.provider === 'gemini') return geminiSmart(cfg, parts, system, json);
  const content = parts.map((p) => (p.image ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.image.split(',')[1] } } : { type: 'text', text: p.text }));
  return call(cfg.key, cfg.model, [{ role: 'user', content }], system, maxTokens);
}
// JSON calls: parse, repair, and on failure ask once more
async function runJSON(cfg, parts, system, maxTokens) {
  const raw = await run(cfg, parts, system, true, maxTokens);
  try { return parseJSON(raw); }
  catch {
    const raw2 = await run(cfg, [...parts, { text: 'UWAGA: poprzednia odpowiedź nie była poprawnym JSON-em. Odpowiedz jeszcze raz WYŁĄCZNIE poprawnym, kompletnym JSON-em.' }], system, true, maxTokens);
    return parseJSON(raw2);
  }
}

async function call(key, model, messages, system, maxTokens = 4000) {
  const r = await post(URL, {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }, { model, max_tokens: maxTokens, system, messages });
  if (!r.ok) {
    let msg = `Błąd ${r.status}`;
    try { const j = await r.json(); msg = j.error?.message || msg; } catch {}
    if (r.status === 401) msg = 'Zły klucz API — sprawdź go w Ustawieniach.';
    if (r.status === 429) msg = 'Za dużo zapytań, spróbuj za chwilę.';
    if (r.status === 529) msg = 'AI jest teraz przeciążone — spróbuj za chwilę.';
    throw new AIError(msg, r.status);
  }
  const j = await r.json();
  return j.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

function parseJSON(t) {
  let s = String(t).replace(/```(?:json)?/gi, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < 0) throw new AIError('AI zwróciło dziwną odpowiedź, spróbuj ponownie.', 500);
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch {}
  // light repair: smart quotes, trailing commas, raw newlines inside strings
  const fixed = s.replace(/[“”„]/g, '"').replace(/,\s*([}\]])/g, '$1').replace(/\r?\n/g, ' ');
  try { return JSON.parse(fixed); } catch { throw new AIError('AI zwróciło uszkodzoną odpowiedź, spróbuj ponownie.', 500); }
}

const SYS = `Jesteś asystentem ucznia polskiej szkoły. Dostajesz zdjęcia odręcznych lub drukowanych notatek.
Odczytaj je dokładnie i zrób z nich zwięzłe, ładne opracowanie po polsku. Nie wymyślaj faktów spoza notatek, ale możesz poprawić oczywiste błędy i doprecyzować.
Odpowiedz WYŁĄCZNIE poprawnym JSON-em (bez markdown, bez \`\`\`) o schemacie:
{
 "title": "krótki tytuł tematu (max 6 słów)",
 "subject": "nazwa przedmiotu szkolnego, np. Biologia",
 "emoji": "jedno emoji pasujące do tematu",
 "summary": "streszczenie w 2-4 zdaniach, prosto i konkretnie",
 "points": ["najważniejsze punkty, 4-8 krótkich zdań"],
 "terms": [{"term":"pojęcie","def":"krótka definicja"}],
 "flashcards": [{"q":"pytanie","a":"krótka odpowiedź"}],
 "quiz": [{"q":"pytanie","options":["A","B","C","D"],"correct":0}],
 "text": "pełny odczytany tekst notatek, uporządkowany"
}
Fiszek 5-10, pytań quizu 4-6 (correct = indeks poprawnej odpowiedzi 0-3, mieszaj pozycje). Jeśli zdjęcie nie jest notatką, i tak zwróć JSON i opisz co widzisz.`;

const extra = (instr) => (instr ? `\n\nWłasne instrukcje ucznia (stosuj je zawsze, o ile nie każą łamać zasad JSON): ${instr}` : '');

export async function summarizeNotes(cfg, images, subjects, hint, instr) {
  const parts = images.map((image) => ({ image }));
  parts.push({ text: `Przedmioty ucznia: ${subjects.join(', ')}. Wybierz najlepiej pasujący (lub inny, jeśli żaden nie pasuje).${hint ? ' Wskazówka ucznia: ' + hint : ''}` });
  return runJSON(cfg, parts, SYS + extra(instr), 6000);
}

const CHAT_SYS = `Jesteś korepetytorem wbudowanym w szkolną aplikację „Zeszyt”. Rozmawiasz z uczniem o JEDNEJ jego notatce.
Zawsze odpowiadasz PO POLSKU (chyba że uczeń wyraźnie poprosi o inny język, np. przy nauce angielskiego), prosto i konkretnie (zwykle 2-6 zdań).
Bez markdown: bez **, #, tabel. Możesz użyć numeracji 1. 2. 3. i nowych linii.
Opieraj się na notatce; gdy trzeba, dopowiedz wiedzę szkolną, ale nie zmyślaj.

Masz pełną integrację z aplikacją — możesz DODAWAĆ, EDYTOWAĆ i USUWAĆ rzeczy, gdy uczeń o to prosi.
Elementy notatki mają numery (indeksy od 0) podane w kontekście — używaj ich do edycji i usuwania.
Akcje:
- {"type":"add_flashcards","cards":[{"q":"pytanie","a":"odpowiedź"}]}
- {"type":"edit_flashcard","index":0,"q":"nowe pytanie","a":"nowa odpowiedź"}
- {"type":"delete_flashcards","indices":[0,2]}
- {"type":"add_quiz","questions":[{"q":"pytanie","options":["A","B","C","D"],"correct":0}]}
- {"type":"edit_quiz","index":0,"q":"...","options":["A","B","C","D"],"correct":1}
- {"type":"delete_quiz","indices":[1]}
- {"type":"add_points","points":["punkt"]} / {"type":"delete_points","indices":[0]}
- {"type":"add_terms","terms":[{"term":"pojęcie","def":"definicja"}]} / {"type":"delete_terms","indices":[0]}
- {"type":"update_summary","summary":"nowe streszczenie"}
- {"type":"rename_note","title":"nowy tytuł"}
- {"type":"add_reminder","title":"np. Powtórka: fotosynteza","kind":"test|quiz|hw|project|other","date":"YYYY-MM-DD","time":"HH:MM","note":""}
- {"type":"delete_reminders","ids":["id z listy przypominajek"]} / {"type":"complete_reminders","ids":["..."]}
Zasady: usuwaj tylko to, o co uczeń prosi (np. „usuń fiszki o X”, „usuń zduplikowane”, „wyczyść quiz”). Przy „usuń wszystkie fiszki” podaj wszystkie indeksy.
Nie dubluj istniejących fiszek i pytań. Daty liczysz od dzisiejszej daty podanej niżej.
W "reply" powiedz krótko, co zrobiłeś (np. „Usunąłem 3 fiszki o fazie ciemnej”).

Odpowiedz WYŁĄCZNIE JSON-em: {"reply":"tekst dla ucznia","actions":[...]}  (actions może być pustą listą).`;

export async function chatNote(cfg, { note, history, message, today, subjectName, name, instr, reminders }) {
  const ctx = {
    tytul: note.title, przedmiot: subjectName, streszczenie: note.ai?.summary,
    punkty: (note.ai?.points || []).map((p, i) => `${i}: ${p}`),
    pojecia: (note.ai?.terms || []).map((t, i) => `${i}: ${t.term} — ${t.def}`),
    fiszki: (note.ai?.flashcards || []).map((f, i) => `${i}: ${f.q} → ${f.a}`),
    quiz: (note.ai?.quiz || []).map((q, i) => `${i}: ${q.q} [${q.options.join(' | ')}] poprawna: ${q.options[q.correct]}`),
    bledy: (note.ai?.mistakes || []).map((m) => `${m.q}: ${m.correct}`),
    tekst: (note.ai?.text || '').slice(0, 5000), dopiski: note.userText || '',
  };
  const hist = history.slice(-10).map((m) => `${m.role === 'user' ? 'Uczeń' : 'Ty'}: ${m.text}`).join('\n');
  const text = `Dziś: ${today}. Uczeń: ${name || 'uczeń'}.\nNOTATKA:\n${JSON.stringify(ctx)}\n\nPRZYPOMINAJKI UCZNIA (id: tytuł, termin): ${JSON.stringify(reminders || [])}\n\n${hist ? 'DOTYCHCZASOWA ROZMOWA:\n' + hist + '\n\n' : ''}NOWA WIADOMOŚĆ UCZNIA: ${message}`;
  const raw = await run(cfg, [{ text }], CHAT_SYS + extra(instr), true, 3000);
  try { const j = parseJSON(raw); return { reply: String(j.reply || ''), actions: Array.isArray(j.actions) ? j.actions : [] }; }
  catch { return { reply: String(raw).replace(/[{}"]/g, '').trim().slice(0, 1500), actions: [] }; }
}

export async function generateMore(cfg, note, kind, count, instr) {
  const have = kind === 'cards' ? (note.ai?.flashcards || []).map((f) => f.q) : (note.ai?.quiz || []).map((q) => q.q);
  const schema = kind === 'cards' ? '{"items":[{"q":"pytanie","a":"krótka odpowiedź"}]}' : '{"items":[{"q":"pytanie","options":["A","B","C","D"],"correct":0}]}';
  const text = `Notatka: ${JSON.stringify({ title: note.title, summary: note.ai?.summary, points: note.ai?.points, terms: note.ai?.terms, text: (note.ai?.text || note.userText || '').slice(0, 6000) })}
Już istnieją (NIE powtarzaj): ${JSON.stringify(have)}
Zrób ${count} NOWYCH ${kind === 'cards' ? 'fiszek' : 'pytań quizowych (4 odpowiedzi, correct = indeks 0-3, mieszaj pozycję poprawnej)'} po polsku. Odpowiedz tylko JSON-em: ${schema}`;
  const j = await runJSON(cfg, [{ text }], 'Tworzysz materiały do nauki dla ucznia polskiej szkoły. Odpowiadasz wyłącznie poprawnym JSON-em.' + extra(instr), 3000);
  return Array.isArray(j.items) ? j.items : [];
}

export async function analyzeMistakes(cfg, { topic, context, mistakes, instr }) {
  const text = `Temat/notatki: ${topic}
Kontekst z notatek ucznia: ${JSON.stringify(context).slice(0, 7000)}
Uczeń rozwiązał quiz i POMYLIŁ SIĘ w tych pytaniach:
${JSON.stringify(mistakes.map((m) => ({ pytanie: m.q, odpowiedzi: m.options, poprawna: m.options[m.correct], wybral: m.options[m.chosen] })))}

Zrób notatkę z błędów po polsku. Dla KAŻDEGO błędu wyjaśnij prosto, dlaczego poprawna odpowiedź jest poprawna, czemu wybrana jest zła (jaki to typowy błąd myślenia) i daj krótki trik do zapamiętania.
Potem dodaj fiszki do utrwalenia oraz NOWE pytania quizowe sprawdzające te same umiejętności (inaczej sformułowane, nie kopiuj pytań).
Odpowiedz WYŁĄCZNIE JSON-em:
{"title":"Błędy: krótki temat","emoji":"🎯","summary":"2-3 zdania: co ogólnie sprawia problem i na co uważać",
 "mistakes":[{"q":"pytanie","yours":"odpowiedź ucznia","correct":"poprawna","why":"wyjaśnienie 2-3 zdania","tip":"krótki trik"}],
 "terms":[{"term":"pojęcie","def":"definicja"}],
 "flashcards":[{"q":"pytanie","a":"krótka odpowiedź"}],
 "quiz":[{"q":"pytanie","options":["A","B","C","D"],"correct":0}]}
Fiszek ${Math.min(10, mistakes.length * 2 + 2)}, pytań ${Math.min(10, mistakes.length * 2 + 2)} (correct = indeks 0-3, mieszaj pozycję).`;
  return runJSON(cfg, [{ text }], 'Jesteś cierpliwym nauczycielem, który pomaga uczniowi zrozumieć jego błędy. Odpowiadasz wyłącznie poprawnym JSON-em.' + extra(instr), 6000);
}

export async function testKey(cfg) {
  await run(cfg, [{ text: 'Odpowiedz jednym słowem: ok' }], 'Test.', false, 10);
}
