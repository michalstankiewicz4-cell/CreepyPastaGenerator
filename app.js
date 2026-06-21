const memoryKeys = {
  lastStory: "creepypasta-studio-story",
  preferences: "creepypasta-studio-preferences",
};

const storyVersion = 3;
const hfModel = "openai/gpt-oss-120b:fastest";
const googleModel = "gemini-2.5-flash-lite"; // domyslny/fallback model Gemini do inspiracji
const scpWikiBase = "https://scp-wiki.wikidot.com";
// Proxy CORS do SCP Wiki (po kolei, az ktores zadziala). r.jina.ai zwraca czysty
// tekst (markdown) — najpewniejsze; allorigins to zapas zwracajacy surowy HTML.
const scpProxies = [
  {
    build: (url) => `https://r.jina.ai/${url}`,
    extract: (raw) => cleanScpText(stripJinaHeader(raw)),
  },
  {
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    extract: (raw) => extractScpHtml(raw),
  },
];
const isFileProtocol = window.location.protocol === "file:";
let puterScriptPromise = null;

const formEl = document.querySelector("#story-form");
const topicInput = document.querySelector("#topic-input");
const sceneCountSelect = document.querySelector("#scene-count");
const generateButton = document.querySelector("#generate-button");
const randomTopicButton = document.querySelector("#random-topic-button");
const clearButton = document.querySelector("#clear-button");
const speakButton = document.querySelector("#speak-button");
const aiToggle = document.querySelector("#ai-toggle");
const researchToggle = document.querySelector("#research-toggle");
const imageToggle = document.querySelector("#image-toggle");
const imageModelSelect = document.querySelector("#image-model");
const narratorToggle = document.querySelector("#narrator-toggle");
const hfTokenInput = document.querySelector("#hf-token");
const tokenStatusEl = document.querySelector("#token-status");
const googleKeyInput = document.querySelector("#google-key");
const googleKeyStatusEl = document.querySelector("#google-key-status");
const geminiModelSelect = document.querySelector("#gemini-model");
const geminiGroundingToggle = document.querySelector("#gemini-grounding");
const geminiBlock = document.querySelector("#gemini-block");

// Pomocnicze do grup radio (zrodlo inspiracji / zrodlo obrazow).
function getRadio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
}
function setRadio(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}
function onRadioChange(name, handler) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((el) =>
    el.addEventListener("change", handler),
  );
}
const storyTitleEl = document.querySelector("#story-title");
const storyOutputEl = document.querySelector("#story-output");
const choiceListEl = document.querySelector("#choice-list");
const modeBadgeEl = document.querySelector("#mode-badge");

const preferences = loadPreferences();
aiToggle.checked = preferences.textAi;
researchToggle.checked = preferences.research;
setRadio("research-source", preferences.researchSource);
geminiModelSelect.value = preferences.geminiModel;
geminiGroundingToggle.checked = preferences.geminiGrounding;
imageToggle.checked = preferences.imageAi;
setRadio("image-provider", preferences.imageProvider);
imageModelSelect.value = preferences.imageModel;
updateImageProviderUI();
setRadio("key-storage", preferences.keyStorage);
narratorToggle.checked = preferences.narrator;
// Token/klucz trzymamy w zmiennej w pamieci jako zrodlo prawdy — pole <input type="password">
// po odswiezeniu bywa przejmowane przez autofill przegladarki i zwraca pusta wartosc do JS.
let hfToken = preferences.hfToken || "";
let googleKey = preferences.googleKey || "";
let isGenerating = false; // blokada przed rownoleglym generowaniem/kontynuacja (np. podwojny klik)
hfTokenInput.value = hfToken;
googleKeyInput.value = googleKey;
sceneCountSelect.value = String(preferences.sceneCount);
updateTokenStatus();
updateGoogleKeyStatus();
updateOptionsVisibility();

// Pokazuje opcje Gemini (model + grounding) tylko gdy zrodlo inspiracji = Google AI,
// a radia zrodla wyszarza, gdy research jest wylaczony. Klucze maja wlasna pod-zakladke.
function updateOptionsVisibility() {
  geminiBlock.hidden = getRadio("research-source") !== "google";
  document
    .querySelectorAll('input[name="research-source"]')
    .forEach((el) => (el.disabled = !researchToggle.checked));
}

// W trybie RAM klucz zyje tylko w pamieci sesji; w localhost jest zapisany w przegladarce.
function keyStatusText() {
  return getRadio("key-storage") === "ram" ? "✓ w pamięci" : "✓ zapisany";
}

