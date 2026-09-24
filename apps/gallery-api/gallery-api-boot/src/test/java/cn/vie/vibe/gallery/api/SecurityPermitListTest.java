package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.AuthFacade;
import cn.vie.vibe.gallery.application.ShareLinkFacade;
import cn.vie.vibe.gallery.application.ShortLinkTarget;
import cn.vie.vibe.gallery.domain.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 验证公开端点的安全放行规则：/s/{code}（短链接重定向）必须匿名可达，
 * 其余未在白名单内的路径仍要求认证。
 */
@WebMvcTest(controllers = ShortLinkRedirectController.class)
@Import({SecurityConfig.class, RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class,
        ApiErrorWriter.class, ApiErrorFactory.class, TenantContextFilter.class})
class SecurityPermitListTest {

    /**
     * 独立的测试引导配置：避免主应用的 @MapperScan 把 MyBatis mapper 拉进 WebMvcTest 上下文。
     * 只注册被测的短链接重定向控制器。
     */
    @SpringBootConfiguration
    @ComponentScan(basePackageClasses = ShortLinkRedirectController.class, useDefaultFilters = false,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE,
                    classes = ShortLinkRedirectController.class))
    static class TestBoot {
    }

    @MockBean
    ShareLinkFacade shareLinkFacade;

    @MockBean
    AuthFacade authFacade;

    private final MockMvc mockMvc;

    @Autowired
    SecurityPermitListTest(MockMvc mockMvc) {
        this.mockMvc = mockMvc;
    }

    @Test
    void validShortCodeRedirectsAnonymously() throws Exception {
        when(shareLinkFacade.resolveShortLink("abc123")).thenReturn(
                new ShortLinkTarget("https://gallery.test/g/slug?t=tok", "slug", "abc123"));

        mockMvc.perform(get("/s/abc123"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl("https://gallery.test/g/slug?t=tok"));
    }

    @Test
    void missingShortCodeReturns404InsteadOfAuthError() throws Exception {
        when(shareLinkFacade.resolveShortLink("zzzzzz"))
                .thenThrow(new DomainException("SHORT_LINK_NOT_FOUND", "Short link not found"));

        mockMvc.perform(get("/s/zzzzzz"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SHORT_LINK_NOT_FOUND"));
    }

    @Test
    void invalidShortCodeReturns404InsteadOfAuthError() throws Exception {
        when(shareLinkFacade.resolveShortLink("expired"))
                .thenThrow(new DomainException("SHORT_LINK_INVALID", "Short link is expired or revoked"));

        mockMvc.perform(get("/s/expired"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SHORT_LINK_INVALID"));
    }

    @Test
    void unknownProtectedPathStillRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/galleries/whatever"))
                .andExpect(status().isUnauthorized());
    }
}
