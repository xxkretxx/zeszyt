// Claude API client (user's own key, stored only on the device).
const URL = 'https://api.anthropic.com/v1/messages';

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

export async function summarizeNotes(key, model, images, subjects, hint) {
  const content = images.map((d) => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: d.split(',')[1] },
  }));
  content.push({
    type: 'text',
    text: `Przedmioty ucznia: ${subjects.join(', ')}. Wybierz najlepiej pasujący (lub inny, jeśli żaden nie pasuje).${hint ? ' Wskazówka ucznia: ' + hint : ''}`,
  });
  const t = await call(key, model, [{ role: 'user', content }], SYS, 6000);
  return parseJSON(t);
}

export async function askAboutNote(key, model, note, question) {
  const ctx = JSON.stringify({ title: note.title, summary: note.ai?.summary, points: note.ai?.points, terms: note.ai?.terms, text: note.ai?.text || note.userText });
  return call(
    key, model,
    [{ role: 'user', content: `Notatka ucznia:\n${ctx}\n\nPytanie: ${question}` }],
    'Jesteś cierpliwym korepetytorem. Odpowiadaj po polsku, krótko (max 6 zdań), prostym językiem, bez formatowania markdown. Opieraj się na notatce, a jeśli trzeba, dopowiedz wiedzę szkolną.',
    1200,
  );
}

export async function testKey(key, model) {
  await call(key, model, [{ role: 'user', content: 'Odpowiedz jednym słowem: ok' }], 'Test.', 10);
}
