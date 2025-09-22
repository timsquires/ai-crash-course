# Changelog

## 2025-09-22

### Fix dynamic import to handle Windows paths
Includes `timsquires` fix for Windows paths
https://github.com/timsquires/ai-crash-course/pull/1

### Fixed: NestJS Dependency Injection for Thread Repositories
- Resolved runtime errors where NestJS could not resolve dependencies for `PgThreadRepository` and `ThreadEntityRepository`.
- Updated `apps/api/src/persistence/models.module.ts` to always import and export both `TypeOrmModule.forFeature([ThreadEntity])` and `MongooseModule.forFeature([{ name: ThreadModel.name, schema: ThreadSchema }])`, ensuring both repositories are available for dependency injection regardless of environment.
- Updated `apps/api/src/app.module.ts` to include both `TypeOrmModule.forRootAsync` (using `POSTGRES_URL` from environment) and `MongooseModule.forRoot` (using `MONGO_URL` from environment), so the required database providers are always available for feature modules.
- These changes allow the runtime provider switch in `RepositoryModule` to work correctly and prevent missing dependency errors when starting the app.
