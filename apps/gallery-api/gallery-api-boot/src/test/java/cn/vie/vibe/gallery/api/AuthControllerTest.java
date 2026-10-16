package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.AuthFacade;
import cn.vie.vibe.gallery.application.AuthenticatedUser;
import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.Tenant;
import cn.vie.vibe.gallery.domain.User;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthControllerTest {
    private static final String EMAIL = "creator@example.com";
    private static final String RESET_TOKEN = "1234567890123456789012345678901234567890123";

    private static AuthController controller(AuthFacade auth, RedisRateLimiter limiter) {
        return new AuthController(auth, mock(SecurityContextRepository.class), limiter);
    }

    @ParameterizedTest
    @ValueSource(ints = {6, 12, 128})
    void accountRequestsAcceptSixCharactersAndExistingLongerPasswords(int length) {
        String password = "a".repeat(length);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            Validator validator = factory.getValidator();
            assertEquals(0, validator.validate(new AuthController.RegisterRequest(EMAIL, password, "Creator")).size());
            assertEquals(0, validator.validate(new AuthController.LoginRequest(EMAIL, password)).size());
            assertEquals(0, validator.validate(new AuthController.ResetPasswordRequest(RESET_TOKEN, password)).size());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"12345", "      "})
    void accountRequestsRejectShortOrBlankPasswords(String password) {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            Validator validator = factory.getValidator();
            assertEquals(1, validator.validate(new AuthController.RegisterRequest(EMAIL, password, "Creator")).size());
            assertEquals(1, validator.validate(new AuthController.LoginRequest(EMAIL, password)).size());
            assertEquals(1, validator.validate(new AuthController.ResetPasswordRequest(RESET_TOKEN, password)).size());
        }
    }

    @Test
    void accountRequestsKeepThePasswordUpperBound() {
        String password = "a".repeat(129);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            Validator validator = factory.getValidator();
            assertEquals(1, validator.validate(new AuthController.RegisterRequest(EMAIL, password, "Creator")).size());
            assertEquals(1, validator.validate(new AuthController.LoginRequest(EMAIL, password)).size());
            assertEquals(1, validator.validate(new AuthController.ResetPasswordRequest(RESET_TOKEN, password)).size());
        }
    }

    @Test
    void successfulLoginResetsFailureCounter() {
        AuthFacade auth = mock(AuthFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        User user = mock(User.class);
        Tenant tenant = mock(Tenant.class);
        when(user.id()).thenReturn(UUID.randomUUID());
        when(user.email()).thenReturn(EMAIL);
        when(user.displayName()).thenReturn("Creator");
        when(tenant.id()).thenReturn(UUID.randomUUID());
        when(tenant.name()).thenReturn("Test Workspace");
        when(tenant.slug()).thenReturn("test-workspace");
        when(auth.login(EMAIL, "Password123456"))
                .thenReturn(new AuthenticatedUser(user, tenant, MembershipRole.OWNER));
        AuthController controller = controller(auth, limiter);

        controller.login(new AuthController.LoginRequest(EMAIL, "Password123456"),
                new MockHttpServletRequest(), new MockHttpServletResponse());

        verify(limiter).assertLoginAllowed(EMAIL);
        verify(limiter).resetLogin(EMAIL);
        verify(limiter, never()).recordLoginFailure(anyString());
    }

    @Test
    void failedLoginRecordsFailureAndKeepsCounter() {
        AuthFacade auth = mock(AuthFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        when(auth.login(EMAIL, "Password123456"))
                .thenThrow(new DomainException("AUTH_INVALID_CREDENTIALS", "Invalid credentials"));
        AuthController controller = controller(auth, limiter);

        DomainException exception = assertThrows(DomainException.class,
                () -> controller.login(new AuthController.LoginRequest(EMAIL, "Password123456"),
                        new MockHttpServletRequest(), new MockHttpServletResponse()));

        assertEquals("AUTH_INVALID_CREDENTIALS", exception.code());
        verify(limiter).recordLoginFailure(EMAIL);
        verify(limiter, never()).resetLogin(anyString());
    }

    @Test
    void blockedLoginIsRejectedBeforeReachingFacade() {
        AuthFacade auth = mock(AuthFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        doThrow(new DomainException("RATE_LIMITED", "尝试次数过多，请稍后再试"))
                .when(limiter).assertLoginAllowed(anyString());
        AuthController controller = controller(auth, limiter);

        DomainException exception = assertThrows(DomainException.class,
                () -> controller.login(new AuthController.LoginRequest(EMAIL, "Password123456"),
                        new MockHttpServletRequest(), new MockHttpServletResponse()));

        assertEquals("RATE_LIMITED", exception.code());
        verify(auth, never()).login(anyString(), anyString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/auth/forgot-password", "/api/auth/reset-password"})
    void recoveryEndpointsAreUnavailableWithoutCallingTheFacade(String endpoint) throws Exception {
        AuthFacade auth = mock(AuthFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller(auth, limiter))
                .setControllerAdvice(new GlobalExceptionHandler(new ApiErrorFactory()))
                .build();

        for (String body : new String[]{"", "{}", "{\"email\":\"creator@example.com\",\"token\":\""
                + RESET_TOKEN + "\",\"newPassword\":\"abc123\"}"}) {
            mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.code").value("AUTH_PASSWORD_RECOVERY_UNAVAILABLE"))
                    .andExpect(jsonPath("$.message").value("暂未开放找回密码，请妥善保管登录密码"));
        }

        verifyNoInteractions(auth, limiter);
    }
}
