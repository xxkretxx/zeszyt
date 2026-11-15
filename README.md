# 📚 Zeszyt

Minimalistyczna aplikacja szkolna na Androida.

- 🔔 **Przypominajki**: sprawdziany, kartkówki i zadania z powiadomieniami (o czasie, godzinę przed, dzień przed albo rano), przesunięcie w lewo usuwa, odhaczenie sypie konfetti
- 📸 **Notatki ze zdjęć**: AI (Claude) czyta zeszyt i robi streszczenie, najważniejsze punkty, pojęcia, fiszki i quiz, a do tego można dopytać AI o notatkę
- 🃏 **Fiszki** z powtórkami rozłożonymi w czasie (system Leitnera)
- 🧠 **Quizy** z jednej notatki albo mix ze wszystkich
- ⏱️ **Fokus** (Pomodoro) z wykresem tygodnia i powiadomieniem na koniec
- 🗓️ **Plan lekcji**: „teraz / następna lekcja” na ekranie głównym
- 📊 **Oceny** ze średnią ważoną i kalkulatorem „ile muszę dostać?”
- 🔥 Seria dni, odliczanie do wakacji, wieczorny przegląd o 19:00, motyw jasny/ciemny i 6 kolorów akcentu

## Instalacja
Wejdź w **Releases**, pobierz `Zeszyt.apk` na telefon i otwórz. Za pierwszym razem trzeba zezwolić na instalację z nieznanych źródeł.

## AI
W *Więcej → Ustawienia* wklej klucz API z console.anthropic.com. Klucz zostaje tylko na telefonie.

## Budowanie
Każdy push na `main` buduje APK w GitHub Actions (`.github/workflows/build-apk.yml`).
