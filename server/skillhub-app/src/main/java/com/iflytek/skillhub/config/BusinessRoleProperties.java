package com.iflytek.skillhub.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Configured discovery choices, independent of authorization roles. */
@Component
@ConfigurationProperties(prefix = "skillhub.business-roles")
public class BusinessRoleProperties {
    private List<Option> options = List.of();

    public List<Option> getOptions() { return options; }
    public void setOptions(List<Option> options) { this.options = options; }

    public record Option(String key, String name) {}
}
