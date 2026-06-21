# Creepypasta Studio

Statyczny prototyp w JavaScript do generowania krotkich opowiesci creepypasta
o podanym temacie oraz serii klimatycznych obrazkow.

## Start

Mozesz otworzyc `index.html` bezposrednio w przegladarce. Tekst i lokalny tryb
demonstracyjny beda dzialac z pliku.

Obrazy AI przez Puter.js wymagaja adresu `http://` albo `https://`. Do lokalnego
podgladu uruchom w folderze projektu:

```powershell
python -m http.server 4173
```

Nastepnie otworz:

```text
http://localhost:4173
```

## AI

- `Tekst AI` uzywa Hugging Face Router bezposrednio z przegladarki.
- `Obrazy AI` uzywa Puter.js i generuje serie kadrów do scen.
- `Research SCP` pobiera krotki kontekst z SCP Wiki i przekazuje go do AI.
- `Lektor` uzywa Web Speech API; jesli system ma polski glos, czyta po polsku.
- Wybory pod opowiescia dopisuja dalszy ciag historii.
- Token HF, checkboxy i ostatnia historia sa zapisywane w `localStorage`.

Token wkleja sie w polu `Token HF` w oknie aplikacji. To wygodne na czas
tworzenia, ale dla publicznej wersji token powinien byc ukryty po stronie
backendu.
