package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.AuthFacade;
import cn.vie.vibe.gallery.application.AuthenticatedUser;
import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.Tenant;
import cn.vie.vibe.gallery.domain.User;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.context.SecurityContextRepository;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthControllerTest {
    private static final String EMAIL = "creator@example.com";

    private static AuthController controller(AuthFacade auth, RedisRateLimiter limiter) {
        return new AuthController(auth, mock(SecurityContextRepository.class), limiter);
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

    @Test
    void forgotPasswordInvokesFacadeAndReturnsGenericMessage() {
        AuthFacade auth = mock(AuthFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        AuthController controller = controller(auth, limiter);

        java.util.Map<String, String> response = controller.forgotPassword(
                new AuthController.ForgotPasswordRequest(EMAIL));

        verify(auth).requestPasswordReset(EMAIL);
        assertEquals("如果邮箱存在，您将收到密码重置邮件", response.get("message"));
    }

    @Test
    void resetPasswordInvokesFacadeAndReturnsSuccessMessage() {
        AuthFacade auth = mock(AuthFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        AuthController controller = controller(auth, limiter);

        String token = "1234567890123456789012345678901234567890123";
        java.util.Map<String, Boolean> response = controller.resetPassword(
                new AuthController.ResetPasswordRequest(token, "NewPassword123"));

        verify(auth).resetPassword(token, "NewPassword123");
        assertEquals(true, response.get("success"));
    }
}
