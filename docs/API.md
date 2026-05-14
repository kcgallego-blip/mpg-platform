# MPG Platform API Documentation

## Overview

The MPG Platform provides a RESTful API for managing tickets, authentication, and user data. The API is built with Next.js 15 using the App Router architecture and integrates with Supabase for data persistence and Webex for communication.

**Base URL:** `http://localhost:3000/api` (development)  
**Production URL:** `https://[your-domain]/api`  
**Format:** JSON  
**Authentication:** Cookie-based session (`webex_auth` cookie)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Tickets](#tickets)
3. [Data Models](#data-models)
4. [Error Handling](#error-handling)
5. [Environment Variables](#environment-variables)

---

## Authentication

The API uses cookie-based authentication via Webex OAuth. After successful login, a `webex_auth` cookie is set containing user session data.

### GET `/api/auth/me`

Get current authenticated user information.

**Response 200:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "token": "webex_access_token",
  "avatar_image": "https://webexapis.com/avatar.jpg"
}
```

**Response 401 (Not Authenticated):**
```json
{
  "error": "Not authenticated"
}
```

---

### GET `/api/auth/callback`

OAuth callback endpoint for Webex authentication flow.

**Query Parameters:**
- `code` (required): Authorization code from Webex
- `error` (optional): Error code if OAuth failed
- `state` (optional): State parameter for CSRF protection

**Success Flow:**
1. Exchanges authorization code for access token with Webex API
2. Fetches user profile from Webex
3. Upserts user into Supabase `users` table
4. Creates Supabase session
5. Sets `webex_auth` cookie (7-day expiry)
6. Redirects to `/dashboard`

**Error Redirects:**
- `/login?error=no_code` - Missing authorization code
- `/login?error=token_error` - Failed to exchange token
- `/login?error=user_info_error` - Failed to fetch user info
- `/login?error=no_email` - User has no email address
- `/login?error=db_error` - Database operation failed
- `/login?error=config_error` - Missing environment variables
- `/login?error=server_error` - Unexpected server error

**Cookie Set:**
```typescript
{
  name: 'webex_auth',
  value: JSON.stringify({
    email: string,
    name: string,
    token: string,
    avatar_image: string | null
  }),
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 604800 // 7 days in seconds
}
```

---

### GET `/api/auth/webex/callback`

Alternative Webex OAuth callback endpoint (identical functionality to `/api/auth/callback`). Maintained for backward compatibility or alternative routing.

*See `/api/auth/callback` for full documentation.*

---

### POST `/api/auth/logout`

Log out the current user by clearing the authentication cookie.

**Response 200:**
```json
{
  "success": true
}
```

**Headers:** `Set-Cookie: webex_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`

---

## Tickets

Ticket endpoints for managing support tickets and Webex integration.

---

### GET `/api/tickets/[id]`

Fetch a single ticket by its ID.

**URL Parameters:**
- `id` (required): Ticket ID (numeric)

**Response 200:**
```json
{
  "ticketid": 123,
  "category": "Hardware",
  "concern": "Printer not working",
  "date": "2025-05-13",
  "start_time": "09:00:00",
  "name": "John Doe",
  "end_time": "10:30:00",
  "troubleshooting": "Rebooted printer, replaced toner",
  "assisted_by": "IT Support",
  "status": "Resolved",
  "team_leader": "Jane Smith",
  "onsite": true,
  "affected_five9": false,
  "webex_message_id": "webex_msg_123",
  "created_at": "2025-05-13T01:00:00.000Z",
  "updated_at": "2025-05-13T02:00:00.000Z"
}
```

**Response 404:**
```json
{
  "error": "Ticket not found"
}
```

---

### PATCH `/api/tickets/[id]`

Update ticket fields: `end_time`, `troubleshooting`, or both.

**URL Parameters:**
- `id` (required): Ticket ID (numeric)

**Request Body:**
```json
{
  "end_time": "17:00:00",
  "troubleshooting": "Issue resolved by clearing cache"
}
```

*At least one field must be provided.*

**Response 200:**
```json
{
  "message": "Ticket updated successfully",
  "ticket": { /* updated ticket object */ }
}
```

**Response 400:**
```json
{
  "error": "No valid fields to update (end_time or troubleshooting)"
}
```

---

### GET `/api/tickets/by-webex`

Fetch a ticket by its associated Webex message ID.

**Query Parameters:**
- `webex_message_id` (required): Webex message ID to search for

**Response 200:**
```json
{
  "ticketid": 123,
  "webex_message_id": "webex_msg_123",
  ...
}
```

**Response 404:**
```json
{
  "error": "Ticket not found for given webex_message_id"
}
```

---

### PATCH `/api/tickets/set-webex`

Set the Webex message ID for a ticket (query parameter version).

**Query Parameters:**
- `ticketid` (required): Ticket ID (numeric)
- `webex_message_id` (required): Webex message ID to set

**Response 200:**
```json
{
  "message": "Webex message ID updated successfully",
  "ticket": { /* updated ticket object */ }
}
```

**Response 400:**
```json
{
  "error": "ticketid query parameter is required"
}
```

```json
{
  "error": "webex_message_id query parameter is required"
}
```

---

### PATCH `/api/tickets/[id]/set-webex`

Set the Webex message ID for a ticket (path parameter version).

**URL Parameters:**
- `id` (required): Ticket ID (numeric)

**Query Parameters:**
- `webex_message_id` (required): Webex message ID to set

**Response 200:**
```json
{
  "message": "Webex message ID updated successfully",
  "ticket": { /* updated ticket object */ }
}
```

---

### PATCH `/api/tickets/[id]/webex`

Update a ticket's Webex message ID (request body version).

**URL Parameters:**
- `id` (required): Ticket ID (numeric)

**Request Body:**
```json
{
  "webex_message_id": "webex_msg_123"
}
```

**Response 200:**
```json
{
  "message": "Webex message ID updated",
  "ticket": { /* updated ticket object */ }
}
```

---

### PUT `/api/tickets/[id]/pending`

Mark a ticket as Pending and optionally assign an IT assistant.

**URL Parameters:**
- `id` (required): Ticket ID (numeric)

**Query Parameters:**
- `it` (optional): IT assistant name/ID to assign

**Behavior:**
- Sets `status` to `"Pending"`
- Sets `assisted_by` to the provided IT assistant name (if provided)

**Response 200:**
```json
{
  "message": "Ticket status updated to Pending",
  "ticket": { /* updated ticket object */ }
}
```

---

## Data Models

### User (from `webex_auth` cookie)

```typescript
interface AuthUser {
  email: string;
  name: string;
  token: string;        // Webex access token
  avatar_image: string | null;
}
```

### Ticket

```typescript
interface Ticket {
  ticketid: number;           // Primary key
  category: string | null;
  concern: string | null;
  date: string | null;        // Date of ticket (DD-MM-YYYY format)
  start_time: string | null;  // Time ticket started (HH:mm:ss)
  name: string | null;        // Customer name
  end_time: string | null;    // Time ticket resolved (HH:mm:ss)
  troubleshooting: string | null;  // Resolution notes
  assisted_by: string | null;      // IT agent name/ID
  status: string | null;           // Ticket status (e.g., "Pending", "Resolved")
  team_leader: string | null;      // Team leader name
  onsite: boolean | null;          // Whether service was onsite
  affected_five9: boolean | null;  // Whether Five9 system was affected
  webex_message_id: string | null; // Webex message reference
  created_at: string;    // ISO timestamp
  updated_at: string;    // ISO timestamp
}
```

### Database Tables (Supabase)

#### `users`
- `id` (uuid, PK)
- `email` (text, unique)
- `company` (text, nullable)
- `name` (text, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

#### `tickets`
- `ticketid` (integer, PK)
- All fields from Ticket model above
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

#### `reports`
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `title` (text)
- `description` (text, nullable)
- `report_data` (jsonb)
- `report_type` (text, nullable)
- `export_format` (text)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

#### `analytics`
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `metric_name` (text)
- `metric_value` (numeric, nullable)
- `metric_date` (date)
- `created_at` (timestamptz)

---

## Error Handling

All API endpoints return consistent error responses in JSON format.

**Standard Error Format:**
```json
{
  "error": "Human-readable error message"
}
```

**HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (missing/invalid parameters)
- `401` - Unauthorized (not authenticated)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error (unexpected error)

**Common Error Messages:**
- `"Not authenticated"` - Missing or invalid auth cookie
- `"Ticket not found"` - Ticket ID doesn't exist
- `"Ticket ID is required"` - Missing URL parameter
- `"webex_message_id query parameter is required"` - Missing required query param
- `"webex_message_id is required in request body"` - Missing required field
- `"No valid fields to update"` - PATCH request with no valid update fields

---

## Environment Variables

The API relies on the following environment variables:

**Supabase:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Webex Integration:**
```env
NEXT_PUBLIC_WEBEX_CLIENT_ID=your-webex-client-id
WEBEX_CLIENT_SECRET=your-webex-client-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**OAuth Callback URL:**
```
https://webexapis.com/v1/access_token
https://webexapis.com/v1/people/me
```

---

## Integration Notes

### Webex OAuth Flow

1. User initiates login → redirected to Webex authorization page
2. Webex redirects back to `/api/auth/callback?code=...`
3. Backend exchanges code for access token
4. User profile fetched from Webex API
5. User upserted to Supabase `users` table
6. Session cookie set and user redirected to `/dashboard`

### Ticket-Webex Linking

Tickets can be linked to Webex messages via three equivalent endpoints:
- `PATCH /api/tickets/set-webex?ticketid=123&webex_message_id=abc`
- `PATCH /api/tickets/123/set-webex?webex_message_id=abc`
- `PATCH /api/tickets/123/webex` (with JSON body)

All three update the `webex_message_id` field on the ticket record.

---

## Version History

**v1.0.0** (May 2026)
- Initial API release
- Webex OAuth integration
- Complete ticket management endpoints
- Cookie-based session management
