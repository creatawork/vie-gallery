package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.domain.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisRateLimiterTest {
    private static final Duration WINDOW = Duration.ofMinutes(15);

    @SuppressWarnings("unchecked")
    private static RedisRateLimiter limiter(StringRedisTemplate redis, ValueOperations<String, String> values) {
        when(redis.opsForValue()).thenReturn(values);
        return new RedisRateLimiter(redis, 5, WINDOW, 5, WINDOW);
    }

    @Test
    void loginAttemptIsBlockedOnceFailureCountReachesMaximum() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        RedisRateLimiter limiter = limiter(redis, values);

        when(values.get("vie:rate:login:user@example.com")).thenReturn("4");
        assertDoesNotThrow(() -> limiter.assertLoginAllowed("user@example.com"));

        when(values.get("vie:rate:login:user@example.com")).thenReturn("5");
        DomainException exception = assertThrows(DomainException.class,
                () -> limiter.assertLoginAllowed("user@example.com"));
        assertEquals("RATE_LIMITED", exception.code());
    }

    @Test
    void firstFailureStartsWindowAndLaterFailuresKeepItWithoutExtending() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        RedisRateLimiter limiter = limiter(redis, values);

        when(values.increment("vie:rate:login:user@example.com")).thenReturn(1L);
        limiter.recordLoginFailure("User@Example.com");
        verify(redis).expire("vie:rate:login:user@example.com", WINDOW);

        when(values.increment("vie:rate:login:user@example.com")).thenReturn(2L);
        limiter.recordLoginFailure("user@example.com");
        verify(redis, times(1)).expire("vie:rate:login:user@example.com", WINDOW);
    }

    @Test
    void identitiesAreNormalizedToLowerCaseKeysAndDelimited() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        RedisRateLimiter limiter = limiter(redis, values);

        limiter.resetLogin(" User@EXAMPLE.com ");

        verify(redis).delete("vie:rate:login:user@example.com");
    }

    @Test
    void unlockAndLoginGatesUseSeparateKeys() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        RedisRateLimiter limiter = limiter(redis, values);

        limiter.resetUnlock("slug|1.2.3.4");
        limiter.resetLogin("slug|1.2.3.4");

        verify(redis).delete("vie:rate:unlock:slug|1.2.3.4");
        verify(redis).delete("vie:rate:login:slug|1.2.3.4");
    }

    @Test
    void recordFailureWithNullCountDoesNothing() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        RedisRateLimiter limiter = limiter(redis, values);

        when(values.increment(anyString())).thenReturn(null);
        limiter.recordLoginFailure("user@example.com");
        verify(redis, never()).expire(anyString(), any(Duration.class));
    }
}
