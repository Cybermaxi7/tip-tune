# TipTune Backend

A professional NestJS backend service for audio file upload, storage, and streaming.

## Features

- **Audio File Upload**: Support for MP3, WAV, FLAC formats
- **File Validation**: Type and size validation (max 50MB)
- **Secure Storage**: Local storage with unique filename generation
- **Audio Streaming**: Range request support for audio seeking
- **Track Management**: CRUD operations for track metadata
- **Search & Filter**: Search by title, artist, album; filter by genre
- **Waveform Generation**: Background processing with BullMQ, retry logic, and DLQ support
- **API Documentation**: Auto-generated Swagger documentation
- **Database Integration**: PostgreSQL with TypeORM
- **Comprehensive Testing**: Integration tests for all endpoints

## Tech Stack
/**
 * Compression Measurement Script
 * 
 * This script measures the effectiveness of HTTP response compression
 * on key API endpoints by comparing response sizes with different
 * compression algorithms (brotli, gzip, none).
 * 
 * Usage: node scripts/measure-compression.js
 * 
 * Requirements: Server must be running on the configured port
 */
- **Framework**: NestJS
- **Database**: PostgreSQL with TypeORM
- **File Upload**: Multer
- **Validation**: class-validator
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest with Supertest

## Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database and storage configuration
```

3. Set up the database:
```bash
# Create database
createdb tiptune

# The application will auto-create tables on first run (in development)

# Run search migration (full-text + fuzzy search)
npm run migration:run
```

4. Run the application:
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

### API Documentation

Once running, visit `http://localhost:3001/api/docs` for interactive API documentation.
API routes are versioned under `/api/v1/*` (except health probes and `/api/version`).

## API Endpoints

### File Storage

- `POST /api/v1/files/upload` - Upload audio file
- `GET /api/v1/files/:filename` - Download file
- `GET /api/v1/files/:filename/stream` - Stream audio file
- `GET /api/v1/files/:filename/info` - Get file information
- `DELETE /api/v1/files/:filename` - Delete file

### Search

- `GET /api/v1/search?q=...&type=artist|track&genre=...&sort=...&page=...&limit=...` - Full-text search (artists/tracks, filters, sort, pagination)
- `GET /api/v1/search/suggestions?q=partial` - Autocomplete suggestions

See `src/search/README.md` for details.

### Notifications

- `GET /api/v1/notifications` - Get user notifications (paginated)
- `GET /api/v1/notifications/unread-count` - Get unread notification count
- `PATCH /api/v1/notifications/:id/read` - Mark notification as read
- `PATCH /api/v1/notifications/read-all` - Mark all notifications as read

See `docs/notification-websocket-guide.md` for complete WebSocket notification delivery guide.

### Tracks

- `POST /api/v1/tracks` - Create track with file upload
- `GET /api/v1/tracks` - Get all tracks
- `GET /api/v1/tracks/public` - Get public tracks only
- `GET /api/v1/tracks/search?q=query` - Search tracks
- `GET /api/v1/tracks/artist/:artist` - Get tracks by artist
- `GET /api/v1/tracks/genre/:genre` - Get tracks by genre
- `GET /api/v1/tracks/:id` - Get track by ID
- `PATCH /api/v1/tracks/:id` - Update track
- `PATCH /api/v1/tracks/:id/play` - Increment play count
- `DELETE /api/v1/tracks/:id` - Delete track

### Waveform

- `GET /api/v1/tracks/:trackId/waveform` - Get waveform data for a track
- `POST /api/v1/tracks/:trackId/waveform/regenerate` - Trigger waveform regeneration
- `GET /api/v1/tracks/:trackId/waveform/status` - Get waveform generation status

## File Upload

### Supported Formats
- MP3 (audio/mpeg)
- WAV (audio/wav)
- FLAC (audio/flac, audio/x-flac)

### Maximum File Size
- 50MB (configurable via MAX_FILE_SIZE env var)

### Upload Example

```bash
curl -X POST http://localhost:3001/api/tracks \
  -F "file=@track.mp3" \
  -F "title=My Track" \
  -F "artist=John Doe" \
  -F "genre=rock" \
  -F "isPublic=true"
```

## Testing

```bash
# Run unit tests
npm test

# Run e2e tests
npm run test:e2e

# Run with coverage
npm run test:cov
```

## Environment Variables

TipTune uses environment variables for configuration. 

For a complete list of variables, descriptions, and defaults, see the [Canonical Environment Variable Reference](../docs/environment-reference.md).

## Project Structure

```
src/
├── app.module.ts          # Root module
├── main.ts                # Application entry point
├── waveform/              # Waveform generation module
│   ├── waveform.controller.ts
│   ├── waveform.service.ts
│   ├── waveform-generator.service.ts
│   ├── waveform.processor.ts
│   ├── waveform.module.ts
│   ├── entities/
│   │   └── track-waveform.entity.ts
│   └── dto/
│       └── waveform.dto.ts
├── storage/               # File storage module
│   ├── storage.controller.ts
│   ├── storage.service.ts
│   ├── storage.module.ts
│   └── dto/
│       └── upload-file.dto.ts
├── tracks/                # Track management module
│   ├── tracks.controller.ts
│   ├── tracks.service.ts
│   ├── tracks.module.ts
│   ├── entities/
│   │   └── track.entity.ts
│   └── dto/
│       └── create-track.dto.ts
└── ...
```

## Development

### Adding New Features

1. Create new module: `nest generate module feature`
2. Add controller: `nest generate controller feature`
3. Add service: `nest generate service feature`
4. Add entities and DTOs as needed

### Database Migrations

```bash
# Run migrations (e.g. search indexes)
npm run migration:run

# Revert last migration
npm run migration:revert
```

The **search** feature requires the migration `AddSearchIndexes` (pg_trgm, tsvector columns, GIN indexes). See `src/search/README.md`.

## License

This project is proprietary and confidential.
