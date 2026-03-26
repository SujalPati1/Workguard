# WorkGuard Authentication System - Setup Guide

## Overview

This guide covers the complete authentication system implementation for WorkGuard. The system includes:

- **Traditional Authentication** (Email/Password with JWT)
- **MongoDB Database** for user storage
- **Token Refresh Mechanism** for persistent sessions
- **Electron Integration** for desktop session persistence
- **React Frontend** with protected routes
- **Express Backend** with secure endpoints

## Installation & Setup

### 1. Server Setup

#### Install Dependencies

```bash
cd server
npm install
```

This installs:
- `express` - Web framework
- `mongoose` - MongoDB ODM
- `jsonwebtoken` - JWT token generation
- `bcryptjs` - Password hashing
- `cors` - Cross-origin requests
- `dotenv` - Environment variables

#### Configure Environment

Update `.env` file:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/workguard
JWT_SECRET=your_super_secret_key_change_this_in_production
NODE_ENV=development
```

**Important:** Change `JWT_SECRET` to a strong random string for production.

#### Start MongoDB

Ensure MongoDB is running:

```bash
# Windows
mongod

# Mac/Linux
brew services start mongodb-community
```

#### Run Server

```bash
npm run dev
```

Server will start on `http://localhost:5000`

---

### 2. Frontend Setup

Frontend dependencies are already configured. No additional setup needed.

The frontend includes:
- Session Context with token management
- Protected routes
- Auto token refresh on API calls
- Persistent session across app restarts

---

### 3. Electron Setup

#### Update Dependencies in Root `package.json`

Add `electron-store` to your Electron dependencies:

```bash
npm install electron-store
```

This package handles persistent storage of auth tokens at the Electron level.

#### Run Electron App

```bash
npm run dev            # Starts Vite + Electron concurrently
# OR individually:
npm run electron       # Electron only (requires Vite running)
```

---

## Architecture & Flow

### Authentication Flow

```
User Registration/Login
    ↓
Frontend sends credentials to `/auth/register` or `/auth/login`
    ↓
Backend validates & generates JWT tokens (access + refresh)
    ↓
Frontend stores tokens in localStorage + SessionContext
    ↓
Electron stores tokens in electron-store for persistence
    ↓
User logged in state maintained across app restarts
```

### Token Management

**Access Token:**
- Expires in 15 minutes
- Used for API requests
- Sent in Authorization header

**Refresh Token:**
- Expires in 7 days
- Stored in database & Electron store
- Used to get new access token when expired

### API Request Flow

```
Request made to API
    ↓
apiClient interceptor adds access token to header
    ↓
Request sent ✓ / Token expired ✗
    ↓
If expired: Auto-refresh token silently
    ↓
Retry request with new token / Redirect to login if refresh fails
```

---

## Database Schema

### User Collection

```javascript
{
  _id: ObjectId,
  empId: String (unique),
  email: String (unique, lowercase),
  password: String (hashed),
  fullName: String,
  department: String,
  role: String ("employee" | "admin"),
  refreshToken: String || null,
  isActive: Boolean,
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

---

## API Endpoints

### Public Endpoints

#### Register
```
POST /auth/register
Content-Type: application/json

{
  "empId": "EMP101",
  "email": "user@company.com",
  "password": "securePass123",
  "fullName": "John Doe",
  "department": "Engineering"
}

Response:
{
  "success": true,
  "message": "User registered successfully",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "employee": {
    "id": "507f191e810c19729de860ea",
    "empId": "EMP101",
    "email": "user@company.com",
    "fullName": "John Doe",
    "department": "Engineering",
    "role": "employee"
  }
}
```

#### Login
```
POST /auth/login
Content-Type: application/json

{
  "empId": "EMP101",
  "email": "user@company.com",
  "password": "securePass123"
}

Response: (same as register)
```

#### Refresh Token
```
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}

