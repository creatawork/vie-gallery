/**
 * 照片主色调分析工具
 * 使用简化的 K-means 聚类算法提取照片的主导色彩
 */

export interface ColorRGB {
  r: number
  g: number
  b: number
}

export interface DominantColorResult {
  /** 主导色 RGB 值 (0-255) */
  color: ColorRGB
  /** 适合用于环境光的色温调整后的颜色 */
  ambientColor: ColorRGB
  /** 色温类型 */
  temperature: 'cool' | 'neutral' | 'warm'
  /** 处理耗时 (ms) */
  processingTime: number
}

interface ColorCluster {
  color: ColorRGB
  count: number
}

// Web Worker instance (lazy loaded)
let workerInstance: Worker | null = null
let useWorker = true

/**
 * 检测是否支持 Web Worker
 */
function supportsWorker(): boolean {
  return typeof Worker !== 'undefined'
}

/**
 * 获取或创建 Web Worker 实例
 */
function getWorker(): Worker | null {
  if (!useWorker || !supportsWorker()) {
    return null
  }
  
  if (!workerInstance) {
    try {
      workerInstance = new Worker(
        new URL('../workers/colorAnalyzer.worker.ts', import.meta.url),
        { type: 'module' }
      )
    } catch (error) {
      console.warn('Failed to create Web Worker, falling back to main thread:', error)
      useWorker = false
      return null
    }
  }
  
  return workerInstance
}

/**
 * 从图片 URL 提取主导色
 * @param imageUrl 图片 URL（支持跨域或 base64）
 * @param options 配置选项
 * @returns 主导色分析结果
 */
export async function extractDominantColor(
  imageUrl: string,
  options: {
    /** 采样尺寸，越小越快但精度降低 */
    sampleSize?: number
    /** 聚类数量 */
    clusters?: number
    /** 最大迭代次数 */
    maxIterations?: number
    /** 强制使用主线程（禁用 Worker） */
    forceMainThread?: boolean
  } = {}
): Promise<DominantColorResult> {
  const startTime = performance.now()
  
  const {
    sampleSize = 100,
    clusters = 5,
    maxIterations = 10,
    forceMainThread = false
  } = options

  // 1. 加载图片并缩放到采样尺寸
  const imageData = await loadAndSampleImage(imageUrl, sampleSize)
  
  // 2. 尝试使用 Web Worker 分析（如果可用且未禁用）
  if (!forceMainThread) {
    const worker = getWorker()
    if (worker) {
      try {
        const result = await analyzeInWorker(worker, imageData, { clusters, maxIterations })
        return {
          ...result,
          processingTime: performance.now() - startTime
        }
      } catch (error) {
        console.warn('Worker analysis failed, falling back to main thread:', error)
      }
    }
  }
  
  // 3. 降级到主线程分析
  const pixels = extractPixels(imageData)
  const colorClusters = kMeansClustering(pixels, clusters, maxIterations)
  const dominantCluster = colorClusters.reduce((max, cluster) => 
    cluster.count > max.count ? cluster : max
  )
  
  const ambientColor = convertToAmbientLight(dominantCluster.color)
  const temperature = detectTemperature(dominantCluster.color)
  const processingTime = performance.now() - startTime
  
  return {
    color: dominantCluster.color,
    ambientColor,
    temperature,
    processingTime
  }
}

/**
 * 在 Web Worker 中分析颜色
 */
function analyzeInWorker(
  worker: Worker,
  imageData: ImageData,
  options: { clusters: number; maxIterations: number }
): Promise<{ color: ColorRGB; ambientColor: ColorRGB; temperature: 'cool' | 'neutral' | 'warm' }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Worker analysis timeout'))
    }, 5000) // 5 秒超时
    
    const handleMessage = (e: MessageEvent) => {
      clearTimeout(timeout)
      worker.removeEventListener('message', handleMessage)
      
      if (e.data.type === 'result') {
        resolve({
          color: e.data.color,
          ambientColor: e.data.ambientColor,
          temperature: e.data.temperature
        })
      } else {
        reject(new Error(e.data.error || 'Worker analysis failed'))
      }
    }
    
    worker.addEventListener('message', handleMessage)
    worker.postMessage({
      type: 'analyze',
      imageData,
      options
    })
  })
}

/**
 * 加载图片并缩放到指定采样尺寸
 */
async function loadAndSampleImage(
  imageUrl: string,
  sampleSize: number
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      try {
        // 创建离屏 Canvas
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        
        if (!ctx) {
          reject(new Error('Failed to get 2D context'))
          return
        }
        
        // 计算缩放比例（保持宽高比）
        const scale = Math.min(
          sampleSize / img.width,
          sampleSize / img.height
        )
        
        canvas.width = Math.floor(img.width * scale)
        canvas.height = Math.floor(img.height * scale)
        
        // 绘制缩放后的图片
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        
        // 提取像素数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        resolve(imageData)
      } catch (error) {
        reject(error)
      }
    }
    
    img.onerror = () => {
      reject(new Error(`Failed to load image: ${imageUrl}`))
    }
    
    img.src = imageUrl
  })
}

/**
 * 从 ImageData 提取所有像素的 RGB 值
 * 跳过透明和过暗/过亮的像素
 */
function extractPixels(imageData: ImageData): ColorRGB[] {
  const pixels: ColorRGB[] = []
  const data = imageData.data
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    
    // 跳过透明像素
    if (a < 128) continue
    
    // 跳过过暗的像素（接近黑色）
    if (r < 10 && g < 10 && b < 10) continue
    
    // 跳过过亮的像素（接近白色）
    if (r > 245 && g > 245 && b > 245) continue
    
    pixels.push({ r, g, b })
  }
  
  return pixels
}

