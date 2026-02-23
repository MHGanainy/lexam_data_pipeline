import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const API = "/api";

const ANSWER_MODELS = [
  "Qwen/Qwen3-14B",
  "Qwen/Qwen3-32B",
  "deepseek-ai/DeepSeek-V3",
  "meta-llama/Llama-3.3-70B-Instruct",
];

const JUDGE_MODELS = [
  "Qwen/Qwen3-32B",
  "deepseek-ai/DeepSeek-V3",
];

const AREA_COLORS = {
  Private: "#4a6cf7",
  Public: "#e67e22",
  Criminal: "#e74c3c",
  Interdisciplinary: "#27ae60",
};

/* ── Inline MultiSelect (matches App.jsx pattern) ─────────── */
function MultiSelect({ label, options, selected, onChange, renderOption }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isAllSelected = selected === null;
  const selectedStrs = selected === null ? null : new Set(selected.map(String));

  const handleAllToggle = () => onChange(isAllSelected ? [] : null);

  const handleToggle = (val) => {
    const valStr = String(val);
    if (isAllSelected) {
      onChange(options.filter((o) => String(o) !== valStr));
    } else if (selectedStrs.has(valStr)) {
      onChange(selected.filter((v) => String(v) !== valStr));
    } else {
      const next = [...selected, val];
      onChange(next.length === options.length ? null : next);
    }
  };

  const render = renderOption || String;
  const isChecked = (opt) => isAllSelected || (selectedStrs && selectedStrs.has(String(opt)));
  const activeCount = selected === null ? options.length : selected.length;
  const displayLabel = isAllSelected
    ? `All ${label}`
    : activeCount === 0 ? label
    : activeCount === 1 ? render(selected[0])
    : `${activeCount} ${label}`;

  return (
    <div className="multi-select" ref={ref}>
      <button
        type="button"
        className={"multi-select-trigger" + (!isAllSelected && activeCount > 0 ? " active" : "")}
        onClick={() => setOpen(!open)}
      >
        <span className="multi-select-label">{displayLabel}</span>
        <span className="multi-select-arrow">{open ? "\u25B4" : "\u25BE"}</span>
      </button>
      {open && (
        <div className="multi-select-dropdown">
          <label className="multi-select-option">
            <input type="checkbox" checked={isAllSelected} onChange={handleAllToggle} />
            All
          </label>
          <div className="multi-select-divider" />
          {options.map((opt) => (
            <label key={opt} className="multi-select-option">
              <input type="checkbox" checked={isChecked(opt)} onChange={() => handleToggle(opt)} />
              {render(opt)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────── */
export default function ExperimentDetail({ experimentId, onBack }) {
  const [tab, setTab] = useState("config");
  const [exp, setExp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questionCount, setQuestionCount] = useState(null);

  // Filter state (for config tab)
  const [filterConfig, setFilterConfig] = useState(null);
  const [filterSplit, setFilterSplit] = useState(null);
  const [filterArea, setFilterArea] = useState(null);
  const [filterLanguage, setFilterLanguage] = useState(null);
  const [filterCourse, setFilterCourse] = useState(null);
  const [filterJurisdiction, setFilterJurisdiction] = useState(null);
  const [filterYear, setFilterYear] = useState(null);
  const [filterInternational, setFilterInternational] = useState("");

  // Filter options
  const [filterOptions, setFilterOptions] = useState(null);

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [modelName, setModelName] = useState("Qwen/Qwen3-14B");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [nAnswers, setNAnswers] = useState(1);
  const [openPrompt, setOpenPrompt] = useState("");
  const [mcqPrompt, setMcqPrompt] = useState("");
  const [judgeSystemPrompt, setJudgeSystemPrompt] = useState("");
  const [judgePrompt, setJudgePrompt] = useState("");

  // Answers tab
  const [answers, setAnswers] = useState(null);
  const [answerOffset, setAnswerOffset] = useState(0);
  const [genProgress, setGenProgress] = useState(null);
  const [expandedAnswer, setExpandedAnswer] = useState(null);

  // Judging tab
  const [judgeModel, setJudgeModel] = useState("Qwen/Qwen3-32B");
  const [judgeTemperature, setJudgeTemperature] = useState(0.3);
  const [judgeMaxTokens, setJudgeMaxTokens] = useState(4096);
  const [judgments, setJudgments] = useState(null);
  const [judgmentOffset, setJudgmentOffset] = useState(0);
  const [judgeProgress, setJudgeProgress] = useState(null);
  const [expandedJudgment, setExpandedJudgment] = useState(null);
  const [judgeSummary, setJudgeSummary] = useState([]);
  const [judgmentJudgeFilter, setJudgmentJudgeFilter] = useState("");

  // Stats tab
  const [stats, setStats] = useState(null);
  const [statsByQuestion, setStatsByQuestion] = useState(null);
  const [statsModelFilter, setStatsModelFilter] = useState("");
  const [statsJudgeFilter, setStatsJudgeFilter] = useState("");
  const [judgeComparison, setJudgeComparison] = useState(null);

  // Polling refs
  const genPollRef = useRef(null);
  const judgePollRef = useRef(null);

  /* ── Load experiment ─────────────────────────────────────── */
  const fetchExp = useCallback(() => {
    fetch(`${API}/experiments/${experimentId}`)
      .then((r) => r.json())
      .then((data) => {
        setExp(data);
        setName(data.name || "");
        setDescription(data.description || "");
        setModelName(data.model_name || "Qwen/Qwen3-14B");
        setTemperature(data.temperature ?? 0.7);
        setMaxTokens(data.max_tokens ?? 2048);
        setNAnswers(data.n_answers || 1);
        setOpenPrompt(data.open_question_prompt || "");
        setMcqPrompt(data.mcq_prompt || "");
        setJudgeSystemPrompt(data.judge_system_prompt || "");
        setJudgePrompt(data.judge_prompt || "");
        setJudgeTemperature(data.judge_temperature ?? 0.3);
        setJudgeMaxTokens(data.judge_max_tokens ?? 4096);

        // Set filter state from saved config
        const fc = data.filter_config || {};
        setFilterConfig(fc.config || null);
        setFilterSplit(fc.split || null);
        setFilterArea(fc.area || null);
        setFilterLanguage(fc.language || null);
        setFilterCourse(fc.course || null);
        setFilterJurisdiction(fc.jurisdiction || null);
        setFilterYear(fc.year || null);
        setFilterInternational(fc.international != null ? String(fc.international) : "");

        setLoading(false);
      });
  }, [experimentId]);

  useEffect(() => {
    fetchExp();
  }, [fetchExp]);

  /* ── Fetch filter options ────────────────────────────────── */
  useEffect(() => {
    fetch(`${API}/filters`)
      .then((r) => r.json())
      .then(setFilterOptions);
  }, []);

  /* ── Live question count ─────────────────────────────────── */
  useEffect(() => {
    if (!exp) return;
    const fc = _buildFilterConfig();
    fetch(`${API}/experiments/${experimentId}/question-count`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filter_config: fc }),
    })
      .then((r) => r.json())
      .then((d) => setQuestionCount(d.count));
  }, [filterConfig, filterSplit, filterArea, filterLanguage, filterCourse, filterJurisdiction, filterYear, filterInternational, exp]);

  const _buildFilterConfig = () => {
    const fc = {};
    if (filterConfig?.length) fc.config = filterConfig;
    if (filterSplit?.length) fc.split = filterSplit;
    if (filterArea?.length) fc.area = filterArea;
    if (filterLanguage?.length) fc.language = filterLanguage;
    if (filterCourse?.length) fc.course = filterCourse;
    if (filterJurisdiction?.length) fc.jurisdiction = filterJurisdiction;
    if (filterYear?.length) fc.year = filterYear;
    if (filterInternational !== "") fc.international = filterInternational === "true";
    return fc;
  };

  /* ── Save experiment config ──────────────────────────────── */
  const handleSave = () => {
    setSaving(true);
    const fc = _buildFilterConfig();
    fetch(`${API}/experiments/${experimentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || null,
        filter_config: fc,
        model_name: modelName,
        temperature,
        max_tokens: maxTokens,
        n_answers: nAnswers,
        open_question_prompt: openPrompt,
        mcq_prompt: mcqPrompt,
        judge_system_prompt: judgeSystemPrompt,
        judge_prompt: judgePrompt,
        judge_temperature: judgeTemperature,
        judge_max_tokens: judgeMaxTokens,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        setExp(data);
        setSaving(false);
      });
  };

  /* ── Answers tab functions ───────────────────────────────── */
  const fetchAnswers = useCallback(() => {
    fetch(`${API}/experiments/${experimentId}/answers?offset=${answerOffset}&limit=50`)
      .then((r) => r.json())
      .then(setAnswers);
  }, [experimentId, answerOffset]);

  useEffect(() => {
    if (tab === "answers") fetchAnswers();
  }, [tab, fetchAnswers]);

  const startGeneration = () => {
    fetch(`${API}/experiments/${experimentId}/generate`, { method: "POST" })
      .then((r) => r.json())
      .then(() => {
        pollGeneration();
      });
  };

  const pollGeneration = () => {
    if (genPollRef.current) clearInterval(genPollRef.current);
    genPollRef.current = setInterval(() => {
      fetch(`${API}/experiments/${experimentId}/progress`)
        .then((r) => r.json())
        .then((p) => {
          setGenProgress(p);
          fetchAnswers();
          if (p.status === "done" || p.status === "error" || p.status === "idle") {
            clearInterval(genPollRef.current);
            genPollRef.current = null;
            fetchExp();
          }
        });
    }, 2000);
  };

  const deleteAnswers = () => {
    if (!confirm("Delete all generated answers?")) return;
    fetch(`${API}/experiments/${experimentId}/answers`, { method: "DELETE" })
      .then(() => {
        setAnswers(null);
        setGenProgress(null);
        fetchExp();
        fetchAnswers();
      });
  };

  useEffect(() => {
    return () => {
      if (genPollRef.current) clearInterval(genPollRef.current);
      if (judgePollRef.current) clearInterval(judgePollRef.current);
    };
  }, []);

  /* ── Judging tab functions ───────────────────────────────── */
  const fetchJudgeSummary = useCallback(() => {
    fetch(`${API}/experiments/${experimentId}/judge-summary`)
      .then((r) => r.json())
      .then(setJudgeSummary);
  }, [experimentId]);

  const fetchJudgments = useCallback(() => {
    const params = new URLSearchParams({ offset: judgmentOffset, limit: 50 });
    if (judgmentJudgeFilter) params.set("judge_model", judgmentJudgeFilter);
    fetch(`${API}/experiments/${experimentId}/judgments?${params}`)
      .then((r) => r.json())
      .then(setJudgments);
  }, [experimentId, judgmentOffset, judgmentJudgeFilter]);

  useEffect(() => {
    if (tab === "judging") {
      fetchJudgments();
      fetchJudgeSummary();
    }
  }, [tab, fetchJudgments, fetchJudgeSummary]);

  const startJudging = () => {
    fetch(`${API}/experiments/${experimentId}/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judge_model: judgeModel }),
    })
      .then((r) => r.json())
      .then(() => {
        pollJudging();
      });
  };

  const pollJudging = () => {
    if (judgePollRef.current) clearInterval(judgePollRef.current);
    judgePollRef.current = setInterval(() => {
      fetch(`${API}/experiments/${experimentId}/judge-progress?judge_model=${encodeURIComponent(judgeModel)}`)
        .then((r) => r.json())
        .then((p) => {
          setJudgeProgress(p);
          fetchJudgments();
          fetchJudgeSummary();
          if (p.status === "done" || p.status === "error" || p.status === "idle") {
            clearInterval(judgePollRef.current);
            judgePollRef.current = null;
            fetchExp();
            fetchJudgeSummary();
          }
        });
    }, 2000);
  };

  const deleteJudgments = (forJudge) => {
    const target = forJudge || "ALL";
    if (!confirm(`Delete judgments for: ${target}?`)) return;
    const params = forJudge ? `?judge_model=${encodeURIComponent(forJudge)}` : "";
    fetch(`${API}/experiments/${experimentId}/judgments${params}`, { method: "DELETE" })
      .then(() => {
        setJudgments(null);
        setJudgeProgress(null);
        fetchExp();
        fetchJudgments();
        fetchJudgeSummary();
      });
  };

  /* ── Auto-resume polling on mount/refresh ──────────────── */
  useEffect(() => {
    if (!exp) return;
    if (exp.status === "generating" && !genPollRef.current) {
      fetch(`${API}/experiments/${experimentId}/progress`)
        .then((r) => r.json())
        .then((p) => {
          setGenProgress(p);
          if (p.status === "running") pollGeneration();
        });
    }
    if (exp.status === "judging" && !judgePollRef.current) {
      fetch(`${API}/experiments/${experimentId}/judge-progress?judge_model=${encodeURIComponent(judgeModel)}`)
        .then((r) => r.json())
        .then((p) => {
          setJudgeProgress(p);
          if (p.status === "running") pollJudging();
        });
    }
  }, [exp?.status]);

  /* ── Stats tab functions ─────────────────────────────────── */
  const fetchStats = useCallback(() => {
    const params = new URLSearchParams();
    if (statsModelFilter) params.set("model_name", statsModelFilter);
    if (statsJudgeFilter) params.set("judge_model", statsJudgeFilter);
    fetch(`${API}/experiments/${experimentId}/stats?${params}`)
      .then((r) => r.json())
      .then(setStats);
    fetch(`${API}/experiments/${experimentId}/stats/by-question?${params}`)
      .then((r) => r.json())
      .then(setStatsByQuestion);
    fetch(`${API}/experiments/${experimentId}/stats/compare-judges`)
      .then((r) => r.json())
      .then(setJudgeComparison);
  }, [experimentId, statsModelFilter, statsJudgeFilter]);

  useEffect(() => {
    if (tab === "stats") fetchStats();
  }, [tab, fetchStats]);

  /* ── Render ──────────────────────────────────────────────── */
  if (loading || !exp) return <div className="loading">Loading experiment...</div>;

  return (
    <div className="experiment-detail">
      <div className="experiment-detail-header">
        <button className="btn-back" onClick={onBack}>&larr; Back</button>
        <h2>{exp.name}</h2>
        <span className="badge" style={{
          background: statusColor(exp.status) + "22",
          color: statusColor(exp.status),
          marginLeft: 12,
        }}>
          {exp.status}
        </span>
        {(exp.status === "generating" || exp.status === "judging" || exp.status === "error") && (
          <button
            className="btn-secondary"
            style={{ marginLeft: 12, fontSize: "0.8rem" }}
            onClick={() => {
              fetch(`${API}/experiments/${experimentId}/reset-status`, { method: "POST" })
                .then((r) => r.json())
                .then((data) => setExp(data));
            }}
          >
            Reset Status
          </button>
        )}
      </div>

      <div className="experiment-tabs">
        {["config", "answers", "judging", "stats"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "config" ? "Configuration" : t === "answers" ? "Answers" : t === "judging" ? "Judging" : "Statistics"}
          </button>
        ))}
      </div>

      {/* ── Configuration Tab ────────────────────────────────── */}
      {tab === "config" && (
        <div className="experiment-section">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 3 }}>
              <label>Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
          </div>

          <h3>Data Filters</h3>
          {questionCount !== null && (
            <div className="question-count-badge">
              <strong>{questionCount.toLocaleString()}</strong> matching variants
            </div>
          )}

          {filterOptions && (
            <div className="filters">
              <MultiSelect label="configs" options={filterOptions.configs} selected={filterConfig} onChange={setFilterConfig} renderOption={(v) => v.replace(/_/g, " ")} />
              <MultiSelect label="splits" options={filterOptions.splits} selected={filterSplit} onChange={setFilterSplit} />
              <MultiSelect label="areas" options={filterOptions.areas} selected={filterArea} onChange={setFilterArea} />
              <MultiSelect label="languages" options={filterOptions.languages} selected={filterLanguage} onChange={setFilterLanguage} />
              <MultiSelect label="courses" options={filterOptions.courses} selected={filterCourse} onChange={setFilterCourse} />
              <MultiSelect label="jurisdictions" options={filterOptions.jurisdictions} selected={filterJurisdiction} onChange={setFilterJurisdiction} />
              <MultiSelect label="years" options={filterOptions.years} selected={filterYear} onChange={setFilterYear} />
              <select value={filterInternational} onChange={(e) => setFilterInternational(e.target.value)}>
                <option value="">International</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          )}

          <h3>Model Settings</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Model</label>
              <select value={modelName} onChange={(e) => setModelName(e.target.value)}>
                {ANSWER_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ maxWidth: 140 }}>
              <label>Temperature</label>
              <input type="number" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-group" style={{ maxWidth: 140 }}>
              <label>Max Tokens</label>
              <input type="number" min={1} max={16384} step={256} value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2048)} />
            </div>
            <div className="form-group" style={{ maxWidth: 140 }}>
              <label>Self-consistency N</label>
              <input type="number" min={1} max={10} value={nAnswers} onChange={(e) => setNAnswers(parseInt(e.target.value) || 1)} />
            </div>
          </div>

          <h3>Prompt Templates</h3>
          <div className="form-group">
            <label>Open Question Prompt <span className="hint">Placeholders: {"{course_name}"}, {"{question}"}</span></label>
            <textarea rows={5} value={openPrompt} onChange={(e) => setOpenPrompt(e.target.value)} />
          </div>
          <div className="form-group">
            <label>MCQ Prompt <span className="hint">Placeholders: {"{course_name}"}, {"{question}"}</span></label>
            <textarea rows={5} value={mcqPrompt} onChange={(e) => setMcqPrompt(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Judge System Prompt</label>
            <textarea rows={3} value={judgeSystemPrompt} onChange={(e) => setJudgeSystemPrompt(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Judge Prompt <span className="hint">Placeholders: {"{question_fact}"}, {"{ref_answer}"}, {"{model_answer}"}</span></label>
            <textarea rows={8} value={judgePrompt} onChange={(e) => setJudgePrompt(e.target.value)} />
          </div>

          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      )}

      {/* ── Answers Tab ──────────────────────────────────────── */}
      {tab === "answers" && (
        <div className="experiment-section">
          <div className="section-actions">
            <button className="btn-primary" onClick={startGeneration} disabled={exp.status === "generating" || exp.status === "judging"}>
              Generate Answers
            </button>
            {answers && answers.total > 0 && (
              <button className="btn-danger" onClick={deleteAnswers}>Delete All Answers</button>
            )}
          </div>

          {genProgress && genProgress.status === "running" && (
            <ProgressBar progress={genProgress} />
          )}

          {genProgress && genProgress.status === "error" && (
            <div className="alert alert-error">Error: {genProgress.error_message}</div>
          )}

          {answers && answers.total > 0 ? (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Question ID</th>
                      <th>Config</th>
                      <th>Course</th>
                      <th>Run</th>
                      <th>Model Answer</th>
                      <th>Thinking</th>
                      <th>Tokens</th>
                      <th>MCQ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {answers.items.map((a) => {
                      const { thinking, answer: cleanAnswer } = parseThinking(a.answer_text);
                      const isExpanded = expandedAnswer === a.id;
                      return [
                        <tr key={a.id} onClick={() => setExpandedAnswer(isExpanded ? null : a.id)} style={{ cursor: "pointer" }}>
                          <td><code style={{ fontSize: "0.75rem" }}>{(a.question_id || "").slice(0, 8)}</code></td>
                          <td><span className="badge badge-config">{(a.config || "").replace("mcq_", "").replace("_choices", "").replace("open_question", "open")}</span></td>
                          <td style={{ fontSize: "0.85rem" }}>{a.course}</td>
                          <td>{a.run_index}</td>
                          <td className="answer-preview">
                            {cleanAnswer.slice(0, 120)}{cleanAnswer.length > 120 ? "..." : ""}
                          </td>
                          <td>
                            {thinking ? <span className="badge" style={{ background: "#f0e6ff", color: "#7c3aed" }}>Has thinking</span> : "—"}
                          </td>
                          <td style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                            {a.input_tokens}/{a.output_tokens}
                          </td>
                          <td>
                            {a.extracted_letter && (
                              <span className={`badge ${a.mcq_correct ? "badge-correct" : "badge-incorrect"}`}>
                                {a.extracted_letter} {a.mcq_correct ? "\u2713" : "\u2717"}
                              </span>
                            )}
                          </td>
                        </tr>,
                        isExpanded && (
                          <tr key={`${a.id}-detail`} className="expanded-row">
                            <td colSpan={8} style={{ padding: 0 }}>
                              <div className="answer-detail-panel">
                                <div className="answer-detail-grid">
                                  <div className="answer-detail-col">
                                    <h4>Question</h4>
                                    <div className="answer-detail-content">{a.question_text || "—"}</div>
                                  </div>
                                  <div className="answer-detail-col">
                                    <h4>Gold / Reference Answer</h4>
                                    <div className="answer-detail-content">
                                      {a.gold_answer || (a.gold_index != null && a.choices ? `${String.fromCharCode(65 + a.gold_index)}) ${a.choices[a.gold_index]}` : "—")}
                                    </div>
                                  </div>
                                  <div className="answer-detail-col">
                                    <h4>Model Answer</h4>
                                    <div className="answer-detail-content">{cleanAnswer}</div>
                                  </div>
                                </div>
                                {thinking && (
                                  <div className="answer-detail-thinking">
                                    <h4>Thinking Trace</h4>
                                    <div className="answer-detail-content thinking-content">{thinking}</div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <button disabled={answerOffset === 0} onClick={() => setAnswerOffset(Math.max(0, answerOffset - 50))}>Previous</button>
                <span>Showing {answerOffset + 1}–{Math.min(answerOffset + 50, answers.total)} of {answers.total}</span>
                <button disabled={answerOffset + 50 >= answers.total} onClick={() => setAnswerOffset(answerOffset + 50)}>Next</button>
              </div>
            </>
          ) : (
            <div className="experiments-empty">
              <p>No answers yet. Configure your experiment and generate answers.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Judging Tab ──────────────────────────────────────── */}
      {tab === "judging" && (
        <div className="experiment-section">
          <div className="section-actions">
            <div className="form-group" style={{ marginBottom: 0, marginRight: 12 }}>
              <label style={{ fontSize: "0.8rem" }}>Judge Model</label>
              <select value={judgeModel} onChange={(e) => setJudgeModel(e.target.value)}>
                {JUDGE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, marginRight: 12, maxWidth: 120 }}>
              <label style={{ fontSize: "0.8rem" }}>Temperature</label>
              <input type="number" min={0} max={2} step={0.1} value={judgeTemperature} onChange={(e) => setJudgeTemperature(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, marginRight: 12, maxWidth: 120 }}>
              <label style={{ fontSize: "0.8rem" }}>Max Tokens</label>
              <input type="number" min={1} max={16384} step={256} value={judgeMaxTokens} onChange={(e) => setJudgeMaxTokens(parseInt(e.target.value) || 4096)} />
            </div>
            <button className="btn-primary" onClick={startJudging} disabled={exp.status === "generating" || exp.status === "judging"}>
              Run Judging
            </button>
            {judgments && judgments.total > 0 && (
              <button className="btn-danger" onClick={() => deleteJudgments(judgmentJudgeFilter || null)}>
                Delete {judgmentJudgeFilter ? judgmentJudgeFilter.split("/").pop() : "ALL"} Judgments
              </button>
            )}
          </div>

          {/* Judge summary chips */}
          {judgeSummary.length > 0 && (
            <div className="judge-chips" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
              {judgeSummary.map((js) => (
                <span key={js.judge_model} className="badge" style={{
                  background: "#e8f4fd", color: "#2980b9", padding: "6px 12px", fontSize: "0.85rem",
                  border: judgmentJudgeFilter === js.judge_model ? "2px solid #2980b9" : "1px solid #b8daff",
                  cursor: "pointer",
                }} onClick={() => setJudgmentJudgeFilter(judgmentJudgeFilter === js.judge_model ? "" : js.judge_model)}>
                  {js.judge_model.split("/").pop()} — {js.count} judged
                  {js.avg_score != null && ` — avg ${js.avg_score.toFixed(3)}`}
                </span>
              ))}
            </div>
          )}

          {/* Filter dropdown */}
          {judgeSummary.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <select
                value={judgmentJudgeFilter}
                onChange={(e) => { setJudgmentJudgeFilter(e.target.value); setJudgmentOffset(0); }}
                style={{ fontSize: "0.85rem" }}
              >
                <option value="">All judges</option>
                {judgeSummary.map((js) => (
                  <option key={js.judge_model} value={js.judge_model}>{js.judge_model}</option>
                ))}
              </select>
            </div>
          )}

          {judgeProgress && judgeProgress.status === "running" && (
            <ProgressBar progress={judgeProgress} />
          )}

          {judgeProgress && judgeProgress.status === "error" && (
            <div className="alert alert-error">Error: {judgeProgress.error_message}</div>
          )}

          {judgments && judgments.total > 0 ? (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Question ID</th>
                      <th>Course</th>
                      <th>Judge Model</th>
                      <th>Model Answer</th>
                      <th>Judgment</th>
                      <th>Thinking</th>
                      <th>Score</th>
                      <th>Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {judgments.items.map((j) => {
                      const { thinking: modelThinking, answer: cleanModelAnswer } = parseThinking(j.model_answer);
                      const { thinking: judgeThinking, answer: cleanJudgment } = parseThinking(j.judgment_text);
                      const isExpanded = expandedJudgment === j.id;
                      return [
                        <tr key={j.id} onClick={() => setExpandedJudgment(isExpanded ? null : j.id)} style={{ cursor: "pointer" }}>
                          <td><code style={{ fontSize: "0.75rem" }}>{(j.question_id || "").slice(0, 8)}</code></td>
                          <td style={{ fontSize: "0.85rem" }}>{j.course}</td>
                          <td style={{ fontSize: "0.8rem" }}><code>{(j.judge_model || "").split("/").pop()}</code></td>
                          <td className="answer-preview">
                            {cleanModelAnswer.slice(0, 80)}{cleanModelAnswer.length > 80 ? "..." : ""}
                          </td>
                          <td className="answer-preview">
                            {cleanJudgment.slice(0, 80)}{cleanJudgment.length > 80 ? "..." : ""}
                          </td>
                          <td>
                            {(modelThinking || judgeThinking) ? (
                              <span className="badge" style={{ background: "#f0e6ff", color: "#7c3aed" }}>
                                {modelThinking && judgeThinking ? "Both" : modelThinking ? "Model" : "Judge"}
                              </span>
                            ) : "—"}
                          </td>
                          <td>
                            {j.score != null && (
                              <span className="score-badge" style={{ background: scoreColor(j.score) }}>
                                {j.score.toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                            {j.input_tokens}/{j.output_tokens}
                          </td>
                        </tr>,
                        isExpanded && (
                          <tr key={`${j.id}-detail`} className="expanded-row">
                            <td colSpan={8} style={{ padding: 0 }}>
                              <div className="answer-detail-panel">
                                <div className="answer-detail-grid">
                                  <div className="answer-detail-col">
                                    <h4>Question</h4>
                                    <div className="answer-detail-content">{j.question_text || "—"}</div>
                                  </div>
                                  <div className="answer-detail-col">
                                    <h4>Gold / Reference Answer</h4>
                                    <div className="answer-detail-content">{j.gold_answer || "—"}</div>
                                  </div>
                                  <div className="answer-detail-col">
                                    <h4>Model Answer</h4>
                                    <div className="answer-detail-content">{cleanModelAnswer}</div>
                                  </div>
                                </div>
                                <div className="answer-detail-col" style={{ marginTop: 16 }}>
                                  <h4>Judgment ({j.judge_model}) {j.score != null && <span className="score-badge" style={{ background: scoreColor(j.score), marginLeft: 8 }}>{j.score.toFixed(2)}</span>}</h4>
                                  <div className="answer-detail-content">{cleanJudgment}</div>
                                </div>
                                {modelThinking && (
                                  <div className="answer-detail-thinking">
                                    <h4>Model Thinking Trace</h4>
                                    <div className="answer-detail-content thinking-content">{modelThinking}</div>
                                  </div>
                                )}
                                {judgeThinking && (
                                  <div className="answer-detail-thinking">
                                    <h4>Judge Thinking Trace</h4>
                                    <div className="answer-detail-content thinking-content">{judgeThinking}</div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <button disabled={judgmentOffset === 0} onClick={() => setJudgmentOffset(Math.max(0, judgmentOffset - 50))}>Previous</button>
                <span>Showing {judgmentOffset + 1}–{Math.min(judgmentOffset + 50, judgments.total)} of {judgments.total}</span>
                <button disabled={judgmentOffset + 50 >= judgments.total} onClick={() => setJudgmentOffset(judgmentOffset + 50)}>Next</button>
              </div>
            </>
          ) : (
            <div className="experiments-empty">
              <p>No judgments yet. Generate answers first, then run judging.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Statistics Tab ───────────────────────────────────── */}
      {tab === "stats" && (
        <div className="experiment-section">
          <div className="stats-filters">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "0.8rem" }}>Model</label>
              <select value={statsModelFilter} onChange={(e) => setStatsModelFilter(e.target.value)}>
                <option value="">All models</option>
                {ANSWER_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "0.8rem" }}>Judge</label>
              <select value={statsJudgeFilter} onChange={(e) => setStatsJudgeFilter(e.target.value)}>
                <option value="">All judges</option>
                {JUDGE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {stats ? (
            <>
              {/* Summary cards */}
              <div className="stats-cards">
                <div className="stat-card">
                  <div className="label">Total Answers</div>
                  <div className="value">{stats.total_answers}</div>
                </div>
                <div className="stat-card">
                  <div className="label">MCQ Accuracy</div>
                  <div className="value">{stats.mcq.total > 0 ? `${(stats.mcq.accuracy * 100).toFixed(1)}%` : "N/A"}</div>
                  <div className="label">{stats.mcq.correct}/{stats.mcq.total}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Open Avg Score</div>
                  <div className="value">{stats.open.judged > 0 ? stats.open.avg_score.toFixed(3) : "N/A"}</div>
                  <div className="label">{stats.open.judged} judged</div>
                </div>
                <div className="stat-card">
                  <div className="label">Total Tokens</div>
                  <div className="value">{stats.tokens.total.toLocaleString()}</div>
                </div>
              </div>

              {/* Judge comparison table */}
              {judgeComparison && judgeComparison.length >= 2 && (
                <div className="stats-chart-section">
                  <h3>Judge Comparison</h3>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Judge Model</th>
                          <th>Judged</th>
                          <th>Avg Score</th>
                          <th>Median Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {judgeComparison.map((jc) => (
                          <tr key={jc.judge_model}>
                            <td><code style={{ fontSize: "0.85rem" }}>{jc.judge_model}</code></td>
                            <td>{jc.judged}</td>
                            <td>
                              <span className="score-badge" style={{ background: scoreColor(jc.avg_score) }}>
                                {jc.avg_score.toFixed(4)}
                              </span>
                            </td>
                            <td>
                              <span className="score-badge" style={{ background: scoreColor(jc.median_score) }}>
                                {jc.median_score.toFixed(4)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Area breakdown chart */}
              {stats.by_area && stats.by_area.length > 0 && (
                <div className="stats-chart-section">
                  <h3>By Area</h3>
                  <div className="stats-chart-row">
                    {stats.by_area.some((a) => a.mcq_total > 0) && (
                      <div className="stats-chart-card">
                        <h4>MCQ Accuracy by Area</h4>
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={stats.by_area.filter((a) => a.mcq_total > 0)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                            <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                            <Bar dataKey="mcq_accuracy">
                              {stats.by_area.filter((a) => a.mcq_total > 0).map((entry) => (
                                <Cell key={entry.name} fill={AREA_COLORS[entry.name] || "#888"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {stats.by_area.some((a) => a.open_total > 0) && (
                      <div className="stats-chart-card">
                        <h4>Open Avg Score by Area</h4>
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={stats.by_area.filter((a) => a.open_total > 0)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis domain={[0, 1]} />
                            <Tooltip formatter={(v) => v.toFixed(3)} />
                            <Bar dataKey="open_avg_score">
                              {stats.by_area.filter((a) => a.open_total > 0).map((entry) => (
                                <Cell key={entry.name} fill={AREA_COLORS[entry.name] || "#888"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Course breakdown table */}
              {stats.by_course && stats.by_course.length > 0 && (
                <div className="stats-chart-section">
                  <h3>By Course</h3>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Course</th>
                          <th>MCQ Accuracy</th>
                          <th>MCQ Total</th>
                          <th>Open Avg Score</th>
                          <th>Open Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.by_course.map((c) => (
                          <tr key={c.name}>
                            <td>{c.name}</td>
                            <td>{c.mcq_accuracy != null ? `${(c.mcq_accuracy * 100).toFixed(1)}%` : "—"}</td>
                            <td>{c.mcq_total}</td>
                            <td>{c.open_avg_score != null ? c.open_avg_score.toFixed(3) : "—"}</td>
                            <td>{c.open_total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Self-consistency */}
              {stats.self_consistency && (
                <div className="stats-chart-section">
                  <h3>Self-Consistency (N={exp.n_answers})</h3>
                  <div className="stats-cards">
                    <div className="stat-card">
                      <div className="label">Total Variants</div>
                      <div className="value">{stats.self_consistency.total_variants}</div>
                    </div>
                    <div className="stat-card">
                      <div className="label">Unanimous</div>
                      <div className="value">{stats.self_consistency.unanimous}</div>
                    </div>
                    <div className="stat-card">
                      <div className="label">Unanimous Rate</div>
                      <div className="value">{(stats.self_consistency.unanimous_rate * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Per-question scores */}
              {statsByQuestion && statsByQuestion.length > 0 && (
                <div className="stats-chart-section">
                  <h3>Per-Question Scores</h3>
                  <div className="table-container" style={{ maxHeight: 400, overflowY: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Question ID</th>
                          <th>Area</th>
                          <th>Course</th>
                          <th>Config</th>
                          <th>MCQ</th>
                          <th>Avg Score</th>
                          <th>Answers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsByQuestion.map((q) => (
                          <tr key={q.question_id}>
                            <td><code style={{ fontSize: "0.75rem" }}>{q.question_id.slice(0, 8)}</code></td>
                            <td><span className="badge badge-area">{q.area}</span></td>
                            <td style={{ fontSize: "0.85rem" }}>{q.course}</td>
                            <td><span className="badge badge-config">{(q.config || "").replace("mcq_", "").replace("_choices", "").replace("open_question", "open")}</span></td>
                            <td>
                              {q.mcq_correct != null && (
                                <span className={q.mcq_correct ? "text-success" : "text-danger"}>
                                  {q.mcq_correct ? "\u2713" : "\u2717"}
                                </span>
                              )}
                            </td>
                            <td>
                              {q.avg_score != null && (
                                <span className="score-badge" style={{ background: scoreColor(q.avg_score) }}>
                                  {q.avg_score.toFixed(3)}
                                </span>
                              )}
                            </td>
                            <td>{q.answer_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Token breakdown */}
              <div className="stats-chart-section">
                <h3>Token Usage</h3>
                <div className="stats-cards">
                  <div className="stat-card">
                    <div className="label">Gen Input</div>
                    <div className="value">{stats.tokens.generation_input.toLocaleString()}</div>
                  </div>
                  <div className="stat-card">
                    <div className="label">Gen Output</div>
                    <div className="value">{stats.tokens.generation_output.toLocaleString()}</div>
                  </div>
                  <div className="stat-card">
                    <div className="label">Judge Input</div>
                    <div className="value">{stats.tokens.judge_input.toLocaleString()}</div>
                  </div>
                  <div className="stat-card">
                    <div className="label">Judge Output</div>
                    <div className="value">{stats.tokens.judge_output.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="loading">Loading statistics...</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */
function formatTime(seconds) {
  if (!seconds || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ProgressBar({ progress }) {
  const done = progress.completed + progress.failed;
  const pct = progress.total > 0 ? (done / progress.total * 100) : 0;
  return (
    <div className="progress-section">
      <div className="progress-bar-container">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-tqdm">
        <span className="progress-counts">
          {done}/{progress.total}
          {progress.failed > 0 && <span className="text-danger"> ({progress.failed} failed)</span>}
        </span>
        <span className="progress-pct">{pct.toFixed(0)}%</span>
        <span className="progress-timing">
          [{formatTime(progress.elapsed)}&lt;{formatTime(progress.eta)}, {progress.rate?.toFixed(2) || "0.00"} it/s]
        </span>
      </div>
    </div>
  );
}

function parseThinking(text) {
  if (!text) return { thinking: null, answer: "" };
  const match = text.match(/<think>([\s\S]*?)<\/think>/);
  if (match) {
    const thinking = match[1].trim();
    const answer = text.replace(/<think>[\s\S]*?<\/think>/, "").trim();
    return { thinking, answer };
  }
  return { thinking: null, answer: text };
}

function statusColor(s) {
  const map = {
    created: "#888",
    generating: "#e67e22",
    generated: "#2980b9",
    judging: "#e67e22",
    completed: "#27ae60",
    error: "#e74c3c",
  };
  return map[s] || "#888";
}

function scoreColor(score) {
  if (score >= 0.8) return "#27ae6033";
  if (score >= 0.5) return "#e67e2233";
  return "#e74c3c33";
}
