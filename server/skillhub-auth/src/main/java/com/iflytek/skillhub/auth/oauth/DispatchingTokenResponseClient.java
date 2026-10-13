package com.iflytek.skillhub.auth.oauth;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.core.endpoint.OAuth2AccessTokenResponse;
import org.springframework.stereotype.Component;
import org.springframework.security.oauth2.core.oidc.OidcScopes;

/**
 * Routes the authorization-code token exchange to a {@link ProviderTokenResponseClient} when one
 * claims the registration, and to the standard Spring client otherwise.
 *
 * <p>Spring's {@code tokenEndpoint} accepts a single client, so per-provider exchange needs one
 * dispatcher rather than a branch inside the security configuration.
 */
@Component
public class DispatchingTokenResponseClient
        implements OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> {

    private final Map<String, ProviderTokenResponseClient> overrides;
    private final OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> delegate;

    @Autowired
    public DispatchingTokenResponseClient(List<ProviderTokenResponseClient> providerClients) {
        this(providerClients, OAuth2TokenResponseClients.standard());
    }

    DispatchingTokenResponseClient(
            List<ProviderTokenResponseClient> providerClients,
            OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> delegate
    ) {
        this.overrides = providerClients.stream()
                .collect(Collectors.toMap(ProviderTokenResponseClient::getProvider, Function.identity()));
        this.delegate = delegate;
    }

    @Override
    public OAuth2AccessTokenResponse getTokenResponse(OAuth2AuthorizationCodeGrantRequest request) {
        // Explicit OIDC registrations may reuse a native provider name for an identity broker.
        var scopes = request.getClientRegistration().getScopes();
        if (scopes != null && scopes.contains(OidcScopes.OPENID)) {
            return delegate.getTokenResponse(request);
        }
        String registrationId = request.getClientRegistration().getRegistrationId();
        ProviderTokenResponseClient override = overrides.get(registrationId);
        return (override != null ? override : delegate).getTokenResponse(request);
    }
}