function setSavedStatus(el, hasValue) {
  if (!el) return;
  el.textContent = hasValue ? keyStatusText() : "";
  el.className = hasValue ? "token-status saved" : "token-status";
}

function updateGoogleKeyStatus() {
  setSavedStatus(googleKeyStatusEl, googleKey);
}

function updateTokenStatus() {
  setSavedStatus(tokenStatusEl, hfToken);
}

// Modele Hugging Face do generowania obrazow (text-to-image).
const hfImageModels = {
  "flux-schnell": "black-forest-labs/FLUX.1-schnell",
  sdxl: "stabilityai/stable-diffusion-xl-base-1.0",
};

// Pole wyboru modelu ma sens tylko dla Hugging Face; Puter.js wymaga http/https.
function updateImageProviderUI() {
  const isHuggingFace = getRadio("image-provider") === "huggingface";
  imageModelSelect.disabled = !isHuggingFace;

  const puterOnFile = isFileProtocol && !isHuggingFace;
  imageToggle.disabled = puterOnFile;
  if (puterOnFile) {
    imageToggle.checked = false;
    imageToggle.title = "Puter.js wymaga adresu http/https. Wybierz Hugging Face albo uruchom serwer.";
  } else {
    imageToggle.title = "";
  }
}

const savedStory = loadLastStory();
if (savedStory) {
  renderStory(savedStory);
} else {
  renderChoices([]);
}

// ===== Narracja (krzywe tempa/grozy + punkt zwrotu z zakladki Narracja) =====
const narrationKey = "creepypasta-studio-charts-v1"; // ten sam klucz co charts.js
const narrationStep = 0.2; // jeden fragment = 1/5 luku narracyjnego (~5 klikniec = pelny luk)
const narrationDefaults = {
  pace: [
    { x: 0.0, y: 0.2 }, { x: 0.25, y: 0.35 }, { x: 0.5, y: 0.6 },
    { x: 0.75, y: 0.82 }, { x: 1.0, y: 0.95 },
  ],
  fear: [
    { x: 0.0, y: 0.05 }, { x: 0.3, y: 0.28 }, { x: 0.55, y: 0.55 },
    { x: 0.75, y: 0.88 }, { x: 1.0, y: 0.72 },
  ],
  twist: 0.62,
};

function loadNarrationCurves() {
  try {
    const raw = JSON.parse(localStorage.getItem(narrationKey));
    if (raw && Array.isArray(raw.pace) && Array.isArray(raw.fear) && typeof raw.twist === "number") {
      return raw;
    }
  } catch (error) {}
  return narrationDefaults;
}

