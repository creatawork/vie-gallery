/**
 * 时间段氛围光照预设
 * 为不同时间段提供预定义的光照参数，营造特定氛围
 */

import type * as THREE from 'three'

export interface LightingPreset {
  /** 预设名称 */
  name: string
  /** 预设描述 */
  description: string
  
  /** 环境光配置 */
  ambientLight: {
    color: string | number
    intensity: number
  }
  
  /** 主光源配置（方向光） */
  directionalLight: {
    color: string | number
    intensity: number
    position: { x: number; y: number; z: number }
  }
  
  /** 辅助光源配置（可选） */
  fillLight?: {
    color: string | number
    intensity: number
    position: { x: number; y: number; z: number }
  }
  
  /** 雾效配置（可选） */
  fog?: {
    enabled: boolean
    color: string | number
    density: number
  }
  
  /** 粒子系统建议 */
  particlesSuggestion?: {
    enabled: boolean
    density: number
  }
}

/**
 * 日出氛围 - 柔和橙色光，低强度
 * 适合早晨、温馨回忆类照片
 */
export const SUNRISE_PRESET: LightingPreset = {
  name: 'sunrise',
  description: '日出 - 柔和温暖的晨光',
  
  ambientLight: {
    color: 0xffb380, // 柔和橙色
    intensity: 0.4
  },
  
  directionalLight: {
    color: 0xffd4a3, // 金橙色
    intensity: 0.6,
    position: { x: 100, y: 50, z: 100 }
  },
  
  fillLight: {
    color: 0xffeedd, // 暖白色
    intensity: 0.2,
    position: { x: -50, y: 30, z: -50 }
  },
  
  fog: {
    enabled: true,
    color: 0xffe4c4,
    density: 0.0003
  },
  
  particlesSuggestion: {
    enabled: false,
    density: 0
  }
}

/**
 * 正午氛围 - 白色光，高强度
 * 适合明亮、活力充沛的照片
 */
export const NOON_PRESET: LightingPreset = {
  name: 'noon',
  description: '正午 - 明亮清晰的日光',
  
  ambientLight: {
    color: 0xffffff, // 纯白
    intensity: 0.6
  },
  
  directionalLight: {
    color: 0xffffff, // 纯白
    intensity: 1.0,
    position: { x: 0, y: 200, z: 0 } // 顶部照射
  },
  
  fillLight: {
    color: 0xf0f8ff, // 天蓝色（天空反射光）
    intensity: 0.3,
    position: { x: -100, y: 50, z: 100 }
  },
  
  fog: {
    enabled: false,
    color: 0xffffff,
    density: 0
  },
  
  particlesSuggestion: {
    enabled: false,
    density: 0
  }
}

/**
 * 黄昏氛围 - 金色光，中等强度，增加雾效
 * 适合浪漫、怀旧情绪的照片
 */
export const SUNSET_PRESET: LightingPreset = {
  name: 'sunset',
  description: '黄昏 - 温暖浪漫的金色时光',
  
  ambientLight: {
    color: 0xff9966, // 金橙色
    intensity: 0.5
  },
  
  directionalLight: {
    color: 0xff7733, // 深橙色
    intensity: 0.8,
    position: { x: -150, y: 30, z: -100 } // 低角度侧光
  },
  
  fillLight: {
    color: 0xcc88ff, // 紫罗兰色（天空反射）
    intensity: 0.25,
    position: { x: 100, y: 50, z: 100 }
  },
  
  fog: {
    enabled: true,
    color: 0xff9966,
    density: 0.0005
  },
  
  particlesSuggestion: {
    enabled: true,
    density: 0.3
  }
}

/**
 * 夜晚氛围 - 蓝紫色光，低强度，增加粒子
 * 适合夜景、星空、宁静氛围的照片
 */
export const NIGHT_PRESET: LightingPreset = {
  name: 'night',
  description: '夜晚 - 神秘静谧的月光',
  
  ambientLight: {
    color: 0x4466aa, // 蓝紫色
    intensity: 0.3
  },
  
  directionalLight: {
    color: 0x6688cc, // 月光蓝
    intensity: 0.4,
    position: { x: -80, y: 100, z: -80 }
  },
  
  fillLight: {
    color: 0x2233aa, // 深蓝色
    intensity: 0.15,
    position: { x: 50, y: 20, z: 50 }
  },
  
  fog: {
    enabled: true,
    color: 0x112244,
    density: 0.0004
  },
  
  particlesSuggestion: {
    enabled: true,
    density: 0.6 // 高密度星星粒子
  }
}

/**
 * 所有预设的映射
 */
