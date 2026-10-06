# 场景背景图

使用内置 image_gen 工具生成，转换为 WebP（quality 86）。图片部署于 /g/backgrounds/，配置栏和 3D 渲染共用。

### 极简空间 (`minimal.webp`)

Use case: stylized-concept. Asset type: immersive 3D photo gallery environment background. Theme: 极简空间. An airy minimalist white architectural gallery with sculptural pale stone, soft ivory sky and diffuse daylight. Create a refined cinematic photorealistic 3D environment, very wide panoramic landscape 2:1 composition with coherent horizon suitable as a spherical backdrop viewed behind floating photographs. Empty uncluttered central space, fine natural textures, gentle contrast, no people, no photographs, no frames, no text, no logos, no watermark.

### 森林之梦 (`forest-dream.webp`)

Use case: stylized-concept. Asset type: immersive 3D photo gallery environment background. Theme: 森林之梦. A tranquil lush forest clearing with tall trees, jade foliage, delicate pale pink blossoms and soft morning mist. Create a refined cinematic photorealistic 3D environment, very wide panoramic landscape 2:1 composition with coherent horizon suitable as a spherical backdrop viewed behind floating photographs. Empty uncluttered central space, fine natural textures, gentle contrast, no people, no photographs, no frames, no text, no logos, no watermark.

### 星空夜曲 (`starry-night.webp`)

Use case: stylized-concept. Asset type: immersive 3D photo gallery environment background. Theme: 星空夜曲. A serene deep indigo night sky filled with delicate stars and a subtle Milky Way over distant mountains. Create a refined cinematic photorealistic 3D environment, very wide panoramic landscape 2:1 composition with coherent horizon suitable as a spherical backdrop viewed behind floating photographs. Empty uncluttered central space, fine natural textures, gentle contrast, no people, no photographs, no frames, no text, no logos, no watermark.

### 海洋微风 (`ocean-breeze.webp`)

Use case: stylized-concept. Asset type: immersive 3D photo gallery environment background. Theme: 海洋微风. A calm turquoise ocean horizon with pale blue sky and soft coastal clouds, gentle sea atmosphere. Create a refined cinematic photorealistic 3D environment, very wide panoramic landscape 2:1 composition with coherent horizon suitable as a spherical backdrop viewed behind floating photographs. Empty uncluttered central space, fine natural textures, gentle contrast, no people, no photographs, no frames, no text, no logos, no watermark.

### 日落余晖 (`sunset-glow.webp`)

Use case: stylized-concept. Asset type: immersive 3D photo gallery environment background. Theme: 日落余晖. An expansive sunset sky with luminous peach and amber clouds over distant terracotta hills. Create a refined cinematic photorealistic 3D environment, very wide panoramic landscape 2:1 composition with coherent horizon suitable as a spherical backdrop viewed behind floating photographs. Empty uncluttered central space, fine natural textures, gentle contrast, no people, no photographs, no frames, no text, no logos, no watermark.

### 心动浪漫 (`romantic.webp`)

Use case: stylized-concept. Asset type: immersive 3D photo gallery environment background. Theme: 心动浪漫. An ethereal rose garden with blush pink clouds, soft petals and elegant pale arches in the distance. Create a refined cinematic photorealistic 3D environment, very wide panoramic landscape 2:1 composition with coherent horizon suitable as a spherical backdrop viewed behind floating photographs. Empty uncluttered central space, fine natural textures, gentle contrast, no people, no photographs, no frames, no text, no logos, no watermark.

### 冬日雪境 (`winter-snow.webp`)

Use case: stylized-concept. Asset type: immersive 3D photo gallery environment background. Theme: 冬日雪境. A peaceful snowy alpine forest with powder blue sky, frosted fir trees and soft snow under diffuse winter daylight. Create a refined cinematic photorealistic 3D environment, very wide panoramic landscape 2:1 composition with coherent horizon suitable as a spherical backdrop viewed behind floating photographs. Empty uncluttered central space, fine natural textures, gentle contrast, no people, no photographs, no frames, no text, no logos, no watermark.

### 胶片展厅 (`film-gallery.webp`)

Use case: stylized-concept. Asset type: immersive 3D photo gallery environment background. Theme: 胶片展厅. An elegant dark warm analog film photography gallery, charcoal walls, amber indirect lights and subtle walnut architecture, empty walls. Create a refined cinematic photorealistic 3D environment, very wide panoramic landscape 2:1 composition with coherent horizon suitable as a spherical backdrop viewed behind floating photographs. Empty uncluttered central space, fine natural textures, gentle contrast, no people, no photographs, no frames, no text, no logos, no watermark.

## 派生产物与缓存版本

- `thumbs/<name>.webp`（320×160）：配置面板卡片缩略图，避免卡片加载高分辨率全景。
- `<name>-low.webp`（887×444）：low 画质设备加载的半分辨率全景变体（`backgroundTextureUrl`）。
- 契约 `SCENE_BACKGROUND_VERSION` 会以 `?v=` 追加到以上 URL；替换任何同名素材时必须同步递增该版本，否则缓存会继续返回旧图。
- 每张素材上线前须按等距柱状投影检查 0/90/180/270 度视角、左右接缝与极点；2:1 宽幅构图本身不等于合格全景。
