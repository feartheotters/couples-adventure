"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { usePeerConnection } from "./hooks/usePeerConnection";
import { SYSTEM_PROMPT, SCENARIOS } from "./lib/constants";
import type {
  Player,
  NarrativeEntry,
  Phase,
  GameMode,
  SyncState,
  PeerMessage,
} from "./lib/types";

const EMPTY_PLAYER: Player = { name: "", characterName: "", characterDesc: "" };

export default function Home() {
  // ── Core state ──
  const [phase, setPhase] = useState<Phase>("lobby");
  const [mode, setMode] = useState<GameMode | null>(null);
  const [myPlayer, setMyPlayer] = useState<1 | 2>(1);
  const [player1, setPlayer1] = useState<Player>({ ...EMPTY_PLAYER });
  const [player2, setPlayer2] = useState<Player>({ ...EMPTY_PLAYER });
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [customScenario, setCustomScenario] = useState("");
  const [useCustomScenario, setUseCustomScenario] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1);
  const [narrativeHistory, setNarrativeHistory] = useState<NarrativeEntry[]>([]);
  const [currentNarrative, setCurrentNarrative] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");

  // ── Local-mode handoff ──
  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffTarget, setHandoffTarget] = useState<1 | 2>(1);

  // ── Multiplayer lobby ──
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [guestReady, setGuestReady] = useState(false);

  const narrativeEndRef = useRef<HTMLDivElement>(null);
  const isMyTurn = mode === "local" || currentTurn === myPlayer;

  // ── Check URL for room code ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) setJoinCode(room.toUpperCase());
  }, []);

  // ── Peer connection ──
  const handlePeerMessage = useCallback(
    (msg: PeerMessage) => {
      if (msg.type === "playerInfo") {
        setPlayer2(msg.player);
        setGuestReady(true);
      } else if (msg.type === "action") {
        pendingActionRef.current = msg.action;
      } else if (msg.type === "stateSync") {
        const s = msg.state;
        setPhase(s.phase);
        setPlayer1(s.player1);
        setPlayer2(s.player2);
        setScenario(s.scenario);
        setCurrentTurn(s.currentTurn);
        setNarrativeHistory(s.narrativeHistory);
        setCurrentNarrative(s.currentNarrative);
        setOptions(s.options);
        setIsLoading(s.isLoading);
      }
    },
    []
  );

  const peer = usePeerConnection(handlePeerMessage);
  const pendingActionRef = useRef<string | null>(null);

  // ── Process pending guest action ──
  useEffect(() => {
    if (pendingActionRef.current && !isLoading && mode === "host") {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      callGenerate(action, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, mode]);

  // ── Sync state to guest (host only) ──
  function syncToGuest(overrides: Partial<SyncState> = {}) {
    if (mode !== "host" || !peer.isConnected) return;
    const state: SyncState = {
      phase,
      player1,
      player2,
      scenario: useCustomScenario ? customScenario : scenario,
      currentTurn,
      narrativeHistory,
      currentNarrative,
      options,
      isLoading,
      ...overrides,
    };
    peer.send({ type: "stateSync", state });
  }

  // ── Auto-scroll ──
  useEffect(() => {
    narrativeEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentNarrative, narrativeHistory]);

  // ── Claude API ──
  async function callGenerate(action: string, isStart: boolean) {
    setIsLoading(true);
    setError(null);

    if (mode === "host") {
      syncToGuest({ isLoading: true });
    }

    try {
      const activeScenario = useCustomScenario ? customScenario : scenario;

      let userMessage = "";
      if (isStart) {
        userMessage = `START A NEW GAME.\n\nPlayer 1: "${player1.name}" controls the character "${player1.characterName}" — ${player1.characterDesc}\nPlayer 2: "${player2.name}" controls the character "${player2.characterName}" — ${player2.characterDesc}\n\nSetting/Scenario: ${activeScenario}\n\nGenerate the opening scene that sets the mood and scenario. End by providing 4 options for ${player1.characterName} (controlled by ${player1.name}) to begin.`;
      } else {
        const historyText = narrativeHistory
          .map((entry) => {
            if (!entry.action) return entry.text;
            const p = entry.actingPlayer === 1 ? player1 : player2;
            return `[${p.characterName} chose: "${entry.action}"]\n${entry.text}`;
          })
          .join("\n\n---\n\n");

        const nextPlayer = currentTurn === 1 ? player1 : player2;
        const actingPlayer = currentTurn === 1 ? player2 : player1;

        userMessage = `GAME STATE:\nPlayer 1's character: "${player1.characterName}" — ${player1.characterDesc}\nPlayer 2's character: "${player2.characterName}" — ${player2.characterDesc}\n\nSTORY SO FAR:\n${historyText}\n\n${currentNarrative}\n\nNOW: ${actingPlayer.characterName} chose the action: "${action}"\n\nContinue the narrative based on this action. Then provide 4 options for ${nextPlayer.characterName} (the other player's character) to respond.\n\nRemember: only set gameOver to true when BOTH characters have reached orgasm in the story.`;
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(
          errData?.error?.message || `API request failed (${res.status})`
        );
      }

      const resData = await res.json();
      const content = resData.content?.[0];
      if (!content || content.type !== "text") throw new Error("Unexpected response format");

      let jsonText = content.text.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonText = jsonMatch[1].trim();
      const data = JSON.parse(jsonText);

      if (isStart) {
        setCurrentNarrative(data.narrative);
        setOptions(data.options);
        setCurrentTurn(1);
        setPhase("playing");
        setIsLoading(false);
        syncToGuest({
          phase: "playing",
          currentNarrative: data.narrative,
          options: data.options,
          currentTurn: 1,
          isLoading: false,
        });
      } else {
        const newHistory = [
          ...narrativeHistory,
          { text: currentNarrative, actingPlayer: 0, action: "" },
        ];
        const nextTurn: 1 | 2 = currentTurn === 1 ? 2 : 1;
        const newPhase = data.gameOver ? "finished" : "playing";

        setNarrativeHistory(newHistory);
        setCurrentNarrative(data.narrative);
        setOptions(data.options);
        setIsLoading(false);

        if (data.gameOver) {
          setPhase("finished");
        } else {
          setCurrentTurn(nextTurn);
          if (mode === "local") {
            setHandoffTarget(nextTurn);
            setShowHandoff(true);
          }
        }

        syncToGuest({
          phase: newPhase,
          narrativeHistory: newHistory,
          currentNarrative: data.narrative,
          options: data.options,
          currentTurn: nextTurn,
          isLoading: false,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsLoading(false);
      if (mode === "host") syncToGuest({ isLoading: false });
    }
  }

  // ── Handlers ──
  function handleStart(e: FormEvent) {
    e.preventDefault();
    callGenerate("", true);
  }

  function handleOptionSelect(option: string) {
    if (mode === "guest") {
      peer.send({ type: "action", action: option });
      return;
    }
    setFreeText("");
    callGenerate(option, false);
  }

  function handleFreeTextSubmit(e: FormEvent) {
    e.preventDefault();
    if (!freeText.trim()) return;
    if (mode === "guest") {
      peer.send({ type: "action", action: freeText.trim() });
      setFreeText("");
      return;
    }
    callGenerate(freeText.trim(), false);
    setFreeText("");
  }

  function handlePlayAgain() {
    setPhase("lobby");
    setMode(null);
    setNarrativeHistory([]);
    setCurrentNarrative("");
    setOptions([]);
    setCurrentTurn(1);
    setError(null);
    setGuestReady(false);
    peer.cleanup();
  }

  async function handleCreateRoom() {
    setIsCreating(true);
    setError(null);
    try {
      await peer.createRoom();
      setMode("host");
      setMyPlayer(1);
      setPhase("setup");
    } catch {
      // error set by hook
    } finally {
      setIsCreating(false);
    }
  }

  async function handleJoinRoom(e: FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setIsJoining(true);
    setError(null);
    try {
      await peer.joinRoom(joinCode.trim());
      setMode("guest");
      setMyPlayer(2);
      setPhase("setup");
    } catch {
      // error set by hook
    } finally {
      setIsJoining(false);
    }
  }

  function handleLocalMode() {
    setMode("local");
    setMyPlayer(1);
    setPhase("setup");
  }

  function handleGuestSubmitInfo(e: FormEvent) {
    e.preventDefault();
    peer.send({ type: "playerInfo", player: player2 });
    setGuestReady(true);
  }

  const activePlayer = currentTurn === 1 ? player1 : player2;
  const activeCharacter = currentTurn === 1 ? player1.characterName : player2.characterName;

  // ═══════════════════════════════════════
  // LOBBY
  // ═══════════════════════════════════════
  if (phase === "lobby") {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-rose-400 via-purple-400 to-rose-400 bg-clip-text text-transparent mb-3">
            Intimate Adventures
          </h1>
          <p className="text-slate-400 text-base sm:text-lg mb-10">
            An AI-powered narrative game for couples
          </p>

          <div className="space-y-4">
            <button
              onClick={handleLocalMode}
              className="w-full py-4 bg-gradient-to-r from-rose-600 to-purple-700 hover:from-rose-500 hover:to-purple-600 text-white font-semibold rounded-xl transition-all text-base touch-manipulation"
            >
              Play on Same Device
            </button>

            <div className="flex items-center gap-3 text-slate-600 text-sm">
              <div className="flex-1 border-t border-slate-800" />
              or play remotely
              <div className="flex-1 border-t border-slate-800" />
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={isCreating}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold rounded-xl transition-all text-base touch-manipulation disabled:opacity-50"
            >
              {isCreating ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingDots /> Creating room...
                </span>
              ) : (
                "Create Game"
              )}
            </button>

            <form onSubmit={handleJoinRoom} className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Room code"
                maxLength={6}
                className="flex-1 px-4 py-4 bg-slate-800 border border-slate-700 rounded-xl text-center text-lg font-mono tracking-widest text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 touch-manipulation"
              />
              <button
                type="submit"
                disabled={joinCode.length < 6 || isJoining}
                className="px-6 py-4 bg-purple-700 hover:bg-purple-600 disabled:opacity-30 text-white font-semibold rounded-xl transition-all touch-manipulation"
              >
                {isJoining ? <LoadingDots /> : "Join"}
              </button>
            </form>
          </div>

          {(error || peer.error) && (
            <p className="text-red-400 text-sm mt-4">{error || peer.error}</p>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // HANDOFF (local mode only)
  // ═══════════════════════════════════════
  if (mode === "local" && showHandoff && !isLoading) {
    const target = handoffTarget === 1 ? player1 : player2;
    const color = handoffTarget === 1 ? "rose" : "purple";
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
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
            className={`px-8 py-4 rounded-xl font-semibold text-white text-lg transition-all touch-manipulation ${
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

  // ═══════════════════════════════════════
  // SETUP
  // ═══════════════════════════════════════
  if (phase === "setup") {
    // ── Guest setup ──
    if (mode === "guest") {
      return (
        <div className="min-h-dvh flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <h1 className="text-3xl sm:text-4xl font-bold text-center bg-gradient-to-r from-rose-400 to-purple-400 bg-clip-text text-transparent mb-2">
              Intimate Adventures
            </h1>
            <p className="text-center text-slate-400 mb-6">
              Connected to room{" "}
              <span className="font-mono text-purple-400">{peer.roomCode}</span>
            </p>

            {!guestReady ? (
              <form
                onSubmit={handleGuestSubmitInfo}
                className="space-y-4 bg-slate-900/80 border border-purple-900/50 rounded-2xl p-6"
              >
                <h3 className="font-semibold text-purple-400">Your Character</h3>
                <input
                  required
                  placeholder="Your name"
                  value={player2.name}
                  onChange={(e) => setPlayer2({ ...player2, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 touch-manipulation"
                />
                <input
                  required
                  placeholder="Character name"
                  value={player2.characterName}
                  onChange={(e) => setPlayer2({ ...player2, characterName: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 touch-manipulation"
                />
                <textarea
                  required
                  placeholder="Describe your character (appearance, personality, vibe...)"
                  value={player2.characterDesc}
                  onChange={(e) => setPlayer2({ ...player2, characterDesc: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none touch-manipulation"
                />
                <button
                  type="submit"
                  className="w-full py-4 bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-xl transition-all touch-manipulation"
                >
                  Submit &amp; Wait for Host
                </button>
              </form>
            ) : (
              <div className="text-center space-y-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-8">
                <LoadingDots />
                <p className="text-slate-400">Waiting for the host to start the game...</p>
                <p className="text-sm text-slate-600">
                  You&apos;ll play as{" "}
                  <span className="text-purple-400">{player2.characterName}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ── Host / Local setup ──
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-6">
            <h1 className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-rose-400 via-purple-400 to-rose-400 bg-clip-text text-transparent mb-2">
              Intimate Adventures
            </h1>
            {mode === "host" && peer.roomCode && (
              <div className="mt-2 space-y-1">
                <p className="text-slate-400 text-sm">
                  Share this code with your partner:
                </p>
                <p className="text-3xl font-mono font-bold tracking-widest text-purple-400">
                  {peer.roomCode}
                </p>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}${window.location.pathname}?room=${peer.roomCode}`;
                    navigator.clipboard?.writeText(url);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-300 underline touch-manipulation"
                >
                  Copy invite link
                </button>
                <p className="text-xs mt-1">
                  {peer.isConnected ? (
                    <span className="text-green-400">Partner connected</span>
                  ) : (
                    <span className="text-yellow-400 animate-pulse">Waiting for partner...</span>
                  )}
                </p>
              </div>
            )}
          </div>

          <form
            onSubmit={handleStart}
            className="space-y-5 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 sm:p-8"
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
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 touch-manipulation"
              />
              <p className="text-xs text-slate-500 mt-1">
                Your key is sent directly to Claude&apos;s API and never stored
                {mode === "host" ? " or shared with your partner" : ""}.
              </p>
            </div>

            {/* Players */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Player 1 */}
              <div className="space-y-3 p-4 rounded-xl border border-rose-900/50 bg-rose-950/20">
                <h3 className="font-semibold text-rose-400">
                  {mode === "host" ? "You (Player 1)" : "Player 1"}
                </h3>
                <input
                  required
                  placeholder="Your name"
                  value={player1.name}
                  onChange={(e) => setPlayer1({ ...player1, name: e.target.value })}
                  className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 touch-manipulation"
                />
                <input
                  required
                  placeholder="Character name"
                  value={player1.characterName}
                  onChange={(e) => setPlayer1({ ...player1, characterName: e.target.value })}
                  className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 touch-manipulation"
                />
                <textarea
                  required
                  placeholder="Describe your character..."
                  value={player1.characterDesc}
                  onChange={(e) => setPlayer1({ ...player1, characterDesc: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none touch-manipulation"
                />
              </div>

              {/* Player 2 */}
              <div className="space-y-3 p-4 rounded-xl border border-purple-900/50 bg-purple-950/20">
                <h3 className="font-semibold text-purple-400">
                  {mode === "host" ? "Partner (Player 2)" : "Player 2"}
                </h3>
                {mode === "host" ? (
                  guestReady ? (
                    <div className="space-y-2 text-sm text-slate-300">
                      <p>
                        <span className="text-slate-500">Name:</span> {player2.name}
                      </p>
                      <p>
                        <span className="text-slate-500">Character:</span>{" "}
                        {player2.characterName}
                      </p>
                      <p>
                        <span className="text-slate-500">Description:</span>{" "}
                        {player2.characterDesc}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 italic py-4">
                      Waiting for partner to submit their character info...
                    </p>
                  )
                ) : (
                  <>
                    <input
                      required
                      placeholder="Partner's name"
                      value={player2.name}
                      onChange={(e) => setPlayer2({ ...player2, name: e.target.value })}
                      className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 touch-manipulation"
                    />
                    <input
                      required
                      placeholder="Character name"
                      value={player2.characterName}
                      onChange={(e) => setPlayer2({ ...player2, characterName: e.target.value })}
                      className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 touch-manipulation"
                    />
                    <textarea
                      required
                      placeholder="Describe their character..."
                      value={player2.characterDesc}
                      onChange={(e) => setPlayer2({ ...player2, characterDesc: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none touch-manipulation"
                    />
                  </>
                )}
              </div>
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
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/50 touch-manipulation"
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
                    className="text-sm text-rose-400 hover:text-rose-300 touch-manipulation"
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
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none touch-manipulation"
                  />
                  <button
                    type="button"
                    onClick={() => setUseCustomScenario(false)}
                    className="text-sm text-rose-400 hover:text-rose-300 touch-manipulation"
                  >
                    Pick from presets instead...
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || (mode === "host" && !guestReady)}
              className="w-full py-4 bg-gradient-to-r from-rose-600 to-purple-700 hover:from-rose-500 hover:to-purple-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-lg touch-manipulation"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingDots /> Setting the scene...
                </span>
              ) : mode === "host" && !guestReady ? (
                "Waiting for partner..."
              ) : (
                "Begin Your Adventure"
              )}
            </button>

            {(error || peer.error) && (
              <p className="text-red-400 text-sm text-center">
                {error || peer.error}
              </p>
            )}
          </form>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // PLAYING / FINISHED
  // ═══════════════════════════════════════
  return (
    <div className="min-h-dvh flex flex-col max-w-3xl mx-auto px-4 pb-safe">
      {/* Header */}
      <header className="flex items-center justify-between py-3 sm:py-4 border-b border-slate-800 mb-4 shrink-0">
        <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-rose-400 to-purple-400 bg-clip-text text-transparent">
          Intimate Adventures
        </h1>
        <div className="flex items-center gap-2 sm:gap-4">
          {mode !== "local" && (
            <span
              className={`w-2 h-2 rounded-full ${
                peer.isConnected ? "bg-green-400" : "bg-red-400"
              }`}
            />
          )}
          {phase === "playing" && (
            <span
              className={`text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 rounded-full ${
                currentTurn === 1
                  ? "bg-rose-900/50 text-rose-300"
                  : "bg-purple-900/50 text-purple-300"
              }`}
            >
              {isMyTurn
                ? "Your turn"
                : `${activePlayer.name}'s turn`}
            </span>
          )}
          {phase === "finished" && (
            <span className="text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 rounded-full bg-rose-900/50 text-rose-300">
              The End
            </span>
          )}
        </div>
      </header>

      {/* Narrative Area */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {narrativeHistory.map((entry, i) => (
          <div key={i} className="animate-fade-in">
            {entry.action && (
              <div className="text-xs text-slate-500 mb-1 italic">
                Action: {entry.action}
              </div>
            )}
            <div className="narrative-text text-slate-300 leading-relaxed whitespace-pre-line text-sm sm:text-base">
              {entry.text}
            </div>
            <div className="border-b border-slate-800/50 my-4" />
          </div>
        ))}

        {currentNarrative && (
          <div className="animate-fade-in">
            <div className="narrative-text text-slate-200 leading-relaxed whitespace-pre-line text-base sm:text-lg">
              {currentNarrative}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-3 text-slate-400 py-4">
            <LoadingDots />
            <span className="italic text-sm">The story unfolds...</span>
          </div>
        )}

        <div ref={narrativeEndRef} />
      </div>

      {/* Actions Area */}
      {phase === "playing" && !isLoading && options.length > 0 && (
        <div className="shrink-0 border-t border-slate-800 pt-4 pb-2 space-y-3">
          {isMyTurn ? (
            <>
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
                    className="text-left px-4 py-3 bg-slate-800/80 hover:bg-slate-700/80 active:bg-slate-600/80 border border-slate-700 hover:border-rose-600/50 rounded-xl text-sm text-slate-200 transition-all touch-manipulation min-h-[48px]"
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
                  className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 touch-manipulation"
                />
                <button
                  type="submit"
                  disabled={!freeText.trim()}
                  className="px-5 py-3 bg-rose-600 hover:bg-rose-500 active:bg-rose-400 disabled:opacity-30 text-white font-medium rounded-xl transition-colors text-sm touch-manipulation min-h-[48px]"
                >
                  Go
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-6">
              <LoadingDots />
              <p className="text-slate-400 mt-3">
                Waiting for{" "}
                <span
                  className={`font-semibold ${
                    currentTurn === 1 ? "text-rose-400" : "text-purple-400"
                  }`}
                >
                  {activePlayer.name}
                </span>{" "}
                to choose...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Finished */}
      {phase === "finished" && (
        <div className="shrink-0 border-t border-slate-800 pt-6 pb-4 text-center space-y-4">
          <p className="text-rose-300 text-lg italic">
            Your adventure has reached its climax...
          </p>
          <button
            onClick={handlePlayAgain}
            className="px-8 py-3 bg-gradient-to-r from-rose-600 to-purple-700 hover:from-rose-500 hover:to-purple-600 text-white font-semibold rounded-xl transition-all touch-manipulation"
          >
            Play Again
          </button>
        </div>
      )}

      {(error || peer.error) && (
        <div className="shrink-0 mt-2 p-3 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">
          {error || peer.error}
        </div>
      )}
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-1">
      <span
        className="w-2 h-2 bg-rose-400 rounded-full animate-pulse-slow"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-2 h-2 bg-purple-400 rounded-full animate-pulse-slow"
        style={{ animationDelay: "300ms" }}
      />
      <span
        className="w-2 h-2 bg-rose-400 rounded-full animate-pulse-slow"
        style={{ animationDelay: "600ms" }}
      />
    </span>
  );
}