// Liniowa interpolacja krzywej (tablica {x,y}, x i y w zakresie 0..1) w punkcie x.
function sampleCurve(points, x) {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length === 0) return 0.5;
  if (x <= sorted[0].x) return sorted[0].y;
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;
  for (let i = 1; i < sorted.length; i += 1) {
    if (x <= sorted[i].x) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const t = (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return sorted[sorted.length - 1].y;
}

function narrationTrend(yStart, yEnd) {
  const delta = yEnd - yStart;
  if (delta > 0.05) return "rośnie";
  if (delta < -0.05) return "maleje";
  return "utrzymuje się";
}

// Buduje opis luku dla biezacego fragmentu (segment [progress, progress+krok]).
function buildNarration(progress) {
  const curves = loadNarrationCurves();
  const segStart = Math.max(0, Math.min(1, progress));
  const segEnd = Math.max(0, Math.min(1, progress + narrationStep));
  const segMid = (segStart + segEnd) / 2;
  const toLevel = (y) => Math.max(1, Math.min(10, Math.round(y * 10)));

  const pace = {
    level: toLevel(sampleCurve(curves.pace, segMid)),
    trend: narrationTrend(sampleCurve(curves.pace, segStart), sampleCurve(curves.pace, segEnd)),
  };
  const fear = {
    level: toLevel(sampleCurve(curves.fear, segMid)),
    trend: narrationTrend(sampleCurve(curves.fear, segStart), sampleCurve(curves.fear, segEnd)),
  };
  const twist = curves.twist >= segStart && curves.twist < segEnd;

  const brief = [
    `Tempo akcji: ${pace.level}/10, ${pace.trend}.`,
    `Poziom grozy: ${fear.level}/10, ${fear.trend}.`,
    twist ? "W TYM fragmencie wprowadź wyraźny punkt zwrotny akcji." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { progress: Number(segMid.toFixed(2)), pace, fear, twist, brief };
}

async function generateStory(event) {
  event.preventDefault();
  const topic = topicInput.value.trim();
  if (!topic) {
    topicInput.focus();
    return;
  }
  if (isGenerating) return;
  isGenerating = true;

  savePreferences();
  setBusy("Piszę opowieść...");

  try {
    const settings = {
      topic,
      sceneCount: Number(sceneCountSelect.value),
      research: [],
      previousStory: "",
      choice: "",
      narration: buildNarration(0),
    };

    if (researchToggle.checked) {
      settings.research = await fetchResearch(topic).catch(() => []);
    }

    const story = await generateSegment(settings);
    story.progress = 0;
    renderStory(story);
    saveLastStory(story);
    speakStoryIfEnabled(story.story);

    if (imageToggle.checked) {
      await generateImages(story);
    }
  } catch (error) {
    showNotice(`Błąd generowania: ${error.message}. Spróbuj ponownie lub kliknij Wyczyść.`);
  } finally {
    isGenerating = false;
    setReady();
  }
}

async function createAiStory(settings) {
  const token = hfToken || hfTokenInput.value.trim();
  if (!token) {
    throw new Error("Brakuje tokenu Hugging Face.");
  }

  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: hfModel,
      stream: false,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Piszesz po polsku interaktywne creepypasty w klimacie SCP. Używaj poprawnej polszczyzny z pełnymi znakami diakrytycznymi (ą, ć, ę, ł, ń, ó, ś, ź, ż). Zwróć tylko JSON: title, story, scenes, choices. story ma mieć 900-1400 znaków, bez gore i bez przemocy wobec dzieci. Pole research traktuj jako inspirację i streszczenie tła, nie kopiuj dosłownie. Jeśli dostajesz previousStory i choice, kontynuuj historię. scenes to tablica z polami caption i imagePrompt. choices to 3 decyzje dla czytelnika. imagePrompt po angielsku, cinematic SCP horror atmosphere, no text, no gore. Pole narration to plan łuku narracyjnego dla TEGO fragmentu: pace.level (1-10) i fear.level (1-10) z trendem (rośnie/maleje/utrzymuje się). Dostosuj tempo i natężenie grozy do tych wartości oraz ich trendu. Jeśli narration.twist jest true, wprowadź w tym fragmencie wyraźny zwrot akcji.",
        },
        {
          role: "user",
          content: JSON.stringify(settings),
        },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Nieprawidłowy lub niedozwolony token Hugging Face (HTTP " + response.status + ").");
    }
    throw new Error("Hugging Face nie odpowiedział poprawnie (HTTP " + response.status + ").");
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Hugging Face zwrócił pusty tekst.");
  }

  return normalizeStory(JSON.parse(content), settings);
}

// Generuje jeden fragment: AI jesli wlaczone, z czytelnym fallbackiem do trybu lokalnego.
async function generateSegment(settings) {
  if (!aiToggle.checked) return { ...createLocalStory(settings), mode: "local" };
  try {
    return { ...(await createAiStory(settings)), mode: "ai" };
  } catch (error) {
    showNotice(`${error.message} Pokazano tryb demonstracyjny.`);
    return { ...createLocalStory(settings), mode: "local" };
  }
}

function showNotice(message) {
  let el = document.querySelector("#app-notice");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-notice";
    el.className = "app-notice";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => el.classList.remove("visible"), 6000);
}

function createLocalStory(settings) {
  const researchLine = settings.research?.[0]
    ? `W archiwum SCP trafia się notatka: ${settings.research[0].extract}`
    : "W archiwum SCP nie ma prostych odpowiedzi, tylko akta z czarnymi prostokątami i datami bez podpisu.";
  const choiceLine = settings.choice
    ? `Wybrano: ${settings.choice}. Od tego momentu zapis zmienia ton, jakby ktoś inny przejął raport.`
    : "";
  const narration = settings.narration;
  const moodLine = narration
    ? narration.fear.level >= 7
      ? "Powietrze gęstnieje, a każdy dźwięk wydaje się oddechem tuż za plecami."
      : narration.fear.level >= 4
        ? "Coś jest nie tak, choć trudno wskazać co — cisza ma zły rytm."
        : "Na razie jest tylko chłód i papierowy szelest akt."
    : "";
  const twistLine = narration?.twist
    ? "I wtedy następuje zwrot: raport zaczyna opisywać ciebie, czytelnika, w czasie teraźniejszym."
    : "";
  const title = `Raport nocny: ${settings.topic}`;
  const story = [
    `Temat zaczyna się niewinnie: ${settings.topic}.`,
    researchLine,
    moodLine,
    "Pierwszy świadek twierdzi, że wszystko wydarzyło się w miejscu, które na planach budynku nie istnieje. Drugi świadek nie pamięta zdarzenia, ale codziennie o 03:17 budzi się z tym samym zdaniem zapisanym na ręce.",
    choiceLine,
    twistLine,
    "Najgorszy jest materiał dowodowy. Każde nagranie pokazuje inny korytarz, ale na końcu zawsze stoi ta sama sylwetka: nieruchoma, lekko pochylona, jakby czekała na komendę. W raporcie dopisano tylko: nie odpowiadać, jeśli zapuka od środka.",
  ]
    .filter(Boolean)
    .join(" ");

  const step = narration ? Math.round(narration.progress / narrationStep) : 0;

  return {
    version: storyVersion,
    title,
    story,
    research: settings.research || [],
    choices: makeLocalChoices(step),
    scenes: makeLocalScenes(settings),
  };
}

