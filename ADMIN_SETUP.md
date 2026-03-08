# DiaryFi Admin Authentication Setup

## Overview
This guide explains how to set up admin authentication for the DiaryFi admin dashboard.

## Backend Setup

### 1. Environment Variables
Add these variables to your `.env` file:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
PORT=5000
NODE_ENV=development
```

### 2. Seed Initial Admin User

Run this command to create the default admin user:

```bash
npm run seed:admin
```

This creates an admin with:
- **Email**: `admin@diaryfi.com`
- **Password**: `Admin@123`
- **Role**: `super_admin`

**⚠️ IMPORTANT**: Change the default password immediately in production!

### 3. API Endpoints

#### Login
- **Endpoint**: `POST /api/admin/login`
- **Body**:
  ```json
  {
    "email": "admin@diaryfi.com",
    "password": "Admin@123"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Login successful",
    "token": "jwt_token_here",
    "admin": {
      "id": "admin_id",
      "email": "admin@diaryfi.com",
      "name": "Admin User",
      "role": "super_admin"
    }
  }
  ```

#### Get Current Admin
- **Endpoint**: `GET /api/admin/me`
- **Headers**: `Authorization: Bearer {token}`
- **Response**:
  ```json
  {
    "success": true,
    "admin": {
      "id": "admin_id",
      "email": "admin@diaryfi.com",
      "name": "Admin User",
      "role": "super_admin",
      "isActive": true
    }
  }
  ```

## Frontend Setup (React)

### 1. Token Storage
The login endpoint returns a JWT token that is stored in `localStorage`:
- `adminToken` - JWT token for API requests
- `adminName` - Admin's name
- `adminEmail` - Admin's email

### 2. API Base URL
Update your API base URL in `LoginPage.jsx`:

```javascript
const API_BASE_URL = 'http://localhost:5000'; // Update for production
```

### 3. Authenticated Requests
Include the token in request headers:

```javascript
const token = localStorage.getItem('adminToken');
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};
```

## Security Recommendations

1. **Change Default Password**: After seeding the admin, immediately change the default password in production
2. **Use HTTPS**: Always use HTTPS in production
3. **Secure JWT Secret**: Use a strong, random JWT secret
4. **Token Expiration**: Tokens expire in 7 days (configurable in `generateToken` function)
5. **Account Lockout**: Admin accounts lock after 5 failed login attempts for 30 minutes
6. **Environment Variables**: Never commit `.env` files with real secrets

## Database Schema

### Admin Model
```javascript
{
  email: String (unique, required),
  password: String (hashed, required),
  name: String (required),
  role: String (enum: ['admin', 'super_admin'], default: 'admin'),
  isActive: Boolean (default: true),
  lastLogin: Date,
  loginAttempts: Number (default: 0, hidden),
  lockUntil: Date (hidden),
  createdAt: Date,
  updatedAt: Date
}
```

## Troubleshooting

### Admin Not Created
- Check MongoDB connection
- Verify `MONGODB_URI` environment variable
- Check for duplicate email in database

### Login Fails
- Verify email and password are correct
- Check if admin account is active (`isActive: true`)
- Check if account is locked (wait 30 minutes after 5 failed attempts)

### Token Invalid
- Token may have expired (7 days)
- JWT_SECRET mismatch between frontend and backend
- Token format incorrect in Authorization header

## Next Steps

1. Implement password change endpoint
2. Implement admin user management (create, update, delete)
3. Add role-based access control (RBAC)
4. Implement admin activity logging
5. Add two-factor authentication (2FA)
