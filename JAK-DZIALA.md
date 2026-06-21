# Creepypasta Studio — jak to działa

Aplikacja webowa (czysty HTML/CSS/JS, bez backendu) generująca interaktywne
creepypasty w klimacie SCP — z obrazami wplecionymi w tekst, wyborami
rozwijającymi fabułę oraz lektorem. Całość działa w przeglądarce; ustawienia i
ostatnia historia są zapisywane w `localStorage`.

## Pliki

| Plik | Rola |
|------|------|
| `index.html` | Struktura: panel sterowania, panel opowieści, okno Opcji. |
| `styles.css` | Wygląd (ciemny, „instytucjonalny" motyw grozy). |
| `app.js` | Logika generowania, AI, research, obrazy, lektor, zapis stanu. |
| `charts.js` | Edytowalne wykresy narracji + przełączanie zakładek/okna Opcji. |

## Zasada działania

1. **Temat** — użytkownik wpisuje temat (lub klika *Losowy*) i naciska
   *Generuj opowieść*.
2. **Research (opcjonalnie)** — jeśli włączony, aplikacja pobiera krótki
   kontekst ze SCP Wiki (przez publiczny proxy CORS) i przekazuje go modelowi.
3. **Tekst** — w zależności od ustawień:
   - **Tryb AI** wysyła zapytanie do Hugging Face Router i oczekuje
     odpowiedzi w formacie JSON (`title`, `story`, `scenes`, `choices`).
   - **Tryb lokalny (demo)** składa historię z gotowych szablonów — działa
     bez tokenu i bez internetu, jest też fallbackiem, gdy AI zawiedzie.
4. **Render** — tekst jest dzielony na akapity, a do co drugiego dołączany jest
   kadr (obraz lub placeholder). Pod opowieścią pojawiają się 3 wybory.
5. **Obrazy (opcjonalnie)** — dla każdej sceny generowany jest obraz przez
   Puter.js i wstawiany w miejsce placeholdera.
6. **Lektor (opcjonalnie)** — tekst jest odczytywany głosem przez Web Speech API.
7. **Wybory** — kliknięcie wyboru kontynuuje historię: nowy fragment jest
   doklejany do poprzedniego, a sceny się sumują.

## Opcje (okno ⚙ Opcje)

### Zakładka „AI"

- **Tekst AI (Hugging Face)** — włącza generowanie przez model
  `openai/gpt-oss-120b`. Wymaga tokenu; bez niego działa tryb lokalny.
- **Research / inspiracja** — dociąga tło do tematu jako inspirację dla modelu.
- **Źródło inspiracji** — wybór:
  - **SCP Wiki** — pobiera opis obiektu/strony ze SCP Wiki (przez proxy CORS).
  - **Google AI (Gemini)** — pyta Gemini z groundingiem Google Search (odpowiednik
    „AI Mode"); wymaga klucza Google AI Studio.
- **Klucz Google AI Studio** — klucz `AIza...`, zapisywany lokalnie (potrzebny dla
  źródła Google AI).
- **Obrazy AI** — generuje kadry do scen.
- **Źródło obrazów** — wybór dostawcy:
  - **Puter.js** — bez tokenu, ale wymaga adresu `http://`/`https://` (nie działa
    przez `file://`).
  - **Hugging Face** — używa tokenu i wybranego modelu (text-to-image).
- **Model Hugging Face** — **FLUX.1-schnell** lub **Stable Diffusion XL**
  (aktywne, gdy źródłem jest Hugging Face).
- **Lektor (Web Speech API)** — czyta historię na głos (preferuje polski głos,
  jeśli jest w systemie).
- **Liczba kadrów** — ile scen/obrazów stworzyć (2–5).
- **Token Hugging Face** — wklejany token `hf_...`, zapisywany lokalnie.

### Zakładka „Narracja"

Dwa edytowalne wykresy i znacznik punktu zwrotu kształtują łuk opowieści —
te ustawienia **realnie wpływają na generowanie** (pole `narration` w zapytaniu
do AI oraz nastrój w trybie lokalnym):

- **Tempo akcji** — krzywa od spokoju do kulminacji.
- **Poziom grozy** — krzywa od ciszy do horroru.
- **Punkt zwrotu** — suwak na osi czasu (procent długości opowieści).

Obsługa wykresów: **przeciągnij** punkt myszką, **dwuklik** na linię dodaje
nowy punkt, **prawy klik** na punkt go usuwa (min. 2 punkty). Stan wykresów
zapisuje się automatycznie.

**Jak to wpływa na treść:** opowieść posuwa się fragmentami (krok ≈ 1/5 łuku, ~5
wyborów = pełny łuk). Dla każdego fragmentu aplikacja próbkuje krzywe w jego
miejscu i wylicza **poziom 1–10** oraz **trend** (rośnie / maleje / utrzymuje
się) dla tempa i grozy. Gdy znacznik punktu zwrotu wpadnie w bieżący fragment,
AI dostaje polecenie wprowadzenia wyraźnego zwrotu akcji (uruchamia się raz, w
odpowiednim miejscu opowieści).

## Przyciski

- **Generuj opowieść** — uruchamia cały proces generowania.
- **Losowy** — wstawia przykładowy temat.
- **Czytaj / Zatrzymaj czytanie** — ręczne sterowanie lektorem.
- **Wyczyść** — usuwa bieżącą historię i zatrzymuje lektora.

## Zapis stanu (`localStorage`)

- `creepypasta-studio-story` — ostatnia wygenerowana historia.
- `creepypasta-studio-preferences` — przełączniki, token HF, liczba kadrów.
- `creepypasta-studio-charts-v1` — krzywe narracji i punkt zwrotu.

## Uruchomienie

`index.html` można otworzyć wprost w przeglądarce (tekst i tryb demo działają z
pliku). Do obrazów AI potrzebny jest serwer HTTP:

```powershell
python -m http.server 4173
```

Następnie otwórz `http://localhost:4173`.

## Uwaga o bezpieczeństwie

Token Hugging Face jest trzymany po stronie przeglądarki — wygodne na czas
prototypowania, ale w wersji publicznej token powinien być ukryty za backendem.
