package com.iflytek.skillhub.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.iflytek.skillhub.TestRedisConfig;
import com.iflytek.skillhub.auth.token.ApiTokenService;
import com.iflytek.skillhub.domain.namespace.*;
import com.iflytek.skillhub.domain.skill.*;
import com.iflytek.skillhub.domain.suite.*;
import com.iflytek.skillhub.domain.user.UserAccount;
import jakarta.persistence.EntityManager;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Opt-in smoke against the built Node artifact; regular backend CI does not require Node. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
@ActiveProfiles("test")
@Import(TestRedisConfig.class)
@Testcontainers
@EnabledIfSystemProperty(named = "skillhub.cli.smoke", matches = "true")
class BusinessRoleCliSmokeTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    @DynamicPropertySource static void postgres(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.database-platform", () -> "org.hibernate.dialect.PostgreSQLDialect");
        registry.add("spring.flyway.enabled", () -> true);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }
    @LocalServerPort int port;
    @Autowired EntityManager em;
    @Autowired TransactionTemplate transactions;
    @Autowired ApiTokenService tokens;
    @Autowired ObjectMapper mapper;
    @TempDir Path home;

    @Test void builtCliSetsReadsAndClearsBothResourcesThroughRealTokenAuthenticatedHttp() throws Exception {
        transactions.executeWithoutResult(status -> {
            em.persist(new UserAccount("cli-role-owner", "Owner", null, null));
            Namespace ns = new Namespace("cli-roles", "CLI roles", "cli-role-owner");
            em.persist(ns);
            em.persist(new NamespaceMember(ns.getId(), "cli-role-owner", NamespaceRole.OWNER));
            em.persist(new Skill(ns.getId(), "demo", "cli-role-owner", SkillVisibility.PRIVATE));
            em.persist(new SkillSuite(ns.getId(), "demo", "Demo", "cli-role-owner"));
        });
        String token = tokens.createToken("cli-role-owner", "role-smoke", "[\"skill:read\",\"skill:publish\"]").rawToken();
        for (String type : List.of("skill", "suite")) {
            assertThat(cli(token, "set", type, "--role", "support", "--role", "sales", "--role", "sales"))
                    .containsExactly("sales", "support");
            assertThat(cli(token, "get", type)).containsExactly("sales", "support");
            assertThat(cli(token, "set", type, "--clear")).isEmpty();
            assertThat(cli(token, "get", type)).isEmpty();
        }
    }

    private List<String> cli(String token, String action, String type, String... options) throws Exception {
        Path artifact = Path.of(System.getProperty("skillhub.cli.artifact")).toAbsolutePath();
        List<String> command = new ArrayList<>(List.of("node", artifact.toString(), "business-roles", action,
                "@cli-roles/demo", "--type", type, "--json"));
        command.addAll(List.of(options));
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.environment().keySet().removeIf(key -> key.startsWith("SKILLHUB_"));
        builder.environment().put("HOME", home.toString());
        builder.environment().put("SKILLHUB_REGISTRY", "http://127.0.0.1:" + port);
        builder.environment().put("SKILLHUB_TOKEN", token);
        Process process = builder.start();
        boolean finished = process.waitFor(30, TimeUnit.SECONDS);
        if (!finished) process.destroyForcibly();
        assertThat(finished).isTrue();
        String stderr = new String(process.getErrorStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(process.exitValue()).describedAs(stderr).isZero();
        var output = mapper.readTree(process.getInputStream());
        assertThat(output.path("ok").asBoolean()).isTrue();
        List<String> roles = new ArrayList<>();
        output.path("businessRoles").forEach(role -> roles.add(role.asText()));
        return roles;
    }
}
