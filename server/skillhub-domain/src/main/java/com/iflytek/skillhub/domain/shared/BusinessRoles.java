package com.iflytek.skillhub.domain.shared;

import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import java.util.Collection;
import java.util.List;

/** Stable discovery metadata keys, independent of platform and namespace authorization. */
public final class BusinessRoles {
    private BusinessRoles() {}

    public static String key(String value) {
        if (value == null || value.length() > 64 || !value.matches("[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*")) {
            throw new DomainBadRequestException("business_role.invalid_key");
        }
        return value;
    }

    public static String filter(String value) {
        return value == null ? null : key(value);
    }

    public static List<String> normalize(Collection<String> values) {
        if (values == null) throw new DomainBadRequestException("business_role.required");
        List<String> keys = values.stream().map(BusinessRoles::key).distinct().sorted().toList();
        if (keys.size() > 32) throw new DomainBadRequestException("business_role.too_many");
        return keys;
    }
}
