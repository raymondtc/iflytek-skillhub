package com.iflytek.skillhub.integration;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.DriverManager;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class BusinessRoleMigrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @TempDir Path versioned;
    @TempDir Path futureUpstream;

    @Test void upgradesExistingResourcesAndStillAcceptsFutureUpstreamVersions() throws Exception {
        // Build an old installation from the unchanged upstream versioned migrations only.
        for (var resource : new PathMatchingResourcePatternResolver().getResources("classpath:db/migration/V*.sql")) {
            try (var input = resource.getInputStream()) {
                Files.copy(input, versioned.resolve(resource.getFilename()));
            }
        }
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("filesystem:" + versioned).target(MigrationVersion.fromVersion("75")).load().migrate();
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             var statement = connection.createStatement()) {
            statement.execute("INSERT INTO user_account(id, display_name) VALUES ('legacy-owner', 'Legacy Owner')");
            statement.execute("INSERT INTO namespace(slug, display_name, type, created_by) VALUES ('legacy', 'Legacy', 'TEAM', 'legacy-owner')");
            statement.execute("INSERT INTO skill(namespace_id, slug, display_name, owner_id, visibility, status, created_by) "
                    + "SELECT id, 'legacy', 'Legacy', 'legacy-owner', 'PUBLIC', 'ACTIVE', 'legacy-owner' FROM namespace WHERE slug='legacy'");
            statement.execute("INSERT INTO skill_suite(namespace_id, slug, display_name, status, created_by) "
                    + "SELECT id, 'legacy', 'Legacy', 'ACTIVE', 'legacy-owner' FROM namespace WHERE slug='legacy'");
        }
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()).load().migrate();
        // A later upstream V76 must still migrate with default outOfOrder=false.
        Files.writeString(futureUpstream.resolve("V76__upstream_compatibility_probe.sql"),
                "CREATE TABLE upstream_compatibility_probe (id BIGINT PRIMARY KEY)");
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration", "filesystem:" + futureUpstream).load().migrate();
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             var statement = connection.createStatement()) {
            // Running the additive SQL again is harmless; future definitions must remain additive/idempotent.
            try (var input = getClass().getResourceAsStream("/db/migration/R__company_business_roles.sql")) {
                statement.execute(new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            }
            statement.execute("INSERT INTO upstream_compatibility_probe VALUES (1)");
            for (String table : new String[]{"skill", "skill_suite"}) {
                try (var rows = statement.executeQuery("SELECT COUNT(*) FROM " + table + " WHERE slug='legacy' AND latest_version_id IS NULL")) {
                    rows.next(); assertThat(rows.getInt(1)).isEqualTo(1);
                }
            }
            for (String table : new String[]{"company_skill_business_role", "company_skill_suite_business_role"}) {
                try (var rows = statement.executeQuery("SELECT COUNT(*) FROM " + table)) {
                    rows.next(); assertThat(rows.getInt(1)).isZero();
                }
            }
        }
    }
}
