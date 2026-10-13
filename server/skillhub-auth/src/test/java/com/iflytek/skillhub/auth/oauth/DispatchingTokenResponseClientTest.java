package com.iflytek.skillhub.auth.oauth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.endpoint.OAuth2AccessTokenResponse;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationExchange;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationResponse;

class DispatchingTokenResponseClientTest {

    @Test
    void routesToProviderOverrideWhenOneClaimsTheRegistration() {
        OAuth2AccessTokenResponse overrideResponse = response("from-override");
        OAuth2AccessTokenResponse defaultResponse = response("from-default");
        DispatchingTokenResponseClient client = new DispatchingTokenResponseClient(
                List.of(stubProvider("dingtalk", overrideResponse)),
                request -> defaultResponse
        );

        OAuth2AccessTokenResponse result = client.getTokenResponse(grantRequest("dingtalk"));

        assertThat(result.getAccessToken().getTokenValue()).isEqualTo("from-override");
    }

    @Test
    void fallsBackToDefaultClientForUnclaimedRegistrations() {
        OAuth2AccessTokenResponse overrideResponse = response("from-override");
        OAuth2AccessTokenResponse defaultResponse = response("from-default");
        DispatchingTokenResponseClient client = new DispatchingTokenResponseClient(
                List.of(stubProvider("dingtalk", overrideResponse)),
                request -> defaultResponse
        );

        // GitHub must keep the standard exchange even while a DingTalk override is registered.
        OAuth2AccessTokenResponse result = client.getTokenResponse(grantRequest("github"));

        assertThat(result.getAccessToken().getTokenValue()).isEqualTo("from-default");
    }

    @Test
    void explicitOidcRegistrationUsesStandardExchangeDespiteNativeProviderName() {
        var request = grantRequest("dingtalk");
        var oidcRegistration = ClientRegistration.withClientRegistration(request.getClientRegistration())
                .scope("openid", "profile", "email")
                .jwkSetUri("https://provider.example/jwks")
                .build();
        var standard = response("standard-oidc");
        var client = new DispatchingTokenResponseClient(
                List.of(stubProvider("dingtalk", response("native-dingtalk"))),
                grant -> standard);

        assertThat(client.getTokenResponse(new OAuth2AuthorizationCodeGrantRequest(
                oidcRegistration, request.getAuthorizationExchange()))).isSameAs(standard);
    }

    @Test
    void oidcBrokerReceivesStandardFormAndKeepsIdToken() {
        var template = OAuth2TokenResponseClients.standardRestTemplate();
        var server = org.springframework.test.web.client.MockRestServiceServer.createServer(template);
        server.expect(org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo(
                        "https://provider.example/token"))
                .andExpect(org.springframework.test.web.client.match.MockRestRequestMatchers.content()
                        .contentTypeCompatibleWith(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED))
                .andExpect(org.springframework.test.web.client.match.MockRestRequestMatchers.content()
                        .string(org.hamcrest.Matchers.containsString("grant_type=authorization_code")))
                .andExpect(org.springframework.test.web.client.match.MockRestRequestMatchers.header(
                        "Authorization", org.hamcrest.Matchers.startsWith("Basic ")))
                .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess(
                        "{\"access_token\":\"example-access\",\"token_type\":\"Bearer\",\"id_token\":\"example-id-token\"}",
                        org.springframework.http.MediaType.APPLICATION_JSON));
        var standard = new org.springframework.security.oauth2.client.endpoint.DefaultAuthorizationCodeTokenResponseClient();
        standard.setRestOperations(template);
        var client = new DispatchingTokenResponseClient(
                List.of(stubProvider("dingtalk", response("native-response"))), standard);
        var original = grantRequest("dingtalk");
        var registration = ClientRegistration.withClientRegistration(original.getClientRegistration())
                .scope("openid", "profile", "email")
                .jwkSetUri("https://provider.example/jwks")
                .build();

        var result = client.getTokenResponse(new OAuth2AuthorizationCodeGrantRequest(
                registration, original.getAuthorizationExchange()));

        assertThat(result.getAccessToken().getTokenValue()).isEqualTo("example-access");
        assertThat(result.getAdditionalParameters()).containsEntry("id_token", "example-id-token");
        server.verify();
    }

    private static ProviderTokenResponseClient stubProvider(
            String provider,
            OAuth2AccessTokenResponse response
    ) {
        return new ProviderTokenResponseClient() {
            @Override
            public String getProvider() {
                return provider;
            }

            @Override
            public OAuth2AccessTokenResponse getTokenResponse(OAuth2AuthorizationCodeGrantRequest request) {
                return response;
            }
        };
    }

    private static OAuth2AccessTokenResponse response(String tokenValue) {
        return OAuth2AccessTokenResponse.withToken(tokenValue)
                .tokenType(org.springframework.security.oauth2.core.OAuth2AccessToken.TokenType.BEARER)
                .expiresIn(3600)
                .build();
    }

    private static OAuth2AuthorizationCodeGrantRequest grantRequest(String registrationId) {
        ClientRegistration registration = ClientRegistration.withRegistrationId(registrationId)
                .clientId("client")
                .clientSecret("secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .redirectUri("https://skillhub.example/login/oauth2/code/" + registrationId)
                .authorizationUri("https://provider.example/authorize")
                .tokenUri("https://provider.example/token")
                .userInfoUri("https://provider.example/me")
                .userNameAttributeName("id")
                .build();
        OAuth2AuthorizationRequest authorizationRequest = OAuth2AuthorizationRequest.authorizationCode()
                .authorizationUri("https://provider.example/authorize")
                .clientId("client")
                .redirectUri("https://skillhub.example/login/oauth2/code/" + registrationId)
                .state("state-1")
                .build();
        OAuth2AuthorizationResponse authorizationResponse = OAuth2AuthorizationResponse.success("code-1")
                .redirectUri("https://skillhub.example/login/oauth2/code/" + registrationId)
                .state("state-1")
                .build();
        return new OAuth2AuthorizationCodeGrantRequest(
                registration,
                new OAuth2AuthorizationExchange(authorizationRequest, authorizationResponse)
        );
    }

}