function makeLocalChoices(step = 0) {
  const pools = [
    [
      "Otworzyć akta z czarnym stemplem",
      "Zejść do miejsca, którego nie ma na planie",
      "Odtworzyć nagranie od tyłu",
    ],
    [
      "Przesłuchać świadka, który niczego nie pamięta",
      "Wejść do pokoju, gdy zegar pokaże 03:17",
      "Spalić raport i wyjść bez słowa",
    ],
    [
      "Pójść za sylwetką w głąb korytarza",
      "Zadzwonić pod numer dopisany na marginesie",
      "Zostać w miejscu i czekać na pukanie",
    ],
    [
      "Złamać pieczęć Fundacji na ostatniej teczce",
      "Porównać zdjęcie, które za każdym razem wygląda inaczej",
      "Zamknąć drzwi od środka i zgasić światło",
    ],
  ];
  return pools[((step % pools.length) + pools.length) % pools.length];
}

function makeLocalScenes(settings) {
  const captions = [
    "Akta na metalowym stole",
    "Korytarz poza planem budynku",
    "Sylwetka w końcu nagrania",
    "Czerwone światło w pokoju obserwacji",
    "Drzwi opisane numerem, który nie istnieje",
  ];

  return captions.slice(0, settings.sceneCount).map((caption, index) => ({
    caption,
    imagePrompt: [
      "cinematic SCP foundation creepypasta still",
      settings.topic,
      `scene ${index + 1}: ${caption}`,
      "moody realistic horror, institutional corridor, analog surveillance, no gore, no text",
    ].join(", "),
    image: "",
  }));
}

function normalizeStory(rawStory, settings) {
  const title = String(rawStory.title || `Raport nocny: ${settings.topic}`).trim();
  const story = String(rawStory.story || "").trim();
  const scenes = Array.isArray(rawStory.scenes) ? rawStory.scenes : [];
  const choices = Array.isArray(rawStory.choices) ? rawStory.choices : [];
  const fallbackScenes = makeLocalScenes(settings);

  return {
    version: storyVersion,
    title,
    story: story || createLocalStory(settings).story,
    research: settings.research || [],
    choices: makeLocalChoices().map((choice, index) =>
      normalizeChoice(choices[index], choice),
    ),
    scenes: fallbackScenes.map((fallbackScene, index) => ({
      caption: String(scenes[index]?.caption || fallbackScene.caption).trim(),
      imagePrompt: String(scenes[index]?.imagePrompt || fallbackScene.imagePrompt).trim(),
      image: scenes[index]?.image || "",
    })),
  };
}

function normalizeChoice(choice, fallback) {
  if (typeof choice === "string") {
    return choice.trim() || fallback;
  }

  if (choice && typeof choice === "object") {
    return String(
      choice.label ||
        choice.text ||
        choice.choice ||
        choice.title ||
        choice.description ||
        fallback,
    ).trim();
  }

  return fallback;
}

function renderStory(story) {
  storyTitleEl.textContent = story.title;
  updateModeBadge(story.mode);
  renderStoryContent(story);
  renderChoices((story.choices || []).map((choice, index) =>
    normalizeChoice(choice, makeLocalChoices()[index] || "Kontynuuj historię"),
  ));
}

function updateModeBadge(mode) {
  if (!modeBadgeEl) return;
  if (mode === "ai") {
    modeBadgeEl.textContent = "● Online · AI";
    modeBadgeEl.className = "mode-badge online";
  } else if (mode === "local") {
    modeBadgeEl.textContent = "● Tryb lokalny · demo";
    modeBadgeEl.className = "mode-badge local";
  } else {
    modeBadgeEl.textContent = "";
    modeBadgeEl.className = "mode-badge";
  }
}

