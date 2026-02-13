import { useState, useEffect, useCallback, useRef } from "react";
import Dashboard from "./Dashboard";

const API = "/api";

/* ── Multi-select dropdown component ────────────────────────── */
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

  // null = "all" (default), [] = nothing checked, [...] = specific items
  const isAllSelected = selected === null;
  const selectedStrs = selected === null ? null : new Set(selected.map(String));

  const handleAllToggle = () => {
    if (isAllSelected) {
      onChange([]); // uncheck all
    } else {
      onChange(null); // check all
    }
  };

  const handleToggle = (val) => {
    const valStr = String(val);
    if (isAllSelected) {
      // All checked → uncheck this one → all options minus this one
      onChange(options.filter((o) => String(o) !== valStr));
    } else if (selectedStrs.has(valStr)) {
      // Uncheck item
      onChange(selected.filter((v) => String(v) !== valStr));
    } else {
      // Check item
      const next = [...selected, val];
      if (next.length === options.length) {
        onChange(null); // all checked → normalize to null
      } else {
        onChange(next);
      }
    }
  };

  const render = renderOption || String;

  const isChecked = (opt) =>
    isAllSelected || (selectedStrs && selectedStrs.has(String(opt)));

  const activeCount = selected === null ? options.length : selected.length;

  const displayLabel =
    isAllSelected
      ? `All ${label}`
      : activeCount === 0
        ? label
        : activeCount === 1
          ? render(selected[0])
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
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleAllToggle}
            />
            All
          </label>
          <div className="multi-select-divider" />
          {options.map((opt) => (
            <label key={opt} className="multi-select-option">
              <input
                type="checkbox"
                checked={isChecked(opt)}
                onChange={() => handleToggle(opt)}
              />
              {render(opt)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Sortable table header ──────────────────────────────────── */
function SortTh({ field, label, sortBy, sortDir, onSort }) {
  const active = sortBy === field;
  return (
    <th className="sortable" onClick={() => onSort(field)}>
      {label}
      <span className={"sort-arrow" + (active ? " active" : "")}>
        {active ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : " \u25B8"}
      </span>
    </th>
  );
}

/* ── Main App ───────────────────────────────────────────────── */
export default function App() {
  const [view, setView] = useState("explorer");
  const [filters, setFilters] = useState(null);
  const [stats, setStats] = useState(null);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);

  // filter state — null = "all" (no filter), [] = nothing, [...] = specific
  const [config, setConfig] = useState(null);
  const [split, setSplit] = useState(null);
  const [area, setArea] = useState(null);
  const [language, setLanguage] = useState(null);
  const [course, setCourse] = useState(null);
  const [year, setYear] = useState(null);
  const [negativeQuestion, setNegativeQuestion] = useState("");
  const [international, setInternational] = useState("");
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const limit = 50;

  const suppressFilterFetch = useRef(false);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (config?.length) config.forEach((c) => params.append("config", c));
    if (split?.length) split.forEach((s) => params.append("split", s));
    if (area?.length) area.forEach((a) => params.append("area", a));
    if (language?.length) language.forEach((l) => params.append("language", l));
    if (course?.length) course.forEach((c) => params.append("course", c));
    if (year?.length) year.forEach((y) => params.append("year", y));
    if (negativeQuestion !== "") params.set("negative_question", negativeQuestion);
    if (international !== "") params.set("international", international);
    return params;
  }, [config, split, area, language, course, year, negativeQuestion, international]);

  // Fetch stats once
  useEffect(() => {
    fetch(`${API}/stats`).then((r) => r.json()).then(setStats);
  }, []);

  // Fetch filters dynamically whenever selections change (with 150ms debounce)
  useEffect(() => {
    if (suppressFilterFetch.current) {
      suppressFilterFetch.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const params = buildFilterParams();
      fetch(`${API}/filters?${params}`).then((r) => r.json()).then(setFilters);
    }, 150);
    return () => clearTimeout(timer);
  }, [buildFilterParams]);

  // Fetch question data
  const fetchData = useCallback(() => {
    const params = buildFilterParams();
    params.set("offset", offset);
    params.set("limit", limit);
    if (sortBy) {
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
    }
    fetch(`${API}/questions?${params}`).then((r) => r.json()).then(setData);
  }, [buildFilterParams, offset, sortBy, sortDir]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setOffset(0);
  }, [config, split, area, language, course, year, negativeQuestion, international, sortBy, sortDir]);

  const handleSort = useCallback((field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }, [sortBy]);

  // Auto-clear stale selections when viable options narrow
  useEffect(() => {
    if (!filters) return;
    let cleared = false;

    const clean = (sel, viable, setter) => {
      if (sel === null || sel.length === 0) return;
      const viableStrs = new Set(viable.map(String));
      const next = sel.filter((v) => viableStrs.has(String(v)));
      if (next.length !== sel.length) {
        setter(next.length === 0 ? null : next);
        cleared = true;
      }
    };

    clean(config, filters.configs, setConfig);
    clean(split, filters.splits, setSplit);
    clean(area, filters.areas, setArea);
    clean(language, filters.languages, setLanguage);
    clean(course, filters.courses, setCourse);
    clean(year, filters.years, setYear);

    if (cleared) suppressFilterFetch.current = true;
  }, [filters]);

  const resetFilters = useCallback(() => {
    setConfig(null);
    setSplit(null);
    setArea(null);
    setLanguage(null);
    setCourse(null);
    setYear(null);
    setNegativeQuestion("");
    setInternational("");
    setSortBy(null);
    setSortDir("asc");
  }, []);

  const hasActiveFilters =
    (config !== null && config.length > 0) ||
    (split !== null && split.length > 0) ||
    (area !== null && area.length > 0) ||
    (language !== null && language.length > 0) ||
    (course !== null && course.length > 0) ||
    (year !== null && year.length > 0) ||
    negativeQuestion !== "" ||
    international !== "";

  if (view === "dashboard") {
    return (
      <div>
        <nav className="app-nav">
          <button className={view === "explorer" ? "active" : ""} onClick={() => setView("explorer")}>Explorer</button>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Dashboard</button>
        </nav>
        <Dashboard />
      </div>
    );
  }

  if (!filters || !stats) return <div className="loading">Loading LEXam data...</div>;

  return (
    <div className="app">
      <nav className="app-nav">
        <button className={view === "explorer" ? "active" : ""} onClick={() => setView("explorer")}>Explorer</button>
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Dashboard</button>
      </nav>

      <header>
        <h1>LEXam Explorer</h1>
        <p>
          {stats.total_questions.toLocaleString()} questions,{" "}
          {stats.total_variants.toLocaleString()} variants across 5 configs
        </p>
      </header>

      <div className="stats-bar">
        {["open_question", "mcq_4_choices", "mcq_8_choices", "mcq_16_choices", "mcq_32_choices"]
          .filter((k) => k in stats.by_config)
          .map((k) => (
          <div className="stat-card" key={k}>
            <div className="label">{k.replace(/_/g, " ")}</div>
            <div className="value">{stats.by_config[k].toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="filters">
        <MultiSelect
          label="configs"
          options={filters.configs}
          selected={config}
          onChange={setConfig}
          renderOption={(v) => v.replace(/_/g, " ")}
        />
        <MultiSelect
          label="splits"
          options={filters.splits}
          selected={split}
          onChange={setSplit}
        />
        <MultiSelect
          label="areas"
          options={filters.areas}
          selected={area}
          onChange={setArea}
        />
        <MultiSelect
          label="languages"
          options={filters.languages}
          selected={language}
          onChange={setLanguage}
        />
        <MultiSelect
          label="courses"
          options={filters.courses}
          selected={course}
          onChange={setCourse}
        />
        <MultiSelect
          label="years"
          options={filters.years}
          selected={year}
          onChange={setYear}
        />
        <select value={negativeQuestion} onChange={(e) => setNegativeQuestion(e.target.value)}>
          <option value="">Neg. question</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
        <select value={international} onChange={(e) => setInternational(e.target.value)}>
          <option value="">International</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
        <button className="reset-btn" disabled={!hasActiveFilters} onClick={resetFilters}>
          Reset
        </button>
      </div>

      <div className="table-container">
        {!data ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <SortTh field="id" label="ID" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="config" label="Configs" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="split" label="Split" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="area" label="Area" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="course" label="Course" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="language" label="Lang" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="year" label="Year" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="negative_question" label="Neg?" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="international" label="Intl?" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="question" label="Question" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} onClick={() => setSelected(row)} style={{ cursor: "pointer" }}>
                    <td>
                      <code style={{ fontSize: "0.75rem" }}>{row.id.slice(0, 8)}</code>
                      <button
                        className="copy-btn"
                        title={row.id}
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(row.id); }}
                      >
                        copy
                      </button>
                    </td>
                    <td>
                      {row.variants.map((v) => (
                        <span className="badge badge-config" key={v.config} style={{ marginRight: 4 }}>
                          {v.config.replace("mcq_", "").replace("_choices", "").replace("open_question", "open")}
                        </span>
                      ))}
                    </td>
                    <td>
                      {[...new Set(row.variants.map((v) => v.split))].map((s) => (
                        <span className="badge" key={s} style={{ marginRight: 4 }}>{s}</span>
                      ))}
                    </td>
                    <td><span className="badge badge-area">{row.area}</span></td>
                    <td>{row.course}</td>
                    <td><span className="badge badge-lang">{row.language}</span></td>
                    <td>{row.year}</td>
                    <td>{row.negative_question === true ? "Y" : row.negative_question === false ? "N" : "—"}</td>
                    <td>{row.international === true ? "Y" : row.international === false ? "N" : "—"}</td>
                    <td className="question-text">{row.question}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination">
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                Previous
              </button>
              <span>
                Showing {offset + 1}–{Math.min(offset + limit, data.total)} of{" "}
                {data.total.toLocaleString()}
              </span>
              <button disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)}>
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Question Detail</h2>
            <div className="meta">
              <span className="badge badge-area">{selected.area}</span>
              <span className="badge badge-lang">{selected.language}</span>
              <span className="badge">{selected.course}</span>
              <span className="badge">{selected.year}</span>
              <span className="badge">{selected.jurisdiction}</span>
              {selected.international && <span className="badge">International</span>}
            </div>
            <div className="question-full">{selected.question}</div>

            <h3>Variants ({selected.variants.length})</h3>
            {selected.variants.map((v) => (
              <div key={v.config} className="variant-block">
                <h4>
                  <span className="badge badge-config">{v.config.replace(/_/g, " ")}</span>
                  <span className="variant-split">{v.split}</span>
                </h4>
                {v.choices && (
                  <ul className="choices-list">
                    {v.choices.map((c, i) => (
                      <li key={i} className={i === v.gold ? "correct" : ""}>
                        {i === v.gold ? "\u2713 " : ""}{c}
                      </li>
                    ))}
                  </ul>
                )}
                {v.answer && (
                  <div className="question-full">{v.answer}</div>
                )}
              </div>
            ))}

            <button className="close" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
