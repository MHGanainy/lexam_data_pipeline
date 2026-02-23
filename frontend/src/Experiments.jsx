import { useState, useEffect } from "react";

const API = "/api";

export default function Experiments({ onSelectExperiment }) {
  const [experiments, setExperiments] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchExperiments = () => {
    setLoading(true);
    fetch(`${API}/experiments`)
      .then((r) => r.json())
      .then((data) => {
        setExperiments(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchExperiments();
  }, []);

  const handleCreate = () => {
    if (!newName.trim()) return;
    fetch(`${API}/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
    })
      .then((r) => r.json())
      .then((exp) => {
        setShowCreate(false);
        setNewName("");
        setNewDesc("");
        onSelectExperiment(exp.id);
      });
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (!confirm("Delete this experiment and all its data?")) return;
    fetch(`${API}/experiments/${id}`, { method: "DELETE" }).then(() => fetchExperiments());
  };

  const statusColor = (s) => {
    const map = {
      created: "#888",
      generating: "#e67e22",
      generated: "#2980b9",
      judging: "#e67e22",
      completed: "#27ae60",
      error: "#e74c3c",
    };
    return map[s] || "#888";
  };

  return (
    <div className="experiments-page">
      <div className="experiments-header">
        <h2>Experiments</h2>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          New Experiment
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading experiments...</div>
      ) : experiments.length === 0 ? (
        <div className="experiments-empty">
          <p>No experiments yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Model</th>
                <th>Status</th>
                <th>Answers</th>
                <th>Judgments</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((exp) => (
                <tr key={exp.id} onClick={() => onSelectExperiment(exp.id)} style={{ cursor: "pointer" }}>
                  <td>
                    <strong>{exp.name}</strong>
                    {exp.description && (
                      <div style={{ fontSize: "0.8rem", color: "#888", marginTop: 2 }}>
                        {exp.description.slice(0, 80)}
                      </div>
                    )}
                  </td>
                  <td><code style={{ fontSize: "0.8rem" }}>{exp.model_name}</code></td>
                  <td>
                    <span className="badge" style={{ background: statusColor(exp.status) + "22", color: statusColor(exp.status) }}>
                      {exp.status}
                    </span>
                  </td>
                  <td>{exp.answer_count || 0}</td>
                  <td>
                    {exp.judgment_count || 0}
                    {exp.judges && exp.judges.length > 0 && (
                      <div style={{ fontSize: "0.75rem", color: "#888", marginTop: 2 }}>
                        {exp.judges.map((j) => j.model.split("/").pop()).join(", ")}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: "0.85rem", color: "#888" }}>
                    {exp.created_at ? new Date(exp.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td>
                    <button
                      className="btn-danger-sm"
                      onClick={(e) => handleDelete(e, exp.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h2>New Experiment</h2>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Private Law MCQ Baseline"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Describe the experiment..."
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate} disabled={!newName.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
