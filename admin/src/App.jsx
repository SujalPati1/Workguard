import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:5000";

function App() {
  const [empId, setEmpId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [message, setMessage] = useState("");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadEmployees = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/admin/employees`);
      const data = await res.json();
      if (data.success) {
        setEmployees(data.employees || []);
      } else {
        setMessage(data.message || "Could not load employees");
      }
    } catch (err) {
      setMessage(`Error loading employees: ${err.message}`);
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

    if (!empId || !email || !password) {
      setMessage("empId, email and password are required");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/employees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ empId, email, password, fullName, department }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage(data.message);
        setEmpId("");
        setEmail("");
        setPassword("");
        setFullName("");
        setDepartment("");
        loadEmployees();
      } else {
        setMessage(data.message || "Unable to create employee");
      }
    } catch (err) {
      setMessage(`Server error: ${err.message}`);
    }
  };

  return (
    <div className="admin-app">
      <h1>Admin Employee Management</h1>

      <div className="stats-row">
        <div className="stat-card">
          <span>Total Employees</span>
          <strong>{employees.length}</strong>
        </div>
        <div className="stat-card">
          <span>Status</span>
          <strong>{loading ? "Loading..." : "Ready"}</strong>
        </div>
        <button className="refresh-btn" onClick={(e) => { e.preventDefault(); loadEmployees(); }}>
          Refresh
        </button>
      </div>

      <div className="panel-grid">
        <form className="employee-form" onSubmit={createEmployee}>
        <label>
          Employee ID
          <input value={empId} onChange={(e) => setEmpId(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label>
          Full Name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>
          Department
          <input value={department} onChange={(e) => setDepartment(e.target.value)} />
        </label>
        <button type="submit">Create Employee</button>
      </form>

      {message && <div className="message">{message}</div>}

      <section className="employee-list">
        <h2>Existing Employees</h2>
        <table>
          <thead>
            <tr>
              <th>Emp ID</th>
              <th>Email</th>
              <th>Full Name</th>
              <th>Department</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp._id}>
                <td>{emp.empId}</td>
                <td>{emp.email}</td>
                <td>{emp.fullName}</td>
                <td>{emp.department}</td>
                <td>{emp.role}</td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={5}>No employees found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  </div>
  );
}

export default App;

