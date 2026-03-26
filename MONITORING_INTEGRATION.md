# WorkGuard Authentication Integration with Monitoring

## Overview

This document explains how the new authentication system integrates with the existing WorkGuard monitoring system (biometrics, work sessions, etc.).

---

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON DESKTOP APP                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
        ┌───────────────────────┬───────────────────────┐
        ↓                       ↓                       ↓
   ┌─────────┐           ┌──────────┐            ┌───────────┐
   │ LOGIN   │           │WORK       │            │ PYTHON    │
   │MODULE   │           │SESSION    │            │ ENGINE    │
   │(Auth)   │           │(Monitor)  │            │(Biometrics)
   └─────────┘           └──────────┘            └───────────┘
        ↓                       ↓                       ↓
        └───────────────────────┴───────────────────────┘
                              ↓
                    EXPRESS BACKEND
                   (JWT Protected)
                              ↓
        ┌───────────────────────┬───────────────────────┐
        ↓                       ↓
    ┌─────────────┐      ┌──────────────┐
    │ MONGODB     │      │ MONITORING   │
    │ (User Data) │      │ (Sessions,   │
    │             │      │  Biometrics) │
    └─────────────┘      └──────────────┘
```

---

## Integration Points

### 1. Session Creation

When user logs in:
```
LOGIN → JWT Token Generated → User Session Started
          ↓
      Token Stored (localStorage + Electron store)
          ↓
      Dashboard Loads (Python Engine Starts)
          ↓
      Monitoring Begins (with authenticated user context)
```

### 2. During Work Session

```
Work Session Active
    ↓
Every Frame: {
  - Biometrics (from Python)
  - Timestamps
  - User ID (from Auth Context)
}
    ↓
Store to MongoDB with User Reference
```

### 3. On App Close

```
App Closes
    ↓
Session Data Saved to DB
    ↓
Tokens Persisted in Electron Store
    ↓
User Can Reopen App Without Logging In
```

### 4. On App Reopen

```
App Opens
    ↓
Check Stored Tokens (Electron Store)
    ↓
If Valid → Restore Session → Continue Monitoring
If Expired → Try Refresh → If Success → Restore
If Invalid → Redirect to Login
```

---

## Code Integration Examples

### Example 1: WorkSession Component with Auth

```javascript
import { useSession } from '../context/SessionContext';
import { useWorkGuardData } from '../hooks/useWorkGuardData';

function WorkSession() {
  const { employee, accessToken } = useSession();
  const { biometrics } = useWorkGuardData();

  useEffect(() => {
    if (!employee) {
      navigate('/login');
      return;
    }

    // Save session with user context
    const sessionData = {
      userId: employee.id,
      empId: employee.empId,
      startTime: new Date(),
      biometrics: biometrics,
      accessToken: accessToken // Include token for API calls
    };

    // Send to backend with auth
    // API client automatically adds Authorization header
    saveSessionData(sessionData);
  }, [employee, biometrics]);

  return <div>Monitoring Active for {employee.fullName}</div>;
}
```

### Example 2: Protected Monitoring API

```javascript
// server/routes/monitoringRoutes.js (NEW - for future use)
const router = require('express').Router();
const auth = require('../middleware/authMiddleware');

