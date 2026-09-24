-- Runs once, when the local Docker volume is created. Production gets its schema from migrations.
-- Tests wipe this database, so it's kept apart from the development database.
CREATE DATABASE app_test;
