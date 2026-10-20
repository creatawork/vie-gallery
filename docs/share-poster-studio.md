# 分享海报

在已发布展厅的工作台点击「分享 → 海报创作」，即可制作和下载海报。仅展厅所有者可创建海报。

- 版式：留白画册、全幅影像、深色典藏、蓝色光影、双栏展签。
- 尺寸：竖版 1080 × 1440、长图 1080 × 1920、方形 1080 × 1080。
- 内容：标题最多 80 字，寄语最多 160 字；留空标题使用展厅名称。长文案自动换行，超出排版区域时显示省略号。
- 取景：使用展厅封面，未设置时使用可用照片；优先读取高清 MEDIUM 图片，没有变体时读取原图。图片等比裁切，可用滑杆调整裁切位置。
- 下载：点击「下载高清海报」保存 PNG 图片。预览直接使用服务端导出排版，修改选项后自动更新，更新完成前暂停下载。

## 扫码访问

公开展厅扫码直接访问；密码展厅仍要求访客输入展厅密码。

私密展厅的预览不会创建访问链接，二维码区域显示占位提示。成功下载时创建一个 30 天有效的分享链接并嵌入海报；可在「链接分享 → 更多分享设置」的分享链接列表中撤销。重复下载会创建各自独立的访问链接。撤销、过期、撤回发布后，对应海报不能继续访问展厅。

## API

以下接口均要求登录、当前工作区所有者权限，以及属于当前工作区且已发布的展厅。

| 请求 | 结果 |
| --- | --- |
| `POST /api/galleries/{id}/share-poster/preview` | 540 像素宽的 PNG 预览，无文件上传、无访问链接写入 |
| `POST /api/galleries/{id}/share-poster/download` | 1080 像素宽的 PNG，附带附件下载头 |
| `POST /api/galleries/{id}/share-poster` | 保留原有 JSON 响应 `{ posterUrl, template }`，上传图片并返回 7 天有效的图片地址 |

三个接口接受相同的可选 JSON 请求体：

```json
{
  "template": "ELEGANT",
  "format": "PORTRAIT",
  "title": "山野来信",
  "description": "让脚步慢一点，听风从山谷里经过。",
  "focalPoint": 50
}
```

`template` 支持 `MINIMAL / ELEGANT / CLASSIC / VIBRANT / MODERN`，默认 `MINIMAL`。`format` 支持 `PORTRAIT / STORY / SQUARE`，默认 `PORTRAIT`。`focalPoint` 在 0～100 之间，默认 50；按实际裁切方向控制左右或上下位置。预览与下载响应使用 `Cache-Control: no-store`。

## 验证

`SharePosterRendererTest` 覆盖全部 15 种版式与尺寸组合的真实 PNG 尺寸、整图二维码解码、中文与 emoji 换行及等比裁切。`ShareLinkFacadeTest` 覆盖预览无副作用、私密链接有效期和撤销、密码模式、权限隔离及失败不留下分享链接。`SharePosterControllerTest` 覆盖响应头和参数传递。

`apps/gallery-admin/e2e/poster-studio.spec.ts` 覆盖版式切换、文案与取景、真实下载事件、失效预览保护、失败重试、缓存切回、键盘切换和手机布局。浏览器测试使用 API 模拟数据。