router.post('/monitoring/save-session', auth, async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { biometrics, sessionDuration } = req.body;

    // Create session record linked to user
    const sessionRecord = new Session({
      userId,
      biometrics,
      sessionDuration,
      createdAt: new Date()
    });

    await sessionRecord.save();

    res.json({ success: true, message: 'Session saved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
```

### Example 3: Auto Logout on Session Timeout

```javascript
// frontend/hooks/useSessionTimeout.js (NEW - optional)
import { useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { useNavigate } from 'react-router-dom';

export const useSessionTimeout = (timeoutMinutes = 15) => {
  const { logout } = useSession();
  const navigate = useNavigate();
  let timeoutId;

  useEffect(() => {
    const resetTimeout = () => {
      clearTimeout(timeoutId);

      timeoutId = setTimeout(() => {
        logout();
        navigate('/login', { 
          state: { message: 'Session expired due to inactivity' } 
        });
      }, timeoutMinutes * 60 * 1000);
    };

    // Reset on user activity
    document.addEventListener('mousedown', resetTimeout);
    document.addEventListener('keydown', resetTimeout);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', resetTimeout);
      document.removeEventListener('keydown', resetTimeout);
    };
  }, [logout, navigate, timeoutMinutes]);
};
```

---

## Database Schema for Monitoring

### Session Collection

```javascript
{
  _id: ObjectId,
  userId: ObjectId,              // Reference to User
  empId: String,                 // Employee ID for quick lookup
  startTime: Date,
  endTime: Date,
  totalDuration: Number,         // in milliseconds
  
  // Monitoring data
  biometrics: [{
    timestamp: Date,
    ear: Number,
    mar: Number,
    pitch: Number,
    yaw: Number,
    roll: Number,
    isYawning: Boolean,
    isSpeaking: Boolean,
    status: String               // "Focused", "Drowsy", etc.
  }],
  
  // Summary stats
  focusedTime: Number,
  drowsyTime: Number,
  distractedTime: Number,
  
  createdAt: Date,
  updatedAt: Date
}
```

---

## Environment & Configuration

### Current Setup

Your existing setup:
- ✅ Python Engine (Biometrics collection)
- ✅ ZeroMQ (Real-time data)
- ✅ React Frontend (UI)
- ✅ Express Backend (API)
- ✅ MongoDB (Database)

### New Auth Setup

Adds:
- ✅ User Authentication (Login/Register)
- ✅ JWT Token Management
- ✅ Session Persistence (Electron)
- ✅ Protected Routes
- ✅ Token Auto-Refresh

### Combined Setup

```
Python Engine (Biometrics)
    ↓
ZeroMQ → Electron
    ↓
React UI ← SessionContext (Auth)
    ↓
Express API (Protected with JWT)
    ↓
MongoDB (Users + Sessions + Biometrics)
```

---

## Session Lifecycle

### Session Starts
```
1. User logs in
2. Tokens stored
3. Dashboard loads
4. WorkSession component mounts
5. Python engine starts
6. Biometrics collection begins
7. User sees "Monitoring Active"
```

### Session Active
```
1. Biometrics streamed via ZeroMQ
2. React receives data via mainWindow.webContents.send()
3. SessionContext available for user info
4. API calls auto-authenticated
5. Every request includes Access Token
6. Token auto-refreshes if expired

Loop every 30fps:
- Get biometrics
- Update UI
- Save to DB (if configured)
```

### Session Ends
```
1. User clicks "End Session"
2. Biometrics stop
3. Session data saved to MongoDB
4. Python engine can shutdown
5. OR user can start new session
```

### App Closes
```
1. Electron cleanup triggered
2. Python process killed
3. Tokens persisted in electron-store
4. MongoDB connection closed
```

### App Reopens
```
1. Electron retrieves stored tokens
2. Check token validity
3. If valid: Skip login, restore session
4. If expired: Refresh tokens
5. If invalid: Show login screen
6. User can immediately access monitoring
```

---

## Key Points for Your Monitoring System

### 1. **Always Require Auth**

```javascript
// Before accessing monitoring features
import { useSession } from '../context/SessionContext';

function MonitoringComponent() {
  const { employee, accessToken } = useSession();

  if (!employee || !accessToken) {
    return <Navigate to="/login" />;
  }

  // Safe to use employee context
  return <div>User: {employee.empId}</div>;
}
```

### 2. **Include User ID in All Monitoring Data**

```javascript
// When saving session
const sessionData = {
  userId: employee.id,           // Always save reference
  empId: employee.empId,         // For quick queries
  biometrics: [...],
  timestamp: new Date()
};
```

### 3. **Use API Client for All Backend Calls**

```javascript
// Good ✅
import apiClient from '../api/apiClient';
await apiClient.post('/monitoring/save', data);
// Token auto-added, auto-refreshed

// Avoid ❌
fetch('http://localhost:5000/monitoring/save', {
  method: 'POST',
  body: JSON.stringify(data)
  // No auth token!
});
```

### 4. **Check Auth State Before Sensitive Operations**

```javascript
const handleLogout = async () => {
  try {
    // Optional: Notify server
    await apiClient.post('/auth/logout');
  } catch (err) {
    console.error(err);
  }

  // Clear all session
  logout();
  navigate('/login');
};
```

---

## Future Enhancements

### 1. Multi-Device Support

```javascript
// Track which device user is on
const sessionData = {
  userId: employee.id,
  device: {
    hostname: os.hostname(),
    type: getDeviceType(),      // "desktop", "laptop"
    os: process.platform()
  }
};
```

### 2. Admin Dashboard

```
Admin Views:
- All active sessions
- User monitoring history
- Productivity reports
- Compliance tracking
```

### 3. Real-time Alerts

```
When status changes:
Drowsy → Alert employee
Absent → Notify admin
Distracted → Log event
```

### 4. Data Export

```
User can export:
- Daily reports
- Weekly summaries
- PDF documents
(Authenticated requests only)
```

---

## Testing Workflow

### 1. Test Authentication First

```bash
# Start everything
mongod
cd server && npm run dev
cd .. && npm run dev

# Go to http://localhost:5173/register
# Create test account (EMP001 / test@company.com)
# Go to login, enter credentials
# Should redirect to dashboard
```

### 2. Test Session Persistence

```bash
# 1. Log in with credentials
# 2. Close Electron app completely
# 3. Reopen app
# 4. Should show dashboard without login!
# 5. This confirms sessions persist
```

### 3. Test Monitoring Integration

```bash
# 1. Log in
# 2. Navigate to Work Session
# 3. Start monitoring
# 4. Verify biometrics appear
# 5. Close and reopen app
# 6. User stays logged in
# 7. Can resume monitoring
```

### 4. Test Token Refresh

```bash
# 1. Wait for access token to expire (15 min)
# 2. Make any API request
# 3. Should auto-refresh silently
# 4. Request succeeds
# 5. No manual re-login needed
```

---

## Troubleshooting Monitoring + Auth

| Problem | Solution |
|---------|----------|
| Monitoring won't start after login | Check accessToken in SessionContext |
| Data not saving to DB | Verify API endpoint includes auth token |
| Session lost after app restart | Check electron-store is installed |
| Can't test token refresh | Wait 15 min or modify JWT_SECRET to expire faster |
| Multiple logins from same device | Implement device tracking & logout other devices |

---

## Summary

The authentication system is **completely independent** of your biometrics monitoring system but **integrates seamlessly**:

1. **Auth** handles user login/session
2. **Monitoring** handles biometric data collection
3. **Both** share user context via SessionContext
4. **Database** stores both user records and monitoring data
5. **Electron** keeps sessions persistent across restarts

Your existing monitoring logic needs **no changes**—it just gets wrapped in auth checks and user context.

---

**Next Steps:**
1. ✅ Auth system is complete
2. ⏳ Add `/monitoring/save-session` endpoint to backend
3. ⏳ Update WorkSession component to save monitoring data
4. ⏳ Create admin dashboard to view sessions

---

**Last Updated:** March 2026