function renderStoryContent(story) {
  const paragraphs = splitStory(story.story);
  const frames = story.scenes || [];
  const blocks = paragraphs.map((paragraph, index) => {
    const frame = frames[index];
    const frameHtml = frame
      ? `
        <figure class="inline-frame ${index % 2 === 0 ? "left" : "right"}">
          <div class="inline-image">
            ${
              frame.image
                ? `<img src="${frame.image}" alt="${escapeHtml(frame.caption)}" />`
                : `<span>${imagePlaceholderText(index + 1)}</span>`
            }
          </div>
          <figcaption>${escapeHtml(frame.caption)}</figcaption>
        </figure>
      `
      : "";

    return `${frameHtml}<p>${escapeHtml(paragraph)}</p>`;
  });

  storyOutputEl.innerHTML = blocks.join("");
}

function splitStory(story) {
  return String(story)
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .reduce((groups, sentence, index) => {
      const groupIndex = Math.floor(index / 2);
      groups[groupIndex] = `${groups[groupIndex] || ""} ${sentence}`.trim();
      return groups;
    }, [])
    .filter(Boolean);
}

function renderChoices(choices) {
  const normalizedChoices = choices.map((choice, index) =>
    normalizeChoice(choice, makeLocalChoices()[index] || "Kontynuuj historię"),
  );

  if (normalizedChoices.length === 0) {
    choiceListEl.innerHTML = "<span>Wybory pojawią się po wygenerowaniu historii.</span>";
    return;
  }

  choiceListEl.innerHTML = normalizedChoices
    .map(
      (choice) =>
        `<button type="button" data-choice="${escapeHtml(choice)}">${escapeHtml(choice)}</button>`,
    )
    .join("");
}

async function continueStory(choice) {
  if (isGenerating) return;
  const currentStory = loadLastStory();
  if (!currentStory) return;
  isGenerating = true;

  const progress = Math.min(1, (currentStory.progress ?? 0) + narrationStep);
  const settings = {
    topic: topicInput.value.trim() || currentStory.title,
    sceneCount: Number(sceneCountSelect.value),
    research: currentStory.research || [],
    // Do AI wysylamy tylko koncowke historii — pelna tresc rosnie z kazdym wyborem
    // i potrafi przekroczyc limit modelu (czesta przyczyna nieudanej kontynuacji).
    previousStory: tailText(currentStory.story),
    choice,
    narration: buildNarration(progress),
  };

  setBusy("Kontynuuję wybór...");

  try {
    const nextStory = await generateSegment(settings);
    const mergedStory = {
      ...nextStory,
      version: storyVersion,
      title: currentStory.title,
      story: `${currentStory.story}\n\n${nextStory.story}`,
      research: currentStory.research || [],
      scenes: [...(currentStory.scenes || []), ...(nextStory.scenes || [])],
      progress,
    };

    renderStory(mergedStory);
    saveLastStory(mergedStory);
    speakStoryIfEnabled(nextStory.story);

    if (imageToggle.checked) {
      await generateImages(mergedStory);
    }
  } catch (error) {
    showNotice(`Błąd kontynuacji: ${error.message}. Kliknij Wyczyść i zacznij od nowa.`);
  } finally {
    isGenerating = false;
    setReady();
  }
}

// Zwraca koncowke tekstu (do max znakow), zaczynajac od granicy zdania, by nie przycinac w polowie.
function tailText(text, max = 2200) {
  const value = String(text || "");
  if (value.length <= max) return value;
  const tail = value.slice(value.length - max);
  const sentenceStart = tail.search(/[.!?]\s+/);
  return "…" + (sentenceStart >= 0 ? tail.slice(sentenceStart + 2) : tail);
}

// Wybiera zrodlo inspiracji wg ustawienia (SCP Wiki albo Google AI / Gemini).
async function fetchResearch(topic) {
  if (getRadio("research-source") === "google") {
    setBusy("Pytam Google AI...");
    return fetchGoogleResearch(topic);
  }
  setBusy("Przeglądam SCP Wiki...");
  return fetchScpResearch(topic);
}

