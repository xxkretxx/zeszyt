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

export async function summarizeNotes(cfg, images, subjects, hint) {
  const parts = images.map((image) => ({ image }));
  parts.push({ text: `Przedmioty ucznia: ${subjects.join(', ')}. Wybierz najlepiej pasujący (lub inny, jeśli żaden nie pasuje).${hint ? ' Wskazówka ucznia: ' + hint : ''}` });
  return parseJSON(await run(cfg, parts, SYS, true, 6000));
}

export async function askAboutNote(cfg, note, question) {
  const ctx = JSON.stringify({ title: note.title, summary: note.ai?.summary, points: note.ai?.points, terms: note.ai?.terms, text: note.ai?.text || note.userText });
  return run(cfg, [{ text: `Notatka ucznia:\n${ctx}\n\nPytanie: ${question}` }],
    'Jesteś cierpliwym korepetytorem. Odpowiadaj po polsku, krótko (max 6 zdań), prostym językiem, bez formatowania markdown. Opieraj się na notatce, a jeśli trzeba, dopowiedz wiedzę szkolną.',
    false, 1200);
}

export async function testKey(cfg) {
  await run(cfg, [{ text: 'Odpowiedz jednym słowem: ok' }], 'Test.', false, 10);
}
