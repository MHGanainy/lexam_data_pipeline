import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
  LineChart, Line, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";

const API = "/api";
const AREA_COLORS = { Private: "#2563eb", Public: "#dc2626", Criminal: "#f59e0b", Interdisciplinary: "#10b981" };
const JURIS_COLORS = { Swiss: "#dc2626", International: "#2563eb", Generic: "#6b7280" };
const AREA_ORDER = ["Private", "Public", "Criminal", "Interdisciplinary"];
const TYPE_COLORS = { "Open-Ended": "#6366f1", "MCQ": "#f97316" };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid #ddd",
      borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1a1a2e",
      boxShadow: "0 4px 16px rgba(0,0,0,0.1)"
    }}>
      {label && <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color || p.fill }} />
          <span style={{ color: "#888" }}>{p.name || p.dataKey}:</span>
          <span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const StatCard = ({ label, value, sub, accent = "#2563eb" }) => (
  <div style={{
    background: "#fff", border: "1px solid #eee",
    borderRadius: 8, padding: "20px 24px", flex: 1, minWidth: 140,
    borderTop: `3px solid ${accent}`,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  }}>
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 32, fontWeight: 700, color: "#1a1a2e", lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>{sub}</div>}
  </div>
);

const SectionHeader = ({ num, title, subtitle }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span style={{ fontSize: 12, color: "#4a6cf7", letterSpacing: "0.05em", fontWeight: 600 }}>{num}</span>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>{title}</h2>
    </div>
    {subtitle && <p style={{ fontSize: 13, color: "#999", margin: "4px 0 0 32px" }}>{subtitle}</p>}
  </div>
);

const ChartCard = ({ children, style = {} }) => (
  <div style={{
    background: "#fff", border: "1px solid #eee",
    borderRadius: 8, padding: 24,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)", ...style
  }}>{children}</div>
);

const MiniLegend = ({ items }) => (
  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
    {items.map((it, i) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888" }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: it.color, display: "inline-block" }} />
        {it.label}
      </div>
    ))}
  </div>
);

const HeatCell = ({ value, max }) => {
  const intensity = value / max;
  return (
    <td style={{
      padding: "10px 16px", textAlign: "center", fontWeight: 600, fontSize: 14,
      background: `rgba(37, 99, 235, ${0.08 + intensity * 0.35})`,
      color: intensity > 0.5 ? "#fff" : "#1a1a2e", borderRadius: 4,
    }}>{value}</td>
  );
};

