"use client";

import { useState, useRef, useEffect, FormEvent } from "react";

interface Player {
  name: string;
  characterName: string;
  characterDesc: string;
}

interface NarrativeEntry {
  text: string;
  actingPlayer: number;
  action: string;
}

type Phase = "setup" | "playing" | "finished";

const SCENARIOS = [
  "A chance encounter at a dimly lit cocktail bar on a rainy evening",
  "Two strangers sharing a private hot spring at a mountain resort",
  "A masquerade ball at a Venetian palazzo where identities are hidden",
  "Neighbors who keep running into each other, finally invited in for a nightcap",
  "A couples retreat on a secluded tropical island with a private beach",
  "Reunited after years apart, meeting at a cozy cabin in the mountains",
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [player1, setPlayer1] = useState<Player>({
    name: "",
    characterName: "",
    characterDesc: "",
  });
  const [player2, setPlayer2] = useState<Player>({
    name: "",
    characterName: "",
    characterDesc: "",
  });
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [customScenario, setCustomScenario] = useState("");
  const [useCustomScenario, setUseCustomScenario] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1);
  const [narrativeHistory, setNarrativeHistory] = useState<NarrativeEntry[]>(
    []
  );
  const [currentNarrative, setCurrentNarrative] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffTarget, setHandoffTarget] = useState<1 | 2>(1);

  const narrativeEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    narrativeEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentNarrative, narrativeHistory]);

  async function callGenerate(action: string, isStart: boolean) {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          player1,
          player2,
          scenario: useCustomScenario ? customScenario : scenario,
          currentTurn,
          narrativeHistory,
          action,
          isStart,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      if (isStart) {
        setCurrentNarrative(data.narrative);
        setOptions(data.options);
        setCurrentTurn(1);
        setPhase("playing");
      } else {
        const newEntry: NarrativeEntry = {
          text: data.narrative,
          actingPlayer: currentTurn === 1 ? 2 : 1,
          action,
        };
        setNarrativeHistory((prev) => [
          ...prev,
          { text: currentNarrative, actingPlayer: 0, action: "" },
        ]);
        setCurrentNarrative(data.narrative);
        setOptions(data.options);

        if (data.gameOver) {
          setPhase("finished");
        } else {
          const nextTurn: 1 | 2 = currentTurn === 1 ? 2 : 1;
          setHandoffTarget(nextTurn);
          setShowHandoff(true);
          setCurrentTurn(nextTurn);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  function handleStart(e: FormEvent) {
    e.preventDefault();
    callGenerate("", true);
  }

  function handleOptionSelect(option: string) {
    setFreeText("");
    callGenerate(option, false);
  }

  function handleFreeTextSubmit(e: FormEvent) {
    e.preventDefault();
    if (!freeText.trim()) return;
    callGenerate(freeText.trim(), false);
    setFreeText("");
  }

  function handlePlayAgain() {
    setPhase("setup");
    setNarrativeHistory([]);
    setCurrentNarrative("");
    setOptions([]);
    setCurrentTurn(1);
    setError(null);
  }

  const activePlayer = currentTurn === 1 ? player1 : player2;
  const activeCharacter = currentTurn === 1 ? player1.characterName : player2.characterName;

  // ── SETUP PHASE ──
  if (phase === "setup") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-rose-400 via-purple-400 to-rose-400 bg-clip-text text-transparent mb-3">
              Intimate Adventures
            </h1>
            <p className="text-slate-400 text-lg">
              An AI-powered narrative game for couples
            </p>
          </div>

          <form
            onSubmit={handleStart}
            className="space-y-6 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-8"
          >
            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Claude API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Your key is sent directly to Claude&apos;s API and never stored.
              </p>
            </div>

            {/* Players */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { label: "Player 1", state: player1, setter: setPlayer1, color: "rose" },
                { label: "Player 2", state: player2, setter: setPlayer2, color: "purple" },
              ].map(({ label, state, setter, color }) => (
                <div
                  key={label}
                  className={`space-y-3 p-4 rounded-xl border ${
                    color === "rose"
                      ? "border-rose-900/50 bg-rose-950/20"
                      : "border-purple-900/50 bg-purple-950/20"
                  }`}
                >
                  <h3
                    className={`font-semibold ${
                      color === "rose" ? "text-rose-400" : "text-purple-400"
                    }`}
                  >
                    {label}
                  </h3>
                  <input
                    required
                    placeholder="Your name"
                    value={state.name}
                    onChange={(e) =>
                      setter({ ...state, name: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  />
                  <input
                    required
                    placeholder="Character name"
                    value={state.characterName}
                    onChange={(e) =>
                      setter({ ...state, characterName: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  />
                  <textarea
                    required
                    placeholder="Describe your character (appearance, personality, vibe...)"
                    value={state.characterDesc}
                    onChange={(e) =>
                      setter({ ...state, characterDesc: e.target.value })
                    }
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none"
                  />
                </div>
              ))}
            </div>

            {/* Scenario */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Scenario
              </label>
              {!useCustomScenario ? (
                <div className="space-y-2">
                  <select
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  >
                    {SCENARIOS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setUseCustomScenario(true)}
                    className="text-sm text-rose-400 hover:text-rose-300"
                  >
                    Or write your own scenario...
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={customScenario}
                    onChange={(e) => setCustomScenario(e.target.value)}
                    placeholder="Describe the setting and situation..."
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none"
                  />
                  <button
                    type="button"
                    onClick={() => setUseCustomScenario(false)}
                    className="text-sm text-rose-400 hover:text-rose-300"
                  >
                    Pick from presets instead...
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-rose-600 to-purple-700 hover:from-rose-500 hover:to-purple-600 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingDots /> Setting the scene...
                </span>
              ) : (
                "Begin Your Adventure"
              )}
            </button>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}
          </form>
        </div>
      </div>
    );
  }

  // ── HANDOFF SCREEN ──
  if (showHandoff && !isLoading) {
    const target = handoffTarget === 1 ? player1 : player2;
    const color = handoffTarget === 1 ? "rose" : "purple";
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center animate-fade-in">
          <div
            className={`text-6xl mb-6 ${
              color === "rose" ? "text-rose-400" : "text-purple-400"
            }`}
          >
            &#9829;
          </div>
          <h2 className="text-3xl font-bold text-slate-100 mb-4">
            Pass to {target.name}
          </h2>
          <p className="text-slate-400 mb-8">
            It&apos;s {target.characterName}&apos;s turn to act
          </p>
          <button
            onClick={() => setShowHandoff(false)}
            className={`px-8 py-4 rounded-xl font-semibold text-white text-lg transition-all duration-200 ${
              color === "rose"
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-purple-700 hover:bg-purple-600"
            }`}
          >
            I&apos;m {target.name} — Show me
          </button>
        </div>
      </div>
    );
  }

  // ── PLAYING / FINISHED PHASE ──
  return (
    <div className="min-h-screen flex flex-col max-w-3xl mx-auto p-4">
      {/* Header */}
      <header className="flex items-center justify-between py-4 border-b border-slate-800 mb-4 shrink-0">
        <h1 className="text-xl font-bold bg-gradient-to-r from-rose-400 to-purple-400 bg-clip-text text-transparent">
          Intimate Adventures
        </h1>
        <div className="flex items-center gap-4">
          {phase === "playing" && (
            <span
              className={`text-sm font-medium px-3 py-1 rounded-full ${
                currentTurn === 1
                  ? "bg-rose-900/50 text-rose-300"
                  : "bg-purple-900/50 text-purple-300"
              }`}
            >
              {activePlayer.name}&apos;s turn
            </span>
          )}
          {phase === "finished" && (
            <span className="text-sm font-medium px-3 py-1 rounded-full bg-rose-900/50 text-rose-300">
              The End
            </span>
          )}
        </div>
      </header>

      {/* Narrative Area */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {/* History */}
        {narrativeHistory.map((entry, i) => (
          <div key={i} className="animate-fade-in">
            {entry.action && (
              <div className="text-xs text-slate-500 mb-1 italic">
                Action: {entry.action}
              </div>
            )}
            <div className="narrative-text text-slate-300 leading-relaxed whitespace-pre-line">
              {entry.text}
            </div>
            <div className="border-b border-slate-800/50 my-4" />
          </div>
        ))}

        {/* Current */}
        {currentNarrative && (
          <div className="animate-fade-in">
            <div className="narrative-text text-slate-200 leading-relaxed text-lg whitespace-pre-line">
              {currentNarrative}
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-3 text-slate-400 py-4">
            <LoadingDots />
            <span className="italic">The story unfolds...</span>
          </div>
        )}

        <div ref={narrativeEndRef} />
      </div>

      {/* Actions Area */}
      {phase === "playing" && !isLoading && options.length > 0 && (
        <div className="shrink-0 border-t border-slate-800 pt-4 space-y-3">
          <p className="text-sm text-slate-400">
            What does{" "}
            <span
              className={`font-semibold ${
                currentTurn === 1 ? "text-rose-400" : "text-purple-400"
              }`}
            >
              {activeCharacter}
            </span>{" "}
            do next?
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {options.map((option, i) => (
              <button
                key={i}
                onClick={() => handleOptionSelect(option)}
                className="text-left px-4 py-3 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-rose-600/50 rounded-xl text-sm text-slate-200 transition-all duration-200"
              >
                {option}
              </button>
            ))}
          </div>

          <form onSubmit={handleFreeTextSubmit} className="flex gap-2">
            <input
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Or describe a custom action..."
              className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            />
            <button
              type="submit"
              disabled={!freeText.trim()}
              className="px-6 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors text-sm"
            >
              Go
            </button>
          </form>
        </div>
      )}

      {/* Finished */}
      {phase === "finished" && (
        <div className="shrink-0 border-t border-slate-800 pt-6 text-center space-y-4">
          <p className="text-rose-300 text-lg italic">
            Your adventure has reached its climax...
          </p>
          <button
            onClick={handlePlayAgain}
            className="px-8 py-3 bg-gradient-to-r from-rose-600 to-purple-700 hover:from-rose-500 hover:to-purple-600 text-white font-semibold rounded-xl transition-all duration-200"
          >
            Play Again
          </button>
        </div>
      )}

      {error && (
        <div className="shrink-0 mt-2 p-3 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="w-2 h-2 bg-rose-400 rounded-full animate-pulse-slow" style={{ animationDelay: "0ms" }} />
      <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse-slow" style={{ animationDelay: "300ms" }} />
      <span className="w-2 h-2 bg-rose-400 rounded-full animate-pulse-slow" style={{ animationDelay: "600ms" }} />
    </span>
  );
}