/**
 * 简化的 K-means 聚类算法
 */
function kMeansClustering(
  pixels: ColorRGB[],
  k: number,
  maxIterations: number
): ColorCluster[] {
  if (pixels.length === 0) {
    return [{ color: { r: 128, g: 128, b: 128 }, count: 1 }]
  }
  
  // 1. 随机初始化 k 个聚类中心
  const centers: ColorRGB[] = []
  for (let i = 0; i < k; i++) {
    const randomIndex = Math.floor(Math.random() * pixels.length)
    centers.push({ ...pixels[randomIndex] })
  }
  
  let assignments = new Array(pixels.length).fill(0)
  
  // 2. 迭代优化
  for (let iter = 0; iter < maxIterations; iter++) {
    // 分配每个像素到最近的聚类中心
    let changed = false
    for (let i = 0; i < pixels.length; i++) {
      const pixel = pixels[i]
      let minDist = Infinity
      let closestCenter = 0
      
      for (let j = 0; j < centers.length; j++) {
        const dist = colorDistance(pixel, centers[j])
        if (dist < minDist) {
          minDist = dist
          closestCenter = j
        }
      }
      
      if (assignments[i] !== closestCenter) {
        assignments[i] = closestCenter
        changed = true
      }
    }
    
    // 如果没有变化，提前结束
    if (!changed) break
    
    // 重新计算聚类中心
    const sums: { r: number; g: number; b: number; count: number }[] = []
    for (let i = 0; i < k; i++) {
      sums.push({ r: 0, g: 0, b: 0, count: 0 })
    }
    
    for (let i = 0; i < pixels.length; i++) {
      const pixel = pixels[i]
      const cluster = assignments[i]
      sums[cluster].r += pixel.r
      sums[cluster].g += pixel.g
      sums[cluster].b += pixel.b
      sums[cluster].count++
    }
    
    for (let i = 0; i < k; i++) {
      if (sums[i].count > 0) {
        centers[i] = {
          r: Math.round(sums[i].r / sums[i].count),
          g: Math.round(sums[i].g / sums[i].count),
          b: Math.round(sums[i].b / sums[i].count)
        }
      }
    }
  }
  
  // 3. 统计每个聚类的像素数量
  const clusters: ColorCluster[] = centers.map((color, index) => ({
    color,
    count: assignments.filter(a => a === index).length
  }))
  
  // 过滤掉空聚类
  return clusters.filter(c => c.count > 0)
}

/**
 * 计算两个颜色之间的欧几里得距离
 */
function colorDistance(c1: ColorRGB, c2: ColorRGB): number {
  const dr = c1.r - c2.r
  const dg = c1.g - c2.g
  const db = c1.b - c2.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * 将照片主导色转换为适合环境光的颜色
 * 降低饱和度并调整亮度，使其更适合作为环境光
 */
function convertToAmbientLight(color: ColorRGB): ColorRGB {
  // 转换到 HSL 空间
  const hsl = rgbToHsl(color)
  
  // 降低饱和度（环境光不应过于鲜艳）
  hsl.s = Math.min(hsl.s * 0.6, 0.5)
  
  // 调整亮度（环境光应该比较柔和）
  hsl.l = Math.max(0.4, Math.min(0.7, hsl.l))
  
  // 转回 RGB
  return hslToRgb(hsl)
}

/**
 * 检测色温类型
 */
function detectTemperature(color: ColorRGB): 'cool' | 'neutral' | 'warm' {
  const { r, g, b } = color
  
  // 计算色温偏向
  const warmth = (r - b) / 255
  
  if (warmth > 0.15) {
    return 'warm' // 偏向红橙色（暖色调）
  } else if (warmth < -0.15) {
    return 'cool' // 偏向蓝色（冷色调）
  } else {
    return 'neutral' // 中性色调
  }
}

/**
 * RGB 转 HSL
 */
function rgbToHsl(rgb: ColorRGB): { h: number; s: number; l: number } {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  
  if (max === min) {
    return { h: 0, s: 0, l }
  }
  
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  
  let h = 0
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6
  } else {
    h = ((r - g) / d + 4) / 6
  }
  
  return { h, s, l }
}

/**
 * HSL 转 RGB
 */
function hslToRgb(hsl: { h: number; s: number; l: number }): ColorRGB {
  const { h, s, l } = hsl
  
  if (s === 0) {
    const gray = Math.round(l * 255)
    return { r: gray, g: gray, b: gray }
  }
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  }
}

/**
 * 颜色缓存管理器
 * 避免重复分析同一张照片
 */
export class ColorAnalyzerCache {
  private cache = new Map<string, DominantColorResult>()
  private maxSize: number
  
  constructor(maxSize = 50) {
    this.maxSize = maxSize
  }
  
  get(url: string): DominantColorResult | undefined {
    return this.cache.get(url)
  }
  
  set(url: string, result: DominantColorResult): void {
    // 如果缓存满了，删除最早的条目
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }
    
    this.cache.set(url, result)
  }
  
  has(url: string): boolean {
    return this.cache.has(url)
  }
  
  clear(): void {
    this.cache.clear()
  }
  
  size(): number {
    return this.cache.size
  }
}

/**
 * 全局单例缓存实例
 */
export const globalColorCache = new ColorAnalyzerCache(50)
