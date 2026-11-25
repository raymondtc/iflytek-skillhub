package com.iflytek.skillhub.service;

import com.iflytek.skillhub.config.BusinessRoleProperties;
import com.iflytek.skillhub.domain.shared.BusinessRoles;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.dto.BusinessRoleOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;

/** One configuration source for UI labels and write validation. No role-management API. */
@Service
public class BusinessRoleCatalog {
    private final List<BusinessRoleOption> options;
    private final Set<String> keys;

    public BusinessRoleCatalog(BusinessRoleProperties properties) {
        var configured = properties.getOptions();
        if (configured == null) {
            throw new IllegalArgumentException("skillhub.business-roles.options must be a list");
        }
        var result = new ArrayList<BusinessRoleOption>();
        var unique = new HashSet<String>();
        for (var option : configured) {
            if (option == null || option.name() == null || option.name().isBlank()
                    || option.name().length() > 100 || option.name().chars().anyMatch(Character::isISOControl)) {
                throw new IllegalArgumentException("skillhub.business-roles.options requires a display name of 1–100 characters");
            }
            try {
                BusinessRoles.key(option.key());
            } catch (DomainBadRequestException invalid) {
                throw new IllegalArgumentException("skillhub.business-roles.options contains an invalid key", invalid);
            }
            if (!unique.add(option.key())) {
                throw new IllegalArgumentException("skillhub.business-roles.options contains a duplicate key");
            }
            result.add(new BusinessRoleOption(option.key(), option.name().trim()));
        }
        options = List.copyOf(result);
        keys = Set.copyOf(unique);
    }

    public List<BusinessRoleOption> options() { return options; }

    public void requireConfigured(List<String> roles) {
        if (!keys.containsAll(roles)) throw new DomainBadRequestException("business_role.not_configured");
    }
}
