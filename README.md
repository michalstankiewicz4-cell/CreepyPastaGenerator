# Creepypasta Studio

Aplikacja webowa (czysty HTML/CSS/JS, bez backendu) generująca interaktywne
creepypasty w klimacie SCP — z obrazami wplecionymi w tekst, wyborami
rozwijającymi fabułę oraz lektorem. Całość działa w przeglądarce; ustawienia i
ostatnia historia są zapisywane w `localStorage`.

## Demo na żywo

👉 https://michalstankiewicz4-cell.github.io/CreepyPastaGenerator/

To statyczny hosting — każdy użytkownik wpisuje **własne** klucze/tokeny (zostają
w jego przeglądarce, nie na stronie). Bez kluczy działa tryb demonstracyjny.

## Uruchomienie lokalne

`index.html` można otworzyć wprost w przeglądarce — tekst i tryb demo działają
nawet z `file://`. Obrazy przez Puter.js oraz część zapytań wymagają jednak
adresu `http://`/`https://`. Do pełnego podglądu uruchom serwer w folderze
projektu:

```powershell
python -m http.server 4173
```

Następnie otwórz `http://localhost:4173`. (W VSCode działa też **F5** —
konfiguracja w `.vscode/` startuje serwer i otwiera przeglądarkę.)

## Zasada działania

1. **Temat** — wpisz temat (lub kliknij *Losowy*) i naciśnij *Generuj opowieść*.
2. **Research (opcjonalnie)** — pobiera krótkie tło do tematu: ze SCP Wiki
   (przez proxy CORS) albo z Google AI (Gemini z groundingiem Google Search).
3. **Tekst**:
   - **Tryb AI** — zapytanie do Hugging Face Router, odpowiedź w JSON
     (`title`, `story`, `scenes`, `choices`).
   - **Tryb lokalny (demo)** — historia z gotowych szablonów; działa bez tokenu
     i jest fallbackiem, gdy AI zawiedzie.
4. **Render** — tekst dzielony na akapity, do co drugiego dołączany jest kadr
   (obraz lub placeholder). Pod opowieścią pojawiają się 3 wybory.
5. **Obrazy (opcjonalnie)** — dla każdej sceny generowany jest obraz (Puter.js
   lub Hugging Face) i wstawiany w miejsce placeholdera.
6. **Lektor (opcjonalnie)** — tekst odczytywany głosem przez Web Speech API.
7. **Wybory** — kliknięcie wyboru kontynuuje historię: nowy fragment doklejany do
   poprzedniego, sceny się sumują, a wskaźnik trybu (Online/AI vs lokalny)
   pokazuje, jak powstał ostatni fragment.

## Opcje (okno ⚙ Opcje)

### Zakładka „AI" — pod‑zakładki

**🔑 Klucze**
- **Przechowywanie kluczy** — `localhost` (zapis w przeglądarce, domyślny) albo
  `RAM` (klucze tylko w pamięci sesji, znikają po odświeżeniu — bezpieczniejsze).
- **Token Hugging Face** (`hf_…`) — do tekstu AI i obrazów przez Hugging Face.
- **Klucz Google AI Studio** (`AQ.…`/`AIza…`) — do inspiracji przez Google AI.

**📝 Treść**
- **Tekst AI (Hugging Face)** — generowanie przez model `openai/gpt-oss-120b`.
- **Research / inspiracja** + **Źródło inspiracji** (radio):
  - **SCP Wiki** — opis obiektu/strony ze SCP Wiki (bez klucza).
  - **Google AI (Gemini)** — wymaga klucza; **Model Gemini** (combobox,
    domyślnie `gemini-2.5-flash-lite`) oraz **Grounding (Google Search)**.

**🖼 Grafika**
- **Obrazy AI** + **Źródło obrazów** (radio):
  - **Puter.js** — bez tokenu, wymaga `http`/`https`.
  - **Hugging Face** — używa tokenu i **modelu** (FLUX.1-schnell / Stable
    Diffusion XL).
- **Liczba kadrów** — 2–5.

**🔊 Dźwięk**
- **Lektor (Web Speech API)** — czyta historię (preferuje polski głos).
- **Efekty dźwiękowe** i **Ambient** — *(wkrótce)*.

### Zakładka „Narracja"

Dwa edytowalne wykresy i znacznik punktu zwrotu kształtują łuk opowieści i
**realnie wpływają na generowanie** (pole `narration` w zapytaniu do AI oraz
nastrój w trybie lokalnym):

- **Tempo akcji** — krzywa od spokoju do kulminacji.
- **Poziom grozy** — krzywa od ciszy do horroru.
- **Punkt zwrotu** — suwak na osi czasu (procent długości opowieści).

Obsługa: **przeciągnij** punkt myszką, **dwuklik** na linię dodaje punkt, **prawy
klik** usuwa (min. 2 punkty). Opowieść posuwa się fragmentami (krok ≈ 1/5 łuku,
~5 wyborów = pełny łuk); dla każdego fragmentu liczony jest **poziom 1–10** i
**trend** tempa oraz grozy, a gdy znacznik zwrotu trafi w bieżący fragment, AI
dostaje polecenie wprowadzenia zwrotu akcji.

## Przyciski

- **Generuj opowieść** — uruchamia generowanie.
- **Losowy** — wstawia przykładowy temat.
- **Czytaj / Zatrzymaj czytanie** — ręczne sterowanie lektorem.
- **Wyczyść** — usuwa bieżącą historię i zatrzymuje lektora.

## Rozwiązywanie problemów

**W razie problemów z kontynuacją opowieści naciśnij „Wyczyść" i zacznij od
nowa.** Przycisk kasuje zapisaną historię z `localStorage` i resetuje stan, więc
usuwa większość problemów z zablokowaną lub niespójną kontynuacją.

## Zapis stanu (`localStorage`)

- `creepypasta-studio-story` — ostatnia wygenerowana historia.
- `creepypasta-studio-preferences` — przełączniki, wybory, klucze (tylko w trybie
  `localhost`), liczba kadrów.
- `creepypasta-studio-charts-v1` — krzywe narracji i punkt zwrotu.

## Pliki

| Plik | Rola |
|------|------|
| `index.html` | Struktura: panel sterowania, panel opowieści, okno Opcji. |
| `styles.css` | Wygląd (ciemny, „instytucjonalny" motyw grozy). |
| `app.js` | Logika generowania, AI, research, obrazy, lektor, zapis stanu. |
| `charts.js` | Edytowalne wykresy narracji + przełączanie zakładek/okna Opcji. |

## Uwaga o bezpieczeństwie

Klucze i tokeny są trzymane po stronie przeglądarki (w pamięci albo
`localStorage`) — wygodne na czas prototypowania, ale w publicznej wersji
powinny być ukryte za backendem, który pośredniczy w zapytaniach do API.

## Autor i licencja

Autor: **Michał Stankiewicz**. Projekt na licencji **MIT** (po polsku i
angielsku) — zob. [LICENSE.md](LICENSE.md).
