"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type AppMode = "setup" | "focus" | "break";
type Soundscape = "rain" | "stream" | "night" | "silent";
type ThemeName = "paper" | "night";

type FocusSession = {
  id: string;
  date: string;
  minutes: number;
  pages: number;
  feeling: number;
  book: string;
};

type AppSettings = {
  breakMinutes: number;
  volume: number;
  soundscape: Soundscape;
  theme: ThemeName;
};

type AudioEngine = {
  context: AudioContext;
  master: GainNode;
  sources: AudioScheduledSourceNode[];
};

const DEFAULT_SETTINGS: AppSettings = {
  breakMinutes: 5,
  volume: 0.22,
  soundscape: "rain",
  theme: "paper",
};

const DURATION_PRESETS = [
  { minutes: 20, label: "轻读", note: "短章 / 通勤" },
  { minutes: 35, label: "沉浸", note: "推荐节律" },
  { minutes: 50, label: "深读", note: "长章 / 研究" },
];

const SOUND_OPTIONS: Array<{ id: Soundscape; label: string; glyph: string }> = [
  { id: "rain", label: "细雨", glyph: "///" },
  { id: "stream", label: "溪影", glyph: "≈" },
  { id: "night", label: "夜车", glyph: "···" },
  { id: "silent", label: "留白", glyph: "○" },
];

const dateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
};

