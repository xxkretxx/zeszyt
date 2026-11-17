// AI clients: Google Gemini (free tier) or Anthropic Claude. Keys stay on the device.
// cfg = { provider: 'gemini' | 'claude', key, model }
const URL = 'https://api.anthropic.com/v1/messages';
const GEMINI = (m, k) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(k)}`;

// content parts: [{text}] or [{image: dataURL}]
async function gemini(cfg, parts, system, json, model = cfg.model) {
  const r = await fetch(GEMINI(model, cfg.key), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: parts.map((p) => (p.image ? { inline_data: { mime_type: 'image/jpeg', data: p.image.split(',')[1] } } : { text: p.text })) }],
      generationConfig: json ? { responseMimeType: 'application/json' } : {},
    }),
  });
  if (!r.ok) {
    let msg = `Błąd ${r.status}`;
    try { const j = await r.json(); msg = j.error?.message || msg; } catch {}
    if (r.status === 400 && /API key/i.test(msg)) msg = 'Zły klucz Gemini — sprawdź go w Ustawieniach.';
    if (r.status === 403) msg = 'Klucz Gemini nie ma dostępu — wygeneruj nowy w AI Studio.';
    const e = new Error(r.status === 429 ? 'Limit darmowych zapytań na teraz wyczerpany — spróbuj za chwilę.' : msg);
    e.status = r.status; throw e;
  }
  const j = await r.json();
  const t = (j.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  if (!t) throw new Error('AI nie zwróciło odpowiedzi (może zdjęcie zostało zablokowane?)');
  return t;
}
// Flash first; on rate-limit/overload fall back to the lighter model with its own free quota.
async function geminiSmart(cfg, parts, system, json) {
  try { return await gemini(cfg, parts, system, json); }
  catch (e) {
    if ((e.status === 429 || e.status === 503) && cfg.model !== 'gemini-flash-lite-latest') return gemini(cfg, parts, system, json, 'gemini-flash-lite-latest');
    throw e;
  }
}
async function run(cfg, parts, system, json, maxTokens) {
  if (cfg.provider === 'gemini') return geminiSmart(cfg, parts, system, json);
  const content = parts.map((p) => (p.image ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.image.split(',')[1] } } : { type: 'text', text: p.text }));
  return call(cfg.key, cfg.model, [{ role: 'user', content }], system, maxTokens);
}

async function call(key, model, messages, system, maxTokens = 4000) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  if (!r.ok) {
    let msg = `Błąd ${r.status}`;
    try { const j = await r.json(); msg = j.error?.message || msg; } catch {}
    if (r.status === 401) msg = 'Zły klucz API — sprawdź go w Ustawieniach.';
    if (r.status === 429) msg = 'Za dużo zapytań, spróbuj za chwilę.';
    throw new Error(msg);
  }
  const j = await r.json();
  return j.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

function parseJSON(t) {
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('AI zwróciło dziwną odpowiedź, spróbuj ponownie.');
  return JSON.parse(t.slice(s, e + 1));
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
  return parseJSON(await run(cfg, parts, SYS + extra(instr), true, 6000));
}

const CHAT_SYS = `Jesteś korepetytorem wbudowanym w szkolną aplikację „Zeszyt”. Rozmawiasz z uczniem o JEDNEJ jego notatce.
Odpowiadasz po polsku, prosto i konkretnie (zwykle 2-6 zdań), bez markdown (bez **, #, list z myślnikami — możesz użyć numeracji 1. 2. 3.).
Opieraj się na notatce; gdy trzeba, dopowiedz wiedzę szkolną, ale nie zmyślaj.

Masz pełną integrację z aplikacją — możesz WYKONYWAĆ AKCJE, gdy uczeń o to prosi albo gdy to wyraźnie pomoże (np. „zrób więcej fiszek”, „dodaj pytania do quizu”, „przypomnij mi powtórkę w piątek”, „dopisz to do notatki”).
Nie wykonuj akcji, o które nie proszono, poza drobną pomocą (np. po wyjaśnieniu trudnego pojęcia możesz dodać 1 fiszkę i to powiedzieć).
Dostępne akcje:
- {"type":"add_flashcards","cards":[{"q":"pytanie","a":"krótka odpowiedź"}]}
- {"type":"add_quiz","questions":[{"q":"pytanie","options":["A","B","C","D"],"correct":0}]}  (4 odpowiedzi, correct = indeks 0-3, mieszaj pozycję poprawnej)
- {"type":"add_points","points":["krótki punkt"]}
- {"type":"add_terms","terms":[{"term":"pojęcie","def":"definicja"}]}
- {"type":"update_summary","summary":"nowe streszczenie 2-4 zdania"}
- {"type":"rename_note","title":"nowy tytuł"}
- {"type":"add_reminder","title":"np. Powtórka: fotosynteza","kind":"test|quiz|hw|project|other","date":"YYYY-MM-DD","time":"HH:MM","note":"opcjonalnie"}
Nie dubluj fiszek ani pytań, które już są w notatce. Daty liczysz od dzisiejszej daty podanej niżej.
W "reply" powiedz krótko, co zrobiłeś (np. „Dodałem 5 nowych fiszek”).

Odpowiedz WYŁĄCZNIE JSON-em: {"reply":"tekst dla ucznia","actions":[...]}  (actions może być pustą listą).`;

export async function chatNote(cfg, { note, history, message, today, subjectName, name, instr }) {
  const ctx = {
    tytul: note.title, przedmiot: subjectName, streszczenie: note.ai?.summary, punkty: note.ai?.points, pojecia: note.ai?.terms,
    fiszki: (note.ai?.flashcards || []).map((f) => f.q), pytania_quizu: (note.ai?.quiz || []).map((q) => q.q),
    tekst: (note.ai?.text || '').slice(0, 6000), dopiski: note.userText || '',
  };
  const hist = history.slice(-10).map((m) => `${m.role === 'user' ? 'Uczeń' : 'Ty'}: ${m.text}`).join('\n');
  const text = `Dziś: ${today}. Uczeń: ${name || 'uczeń'}.\nNOTATKA:\n${JSON.stringify(ctx)}\n\n${hist ? 'DOTYCHCZASOWA ROZMOWA:\n' + hist + '\n\n' : ''}NOWA WIADOMOŚĆ UCZNIA: ${message}`;
  const raw = await run(cfg, [{ text }], CHAT_SYS + extra(instr), true, 3000);
  try { const j = parseJSON(raw); return { reply: String(j.reply || ''), actions: Array.isArray(j.actions) ? j.actions : [] }; }
  catch { return { reply: raw.trim(), actions: [] }; }
}

export async function generateMore(cfg, note, kind, count, instr) {
  const have = kind === 'cards' ? (note.ai?.flashcards || []).map((f) => f.q) : (note.ai?.quiz || []).map((q) => q.q);
  const schema = kind === 'cards' ? '{"items":[{"q":"pytanie","a":"krótka odpowiedź"}]}' : '{"items":[{"q":"pytanie","options":["A","B","C","D"],"correct":0}]}';
  const text = `Notatka: ${JSON.stringify({ title: note.title, summary: note.ai?.summary, points: note.ai?.points, terms: note.ai?.terms, text: (note.ai?.text || note.userText || '').slice(0, 6000) })}
Już istnieją (NIE powtarzaj): ${JSON.stringify(have)}
Zrób ${count} NOWYCH ${kind === 'cards' ? 'fiszek' : 'pytań quizowych (4 odpowiedzi, correct = indeks 0-3, mieszaj pozycję poprawnej)'} po polsku. Odpowiedz tylko JSON-em: ${schema}`;
  const j = parseJSON(await run(cfg, [{ text }], 'Tworzysz materiały do nauki dla ucznia polskiej szkoły. Odpowiadasz wyłącznie poprawnym JSON-em.' + extra(instr), true, 3000));
  return Array.isArray(j.items) ? j.items : [];
}

export async function testKey(cfg) {
  await run(cfg, [{ text: 'Odpowiedz jednym słowem: ok' }], 'Test.', false, 10);
}
