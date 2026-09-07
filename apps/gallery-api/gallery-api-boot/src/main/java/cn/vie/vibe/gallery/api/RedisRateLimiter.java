package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.domain.DomainException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Locale;

/**
 * Redis 限流器：对登录失败和密码解锁失败按身份计数，达到阈值后拒绝请求。
 * 计数只在失败时增加，成功后清空；窗口从第一次失败开始计时。
 */
@Component
public class RedisRateLimiter {
    private static final String KEY_PREFIX = "vie:rate:";
    private static final int MAX_KEY_LENGTH = 200;

    private final StringRedisTemplate redis;
    private final int loginMaxFailures;
    private final Duration loginWindow;
    private final int unlockMaxFailures;
    private final Duration unlockWindow;

    public RedisRateLimiter(
            StringRedisTemplate redis,
            @Value("${gallery.rate-limit.login.max-failures:5}") int loginMaxFailures,
            @Value("${gallery.rate-limit.login.window:PT15M}") Duration loginWindow,
            @Value("${gallery.rate-limit.unlock.max-failures:5}") int unlockMaxFailures,
            @Value("${gallery.rate-limit.unlock.window:PT15M}") Duration unlockWindow
    ) {
        this.redis = redis;
        this.loginMaxFailures = loginMaxFailures;
        this.loginWindow = loginWindow;
        this.unlockMaxFailures = unlockMaxFailures;
        this.unlockWindow = unlockWindow;
    }

    /** 登录前检查是否已被限流；被限流时抛 429 RATE_LIMITED。 */
    public void assertLoginAllowed(String identity) {
        assertAllowed("login", identity, loginMaxFailures);
    }

    /** 密码解锁前检查；被限流时抛 429 RATE_LIMITED。 */
    public void assertUnlockAllowed(String identity) {
        assertAllowed("unlock", identity, unlockMaxFailures);
    }

    public void recordLoginFailure(String identity) {
        recordFailure("login", identity, loginWindow);
    }

    public void recordUnlockFailure(String identity) {
        recordFailure("unlock", identity, unlockWindow);
    }

    public void resetLogin(String identity) {
        redis.delete(key("login", identity));
    }

    public void resetUnlock(String identity) {
        redis.delete(key("unlock", identity));
    }

    private void assertAllowed(String gate, String identity, int maxFailures) {
        String value = redis.opsForValue().get(key(gate, identity));
        if (value != null && Long.parseLong(value) >= maxFailures) {
            throw new DomainException("RATE_LIMITED", "尝试次数过多，请稍后再试");
        }
    }

    private void recordFailure(String gate, String identity, Duration window) {
        String key = key(gate, identity);
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redis.expire(key, window);
        }
    }

    private static String key(String gate, String identity) {
        String value = identity == null ? "" : identity.trim().toLowerCase(Locale.ROOT);
        if (value.length() > MAX_KEY_LENGTH) {
            value = value.substring(0, MAX_KEY_LENGTH);
        }
        return KEY_PREFIX + gate + ":" + value;
    }
}