const formatTime = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
};

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export function FocusApp() {
  const [mode, setMode] = useState<AppMode>("setup");
  const [durationMinutes, setDurationMinutes] = useState(35);
  const [totalSeconds, setTotalSeconds] = useState(35 * 60);
  const [remaining, setRemaining] = useState(35 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [bookTitle, setBookTitle] = useState("");
  const [readingGoal, setReadingGoal] = useState("");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [wasRunningBeforeStop, setWasRunningBeforeStop] = useState(false);
  const [pagesRead, setPagesRead] = useState("");
  const [feeling, setFeeling] = useState(4);
  const [toast, setToast] = useState("");
  const [clockHour, setClockHour] = useState(14);

  const targetTimeRef = useRef(0);
  const audioRef = useRef<AudioEngine | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const stopAudio = useCallback(() => {
    const engine = audioRef.current;
    if (!engine) return;
    engine.master.gain.cancelScheduledValues(engine.context.currentTime);
    engine.master.gain.setTargetAtTime(0, engine.context.currentTime, 0.04);
    window.setTimeout(() => {
      engine.sources.forEach((source) => {
        try {
          source.stop();
        } catch {
          // The source may already have ended.
        }
      });
      void engine.context.close();
    }, 180);
    audioRef.current = null;
  }, []);

  const startAudio = useCallback(() => {
    stopAudio();
    if (settings.soundscape === "silent" || typeof window === "undefined") return;

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = Math.max(0.001, settings.volume);
    master.connect(context.destination);
    const sources: AudioScheduledSourceNode[] = [];

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[index] = settings.soundscape === "night" ? last * 3.2 : white * 0.34 + last;
    }

    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = settings.soundscape === "rain" ? "highpass" : "lowpass";
    filter.frequency.value =
      settings.soundscape === "rain" ? 1150 : settings.soundscape === "stream" ? 720 : 380;
    const noiseGain = context.createGain();
    noiseGain.gain.value = settings.soundscape === "rain" ? 0.28 : 0.2;
    noise.connect(filter).connect(noiseGain).connect(master);
    noise.start();
    sources.push(noise);

    if (settings.soundscape !== "rain") {
      const tone = context.createOscillator();
      const toneGain = context.createGain();
      tone.type = "sine";
      tone.frequency.value = settings.soundscape === "stream" ? 174 : 92;
      tone.detune.value = settings.soundscape === "stream" ? -7 : 3;
      toneGain.gain.value = 0.028;
      tone.connect(toneGain).connect(master);
      tone.start();
      sources.push(tone);
    }

    audioRef.current = { context, master, sources };
  }, [settings.soundscape, settings.volume, stopAudio]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2800);
  }, []);

  useEffect(() => {
    const storedSettings = safeParse<AppSettings>(
      localStorage.getItem("inkflow:settings"),
      DEFAULT_SETTINGS,
    );
    const storedSessions = safeParse<FocusSession[]>(
      localStorage.getItem("inkflow:sessions"),
      [],
    );
    setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
    setSessions(storedSessions);
    setBookTitle(localStorage.getItem("inkflow:lastBook") || "");
    setReadingGoal(localStorage.getItem("inkflow:lastGoal") || "");
    setClockHour(new Date().getHours());
    setReady(true);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("inkflow:settings", JSON.stringify(settings));
  }, [ready, settings]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("inkflow:lastBook", bookTitle);
    localStorage.setItem("inkflow:lastGoal", readingGoal);
  }, [bookTitle, readingGoal, ready]);

  useEffect(() => {
    if (!isRunning) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((targetTimeRef.current - Date.now()) / 1000));
      setRemaining(next);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || remaining > 0) return;
    setIsRunning(false);
    stopAudio();
    if (mode === "focus") {
      setCompletionOpen(true);
      setPagesRead("");
      setFeeling(4);
      showToast("这一段阅读，已经沉淀下来了");
    } else if (mode === "break") {
      setMode("setup");
      setRemaining(durationMinutes * 60);
      setTotalSeconds(durationMinutes * 60);
      showToast("脑间歇完成，视线和思绪都回来了");
    }
  }, [durationMinutes, isRunning, mode, remaining, showToast, stopAudio]);

  useEffect(() => {
    if (mode === "setup") {
      document.title = "墨流 Inkflow｜为深度阅读留一片安静";
    } else {
      const state = isRunning ? "" : "已暂停 · ";
      document.title = state + formatTime(remaining) + (mode === "focus" ? " · 阅读中" : " · 脑间歇");
    }
    return () => {
      document.title = "墨流 Inkflow｜为深度阅读留一片安静";
    };
  }, [isRunning, mode, remaining]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button")) return;
      if (event.code === "Space" && mode !== "setup" && !completionOpen && !stopOpen) {
        event.preventDefault();
        if (isRunning) {
          const next = Math.max(
            0,
            Math.ceil((targetTimeRef.current - Date.now()) / 1000),
          );
          setRemaining(next);
          setIsRunning(false);
          stopAudio();
        } else {
          targetTimeRef.current = Date.now() + remaining * 1000;
          setIsRunning(true);
          startAudio();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    completionOpen,
    isRunning,
    mode,
    remaining,
    startAudio,
    stopAudio,
    stopOpen,
  ]);

  useEffect(
    () => () => {
      stopAudio();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    },
    [stopAudio],
  );

  const todayKey = dateKey();
  const todaySessions = useMemo(
    () => sessions.filter((session) => session.date === todayKey),
    [sessions, todayKey],
  );
  const todayMinutes = todaySessions.reduce((sum, session) => sum + session.minutes, 0);
  const todayPages = todaySessions.reduce((sum, session) => sum + session.pages, 0);

  const weekData = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = dateKey(date);
      const minutes = sessions
        .filter((session) => session.date === key)
        .reduce((sum, session) => sum + session.minutes, 0);
      return {
        key,
        label: index === 6 ? "今" : ["日", "一", "二", "三", "四", "五", "六"][date.getDay()],
        minutes,
      };
    });
  }, [sessions]);

  const smartAdvice = useMemo(() => {
    if (todayMinutes >= 90 || todaySessions.length >= 3) {
      return {
        eyebrow: "今天读得很深",
        title: "下一轮缩短到 20 分钟",
        body: "长时专注后，理解力往往比意志力更早疲劳。先去看远处、喝水，再读一个短段落。",
      };
    }
    if (clockHour >= 21) {
      return {
        eyebrow: "夜间低刺激模式",
        title: "用 20 分钟收束今天",
        body: "今晚更适合轻读与回看标记。结束后避开新章节，让大脑保留一个自然的停顿。",
      };
    }
    if (clockHour >= 13 && clockHour <= 15) {
      return {
        eyebrow: "午后能量缓坡",
        title: "35 分钟 + 5 分钟远眺",
        body: "先写下这一轮唯一想弄懂的问题。休息时把视线交给远处，不再摄入新的信息。",
      };
    }
    if (todaySessions.length === 0) {
      return {
        eyebrow: "第一滴墨",
        title: "从 35 分钟开始刚刚好",
        body: "不追求一次读完。先选一个清晰的章节终点，专注会更容易自然发生。",
      };
    }
    return {
      eyebrow: "节律稳定",
      title: "保持这一轮的长度",
      body: "你今天的阅读密度很舒服。下一次脑间歇可以加 30 秒闭眼，让刚读到的内容自行连接。",
    };
  }, [clockHour, todayMinutes, todaySessions.length]);

  const progress =
    mode === "setup" || totalSeconds <= 0
      ? 0
      : Math.min(1, Math.max(0, 1 - remaining / totalSeconds));
  const ringStyle = { "--progress": String(progress) } as CSSProperties;

  const breakElapsed = Math.max(0, totalSeconds - remaining);
  const breathPosition = breakElapsed % 12;
  const breathPhase =
    breathPosition < 4 ? "吸气" : breathPosition < 6 ? "停留" : "呼气";
  const breathNote =
    breathPosition < 4
      ? "让肩膀保持松弛"
      : breathPosition < 6
        ? "不需要用力屏住"
        : "慢慢放掉刚才的用力";

  const changeDuration = (next: number) => {
    const safe = Math.min(90, Math.max(10, next));
    setDurationMinutes(safe);
    if (mode === "setup") {
      setTotalSeconds(safe * 60);
      setRemaining(safe * 60);
    }
  };

  const beginFocus = () => {
    const seconds = durationMinutes * 60;
    setMode("focus");
    setTotalSeconds(seconds);
    setRemaining(seconds);
    targetTimeRef.current = Date.now() + seconds * 1000;
    setIsRunning(true);
    startAudio();
    showToast(bookTitle.trim() ? "已为《" + bookTitle.trim() + "》留出安静" : "这一段时间，只留给阅读");
  };

  const pauseTimer = () => {
    const next = Math.max(0, Math.ceil((targetTimeRef.current - Date.now()) / 1000));
    setRemaining(next);
    setIsRunning(false);
    stopAudio();
  };

  const resumeTimer = () => {
    targetTimeRef.current = Date.now() + remaining * 1000;
    setIsRunning(true);
    startAudio();
  };

  const requestStop = () => {
    setWasRunningBeforeStop(isRunning);
    if (isRunning) pauseTimer();
    setStopOpen(true);
  };

  const continueAfterStopPrompt = () => {
    setStopOpen(false);
    if (wasRunningBeforeStop) resumeTimer();
  };

  const storeSession = (minutes: number, pages: number, mood: number) => {
    if (minutes < 1) return;
    const session: FocusSession = {
      id: String(Date.now()),
      date: todayKey,
      minutes,
      pages,
      feeling: mood,
      book: bookTitle.trim() || "未命名阅读",
    };
    const next = [...sessions, session];
    setSessions(next);
    localStorage.setItem("inkflow:sessions", JSON.stringify(next));
  };

  const resetToSetup = () => {
    stopAudio();
    setMode("setup");
    setIsRunning(false);
    setTotalSeconds(durationMinutes * 60);
    setRemaining(durationMinutes * 60);
    setCompletionOpen(false);
    setStopOpen(false);
  };

  const finishEarly = (keepRecord: boolean) => {
    const elapsedSeconds = Math.max(0, totalSeconds - remaining);
    if (keepRecord) {
      storeSession(Math.max(1, Math.round(elapsedSeconds / 60)), 0, 3);
      showToast("已记录这一小段，不完整也有价值");
    } else {
      showToast("这一轮已放下，重新开始也很好");
    }
    resetToSetup();
  };

  const finishFocus = (takeBreak: boolean) => {
    storeSession(
      Math.max(1, Math.round(totalSeconds / 60)),
      Math.max(0, Number.parseInt(pagesRead || "0", 10) || 0),
      feeling,
    );
    setCompletionOpen(false);
    if (!takeBreak) {
      resetToSetup();
      showToast("本轮墨痕已保存");
      return;
    }
    const breakSeconds = settings.breakMinutes * 60;
    setMode("break");
    setTotalSeconds(breakSeconds);
    setRemaining(breakSeconds);
    targetTimeRef.current = Date.now() + breakSeconds * 1000;
    setIsRunning(true);
    startAudio();
  };

  const skipBreak = () => {
    resetToSetup();
    showToast("休息已跳过，下一轮记得让眼睛看远一点");
  };

  const handlePrimary = () => {
    if (mode === "setup") {
      beginFocus();
    } else if (isRunning) {
      pauseTimer();
    } else {
      resumeTimer();
    }
  };

  const primaryLabel =
    mode === "setup"
      ? "开始沉浸"
      : isRunning
        ? mode === "focus"
          ? "暂停一下"
          : "暂停呼吸"
        : "继续";

  const sessionLabel =
    mode === "setup" ? "准备阅读" : mode === "focus" ? "正在阅读" : "脑间歇";

  return (
    <div className={"app-shell theme-" + settings.theme + " mode-" + mode}>
      <div className="ambient-field" aria-hidden="true">
        <span className="wash wash-one" />
        <span className="wash wash-two" />
        <span className="grain" />
      </div>

      <header className="app-header">
        <div className="brand-lockup" aria-label="墨流 Inkflow">
          <span className="brand-mark">墨</span>
          <span>
            <strong>墨流</strong>
            <small>INKFLOW</small>
          </span>
        </div>
        <div className="header-actions">
          <span className="privacy-pill">
            <i />
            数据只留在本机
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label="打开设置"
            data-testid="open-settings"
            onClick={() => setSettingsOpen(true)}
          >
            <span aria-hidden="true">☼</span>
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="focus-card" id="focus" aria-labelledby="focus-heading">
          <div className="card-intro">
            <div>
              <span className="eyebrow">
                <i className={isRunning ? "pulse-dot active" : "pulse-dot"} />
                {sessionLabel}
              </span>
              <h1 id="focus-heading">
                {mode === "break"
                  ? "让刚读到的内容，慢慢沉淀。"
                  : "把注意力，放回这一页。"}
              </h1>
            </div>
            {mode !== "setup" && (
              <span className="keyboard-hint">
                <kbd>Space</kbd>
                暂停 / 继续
              </span>
            )}
          </div>

          {mode === "setup" && (
            <div className="reading-brief">
              <label className="field-group">
                <span>今天读什么</span>
                <input
                  type="text"
                  value={bookTitle}
                  onChange={(event) => setBookTitle(event.target.value)}
                  placeholder="例如：百年孤独"
                  maxLength={60}
                  data-testid="book-input"
                />
              </label>
              <label className="field-group">
                <span>这一轮只做一件事</span>
                <input
                  type="text"
                  value={readingGoal}
                  onChange={(event) => setReadingGoal(event.target.value)}
                  placeholder="例如：读完第三章，不查旁支资料"
                  maxLength={80}
                />
              </label>
            </div>
          )}

          <div className="timer-layout">
            <div className="timer-stage">
              <div
                className={"timer-ring " + (isRunning ? "is-running" : "")}
                style={ringStyle}
                data-testid="timer-ring"
              >
                <div className="ink-orb" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="timer-copy" aria-live="polite">
                  {mode === "break" ? (
                    <>
                      <span className="timer-kicker">{breathPhase}</span>
                      <strong>{formatTime(remaining)}</strong>
                      <small>{breathNote}</small>
                    </>
                  ) : (
                    <>
                      <span className="timer-kicker">
                        {mode === "setup"
                          ? "本轮时长"
                          : isRunning
                            ? bookTitle.trim() || "自由阅读"
                            : "已暂停"}
                      </span>
                      <strong>
                        {mode === "setup"
                          ? String(durationMinutes).padStart(2, "0") + ":00"
                          : formatTime(remaining)}
                      </strong>
                      <small>
                        {mode === "setup"
                          ? "分钟"
                          : readingGoal.trim() || "不追赶，只停留"}
                      </small>
                    </>
                  )}
                </div>
              </div>
            </div>

            {mode === "setup" ? (
              <div className="duration-panel">
                <div className="section-label">
                  <span>选择阅读节律</span>
                  <div className="stepper" aria-label="自定义阅读时长">
                    <button
                      type="button"
                      aria-label="减少五分钟"
                      onClick={() => changeDuration(durationMinutes - 5)}
                    >
                      −
                    </button>
                    <output>{durationMinutes} 分</output>
                    <button
                      type="button"
                      aria-label="增加五分钟"
                      onClick={() => changeDuration(durationMinutes + 5)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="preset-list">
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.minutes}
                      className={durationMinutes === preset.minutes ? "selected" : ""}
                      aria-pressed={durationMinutes === preset.minutes}
                      onClick={() => changeDuration(preset.minutes)}
                    >
                      <span>{preset.label}</span>
                      <strong>{preset.minutes}</strong>
                      <small>{preset.note}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="session-note">
                <span>{mode === "focus" ? "这一轮的意图" : "此刻不再输入信息"}</span>
                <p>
                  {mode === "focus"
                    ? readingGoal.trim() || "慢一点，读到真正理解为止。"
                    : "把视线放到六米以外，跟随呼吸，让眼睛重新变软。"}
                </p>
                <div className="session-progress">
                  <span style={{ width: Math.round(progress * 100) + "%" }} />
                </div>
                <small>{Math.round(progress * 100)}% · 已流过</small>
              </div>
            )}
          </div>

          <div className="control-deck">
            <button
              type="button"
              className="primary-action"
              onClick={handlePrimary}
              data-testid="primary-action"
            >
              <span className="action-symbol" aria-hidden="true">
                {isRunning ? "Ⅱ" : "▶"}
              </span>
              {primaryLabel}
            </button>
            {mode !== "setup" && (
              <button
                type="button"
                className="quiet-action"
                onClick={mode === "break" ? skipBreak : requestStop}
                data-testid={mode === "break" ? "skip-break" : "stop-session"}
              >
                {mode === "break" ? "跳过这次休息" : "结束本轮"}
              </button>
            )}
          </div>

          <div className="sound-ribbon" aria-label="环境声">
            <span className="sound-label">声景</span>
            {SOUND_OPTIONS.map((sound) => (
              <button
                type="button"
                key={sound.id}
                className={settings.soundscape === sound.id ? "active" : ""}
                aria-pressed={settings.soundscape === sound.id}
                onClick={() => {
                  setSettings((current) => ({ ...current, soundscape: sound.id }));
                  if (isRunning) {
                    window.setTimeout(startAudio, 0);
                  }
                }}
              >
                <i aria-hidden="true">{sound.glyph}</i>
                {sound.label}
              </button>
            ))}
          </div>
        </section>

        <aside className="companion-rail" id="rhythm" aria-label="阅读节律与建议">
          <section className="advice-card">
            <div className="advice-topline">
              <span>墨流建议</span>
              <span className="ai-mark">适时生成</span>
            </div>
            <div className="advice-orbit" aria-hidden="true">
              <span />
            </div>
            <span className="advice-eyebrow">{smartAdvice.eyebrow}</span>
            <h2>{smartAdvice.title}</h2>
            <p>{smartAdvice.body}</p>
            <button
              type="button"
              onClick={() => {
                if (smartAdvice.title.includes("20")) changeDuration(20);
                showToast("建议已放进下一轮");
                document.getElementById("focus")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              用在下一轮
              <span aria-hidden="true">↗</span>
            </button>
          </section>

          <section className="today-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">今日墨痕</span>
                <h2>{todayMinutes > 0 ? "专注正在留下形状" : "从第一滴开始"}</h2>
              </div>
              <span className="date-chip">
                {new Intl.DateTimeFormat("zh-CN", {
                  month: "short",
                  day: "numeric",
                }).format(new Date())}
              </span>
            </div>
            <div className="metric-row">
              <div>
                <strong>{todayMinutes}</strong>
                <span>分钟</span>
              </div>
              <div>
                <strong>{todaySessions.length}</strong>
                <span>轮阅读</span>
              </div>
              <div>
                <strong>{todayPages}</strong>
                <span>页沉淀</span>
              </div>
            </div>
            <div className="ink-week" aria-label="最近七天阅读分钟">
              {weekData.map((day) => (
                <div key={day.key} title={day.minutes + " 分钟"}>
                  <span
                    className={day.minutes > 0 ? "ink-drop has-ink" : "ink-drop"}
                    style={{
                      transform:
                        "scale(" + Math.min(1, 0.48 + day.minutes / 90) + ")",
                    }}
                  />
                  <small>{day.label}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="break-preview">
            <div className="break-glyph" aria-hidden="true">
              <span />
              <i />
            </div>
            <div>
              <span className="eyebrow">下一次脑间歇 · {settings.breakMinutes} 分钟</span>
              <h2>不刷屏的休息，才真的算休息。</h2>
              <p>远眺 → 呼吸 → 回想一句刚读到的话</p>
            </div>
          </section>
        </aside>
      </main>

      <footer className="app-footer">
        <span>墨流 Inkflow · 为阅读设计的安静工具</span>
        <span>无需登录 · 本地保存 · 可离线使用</span>
      </footer>

      <nav className="mobile-dock" aria-label="应用导航">
        <button
          type="button"
          onClick={() => document.getElementById("focus")?.scrollIntoView({ behavior: "smooth" })}
        >
          <i aria-hidden="true">◉</i>
          专注
        </button>
        <button
          type="button"
          onClick={() => document.getElementById("rhythm")?.scrollIntoView({ behavior: "smooth" })}
        >
          <i aria-hidden="true">≈</i>
          节律
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)}>
          <i aria-hidden="true">☼</i>
          设置
        </button>
      </nav>

      {settingsOpen && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSettingsOpen(false);
          }}
        >
          <aside
            className="settings-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            data-testid="settings-sheet"
          >
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <div>
                <span className="eyebrow">个性化节律</span>
                <h2 id="settings-title">让墨流更像你的阅读习惯</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭设置"
                onClick={() => setSettingsOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="setting-block">
              <div>
                <strong>脑间歇长度</strong>
                <p>阅读越久，休息也应更完整。</p>
              </div>
              <div className="segmented-control">
                {[3, 5, 8].map((minutes) => (
                  <button
                    type="button"
                    key={minutes}
                    className={settings.breakMinutes === minutes ? "active" : ""}
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        breakMinutes: minutes,
                      }))
                    }
                  >
                    {minutes} 分
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-block range-setting">
              <div>
                <strong>声景音量</strong>
                <p>只盖住环境，不抢走注意力。</p>
              </div>
              <label>
                <span className="sr-only">声景音量</span>
                <input
                  type="range"
                  min="0.05"
                  max="0.5"
                  step="0.01"
                  value={settings.volume}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      volume: Number(event.target.value),
                    }))
                  }
                />
                <output>{Math.round(settings.volume * 200)}%</output>
              </label>
            </div>

            <div className="setting-block">
              <div>
                <strong>界面气候</strong>
                <p>纸上白昼，或深夜墨色。</p>
              </div>
              <div className="theme-picker">
                <button
                  type="button"
                  className={settings.theme === "paper" ? "active paper" : "paper"}
                  onClick={() =>
                    setSettings((current) => ({ ...current, theme: "paper" }))
                  }
                >
                  <i />
                  纸上白昼
                </button>
                <button
                  type="button"
                  className={settings.theme === "night" ? "active night" : "night"}
                  onClick={() =>
                    setSettings((current) => ({ ...current, theme: "night" }))
                  }
                >
                  <i />
                  深夜墨色
                </button>
              </div>
            </div>

            <div className="privacy-note">
              <span aria-hidden="true">⌁</span>
              <p>
                书名、阅读记录与偏好只保存在这台设备的浏览器里。墨流没有账号，也不会上传你的阅读数据。
              </p>
            </div>
          </aside>
        </div>
      )}

      {completionOpen && (
        <div className="modal-backdrop">
          <section
            className="completion-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="completion-title"
            data-testid="completion-modal"
          >
            <div className="completion-bloom" aria-hidden="true">
              <span />
              <i />
            </div>
            <span className="eyebrow">本轮已完成</span>
            <h2 id="completion-title">你刚刚为自己留出了 {Math.round(totalSeconds / 60)} 分钟。</h2>
            <p>不用立刻评价读得够不够。先留下一个轻量的阅读痕迹。</p>
            <div className="recap-grid">
              <label>
                <span>大约读了多少页</span>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={pagesRead}
                  onChange={(event) => setPagesRead(event.target.value)}
                  placeholder="可不填"
                />
              </label>
              <fieldset>
                <legend>这一轮的状态</legend>
                <div className="feeling-picker">
                  {[2, 3, 4, 5].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={feeling === value ? "active" : ""}
                      aria-label={"专注状态 " + value + " 分"}
                      onClick={() => setFeeling(value)}
                    >
                      {value === 2 ? "雾" : value === 3 ? "平" : value === 4 ? "静" : "流"}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="primary-action"
                onClick={() => finishFocus(true)}
                data-testid="start-break"
              >
                进入 {settings.breakMinutes} 分钟脑间歇
              </button>
              <button type="button" className="quiet-action" onClick={() => finishFocus(false)}>
                保存并结束
              </button>
            </div>
          </section>
        </div>
      )}

      {stopOpen && (
        <div className="modal-backdrop">
          <section
            className="stop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stop-title"
            data-testid="stop-modal"
          >
            <span className="eyebrow">先停一下</span>
            <h2 id="stop-title">要结束这一轮阅读吗？</h2>
            <p>
              已经流过 {Math.max(0, Math.round((totalSeconds - remaining) / 60))} 分钟。
              短一点也可以被看见。
            </p>
            <div className="stop-options">
              <button type="button" className="primary-action" onClick={continueAfterStopPrompt}>
                返回阅读
              </button>
              <button type="button" onClick={() => finishEarly(true)}>
                记录这段时间
              </button>
              <button type="button" onClick={() => finishEarly(false)}>
                放弃记录
              </button>
            </div>
          </section>
        </div>
      )}

      <div className={toast ? "toast visible" : "toast"} role="status" aria-live="polite">
        <span aria-hidden="true">●</span>
        {toast}
      </div>
    </div>
  );
}
