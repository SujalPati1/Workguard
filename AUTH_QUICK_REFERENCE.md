# WorkGuard Authentication - Quick Reference

## Quick Start

### 1. Install Dependencies
```bash
# Server
cd server
npm install

# Root (for electron-store)
npm install electron-store
```

### 2. Start Services
```bash
# Terminal 1: MongoDB (if not running)
mongod

# Terminal 2: Express Server
cd server && npm run dev

# Terminal 3: Electron + Frontend (from root)
npm run dev
```

### 3. Test Authentication
- **Register:** Navigate to `http://localhost:5173/register`
- **Login:** Navigate to `http://localhost:5173/login`
- **Dashboard:** Access protected routes after login

---

## Common Commands

### Server Commands
```bash
cd server
npm run dev          # Start with auto-reload
npm start            # Start server
npm test             # Run tests (if configured)
```

### Frontend Commands
```bash
npm run dev          # Start dev server + Electron
npm run build        # Build for production
npm run preview      # Preview production build
```

### Database Commands
```bash
# MongoDB Shell
mongo             # or 'mongosh' for newer versions

# Check database
use workguard
db.users.find()
db.users.deleteMany({})  # Clear all users (dev only!)

# Check specific user
db.users.findOne({ empId: "EMP101" })
```

---

## File Structure

### Important Files for Auth

```
server/
├── models/User.js                      # User schema
├── controllers/authController.js       # Auth logic
├── routes/authRoutes.js                # Auth endpoints
├── middleware/authMiddleware.js        # JWT verification
├── server.js                           # Main server
└── .env                                # Configuration

frontend/src/
├── api/authApi.js                      # Auth API calls
├── api/apiClient.js                    # Axios with interceptors
├── context/SessionContext.jsx          # Auth state management
├── components/ProtectedRoute.jsx       # Protected route wrapper
├── pages/Login.jsx                     # Login page
├── pages/Register.jsx                  # Registration page
└── hooks/useWorkGuardData.js          # Biometrics hook

electron/
├── main.js                             # Electron IPC handlers
├── preload.js                          # IPC exposer
└── (rest of Electron setup)
```

---

## Authentication States

### User Journey

```
Not Authenticated
        ↓
    Register or Login
        ↓
  Get Access + Refresh Token
        ↓
    Authenticated (Session Created)
        ↓
   (App Closed & Reopened)
        ↓
Session Restored (Token Refresh)
        ↓
   Stay Authenticated
        ↓
     Manual Logout
        ↓
  Clear All Tokens
        ↓
Not Authenticated (Back to Login)
```

---

## API Response Examples

### Success Response
```json
{
  "success": true,
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
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

### Error Response
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

## SessionContext Usage

### In Any Component
```javascript
import { useSession } from '../context/SessionContext';

function MyComponent() {
  const { employee, logout, isAuthenticated, accessToken } = useSession();

  if (!isAuthenticated) {
    return <p>Please login</p>;
  }

  return (
    <div>
      <p>Welcome {employee.fullName}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Available Properties
```javascript
{
  employee,            // User object | null
  accessToken,         // JWT token | null
  refreshToken,        // Refresh token | null
  isLoading,          // Boolean (for async ops)
  isAuthenticated,    // Boolean
  login(...),         // Function
  logout(...),        // Function
  refreshAccessToken  // Function
}
```

---

## Debugging Tips

### Check Server Status
```bash
curl http://localhost:5000/health
```

### Check if User Exists
```bash
# In MongoDB shell
db.users.find({ email: "test@company.com" })
```

### Check Token Validity
- Copy token from localStorage (`wg_accessToken`)
- Decode at [jwt.io](https://jwt.io)
- Check expiration: `exp` field in decoded token

### Enable Debug Logs
- **Frontend:** Open DevTools (F12), check Console & Network tabs
- **Electron:** Uncomment `mainWindow.webContents.openDevTools()` in main.js
- **Server:** Check terminal output, all log statements start with `[...]`

### Clear All Session Data
```javascript
// In browser console
localStorage.clear()
location.reload()
```

---

## Password Security

### Development (for testing)
```
Email: test@company.com
Password: test@123
Employee ID: EMP001
```

### Requirements
- Minimum 6 characters
- Sent to server, NEVER stored in plain text
- Hashed with bcryptjs (salt rounds: 10)

---

## Token Configuration

### Access Token
- **Expiration:** 15 minutes
- **Usage:** All API requests
- **Storage:** localStorage + SessionContext

### Refresh Token
- **Expiration:** 7 days
- **Usage:** Get new access token when expired
- **Storage:** localStorage + Electron store + MongoDB

---

## Environment Variables

### Required (.env)
```
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/workguard
JWT_SECRET=your_secret_key_here
NODE_ENV=development
```

### Not Required (Defaults)
```
NODE_ENV=development    # Default
PORT=5000              # Default
```

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "MongoDB connection failed" | Start MongoDB: `mongod` |
| "CORS error" | Check frontend URL in server.js CORS config |
| "Invalid token" | Token expired, try logging out and back in |
| "User already exists" | Use different empId/email or delete from DB |
| "Tokens not persisting" | Check localStorage in browser DevTools |
| "Session lost after app restart" | Check electron-store is installed |

---

## Production Checklist

- [ ] Change `JWT_SECRET` to strong random key
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS for all endpoints
- [ ] Add rate limiting to auth endpoints
- [ ] Add email verification for registration
- [ ] Configure MongoDB Atlas or similar cloud DB
- [ ] Add error logging service (Sentry, etc.)
- [ ] Enable CORS for production domain only
- [ ] Implement password reset feature
- [ ] Add 2FA for admin accounts
- [ ] Monitor failed login attempts
- [ ] Regular security audits

---

## Next Development Steps

1. **Add Email Verification**
   - Send email on registration
   - Verify email before allowing login

2. **Add Password Reset**
   - Forgot password endpoint
   - Reset token generation

3. **Add 2FA/MFA**
   - TOTP authenticator app integration
   - SMS OTP option

4. **Admin Panel**
   - User management
   - Role assignment
   - Activity logs

5. **OAuth Integration** (Future)
   - Google OAuth
   - GitHub OAuth
   - Microsoft Azure AD

---

## Useful Links

- [MongoDB Docs](https://docs.mongodb.com/)
- [Mongoose Docs](https://mongoosejs.com/)
- [JWT Docs](https://jwt.io/)
- [Bcryptjs Docs](https://github.com/dcodeIO/bcrypt.js)
- [Electron Docs](https://www.electronjs.org/docs)

---

**Version:** 1.0 | **Last Updated:** March 2026