export const LIGHTING_PRESETS: Record<string, LightingPreset> = {
  sunrise: SUNRISE_PRESET,
  dawn: SUNRISE_PRESET, // 别名
  noon: NOON_PRESET,
  day: NOON_PRESET, // 别名
  sunset: SUNSET_PRESET,
  dusk: SUNSET_PRESET, // 别名
  night: NIGHT_PRESET
}

/**
 * 根据预设名称获取光照配置
 */
export function getLightingPreset(name: string): LightingPreset {
  const preset = LIGHTING_PRESETS[name.toLowerCase()]
  if (!preset) {
    console.warn(`Unknown lighting preset: ${name}, falling back to noon`)
    return NOON_PRESET
  }
  return preset
}

/**
 * 根据当前时间自动选择预设
 */
export function getAutoLightingPreset(): LightingPreset {
  const hour = new Date().getHours()
  
  if (hour >= 5 && hour < 8) {
    return SUNRISE_PRESET // 5:00 - 8:00
  } else if (hour >= 8 && hour < 17) {
    return NOON_PRESET // 8:00 - 17:00
  } else if (hour >= 17 && hour < 20) {
    return SUNSET_PRESET // 17:00 - 20:00
  } else {
    return NIGHT_PRESET // 20:00 - 5:00
  }
}

/**
 * 在两个光照预设之间插值过渡
 * @param from 起始预设
 * @param to 目标预设
 * @param t 插值系数 (0-1)
 */
export function interpolateLightingPresets(
  from: LightingPreset,
  to: LightingPreset,
  t: number
): LightingPreset {
  // 将颜色转换为 RGB 分量进行插值
  const lerpColor = (c1: number, c2: number, t: number): number => {
    const r1 = (c1 >> 16) & 0xff
    const g1 = (c1 >> 8) & 0xff
    const b1 = c1 & 0xff
    
    const r2 = (c2 >> 16) & 0xff
    const g2 = (c2 >> 8) & 0xff
    const b2 = c2 & 0xff
    
    const r = Math.round(r1 + (r2 - r1) * t)
    const g = Math.round(g1 + (g2 - g1) * t)
    const b = Math.round(b1 + (b2 - b1) * t)
    
    return (r << 16) | (g << 8) | b
  }
  
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  
  return {
    name: `transition-${t.toFixed(2)}`,
    description: `Transition from ${from.name} to ${to.name}`,
    
    ambientLight: {
      color: lerpColor(
        typeof from.ambientLight.color === 'number' ? from.ambientLight.color : 0xffffff,
        typeof to.ambientLight.color === 'number' ? to.ambientLight.color : 0xffffff,
        t
      ),
      intensity: lerp(from.ambientLight.intensity, to.ambientLight.intensity, t)
    },
    
    directionalLight: {
      color: lerpColor(
        typeof from.directionalLight.color === 'number' ? from.directionalLight.color : 0xffffff,
        typeof to.directionalLight.color === 'number' ? to.directionalLight.color : 0xffffff,
        t
      ),
      intensity: lerp(from.directionalLight.intensity, to.directionalLight.intensity, t),
      position: {
        x: lerp(from.directionalLight.position.x, to.directionalLight.position.x, t),
        y: lerp(from.directionalLight.position.y, to.directionalLight.position.y, t),
        z: lerp(from.directionalLight.position.z, to.directionalLight.position.z, t)
      }
    },
    
    fillLight: from.fillLight && to.fillLight ? {
      color: lerpColor(
        typeof from.fillLight.color === 'number' ? from.fillLight.color : 0xffffff,
        typeof to.fillLight.color === 'number' ? to.fillLight.color : 0xffffff,
        t
      ),
      intensity: lerp(from.fillLight.intensity, to.fillLight.intensity, t),
      position: {
        x: lerp(from.fillLight.position.x, to.fillLight.position.x, t),
        y: lerp(from.fillLight.position.y, to.fillLight.position.y, t),
        z: lerp(from.fillLight.position.z, to.fillLight.position.z, t)
      }
    } : undefined,
    
    fog: from.fog && to.fog ? {
      enabled: from.fog.enabled || to.fog.enabled,
      color: lerpColor(
        typeof from.fog.color === 'number' ? from.fog.color : 0xffffff,
        typeof to.fog.color === 'number' ? to.fog.color : 0xffffff,
        t
      ),
      density: lerp(from.fog.density, to.fog.density, t)
    } : undefined,
    
    particlesSuggestion: from.particlesSuggestion && to.particlesSuggestion ? {
      enabled: from.particlesSuggestion.enabled || to.particlesSuggestion.enabled,
      density: lerp(from.particlesSuggestion.density, to.particlesSuggestion.density, t)
    } : undefined
  }
}