/* ── Reusable Dashboard Panel ─────────────────────────────── */
function DashboardPanel({ configs, configOptions, title, numOffset = 0 }) {
  const [data, setData] = useState(null);
  const [langFilter, setLangFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [showTopN, setShowTopN] = useState(20);
  const [configMode, setConfigMode] = useState(configOptions ? configOptions[0].id : null);

  const activeConfigs = configOptions
    ? configOptions.find((o) => o.id === configMode)?.configs || configs
    : configs;

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeConfigs) activeConfigs.forEach((c) => params.append("config", c));
    if (langFilter !== "all") params.append("language", langFilter);
    fetch(`${API}/dashboard?${params}`).then((r) => r.json()).then(setData);
  }, [activeConfigs, langFilter]);

  const topCourses = useMemo(() => {
    if (!data) return [];
    return data.courses.slice(0, showTopN);
  }, [data, showTopN]);

  const maxHeat = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.area_jurisdiction.flatMap((r) => [r.Swiss || 0, r.International || 0, r.Generic || 0]));
  }, [data]);

  if (!data) {
    return (
      <div style={{ border: "1px solid #e0e0e0", borderRadius: 12, padding: 28, background: "#fafbfc", marginBottom: 32 }}>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1a1a2e", margin: "0 0 12px" }}>{title}</h2>
        <div className="loading">Loading...</div>
      </div>
    );
  }

  const hasAnswers = data.answer_lengths?.some((b) => b.count > 0);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "courses", label: "Courses" },
    { id: "cross", label: "Cross-Analysis" },
    ...(hasAnswers ? [{ id: "answers", label: "Answer Analysis" }] : []),
  ];

  const n = (i) => String(numOffset + i).padStart(2, "0");

  const areaData = AREA_ORDER
    .map((name) => data.areas.find((a) => a.name === name))
    .filter(Boolean)
    .map((a) => ({ ...a, color: AREA_COLORS[a.name] }));

  const jurisdictionData = ["Swiss", "International", "Generic"]
    .map((name) => data.jurisdictions.find((j) => j.name === name))
    .filter(Boolean)
    .map((j) => ({ ...j, color: JURIS_COLORS[j.name] }));

  const dePct = data.total_questions > 0 ? Math.round(data.total_de / data.total_questions * 100) : 0;
  const enPct = 100 - dePct;

  const subtitle = `${data.total_questions.toLocaleString()} questions${langFilter !== "all" ? ` (${langFilter.toUpperCase()})` : ""}`;

  const langButtons = [
    { id: "all", label: "All" },
    { id: "de", label: "DE" },
    { id: "en", label: "EN" },
  ];

  return (
    <div style={{
      border: "1px solid #e0e0e0", borderRadius: 12, padding: 28,
      background: "#fafbfc", marginBottom: 32,
    }}>
      {/* Panel Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>{title}</h2>
            <p style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>{subtitle}</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {configOptions && (
              <div style={{ display: "flex", gap: 2, background: "#eee", borderRadius: 6, padding: 2 }}>
                {configOptions.map((o) => (
                  <button key={o.id} onClick={() => setConfigMode(o.id)} style={{
                    padding: "5px 12px", borderRadius: 4, border: "none",
                    cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                    background: configMode === o.id ? "#fff" : "transparent",
                    color: configMode === o.id ? "#1a1a2e" : "#999",
                    boxShadow: configMode === o.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  }}>{o.label}</button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 2, background: "#eee", borderRadius: 6, padding: 2 }}>
              {langButtons.map((b) => (
                <button key={b.id} onClick={() => setLangFilter(b.id)} style={{
                  padding: "5px 12px", borderRadius: 4, border: "none",
                  cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                  background: langFilter === b.id ? "#fff" : "transparent",
                  color: langFilter === b.id ? "#1a1a2e" : "#999",
                  boxShadow: langFilter === b.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}>{b.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: "6px 14px", borderRadius: 6, border: "1px solid",
              cursor: "pointer", fontSize: 12, fontWeight: 500, transition: "all 0.15s",
              background: activeTab === t.id ? "#4a6cf7" : "transparent",
              color: activeTab === t.id ? "#fff" : "#888",
              borderColor: activeTab === t.id ? "#4a6cf7" : "#ddd",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ─── OVERVIEW TAB ─── */}
      {activeTab === "overview" && (
        <div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
            <StatCard label="Total Questions" value={data.total_questions.toLocaleString()} sub="filtered" accent="#dc2626" />
            <StatCard label="Courses" value={data.total_courses} sub="unique course titles" accent="#2563eb" />
            <StatCard label="Years Covered" value={data.years.length} sub={`${data.min_year} \u2014 ${data.max_year}`} accent="#f59e0b" />
            <StatCard label="German / English" value={`${dePct}% / ${enPct}%`} sub={`${data.total_de} de \u00b7 ${data.total_en} en`} accent="#10b981" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
            {/* Area pie */}
            <ChartCard>
              <SectionHeader num={n(1)} title="Legal Area Distribution" subtitle="Questions by area of law" />
              <div style={{ display: "flex", alignItems: "center" }}>
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={areaData} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={44} strokeWidth={0} paddingAngle={2}>
                      {areaData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1 }}>
                  {areaData.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />
                        <span style={{ fontSize: 12, color: "#1a1a2e" }}>{d.name}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a2e" }}>{d.value}</span>
                        <span style={{ fontSize: 10, color: "#aaa", marginLeft: 6 }}>{Math.round(d.value / data.total_questions * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>

            {/* Jurisdiction pie */}
            <ChartCard>
              <SectionHeader num={n(2)} title="Jurisdiction Distribution" subtitle="Questions by applicable jurisdiction" />
              <div style={{ display: "flex", alignItems: "center" }}>
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={jurisdictionData} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={44} strokeWidth={0} paddingAngle={2}>
                      {jurisdictionData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1 }}>
                  {jurisdictionData.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />
                        <span style={{ fontSize: 12, color: "#1a1a2e" }}>{d.name}</span>
                      </div>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a2e" }}>{d.value}</span>
                        <span style={{ fontSize: 10, color: "#aaa", marginLeft: 6 }}>{Math.round(d.value / data.total_questions * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>

          {/* Year trend */}
          <ChartCard style={{ marginBottom: 28 }}>
            <SectionHeader num={n(3)} title="Temporal Distribution" subtitle="Number of questions per year, broken down by legal area" />
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.years} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="year" stroke="#ccc" tick={{ fontSize: 12, fill: "#888" }} />
                <YAxis stroke="#ccc" tick={{ fontSize: 12, fill: "#888" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Private" stackId="1" fill="#2563eb" stroke="#2563eb" fillOpacity={0.6} />
                <Area type="monotone" dataKey="Public" stackId="1" fill="#dc2626" stroke="#dc2626" fillOpacity={0.6} />
                <Area type="monotone" dataKey="Criminal" stackId="1" fill="#f59e0b" stroke="#f59e0b" fillOpacity={0.6} />
                <Area type="monotone" dataKey="Interdisciplinary" stackId="1" fill="#10b981" stroke="#10b981" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
            <MiniLegend items={AREA_ORDER.map((a) => ({ label: a, color: AREA_COLORS[a] }))} />
          </ChartCard>

          {/* Split + Language */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <ChartCard>
              <SectionHeader num={n(4)} title="Train / Test Split" subtitle="Distribution across dev and test sets" />
              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                {data.splits.map((s, i) => (
                  <div key={i} style={{
                    flex: s.name === "test" ? 7 : 3, borderRadius: 8, padding: "14px 12px",
                    background: s.name === "test" ? "#e8f0fe" : "#fafbfc",
                    border: `1px solid ${s.name === "test" ? "#b3d1ff" : "#eee"}`,
                    textAlign: "center"
                  }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888", marginBottom: 6 }}>{s.name}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a2e" }}>{s.value.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{s.pct}</div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard>
              <SectionHeader num={n(5)} title="Language Distribution" subtitle="German vs English across areas" />
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.lang_area} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                  <XAxis type="number" stroke="#ccc" tick={{ fontSize: 11, fill: "#888" }} />
                  <YAxis dataKey="area" type="category" width={110} stroke="#ccc" tick={{ fontSize: 11, fill: "#666" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="de" fill="#6366f1" name="German" radius={[0, 4, 4, 0]} barSize={12} />
                  <Bar dataKey="en" fill="#f472b6" name="English" radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
              <MiniLegend items={[{ label: "German (de)", color: "#6366f1" }, { label: "English (en)", color: "#f472b6" }]} />
            </ChartCard>
          </div>
        </div>
      )}

      {/* ─── COURSES TAB ─── */}
      {activeTab === "courses" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <SectionHeader num={n(6)} title="Questions per Course" subtitle={`Showing top ${showTopN} of ${data.total_courses} courses`} />
            <div style={{ display: "flex", gap: 8 }}>
              {[10, 20, 30].map((nn) => (
                <button key={nn} onClick={() => setShowTopN(nn)} style={{
                  padding: "5px 12px", borderRadius: 6, border: "1px solid",
                  borderColor: showTopN === nn ? "#4a6cf7" : "#ddd",
                  background: showTopN === nn ? "#4a6cf7" : "transparent",
                  color: showTopN === nn ? "#fff" : "#888",
                  cursor: "pointer", fontSize: 11,
                }}>Top {nn}</button>
              ))}
            </div>
          </div>

          <ChartCard>
            <ResponsiveContainer width="100%" height={topCourses.length * 28 + 40}>
              <BarChart data={topCourses} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                <XAxis type="number" stroke="#ccc" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis dataKey="course" type="category" width={240} stroke="#ccc" tick={{ fontSize: 10, fill: "#666" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Questions" radius={[0, 4, 4, 0]} barSize={16}>
                  {topCourses.map((d, i) => <Cell key={i} fill={AREA_COLORS[d.area] || "#6b7280"} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <MiniLegend items={Object.entries(AREA_COLORS).map(([l, c]) => ({ label: l, color: c }))} />
          </ChartCard>

          <ChartCard style={{ marginTop: 20 }}>
            <SectionHeader num={n(7)} title="Course Detail Table" subtitle="Top courses with language breakdown" />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 2px", fontSize: 12 }}>
                <thead>
                  <tr style={{ textTransform: "uppercase", fontSize: 10, letterSpacing: "0.1em", color: "#888" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Course</th>
                    <th style={{ textAlign: "center", padding: "8px 12px" }}>Area</th>
                    <th style={{ textAlign: "right", padding: "8px 12px" }}>Total</th>
                    <th style={{ textAlign: "right", padding: "8px 12px" }}>DE</th>
                    <th style={{ textAlign: "right", padding: "8px 12px" }}>EN</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", width: 180 }}>Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {topCourses.slice(0, 15).map((c, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#f5f7fa" : "transparent" }}>
                      <td style={{ padding: "6px 12px", fontWeight: 500, color: "#1a1a2e" }}>{c.course}</td>
                      <td style={{ textAlign: "center", padding: "6px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${AREA_COLORS[c.area]}18`, color: AREA_COLORS[c.area] }}>{c.area}</span>
                      </td>
                      <td style={{ textAlign: "right", padding: "6px 12px", fontWeight: 600, color: "#1a1a2e" }}>{c.count}</td>
                      <td style={{ textAlign: "right", padding: "6px 12px", color: "#6366f1" }}>{c.lang_de}</td>
                      <td style={{ textAlign: "right", padding: "6px 12px", color: "#f472b6" }}>{c.lang_en}</td>
                      <td style={{ padding: "6px 12px" }}>
                        <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", background: "#f0f0f0" }}>
                          <div style={{ width: `${c.lang_de / c.count * 100}%`, background: "#6366f1" }} />
                          <div style={{ width: `${c.lang_en / c.count * 100}%`, background: "#f472b6" }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      )}

      {/* ─── CROSS-ANALYSIS TAB ─── */}
      {activeTab === "cross" && (
        <div>
          <ChartCard style={{ marginBottom: 20 }}>
            <SectionHeader num={n(8)} title="Area \u00d7 Jurisdiction Heatmap" subtitle="How questions distribute across legal areas and jurisdictions" />
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 4, marginTop: 16 }}>
              <thead>
                <tr>
                  <th style={{ padding: 10, textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888" }}>Area</th>
                  {["Swiss", "International", "Generic"].map((j) => (
                    <th key={j} style={{ padding: 10, textAlign: "center", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888" }}>{j}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.area_jurisdiction.map((row, i) => (
                  <tr key={i}>
                    <td style={{ padding: "10px 16px", fontWeight: 600, color: AREA_COLORS[row.area] }}>{row.area}</td>
                    <HeatCell value={row.Swiss || 0} max={maxHeat} />
                    <HeatCell value={row.International || 0} max={maxHeat} />
                    <HeatCell value={row.Generic || 0} max={maxHeat} />
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>

          <ChartCard style={{ marginBottom: 20 }}>
            <SectionHeader num={n(9)} title="Area \u00d7 Jurisdiction (Chart)" subtitle="Grouped bar comparison" />
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.area_jurisdiction} margin={{ top: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="area" stroke="#ccc" tick={{ fontSize: 11, fill: "#666" }} />
                <YAxis stroke="#ccc" tick={{ fontSize: 11, fill: "#888" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Swiss" fill="#dc2626" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="International" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="Generic" fill="#6b7280" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
            <MiniLegend items={Object.entries(JURIS_COLORS).map(([l, c]) => ({ label: l, color: c }))} />
          </ChartCard>

          <ChartCard>
            <SectionHeader num={n(10)} title="Growth Trend" subtitle="Year-over-year question count growth" />
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.years} margin={{ top: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="year" stroke="#ccc" tick={{ fontSize: 12, fill: "#888" }} />
                <YAxis stroke="#ccc" tick={{ fontSize: 11, fill: "#888" }} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="total" stroke="#1a1a2e" strokeWidth={2.5} dot={{ r: 4, fill: "#1a1a2e" }} name="Total" />
                <Line type="monotone" dataKey="Private" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="Public" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <MiniLegend items={[{ label: "Total", color: "#1a1a2e" }, { label: "Private", color: "#2563eb" }, { label: "Public", color: "#dc2626" }]} />
          </ChartCard>
        </div>
      )}

      {/* ─── ANSWER ANALYSIS TAB ─── */}
      {activeTab === "answers" && hasAnswers && (
        <div>
          <ChartCard style={{ marginBottom: 20 }}>
            <SectionHeader num={n(11)} title="Reference Answer Length Distribution" subtitle="Word count distribution of model answers" />
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.answer_lengths} margin={{ top: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="range" stroke="#ccc" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis stroke="#ccc" tick={{ fontSize: 11, fill: "#888" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Questions" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={36}>
                  {data.answer_lengths.map((_, i) => <Cell key={i} fill={`rgba(99, 102, 241, ${0.45 + i * 0.1})`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard style={{ marginBottom: 20 }}>
            <SectionHeader num={n(12)} title="Answer Statistics by Area" subtitle="Word count stats for reference answers across legal areas" />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 2px", fontSize: 12 }}>
                <thead>
                  <tr style={{ textTransform: "uppercase", fontSize: 10, letterSpacing: "0.1em", color: "#888" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Area</th>
                    <th style={{ textAlign: "right", padding: "8px 12px" }}>Avg Words</th>
                    <th style={{ textAlign: "right", padding: "8px 12px" }}>Median</th>
                    <th style={{ textAlign: "right", padding: "8px 12px" }}>Min</th>
                    <th style={{ textAlign: "right", padding: "8px 12px" }}>Max</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", width: 200 }}>Range</th>
                  </tr>
                </thead>
                <tbody>
                  {data.answer_stats.map((r, i) => {
                    const globalMax = Math.max(...data.answer_stats.map((s) => s.maxWords));
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#f5f7fa" : "transparent" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 600, color: AREA_COLORS[r.area] }}>{r.area}</td>
                        <td style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: "#1a1a2e" }}>{r.avgWords}</td>
                        <td style={{ textAlign: "right", padding: "8px 12px", color: "#666" }}>{r.medianWords}</td>
                        <td style={{ textAlign: "right", padding: "8px 12px", color: "#aaa" }}>{r.minWords}</td>
                        <td style={{ textAlign: "right", padding: "8px 12px", color: "#aaa" }}>{r.maxWords}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ position: "relative", height: 10, background: "#f0f0f0", borderRadius: 6 }}>
                            <div style={{
                              position: "absolute", height: "100%", borderRadius: 6,
                              left: `${r.minWords / globalMax * 100}%`,
                              width: `${(r.maxWords - r.minWords) / globalMax * 100}%`,
                              background: `${AREA_COLORS[r.area]}25`, border: `1px solid ${AREA_COLORS[r.area]}40`,
                            }} />
                            <div style={{
                              position: "absolute", width: 3, height: "100%", borderRadius: 2,
                              left: `${r.avgWords / globalMax * 100}%`, background: AREA_COLORS[r.area],
                            }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>

          {/* Radar */}
          <ChartCard>
            <SectionHeader num={n(13)} title="Area Complexity Profile" subtitle="Radar comparison of answer characteristics" />
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={(() => {
                const stats = {};
                data.answer_stats.forEach((s) => { stats[s.area] = s; });
                const courseCounts = {};
                data.courses.forEach((c) => { courseCounts[c.area] = (courseCounts[c.area] || 0) + 1; });
                const intlCounts = {};
                data.area_jurisdiction.forEach((r) => { intlCounts[r.area] = r.International || 0; });
                const areaCounts = {};
                data.areas.forEach((a) => { areaCounts[a.name] = a.value; });
                return [
                  { metric: "Avg Length", ...Object.fromEntries(AREA_ORDER.map((a) => [a, stats[a]?.avgWords || 0])) },
                  { metric: "Max Length", ...Object.fromEntries(AREA_ORDER.map((a) => [a, Math.round((stats[a]?.maxWords || 0) / 10)])) },
                  { metric: "Question Count", ...Object.fromEntries(AREA_ORDER.map((a) => [a, Math.round((areaCounts[a] || 0) / 4)])) },
                  { metric: "Course Variety", ...Object.fromEntries(AREA_ORDER.map((a) => [a, (courseCounts[a] || 0) * 5])) },
                  { metric: "Int'l Share", ...Object.fromEntries(AREA_ORDER.map((a) => [a, intlCounts[a] || 0])) },
                ];
              })()}>
                <PolarGrid stroke="#e0e0e0" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#888" }} />
                <Radar name="Private" dataKey="Private" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
                <Radar name="Public" dataKey="Public" stroke="#dc2626" fill="#dc2626" fillOpacity={0.1} strokeWidth={2} />
                <Radar name="Criminal" dataKey="Criminal" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} strokeWidth={2} />
                <Radar name="Interdisciplinary" dataKey="Interdisciplinary" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
            <MiniLegend items={Object.entries(AREA_COLORS).map(([l, c]) => ({ label: l, color: c }))} />
          </ChartCard>
        </div>
      )}
    </div>
  );
}

/* ── Comparison Panel ─────────────────────────────────────── */
function ComparisonPanel() {
  const [oeData, setOeData] = useState(null);
  const [mcqData, setMcqData] = useState(null);
  const [langFilter, setLangFilter] = useState("all");
  const [mcqMode, setMcqMode] = useState("mcq_4");

  const mcqConfigs = mcqMode === "mcq_4"
    ? ["mcq_4_choices"]
    : ["mcq_4_choices", "mcq_8_choices", "mcq_16_choices", "mcq_32_choices"];

  useEffect(() => {
    const fetchType = (configs) => {
      const params = new URLSearchParams();
      configs.forEach((c) => params.append("config", c));
      if (langFilter !== "all") params.append("language", langFilter);
      return fetch(`${API}/dashboard?${params}`).then((r) => r.json());
    };
    Promise.all([
      fetchType(["open_question"]),
      fetchType(mcqConfigs),
    ]).then(([oe, mcq]) => { setOeData(oe); setMcqData(mcq); });
  }, [langFilter, mcqMode]);

  const areaComparison = useMemo(() => {
    if (!oeData || !mcqData) return [];
    const map = {};
    oeData.areas.forEach((a) => { map[a.name] = { area: a.name, "Open-Ended": a.value, "MCQ": 0 }; });
    mcqData.areas.forEach((a) => {
      if (!map[a.name]) map[a.name] = { area: a.name, "Open-Ended": 0, "MCQ": 0 };
      map[a.name]["MCQ"] = a.value;
    });
    return AREA_ORDER.map((a) => map[a]).filter(Boolean);
  }, [oeData, mcqData]);

  const yearComparison = useMemo(() => {
    if (!oeData || !mcqData) return [];
    const map = {};
    oeData.years.forEach((y) => { map[y.year] = { year: y.year, "Open-Ended": y.total || 0, "MCQ": 0 }; });
    mcqData.years.forEach((y) => {
      if (!map[y.year]) map[y.year] = { year: y.year, "Open-Ended": 0, "MCQ": 0 };
      map[y.year]["MCQ"] = y.total || 0;
    });
    return Object.values(map).sort((a, b) => a.year - b.year);
  }, [oeData, mcqData]);

  const courseComparison = useMemo(() => {
    if (!oeData || !mcqData) return [];
    const map = {};
    oeData.courses.forEach((c) => {
      map[c.course] = { course: c.course, area: c.area, open: c.count, mcq: 0, total: c.count };
    });
    mcqData.courses.forEach((c) => {
      if (!map[c.course]) map[c.course] = { course: c.course, area: c.area, open: 0, mcq: 0, total: 0 };
      map[c.course].mcq = c.count;
      map[c.course].total = map[c.course].open + c.count;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [oeData, mcqData]);

  if (!oeData || !mcqData) {
    return (
      <div style={{ border: "1px solid #e0e0e0", borderRadius: 12, padding: 28, background: "#fafbfc", marginBottom: 32 }}>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1a1a2e", margin: "0 0 12px" }}>Open-Ended vs MCQ Comparison</h2>
        <div className="loading">Loading comparison data...</div>
      </div>
    );
  }

  const oeTotal = oeData.total_questions;
  const mcqTotal = mcqData.total_questions;
  const combined = oeTotal + mcqTotal;
  const ratio = mcqTotal > 0 ? (oeTotal / mcqTotal).toFixed(2) : "N/A";

  return (
    <div style={{
      border: "1px solid #e0e0e0", borderRadius: 12, padding: 28,
      background: "#fafbfc", marginBottom: 32,
    }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
              Open-Ended vs MCQ Comparison
            </h2>
            <p style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
              Side-by-side comparison{mcqMode === "mcq_4" ? " (MCQ 4 only)" : " (All MCQ)"}{langFilter !== "all" ? ` · ${langFilter.toUpperCase()}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 2, background: "#eee", borderRadius: 6, padding: 2 }}>
              {[{ id: "mcq_4", label: "MCQ 4" }, { id: "all_mcq", label: "All MCQ" }].map((b) => (
                <button key={b.id} onClick={() => setMcqMode(b.id)} style={{
                  padding: "5px 12px", borderRadius: 4, border: "none",
                  cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                  background: mcqMode === b.id ? "#fff" : "transparent",
                  color: mcqMode === b.id ? "#1a1a2e" : "#999",
                  boxShadow: mcqMode === b.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}>{b.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 2, background: "#eee", borderRadius: 6, padding: 2 }}>
              {[{ id: "all", label: "All" }, { id: "de", label: "DE" }, { id: "en", label: "EN" }].map((b) => (
                <button key={b.id} onClick={() => setLangFilter(b.id)} style={{
                  padding: "5px 12px", borderRadius: 4, border: "none",
                  cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                background: langFilter === b.id ? "#fff" : "transparent",
                color: langFilter === b.id ? "#1a1a2e" : "#999",
                boxShadow: langFilter === b.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>{b.label}</button>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
        <StatCard label="Open-Ended" value={oeTotal.toLocaleString()} sub="total questions" accent={TYPE_COLORS["Open-Ended"]} />
        <StatCard label="MCQ" value={mcqTotal.toLocaleString()} sub="total questions" accent={TYPE_COLORS["MCQ"]} />
        <StatCard label="Combined" value={combined.toLocaleString()} sub="all question types" accent="#1a1a2e" />
        <StatCard label="OE : MCQ Ratio" value={ratio} sub="open-ended per MCQ" accent="#10b981" />
      </div>

      {/* 2-column: area bars + year lines */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        <ChartCard>
          <SectionHeader num="C1" title="Area Comparison" subtitle="Open-Ended vs MCQ by legal area" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={areaComparison} margin={{ top: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="area" stroke="#ccc" tick={{ fontSize: 11, fill: "#666" }} />
              <YAxis stroke="#ccc" tick={{ fontSize: 11, fill: "#888" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Open-Ended" fill={TYPE_COLORS["Open-Ended"]} radius={[4, 4, 0, 0]} barSize={24} />
              <Bar dataKey="MCQ" fill={TYPE_COLORS["MCQ"]} radius={[4, 4, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
          <MiniLegend items={[{ label: "Open-Ended", color: TYPE_COLORS["Open-Ended"] }, { label: "MCQ", color: TYPE_COLORS["MCQ"] }]} />
        </ChartCard>

        <ChartCard>
          <SectionHeader num="C2" title="Year Trend" subtitle="Temporal comparison of both types" />
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={yearComparison} margin={{ top: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="year" stroke="#ccc" tick={{ fontSize: 12, fill: "#888" }} />
              <YAxis stroke="#ccc" tick={{ fontSize: 11, fill: "#888" }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="Open-Ended" stroke={TYPE_COLORS["Open-Ended"]} strokeWidth={2.5} dot={{ r: 4, fill: TYPE_COLORS["Open-Ended"] }} />
              <Line type="monotone" dataKey="MCQ" stroke={TYPE_COLORS["MCQ"]} strokeWidth={2.5} dot={{ r: 4, fill: TYPE_COLORS["MCQ"] }} />
            </LineChart>
          </ResponsiveContainer>
          <MiniLegend items={[{ label: "Open-Ended", color: TYPE_COLORS["Open-Ended"] }, { label: "MCQ", color: TYPE_COLORS["MCQ"] }]} />
        </ChartCard>
      </div>

      {/* Full-width: all courses */}
      <ChartCard>
        <SectionHeader num="C3" title={`All Courses (${courseComparison.length})`} subtitle="Combined question count by course, split by type — sorted by total" />
        <ResponsiveContainer width="100%" height={courseComparison.length * 32 + 40}>
          <BarChart data={courseComparison} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
            <XAxis type="number" stroke="#ccc" tick={{ fontSize: 11, fill: "#888" }} />
            <YAxis dataKey="course" type="category" width={240} stroke="#ccc" tick={{ fontSize: 10, fill: "#666" }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="open" name="Open-Ended" fill={TYPE_COLORS["Open-Ended"]} radius={[0, 4, 4, 0]} barSize={12} />
            <Bar dataKey="mcq" name="MCQ" fill={TYPE_COLORS["MCQ"]} radius={[0, 4, 4, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
        <MiniLegend items={[{ label: "Open-Ended", color: TYPE_COLORS["Open-Ended"] }, { label: "MCQ", color: TYPE_COLORS["MCQ"] }]} />
      </ChartCard>
    </div>
  );
}

/* ── Course Summary Table ─────────────────────────────────── */
function CourseSummaryTable() {
  const [data, setData] = useState(null);
  const [sortCol, setSortCol] = useState("area");
  const [sortDir, setSortDir] = useState("asc");
  const [areaFilter, setAreaFilter] = useState("all");
  const [intlFilter, setIntlFilter] = useState("all");
  const [langFilter, setLangFilter] = useState("all");

  useEffect(() => {
    fetch(`${API}/course-summary`).then((r) => r.json()).then(setData);
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data;
    if (areaFilter !== "all") rows = rows.filter((r) => r.area === areaFilter);
    if (intlFilter !== "all") rows = rows.filter((r) => String(r.international) === intlFilter);
    if (langFilter !== "all") rows = rows.filter((r) => r.language === langFilter);
    return [...rows].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortCol, sortDir, areaFilter, intlFilter, langFilter]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  if (!data) {
    return (
      <div style={{ border: "1px solid #e0e0e0", borderRadius: 12, padding: 28, background: "#fafbfc", marginBottom: 32 }}>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1a1a2e", margin: "0 0 12px" }}>Course Summary</h2>
        <div className="loading">Loading course data...</div>
      </div>
    );
  }

  const areas = [...new Set(data.map((r) => r.area))].sort();

  const thStyle = (col) => ({
    padding: "8px 12px", textAlign: "left", cursor: "pointer", userSelect: "none",
    fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
    color: sortCol === col ? "#4a6cf7" : "#888", whiteSpace: "nowrap",
  });
  const arrow = (col) => sortCol === col ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : " \u25B8";

  const langBadge = (lang) => {
    const colors = { de: "#6366f1", en: "#f472b6", both: "#10b981" };
    return (
      <span style={{
        padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
        background: `${colors[lang] || "#888"}18`, color: colors[lang] || "#888",
      }}>{lang}</span>
    );
  };

  return (
    <div style={{
      border: "1px solid #e0e0e0", borderRadius: 12, padding: 28,
      background: "#fafbfc", marginBottom: 32,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>Course Summary</h2>
          <p style={{ fontSize: 13, color: "#666" }}>
            {filtered.length} of {data.length} courses
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 2, background: "#eee", borderRadius: 6, padding: 2 }}>
            {["all", ...areas].map((a) => (
              <button key={a} onClick={() => setAreaFilter(a)} style={{
                padding: "5px 12px", borderRadius: 4, border: "none",
                cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                background: areaFilter === a ? "#fff" : "transparent",
                color: areaFilter === a ? "#1a1a2e" : "#999",
                boxShadow: areaFilter === a ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>{a === "all" ? "All" : a}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 2, background: "#eee", borderRadius: 6, padding: 2 }}>
            {[{ id: "all", label: "All" }, { id: "true", label: "Intl" }, { id: "false", label: "Domestic" }].map((b) => (
              <button key={b.id} onClick={() => setIntlFilter(b.id)} style={{
                padding: "5px 12px", borderRadius: 4, border: "none",
                cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                background: intlFilter === b.id ? "#fff" : "transparent",
                color: intlFilter === b.id ? "#1a1a2e" : "#999",
                boxShadow: intlFilter === b.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>{b.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 2, background: "#eee", borderRadius: 6, padding: 2 }}>
            {[{ id: "all", label: "All" }, { id: "de", label: "DE" }, { id: "en", label: "EN" }, { id: "both", label: "Both" }].map((b) => (
              <button key={b.id} onClick={() => setLangFilter(b.id)} style={{
                padding: "5px 12px", borderRadius: 4, border: "none",
                cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                background: langFilter === b.id ? "#fff" : "transparent",
                color: langFilter === b.id ? "#1a1a2e" : "#999",
                boxShadow: langFilter === b.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>{b.label}</button>
            ))}
          </div>
        </div>
      </div>

      <ChartCard style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 2px", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thStyle("area")} onClick={() => handleSort("area")}>Area{arrow("area")}</th>
                <th style={thStyle("jurisdiction")} onClick={() => handleSort("jurisdiction")}>Jurisdiction{arrow("jurisdiction")}</th>
                <th style={thStyle("course")} onClick={() => handleSort("course")}>Course{arrow("course")}</th>
                <th style={thStyle("international")} onClick={() => handleSort("international")}>Intl?{arrow("international")}</th>
                <th style={{ ...thStyle("mcq_4"), textAlign: "right" }} onClick={() => handleSort("mcq_4")}>MCQ 4{arrow("mcq_4")}</th>
                <th style={{ ...thStyle("mcq_all"), textAlign: "right" }} onClick={() => handleSort("mcq_all")}>MCQ All{arrow("mcq_all")}</th>
                <th style={{ ...thStyle("open_qa"), textAlign: "right" }} onClick={() => handleSort("open_qa")}>Open QA{arrow("open_qa")}</th>
                <th style={{ ...thStyle("open_dev"), textAlign: "right" }} onClick={() => handleSort("open_dev")}>OE Dev{arrow("open_dev")}</th>
                <th style={{ ...thStyle("open_test"), textAlign: "right" }} onClick={() => handleSort("open_test")}>OE Test{arrow("open_test")}</th>
                <th style={thStyle("language")} onClick={() => handleSort("language")}>Lang{arrow("language")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.course} style={{ background: i % 2 === 0 ? "#f5f7fa" : "transparent" }}>
                  <td style={{ padding: "6px 12px" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: `${AREA_COLORS[r.area] || "#888"}18`, color: AREA_COLORS[r.area] || "#888",
                    }}>{r.area}</span>
                  </td>
                  <td style={{ padding: "6px 12px", fontSize: 11, color: "#666" }}>{r.jurisdiction}</td>
                  <td style={{ padding: "6px 12px", fontWeight: 500, color: "#1a1a2e" }}>{r.course}</td>
                  <td style={{ padding: "6px 12px", textAlign: "center" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: r.international ? "#10b98118" : "#f5f5f5",
                      color: r.international ? "#10b981" : "#aaa",
                    }}>{r.international ? "Yes" : "No"}</span>
                  </td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#f97316" }}>{r.mcq_4 || "—"}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#ea580c" }}>{r.mcq_all || "—"}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#6366f1" }}>{r.open_qa || "—"}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500, color: "#818cf8" }}>{r.open_dev || "—"}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500, color: "#4f46e5" }}>{r.open_test || "—"}</td>
                  <td style={{ padding: "6px 12px" }}>{langBadge(r.language)}</td>
                </tr>
              ))}
              {(() => {
                const sum = (key) => filtered.reduce((s, r) => s + (r[key] || 0), 0);
                const footerStyle = { padding: "10px 12px", textAlign: "right", fontWeight: 700, fontSize: 12, borderTop: "2px solid #ddd" };
                return (
                  <tr style={{ background: "#f0f2f5" }}>
                    <td style={{ ...footerStyle, textAlign: "left" }} colSpan={4}>Total ({filtered.length} courses)</td>
                    <td style={{ ...footerStyle, color: "#f97316" }}>{sum("mcq_4")}</td>
                    <td style={{ ...footerStyle, color: "#ea580c" }}>{sum("mcq_all")}</td>
                    <td style={{ ...footerStyle, color: "#6366f1" }}>{sum("open_qa")}</td>
                    <td style={{ ...footerStyle, color: "#818cf8" }}>{sum("open_dev")}</td>
                    <td style={{ ...footerStyle, color: "#4f46e5" }}>{sum("open_test")}</td>
                    <td style={{ ...footerStyle, textAlign: "left" }} />
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

/* ── Config arrays (stable references) ────────────────────── */
const OPEN_CONFIGS = ["open_question"];
const MCQ_4_CONFIGS = ["mcq_4_choices"];
const MCQ_CONFIGS = ["mcq_4_choices", "mcq_8_choices", "mcq_16_choices", "mcq_32_choices"];
const MCQ_OPTIONS = [
  { id: "mcq_4", label: "MCQ 4", configs: MCQ_4_CONFIGS },
  { id: "all_mcq", label: "All MCQ", configs: MCQ_CONFIGS },
];

/* ── Main Dashboard ───────────────────────────────────────── */
export default function Dashboard() {
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 60px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>Dataset Dashboard</h1>
        <p style={{ fontSize: 14, color: "#666", lineHeight: 1.5 }}>
          Breakdown by question type. Each panel shows filtered analytics.
        </p>
      </div>

      <ComparisonPanel />

      <CourseSummaryTable />

      <DashboardPanel
        configs={OPEN_CONFIGS}
        title="Open-Ended QA"
        numOffset={1}
      />

      <DashboardPanel
        configs={MCQ_4_CONFIGS}
        configOptions={MCQ_OPTIONS}
        title="Multiple Choice (MCQ)"
        numOffset={1}
      />

      <div style={{
        marginTop: 32, paddingTop: 24, borderTop: "1px solid #eee",
        fontSize: 11, color: "#aaa",
        display: "flex", justifyContent: "space-between"
      }}>
        <span>Dataset: LEXam Swiss Legal Questions</span>
        <span>Data sourced live from the LEXam database</span>
      </div>
    </div>
  );
}
