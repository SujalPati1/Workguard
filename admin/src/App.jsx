import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:5000";
const ADMIN_API = `${API_BASE}/api/admin`;

// Shared secret — must match ADMIN_SECRET in server/.env
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || "";

function App() {
  const [empId, setEmpId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadEmployees = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${ADMIN_API}/employees`, {
        headers: { "X-Admin-Key": ADMIN_KEY },
      });
      const data = await res.json();
      if (data.success) {
        setEmployees(data.employees || []);
      } else {
        setMessage(data.message || "Could not load employees");
        setIsError(true);
      }
    } catch (err) {
      setMessage(`Error loading employees: ${err.message}`);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      await loadEmployees();
    };

    fetchData();
  }, []);

  const createEmployee = async (e) => {
    e.preventDefault();
    setIsError(false);

    if (!empId || !email || !password) {
      setMessage("Employee ID, Email, and Password are required");
      setIsError(true);
      return;
    }

    try {
      const res = await fetch(`${ADMIN_API}/employees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": ADMIN_KEY,
        },
        body: JSON.stringify({ empId, email, password, fullName, department }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage("Employee mapped & created successfully! ✨");
        setIsError(false);
        setEmpId("");
        setEmail("");
        setPassword("");
        setFullName("");
        setDepartment("");
        loadEmployees();
      } else {
        setMessage(data.message || "Unable to create employee");
        setIsError(true);
      }
    } catch (err) {
      setMessage(`Server error: ${err.message}`);
      setIsError(true);
    }
  };

  return (
    <div className="admin-app">
      <header className="header">
        <div>
          <h1>Workguard Center</h1>
          <p>Enterprise administration & personnel mapping portal</p>
        </div>
        <button className="refresh-btn" onClick={(e) => { e.preventDefault(); loadEmployees(); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 1 0 2.81-6.5L21 8"></path><path d="M9 12h.01"></path><path d="M15 12h.01"></path></svg>
          Sync Data
        </button>
      </header>

      <section className="stats-row">
        <div className="stat-card glass">
          <span>Registered Personnel</span>
          <strong>{employees.length}</strong>
        </div>
        <div className="stat-card glass" style={{ borderColor: loading ? 'var(--secondary)' : 'var(--border-color)' }}>
          <span>System Status</span>
          <strong style={{ color: loading ? 'var(--secondary)' : 'var(--text-main)' }}>
            {loading ? "Syncing..." : "Optimal"}
          </strong>
        </div>
      </section>

      <main className="panel-grid">
        <aside className="glass-panel glass">
          <h2>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--primary)'}}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
            Onboard Personnel
          </h2>
          <form className="employee-form" onSubmit={createEmployee}>
            <div className="input-group">
              <label>Employee ID</label>
              <input placeholder="e.g. EMP-1042" value={empId} onChange={(e) => setEmpId(e.target.value)} required />
            </div>
            <div className="input-group">
              <label>Corporate Email</label>
              <input type="email" placeholder="alex@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="input-group">
              <label>Secure Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label>Full Legal Name</label>
              <input placeholder="Alex Mercer" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="input-group">
              <label>Department</label>
              <input placeholder="e.g. Engineering" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <button className="submit-btn" type="submit">Establish Credentials</button>
          </form>

          {message && (
            <div className={`message ${isError ? 'error' : ''}`}>
              {message}
            </div>
          )}
        </aside>

        <section className="glass-panel glass">
          <h2>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--secondary)'}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            Personnel Directory
          </h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Identity</th>
                  <th>Contact</th>
                  <th>Designation</th>
                  <th>Privilege</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '15px' }}>{emp.fullName || 'Unspecified'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{emp.empId}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{emp.email}</td>
                    <td className="dept-badge">{emp.department || '—'}</td>
                    <td>
                      <span className="role-badge">{emp.role}</span>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && !loading && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "40px 0", color: 'var(--text-muted)' }}>
                      No personnel records found in securely mapped database.
                    </td>
                  </tr>
                )}
                {loading && employees.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "40px 0", color: 'var(--text-muted)' }}>
                      Synchronizing with secure database...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

