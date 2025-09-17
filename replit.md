# MAX Messenger Mass Messaging System

## Overview

A web-based mass messaging platform for MAX messenger that allows users to manage multiple bot accounts, organize contacts, and send bulk messages with file attachments. The system provides a secure, rate-limited interface for managing messaging campaigns with features like phone verification, file uploads, and message history tracking.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### September 17, 2025 - SMS Verification Security Enhancement
- ✅ **Production-Ready SMS Integration**: Added Twilio SMS service with proper lazy loading and error handling
- ✅ **Security Vulnerabilities Fixed**: Removed all hardcoded API keys, implemented dynamic secure key generation  
- ✅ **Comprehensive Rate Limiting**: Added SMS flood protection (1/min, 5/hour per phone) and IP limits (10/hour)
- ✅ **Brute-Force Protection**: 5 failed verification attempts triggers 15-minute phone lockout
- ✅ **Phone Validation Enhanced**: Full support for Russian (+7) and Belarusian (+375) phone formats
- ✅ **API Security**: Fixed keyPreview display bug and session-based authentication
- 🔧 **Ready for Production**: Set NODE_ENV=production and configure TWILIO credentials for deployment

## System Architecture

### Frontend Architecture
- **Single Page Application**: Static HTML/CSS/JavaScript served from the public directory
- **Tab-based Interface**: Multi-section UI with accounts, contacts, messaging, and history management
- **Client-side State Management**: Global variables for managing application state and data caching
- **File Upload Interface**: Secure file upload with validation and preview capabilities

### Backend Architecture
- **Express.js REST API**: Node.js server with modular route structure
- **Route Organization**: Separate routers for accounts, contacts, and messages functionality
- **Middleware Stack**: CORS, JSON parsing, static file serving, and authentication layers
- **Session-based Authentication**: API key authentication with development fallback

### Data Storage
- **SQLite Database**: Local file-based database with foreign key constraints enabled
- **Three-table Schema**:
  - `accounts`: Stores MAX messenger bot tokens and account information
  - `contacts`: User contact lists linked to specific accounts
  - `messages`: Message history with file attachments and delivery status
- **Database Migrations**: Automatic schema updates for existing installations

### Security Features
- **API Key Authentication**: Required for all sensitive operations
- **Rate Limiting**: SMS verification and IP-based request throttling
- **Secure File Handling**: UUID-based file naming, type validation, and automatic cleanup
- **Input Validation**: Phone number format validation and file type restrictions

### Message Processing
- **Bulk Messaging System**: Scalable message sending with file attachment support
- **File Caching**: In-memory file preparation to avoid repeated disk reads
- **Error Handling**: Comprehensive error tracking and status reporting
- **MAX API Integration**: Direct integration with MAX messenger bot API

## External Dependencies

### Core Services
- **MAX Bot API** (`@maxhub/max-bot-api`): Primary messaging service integration
- **Twilio SMS Service**: Phone number verification for account security
- **SQLite3**: Embedded database for data persistence

### Development Libraries
- **Express.js**: Web framework and API server
- **Multer**: Secure multipart file upload handling
- **UUID**: Unique identifier generation for file security
- **CORS**: Cross-origin resource sharing configuration

### Optional Services
- **Twilio Configuration**: Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables
- **Production API Key**: ADMIN_API_KEY environment variable for production security
- **File Storage**: Local uploads directory with automatic cleanup policies