// Gemini z groundingiem przez Google Search ("AI Mode") — zwraca krotkie tlo do tematu.
async function fetchGoogleResearch(topic) {
  const key = googleKey || googleKeyInput.value.trim();
  if (!key) {
    showNotice("Inspiracja Google AI wymaga klucza Google AI Studio.");
    return [];
  }
  // Wykrywamy tylko oczywiscie bledny typ klucza (inna usluga) — nie narzucamy formatu Google.
  const wrongKey = { "sk-ant-": "klucz Anthropic", hf_: "token Hugging Face", "sk-": "klucz OpenAI" };
  const wrongHit = Object.keys(wrongKey).find((prefix) => key.startsWith(prefix));
  if (wrongHit) {
    showNotice(`To wygląda na ${wrongKey[wrongHit]}, nie klucz Google. Wygeneruj klucz na aistudio.google.com/api-keys.`);
    return [];
  }

  const model = geminiModelSelect.value || googleModel;
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const prompt =
    `Podaj zwiezle, rzeczowe tlo (4-6 zdan) do tematu creepypasty: "${topic}". ` +
    "Jesli to obiekt SCP, opisz czym jest, jego klase i kluczowe wlasciwosci. " +
    "Sam konkret, bez wstepow.";

  const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
  // Grounding (Google Search) ma osobny, ograniczony darmowy limit — opcjonalny, by uniknac bledu 429.
  if (geminiGroundingToggle.checked) {
    requestBody.tools = [{ google_search: {} }];
  }

  // Klucz w naglowku (x-goog-api-key), nie w URL — dzieki temu nie trafia do logow konsoli/sieci.
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    showNotice(`Google AI HTTP ${response.status}${detail ? ` — ${detail.slice(0, 140)}` : ""}`);
    return [];
  }

  const payload = await response.json();
  const extract = (payload.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!extract) return [];
  return [{ title: "Google AI", extract: extract.slice(0, 900), url: "" }];
}

async function fetchScpResearch(topic) {
  const urls = buildScpCandidateUrls(topic);
  const results = [];

  for (const url of urls) {
    const text = await fetchScpExtract(url).catch(() => "");
    if (text) {
      results.push({ title: titleFromUrl(url), extract: text, url });
    }
    if (results.length >= 2) break;
  }

  if (results.length > 0) return results;

  return [
    {
      title: "SCP Foundation",
      extract:
        "SCP Wiki opisuje fikcyjną organizację zajmującą się zabezpieczaniem i badaniem anomalnych obiektów, miejsc oraz zjawisk.",
      url: scpWikiBase,
    },
  ];
}

// Pobiera i wyciaga opis SCP, probujac kolejnych proxy az ktores zwroci sensowna tresc.
async function fetchScpExtract(url) {
  for (const proxy of scpProxies) {
    try {
      const response = await fetch(proxy.build(url));
      if (!response.ok) continue;
      const raw = await response.text();
      const text = proxy.extract(raw);
      if (text && text.length > 60) return text;
    } catch (error) {
      // probujemy nastepne proxy
    }
  }
  return "";
}

function buildScpCandidateUrls(topic) {
  const normalized = topic.toLowerCase();
  const directMatch = normalized.match(/scp[-\s]?(\d{3,5})/);
  if (directMatch) {
    return [`${scpWikiBase}/scp-${directMatch[1]}`];
  }

  const slug = normalized
    .replace(/ą/g, "a")
    .replace(/ć/g, "c")
    .replace(/ę/g, "e")
    .replace(/ł/g, "l")
    .replace(/ń/g, "n")
    .replace(/ó/g, "o")
    .replace(/ś/g, "s")
    .replace(/ż|ź/g, "z")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return [
    `${scpWikiBase}/${slug}`,
    `${scpWikiBase}/search:site/q/${encodeURIComponent(topic)}`,
    `${scpWikiBase}/scp-series`,
  ];
}

// r.jina.ai poprzedza tresc naglowkiem (Title/URL Source/Markdown Content) — odcinamy go.
function stripJinaHeader(raw) {
  const marker = "Markdown Content:";
  const index = raw.indexOf(marker);
  return index >= 0 ? raw.slice(index + marker.length) : raw;
}

// Wyciaga tekst z surowego HTML strony SCP (zapasowe proxy), usuwajac szum (oceny, licencje, nawigacje).
function extractScpHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const content = doc.querySelector("#page-content") || doc.body;
  if (!content) return "";
  content
    .querySelectorAll(
      ".page-rate-widget-box, .creditRate, .licensebox, .footer-wikiwalk-nav, #u-credit-view, .info-container, script, style",
    )
    .forEach((el) => el.remove());
  return cleanScpText(content.textContent || "");
}

