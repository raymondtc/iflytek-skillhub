package com.iflytek.skillhub.service;

import static org.assertj.core.api.Assertions.*;

import com.iflytek.skillhub.config.BusinessRoleProperties;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

class BusinessRoleCatalogTest {
    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(BusinessRoleProperties.class)
    @Import(BusinessRoleCatalog.class)
    static class Config {}

    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(Config.class)
            .withPropertyValues("skillhub.business-roles.options[0].key=ExampleTeam-engineering",
                    "skillhub.business-roles.options[0].name=Engineering",
                    "skillhub.business-roles.options[1].key=ExampleTeam-sales",
                    "skillhub.business-roles.options[1].name=Sales");

    @Test void bindsConfiguredNamesAndPreservesCaseSensitiveKeysAndOrder() {
        context.run(ctx -> {
            assertThat(ctx).hasNotFailed();
            var catalog = ctx.getBean(BusinessRoleCatalog.class);
            assertThat(catalog.options()).extracting(o -> o.key()).containsExactly("ExampleTeam-engineering", "ExampleTeam-sales");
            assertThat(catalog.options()).extracting(o -> o.name()).containsExactly("Engineering", "Sales");
            catalog.requireConfigured(List.of("ExampleTeam-sales", "ExampleTeam-engineering"));
            catalog.requireConfigured(List.of());
            for (String key : List.of("sales", "exampleteam-engineering", "ExampleTeam-unknown")) {
                assertThatThrownBy(() -> catalog.requireConfigured(List.of(key))).isInstanceOf(DomainBadRequestException.class);
            }
        });
    }

    @Test void rejectsDuplicateKeysAndMissingNamesAtStartup() {
        context.withPropertyValues("skillhub.business-roles.options[1].key=ExampleTeam-engineering")
                .run(ctx -> assertThat(ctx).hasFailed());
        context.withPropertyValues("skillhub.business-roles.options[0].name= ")
                .run(ctx -> assertThat(ctx).hasFailed());
        context.withPropertyValues("skillhub.business-roles.options[0].key=bad key")
                .run(ctx -> assertThat(ctx).hasFailed());
    }

    @Test void shipsWithoutBusinessDefaultsAndAllowsOnlyClearWhenUnconfigured() {
        var catalog = new BusinessRoleCatalog(new BusinessRoleProperties());
        assertThat(catalog.options()).isEmpty();
        catalog.requireConfigured(List.of());
        assertThatThrownBy(() -> catalog.requireConfigured(List.of("ExampleTeam-sales")))
                .isInstanceOf(DomainBadRequestException.class);
    }
}