Response:
{
  "success": true,
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### Protected Endpoints (Require Authorization Header)

```
Authorization: Bearer <accessToken>
```

#### Logout
```
POST /auth/logout
```

#### Get Current User
```
GET /auth/me
```

---

## Frontend Routes

### Public Routes
- `/login` - Login page
- `/register` - Registration page

### Protected Routes (Require Login)
- `/dashboard` - Main dashboard
- `/work-session` - Work session page
- `/work-report` - Work report page
- `/attendance-summary` - Attendance summary
- `/consent-setup` - Consent setup page

Protected routes automatically redirect to login if user is not authenticated.

---

## SessionContext API

```javascript
const { 
  employee,                    // Current user object
  accessToken,                 // Current JWT access token
  refreshToken,                // Refresh token for token renewal
  isLoading,                   // Loading state for async operations
  isAuthenticated,             // Boolean: is user logged in?
  login,                       // fn(empData, accessToken, refreshToken)
  logout,                      // fn() clears all session data
  refreshAccessToken           // fn() refreshes expired access token
} = useSession();
```

### Example Usage

```javascript
import { useSession } from '../context/SessionContext';

function MyComponent() {
  const { employee, logout, isAuthenticated } = useSession();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return (
    <div>
      <p>Welcome, {employee.fullName}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

---

## Electron Session Persistence

### Stored at: 
`~/.config/WorkGuard/auth-store.json` (or equivalent per OS)

### IPC Handlers

**Store tokens:**
```javascript
const result = await window.ipcRenderer.invoke('auth:store-tokens', {
  accessToken: '...',
  refreshToken: '...',
  employee: {...}
});
```

**Retrieve tokens:**
```javascript
const { accessToken, refreshToken, employee } = 
  await window.ipcRenderer.invoke('auth:get-stored-tokens');
```

**Clear tokens (logout):**
```javascript
await window.ipcRenderer.invoke('auth:clear-tokens');
```

---

## Security Considerations

### ✅ Implemented
- Password hashing with bcryptjs (10 salt rounds)
- JWT token expiration (15min access, 7day refresh)
- CORS protection
- HttpOnly cookies for refresh tokens (optional)
- Secure token refresh mechanism
- Automatic logout on token expiration

### 🔒 Additional Recommendations
- Enable HTTPS in production
- Use environment variables for secrets
- Implement rate limiting on auth endpoints
- Add email verification for registration
- Implement 2FA for sensitive operations
- Use stronger JWT_SECRET (~32 characters)
- Monitor failed login attempts

---

## Troubleshooting

### Issue: Token refresh fails, stuck on login
**Solution:** Check that refresh token endpoint is accessible and MongoDB is running.

### Issue: CORS errors
**Solution:** Ensure CORS origins in `server.js` include your frontend URL (default: `http://localhost:5173`)

### Issue: MongoDB connection failed
**Solution:** 
1. Verify MongoDB service is running
2. Check MONGO_URI in `.env` is correct
3. Ensure port 27017 is not blocked

### Issue: Tokens not persisting in Electron
**Solution:**
1. Ensure `electron-store` is installed
2. Check that IPC handlers in `electron/main.js` are defined
3. Verify preload.js exposes ipcRenderer if using contextIsolation

### Issue: Can't login with new user
**Solution:**
1. Register a new account first via `/register`
2. Then use those credentials to login
3. Check MongoDB has the user collection via `db.users.find()`

---

## Testing the System

### Test Registration

```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "empId": "EMP001",
    "email": "test@company.com",
    "password": "test@123",
    "fullName": "Test User",
    "department": "QA"
  }'
```

### Test Login

```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "empId": "EMP001",
    "password": "test@123"
  }'
```

### Test Protected Route

```bash
curl -X GET http://localhost:5000/auth/me \
  -H "Authorization: Bearer <your_access_token>"
```

---

## Next Steps

1. ✅ Install all dependencies: `npm install` in server folder
2. ✅ Configure `.env` with proper MongoDB URI
3. ✅ Start MongoDB service
4. ✅ Run server: `npm run dev`
5. ✅ Run frontend & Electron: `npm run dev` (from root)
6. ✅ Test registration at `/register`
7. ✅ Test login at `/login`
8. ✅ Verify session persists across app close/reopen

---

## Files Modified/Created

### Backend
- `server/models/User.js` - NEW: User schema with password hashing
- `server/controllers/authController.js` - NEW: Auth logic (register, login, refresh, logout)
- `server/routes/authRoutes.js` - NEW: Auth endpoints
- `server/middleware/authMiddleware.js` - EXISTING: JWT verification
- `server/server.js` - UPDATED: Added auth routes, improved CORS
- `server/.env` - UPDATED: Updated MongoDB URI
- `server/package.json` - UPDATED: Added bcryptjs

### Frontend
- `frontend/src/api/authApi.js` - UPDATED: Real auth API calls
- `frontend/src/api/apiClient.js` - UPDATED: Added token interceptor & refresh logic
- `frontend/src/context/SessionContext.jsx` - UPDATED: Token management & persistence
- `frontend/src/pages/Login.jsx` - UPDATED: Real authentication
- `frontend/src/pages/Register.jsx` - NEW: User registration
- `frontend/src/components/ProtectedRoute.jsx` - NEW: Protected route wrapper

### Electron
- `electron/main.js` - UPDATED: IPC handlers for session persistence with electron-store

---

## Support

For issues or questions, check the logs:
- **Server logs:** Terminal where you ran `npm run dev`
- **Electron logs:** DevTools (press Ctrl+Shift+I or Cmd+Option+I)
- **MongoDB logs:** MongoDB terminal/service logs

---

**Last Updated:** March 2026
**Version:** 1.0