// Normalizuje tekst opisu: usuwa markdown, skleja biale znaki i zaczyna od "Item #:" (pomijajac szum).
function cleanScpText(text) {
  let clean = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // obrazki markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // linki markdown -> sam tekst
    .replace(/[*_`>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const itemIndex = clean.search(/Item\s*#/i);
  if (itemIndex > 0) clean = clean.slice(itemIndex);
  return clean.slice(0, 700);
}

function titleFromUrl(url) {
  return url
    .split("/")
    .pop()
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function currentImageSourceLabel() {
  if (getRadio("image-provider") === "huggingface") {
    return imageModelSelect.value === "sdxl" ? "Stable Diffusion XL" : "FLUX.1-schnell";
  }
  return "Puter.js";
}

function imagePlaceholderText(number) {
  if (isFileProtocol && getRadio("image-provider") !== "huggingface") {
    return "Puter.js wymaga http/https.";
  }

  return `Kadr ${number} czeka na obraz z ${currentImageSourceLabel()}.`;
}

async function generateImages(story) {
  if (getRadio("image-provider") === "huggingface") {
    return generateImagesHuggingFace(story);
  }
  return generateImagesPuter(story);
}

// Wspolna petla po kadrach: pomija juz gotowe, aktualizuje placeholder i zapisuje po kazdym obrazie.
async function generateImagesLoop(story, makeImage) {
  for (let index = 0; index < story.scenes.length; index += 1) {
    if (story.scenes[index].image) continue; // pomin kadry juz wygenerowane (np. z poprzednich wyborow)
    setBusy(`Tworzę obraz ${index + 1}/${story.scenes.length}...`);
    const frame = storyOutputEl.querySelectorAll(".inline-image")[index];
    if (frame) frame.innerHTML = "<span>Obraz powstaje...</span>";

    try {
      story.scenes[index].image = await makeImage(story.scenes[index].imagePrompt);
      renderStoryContent(story);
      saveLastStory(story);
    } catch (error) {
      if (frame) frame.innerHTML = "<span>Nie udało się wygenerować obrazu.</span>";
      showNotice(`Kadr ${index + 1}: ${error.message}`);
    }
  }
}

async function generateImagesPuter(story) {
  if (isFileProtocol) return;

  await loadPuterScript().catch(() => null);
  if (!window.puter?.ai?.txt2img) return;

  await generateImagesLoop(story, async (prompt) => {
    const image = await window.puter.ai.txt2img({
      prompt,
      model: "gpt-image-1-mini",
      quality: "low",
    });
    return image.src;
  });
}

async function generateImagesHuggingFace(story) {
  const token = hfToken || hfTokenInput.value.trim();
  if (!token) {
    showNotice("Obrazy przez Hugging Face wymagają tokenu.");
    return;
  }

  const model = hfImageModels[imageModelSelect.value] || hfImageModels["flux-schnell"];
  await generateImagesLoop(story, (prompt) => huggingFaceImage(prompt, token, model));
}

async function huggingFaceImage(prompt, token, model) {
  // Router HF (ten sam host co czat) z providerem hf-inference — zadanie text-to-image zwraca binarny obraz.
  const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    // wait_for_model: czekaj az model sie zaladuje zamiast bledu 503 przy zimnym starcie
    body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Hugging Face HTTP ${response.status}${detail ? ` — ${detail.slice(0, 160)}` : ""}`);
  }

  // Przy powodzeniu odpowiedz jest binarna; gdy provider zwroci JSON, to komunikat bledu.
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Hugging Face: ${detail.slice(0, 160) || "model nie zwrócił obrazu"}`);
  }

  // Binarny obraz -> data URL, zeby przetrwal w localStorage po odswiezeniu.
  const blob = await response.blob();
  return await blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadPuterScript() {
  if (window.puter?.ai?.txt2img) return Promise.resolve();
  if (puterScriptPromise) return puterScriptPromise;

  puterScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    script.addEventListener("load", resolve);
    script.addEventListener("error", () =>
      reject(new Error("Nie udało się załadować Puter.js.")),
    );
    document.head.appendChild(script);
  });

  return puterScriptPromise;
}

function speakStoryIfEnabled(text) {
  if (narratorToggle.checked) speakText(text);
}

function setSpeakButton(speaking) {
  speakButton.textContent = speaking ? "Zatrzymaj czytanie" : "Czytaj";
}

function speakText(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  utterance.lang = "pl-PL";
  utterance.voice =
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("pl")) || null;
  utterance.rate = 0.94;
  utterance.pitch = 0.88;
  utterance.addEventListener("start", () => setSpeakButton(true));
  utterance.addEventListener("end", () => setSpeakButton(false));
  utterance.addEventListener("cancel", () => setSpeakButton(false));
  speechSynthesis.speak(utterance);
}

function setBusy(label) {
  generateButton.disabled = true;
  generateButton.textContent = label;
}

function setReady() {
  generateButton.disabled = false;
  generateButton.textContent = "Generuj opowieść";
}

function saveLastStory(story) {
  localStorage.setItem(memoryKeys.lastStory, JSON.stringify({ ...story, version: storyVersion }));
}

function loadLastStory() {
  try {
    const story = JSON.parse(localStorage.getItem(memoryKeys.lastStory));
    return story?.version === storyVersion ? story : null;
  } catch (error) {
    return null;
  }
}

function savePreferences() {
  // W trybie RAM nie zapisujemy kluczy na dysk (zostaja tylko w pamieci sesji).
  const persistKeys = getRadio("key-storage") !== "ram";
  localStorage.setItem(
    memoryKeys.preferences,
    JSON.stringify({
      textAi: aiToggle.checked,
      research: researchToggle.checked,
      researchSource: getRadio("research-source"),
      geminiModel: geminiModelSelect.value,
      geminiGrounding: geminiGroundingToggle.checked,
      imageAi: imageToggle.checked,
      imageProvider: getRadio("image-provider"),
      imageModel: imageModelSelect.value,
      narrator: narratorToggle.checked,
      keyStorage: getRadio("key-storage"),
      hfToken: persistKeys ? hfToken : "",
      googleKey: persistKeys ? googleKey : "",
      sceneCount: Number(sceneCountSelect.value),
    }),
  );
}

function loadPreferences() {
  const defaults = {
    textAi: false,
    research: false,
    researchSource: "scp",
    geminiModel: "gemini-2.5-flash-lite",
    geminiGrounding: true,
    imageAi: false,
    imageProvider: "puter",
    imageModel: "flux-schnell",
    narrator: false,
    keyStorage: "localhost",
    hfToken: "",
    googleKey: "",
    sceneCount: 3,
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(memoryKeys.preferences)) };
  } catch (error) {
    return defaults;
  }
}

function clearStory() {
  localStorage.removeItem(memoryKeys.lastStory);
  speechSynthesis.cancel();
  setSpeakButton(false);
  storyTitleEl.textContent = "Czeka na temat";
  updateModeBadge(null);
  storyOutputEl.innerHTML =
    "<p>Wpisz temat i wygeneruj historię. Bez tokenu HF działa lokalny tryb demonstracyjny.</p>";
  renderChoices([]);
}

function randomTopic() {
  const topics = [
    "SCP-173 pojawia się na nagraniu z miejskiego monitoringu",
    "obiekt SCP przechowywany w starym szpitalu kolejowym",
    "kaseta VHS z procedurą, której nikt nie powinien odtwarzać",
    "drzwi w piwnicy bloku prowadzą do placówki Fundacji",
    "telefon alarmowy dzwoni z zamkniętego archiwum SCP",
  ];
  topicInput.value = topics[Math.floor(Math.random() * topics.length)];
  topicInput.focus();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

formEl.addEventListener("submit", generateStory);
randomTopicButton.addEventListener("click", randomTopic);
clearButton.addEventListener("click", clearStory);
speakButton.addEventListener("click", () => {
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    setSpeakButton(false);
    return;
  }
  const story = loadLastStory();
  if (story?.story) speakText(story.story);
});
hfTokenInput.addEventListener("input", () => {
  // Reagujemy tylko na zmiany od uzytkownika. Po zaladowaniu strony menedzer hasel/autofill
  // potrafi wyczyscic pole i odpalic zdarzenie "input" bez fokusu — to wymazywaloby zapisany token.
  if (document.activeElement !== hfTokenInput) return;
  hfToken = hfTokenInput.value.trim();
  savePreferences();
  updateTokenStatus();
});
googleKeyInput.addEventListener("input", () => {
  if (document.activeElement !== googleKeyInput) return;
  googleKey = googleKeyInput.value.trim();
  savePreferences();
  updateGoogleKeyStatus();
});
aiToggle.addEventListener("change", () => {
  updateOptionsVisibility();
  savePreferences();
});
researchToggle.addEventListener("change", () => {
  updateOptionsVisibility();
  savePreferences();
});
onRadioChange("research-source", () => {
  updateOptionsVisibility();
  savePreferences();
});
geminiModelSelect.addEventListener("change", savePreferences);
geminiGroundingToggle.addEventListener("change", savePreferences);
imageToggle.addEventListener("change", savePreferences);
onRadioChange("image-provider", () => {
  updateImageProviderUI();
  updateOptionsVisibility();
  savePreferences();
});
onRadioChange("key-storage", () => {
  // Zmiana trybu: zapisuje (localhost) lub usuwa z dysku (RAM) klucze + odswiezenie statusow.
  savePreferences();
  updateTokenStatus();
  updateGoogleKeyStatus();
});
imageModelSelect.addEventListener("change", savePreferences);
narratorToggle.addEventListener("change", savePreferences);
sceneCountSelect.addEventListener("change", savePreferences);
choiceListEl.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-choice]")?.dataset.choice;
  if (choice) continueStory(choice);
});
