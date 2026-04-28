# Error Envelope Rollout Status

This file tracks the current migration state of backend modules for the standardized error envelope.
It is a living checklist tied to the actual controller/service modules in `backend/src/`.

## Purpose

- Show which modules still use legacy Nest exception classes directly.
- Show which modules have started using the preferred custom exceptions.
- Point teams to the controller/service files that should be audited next.

## Preferred exception classes

All custom API exceptions are defined in:

- `backend/src/common/exceptions/api-exception.ts`

Preferred classes:

- `ApiException`
- `ResourceNotFoundException`
- `ValidationException`
- `AuthenticationException`
- `AuthorizationException`
- `ConflictException`
- `ResourceGoneException`
- `RateLimitException`
- `ExternalServiceException`
- `DatabaseException`
- `FileUploadException`

Use these instead of Nest built-ins such as:

- `BadRequestException`
- `NotFoundException`
- `UnauthorizedException`
- `ForbiddenException`
- `ConflictException` (Nest)
- `HttpException`

## Status Matrix

| Module | Representative files | Status | Notes |
|---|---|---|---|
| activities | `src/activities/activities.controller.ts`, `src/activities/activities.service.ts` | Unmigrated | uses Nest `NotFoundException` in service layer |
| admin | `src/admin/...` | Unmigrated | uses Nest `BadRequestException`, `ForbiddenException`, `NotFoundException`, `UnauthorizedException` |
| artist-status | `src/artist-status/...` | Unmigrated | uses Nest `BadRequestException`, `NotFoundException` |
| artiste-payout | `src/artiste-payout/payouts.controller.ts`, `src/artiste-payout/payouts.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ConflictException`, `ForbiddenException`, `NotFoundException` |
| artists | `src/artists/artists.controller.ts`, `src/artists/artists.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ForbiddenException`, `NotFoundException`, `UnauthorizedException` |
| assets | `src/assets/assets.controller.ts` | Unmigrated | uses Nest `NotFoundException` |
| auth | `src/auth/auth.controller.ts`, `src/auth/auth.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `UnauthorizedException` |
| blocks | `src/blocks/blocks.controller.ts`, `src/blocks/blocks.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ConflictException`, `NotFoundException` |
| collaboration | `src/collaboration/...` | Unmigrated | still throws Nest `BadRequestException`, `ForbiddenException`, `NotFoundException` |
| comments | `src/comments/comments.controller.ts`, `src/comments/comments.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ForbiddenException`, `NotFoundException` |
| common | `src/common/filters/global-exception.filter.ts` | Migrated | global filter is in place and wraps exceptions into the envelope |
| embed | `src/embed/embed.service.ts` | Unmigrated | still throws Nest `ForbiddenException`, `NotFoundException` |
| events | `src/events/events.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ForbiddenException`, `NotFoundException` |
| events-live-show | `src/events-live-show/events.controller.ts`, `src/events-live-show/events.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ConflictException`, `ForbiddenException`, `NotFoundException` |
| follows | `src/follows/follows.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ConflictException`, `NotFoundException` |
| genres | `src/genres/genres.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ConflictException`, `NotFoundException` |
| goals | `src/goals/goals.service.ts` | Unmigrated | still throws Nest `ForbiddenException`, `NotFoundException` |
| moderation | `src/moderation/moderation.controller.ts` | Unmigrated | still throws Nest `BadRequestException` |
| notifications | `src/notifications/notifications.controller.ts` | Unmigrated | still throws Nest `NotFoundException` |
| platinum-fee | `src/platinum-fee/fees.controller.ts`, `src/platinum-fee/fees.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `NotFoundException` |
| playlists | `src/playlists/playlists.controller.ts`, `src/playlists/playlists.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ForbiddenException`, `NotFoundException` |
| reports | `src/reports/reports.controller.ts`, `src/reports/reports.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `NotFoundException` |
| scheduled-releases | `src/scheduled-releases/presaves.service.ts`, `src/scheduled-releases/scheduled-releases.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `NotFoundException` |
| social-sharing | `src/social-sharing/referral.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ConflictException`, `NotFoundException` |
| standardized-subscription | `src/standardized-subscription/subscriptions.service.ts` | Unmigrated | still throws Nest `ConflictException`, `ForbiddenException`, `NotFoundException`, `UnauthorizedException` |
| storage | `src/storage/storage.controller.ts`, `src/storage/storage.service.ts` | Unmigrated | still throws Nest `BadRequestException` |
| subscription-tiers | `src/subscription-tiers/subscriptions.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ConflictException`, `ForbiddenException`, `NotFoundException` |
| subscriptions | `src/subscriptions/subscriptions.service.ts` | Unmigrated | still throws Nest `ConflictException`, `ForbiddenException`, `NotFoundException` |
| tips | `src/tips/tips.controller.ts`, `src/tips/tips.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ConflictException`, `NotFoundException` |
| track-listening-right-management | `src/track-listening-right-management/licensing.controller.ts`, `src/track-listening-right-management/licensing.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ForbiddenException`, `NotFoundException` |
| track-play-count | `src/track-play-count/play-count.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `NotFoundException` |
| tracks | `src/tracks/tracks.controller.ts`, `src/tracks/tracks.service.ts` | Partial | `tracks.service.ts` uses `ResourceNotFoundException`; other Nest exceptions remain in service/controller code |
| users | `src/users/users.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ConflictException`, `ForbiddenException`, `NotFoundException`, `UnauthorizedException` |
| verification | `src/verification/verification.controller.ts`, `src/verification/verification.service.ts` | Unmigrated | still throws Nest `BadRequestException`, `ConflictException`, `NotFoundException` |
| version | `src/version/version.controller.ts` | Unmigrated | no custom exceptions used yet |
| waveform | `src/waveform/**/*.ts` | Unmigrated | still throws Nest `NotFoundException` |

## How to use this checklist

1. Update the module status when you migrate a controller or service to custom exceptions.
2. Prefer the shared exceptions defined in `backend/src/common/exceptions/api-exception.ts`.
3. Keep the global exception filter in `backend/src/common/filters/global-exception.filter.ts` as the single envelope formatter.
4. For partial migrations, note the service/controller file that still emits legacy Nest exceptions.

## Sample audit notes

- `tracks` is currently the only module with a custom exception import from `backend/src/common/exceptions/api-exception.ts`.
- `auth`, `artists`, `reports`, and `users` remain legacy-critical because they still directly throw Nest exception classes.

> Important: this matrix reflects the current source tree and should be updated whenever a migration is completed for a module.
