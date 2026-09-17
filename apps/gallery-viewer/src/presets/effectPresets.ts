/**
 * Bloom 和 Fog 效果预设
 * 提供三种艺术化强度：清新 (Fresh) / 温暖 (Warm) / 深邃 (Deep)
 */

export interface EffectPreset {
  /** 预设名称 */
  name: string
  /** 预设描述 */
  description: string
  
  /** Bloom 配置 */
  bloom: {
    enabled: boolean
    strength: number
    radius: number
    threshold: number
  }
  
  /** Fog 配置 */
  fog: {
    enabled: boolean
    color: string
    density: number
  }
  
  /** 电影调色配置 */
  grading?: {
    vignetteDarkness: number
    vignetteOffset: number
    contrast: number
    saturation: number
  }
}

/**
 * 清新预设 - Fresh
 * 适合：白天照片、明亮场景、清爽氛围
 * 特点：Bloom 弱，Fog 淡，高饱和度
 */
export const FRESH_PRESET: EffectPreset = {
  name: 'fresh',
  description: '清新 - 明亮清爽的白天氛围',
  
  bloom: {
    enabled: true,
    strength: 0.35,      // 降低强度，避免过曝
    radius: 0.4,         // 较小半径，光晕紧凑
    threshold: 0.65      // 高阈值，只有最亮部分发光
  },
  
  fog: {
    enabled: true,
    color: '#f0f4f8',    // 淡蓝灰色
    density: 0.0002      // 极淡雾效
  },
  
  grading: {
    vignetteDarkness: 0.5,   // 轻微暗角
    vignetteOffset: 1.3,     // 暗角范围大
    contrast: 1.02,          // 轻微对比度
    saturation: 1.12         // 略高饱和度
  }
}

/**
 * 温暖预设 - Warm
 * 适合：黄昏照片、温馨场景、浪漫氛围
 * 特点：Bloom 中等，Fog 金黄，电影感强
 */
export const WARM_PRESET: EffectPreset = {
  name: 'warm',
  description: '温暖 - 浪漫温馨的金色时光',
  
  bloom: {
    enabled: true,
    strength: 0.55,      // 中等强度
    radius: 0.6,         // 中等半径，柔和光晕
    threshold: 0.35      // 中等阈值，适度发光
  },
  
  fog: {
    enabled: true,
    color: '#ffd4a3',    // 金橙色（与日落光照呼应）
    density: 0.00035     // 中等雾效
  },
  
  grading: {
    vignetteDarkness: 0.7,   // 中等暗角
    vignetteOffset: 1.1,     // 标准暗角范围
    contrast: 1.08,          // 增强对比度
    saturation: 1.15         // 提高饱和度
  }
}

/**
 * 深邃预设 - Deep
 * 适合：夜景照片、神秘场景、深沉氛围
 * 特点：Bloom 中强，Fog 深蓝，氛围浓厚
 */
export const DEEP_PRESET: EffectPreset = {
  name: 'deep',
  description: '深邃 - 神秘深沉的夜色氛围',
  
  bloom: {
    enabled: true,
    strength: 0.75,      // 较强强度
    radius: 0.8,         // 较大半径，扩散光晕
    threshold: 0.22      // 较低阈值，更多区域发光
  },
  
  fog: {
    enabled: true,
    color: '#2d3a52',    // 深蓝灰色（与夜晚光照呼应）
    density: 0.0005      // 较浓雾效
  },
  
  grading: {
    vignetteDarkness: 0.9,   // 强烈暗角
    vignetteOffset: 1.0,     // 紧凑暗角范围
    contrast: 1.12,          // 高对比度
    saturation: 1.05         // 略降饱和度（更有电影感）
  }
}

/**
 * 极简预设 - Minimal
 * 适合：需要突出照片本身，不分散注意力
 * 特点：效果最弱，接近原始
 */
export const MINIMAL_PRESET: EffectPreset = {
  name: 'minimal',
  description: '极简 - 突出照片本身',
  
  bloom: {
    enabled: true,
    strength: 0.2,
    radius: 0.3,
    threshold: 0.85
  },
  
  fog: {
    enabled: false,
    color: '#ffffff',
    density: 0
  },
  
  grading: {
    vignetteDarkness: 0.3,
    vignetteOffset: 1.5,
    contrast: 1.0,
    saturation: 1.05
  }
}

/**
 * 所有预设的映射
 */
export const EFFECT_PRESETS: Record<string, EffectPreset> = {
  fresh: FRESH_PRESET,
  warm: WARM_PRESET,
  deep: DEEP_PRESET,
  minimal: MINIMAL_PRESET
}

/**
 * 根据预设名称获取效果配置
 */
export function getEffectPreset(name: string): EffectPreset {
  const preset = EFFECT_PRESETS[name.toLowerCase()]
  if (!preset) {
    console.warn(`Unknown effect preset: ${name}, falling back to warm`)
    return WARM_PRESET
  }
  return preset
}

/**
 * 根据光照时间段自动推荐效果预设
 */
export function getAutoEffectPreset(timeOfDay?: string): EffectPreset {
  if (!timeOfDay) return WARM_PRESET
  
  switch (timeOfDay) {
    case 'sunrise':
    case 'dawn':
      return FRESH_PRESET
    
    case 'noon':
    case 'day':
      return FRESH_PRESET
    
    case 'sunset':
    case 'dusk':
      return WARM_PRESET
    
    case 'night':
      return DEEP_PRESET
    
    default:
      return WARM_PRESET
  }
}

/**
 * 在两个效果预设之间插值
 */
export function interpolateEffectPresets(
  from: EffectPreset,
  to: EffectPreset,
  t: number
): EffectPreset {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  
  return {
    name: `transition-${t.toFixed(2)}`,
    description: `Transition from ${from.name} to ${to.name}`,
    
    bloom: {
      enabled: from.bloom.enabled || to.bloom.enabled,
      strength: lerp(from.bloom.strength, to.bloom.strength, t),
      radius: lerp(from.bloom.radius, to.bloom.radius, t),
      threshold: lerp(from.bloom.threshold, to.bloom.threshold, t)
    },
    
    fog: {
      enabled: from.fog.enabled || to.fog.enabled,
      color: from.fog.color, // 颜色不插值，直接切换
      density: lerp(from.fog.density, to.fog.density, t)
    },
    
    grading: from.grading && to.grading ? {
      vignetteDarkness: lerp(from.grading.vignetteDarkness, to.grading.vignetteDarkness, t),
      vignetteOffset: lerp(from.grading.vignetteOffset, to.grading.vignetteOffset, t),
      contrast: lerp(from.grading.contrast, to.grading.contrast, t),
      saturation: lerp(from.grading.saturation, to.grading.saturation, t)
    } : undefined
  }
}
