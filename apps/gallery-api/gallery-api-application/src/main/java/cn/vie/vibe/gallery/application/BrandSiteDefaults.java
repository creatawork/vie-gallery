package cn.vie.vibe.gallery.application;

/**
 * 品牌站初始配置（与前端契约 defaultBrandSiteConfig 保持一致的最小骨架）。
 * 新站落点为 T0 素笺 + 空内容（§5 T0），管理端首开即引导填充。
 */
public final class BrandSiteDefaults {
    private BrandSiteDefaults() {}

    public static final String EMPTY_CONFIG_JSON = """
            {
              "templateId": "plain",
              "projectCardVariant": "mosaic",
              "content": {
                "brand": { "name": "我的品牌站", "primaryColor": "#1F6E68" },
                "hero": {
                  "headline": "我的品牌站的作品集",
                  "subHeadline": "在这里写一句话介绍你自己",
                  "cta": { "label": "查看作品", "action": "scroll-projects" }
                },
                "projects": [],
                "contact": { "formEnabled": true },
                "seo": { "title": "我的品牌站", "description": "我的品牌站" }
              }
            }""";
}
