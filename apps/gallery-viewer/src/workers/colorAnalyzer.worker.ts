/**
 * Web Worker for photo color analysis
 * Runs color extraction in a separate thread to avoid blocking the main thread
 */

interface ColorRGB {
  r: number
  g: number
  b: number
}

interface WorkerMessage {
  type: 'analyze'
  imageData: ImageData
  options: {
    clusters?: number
    maxIterations?: number
  }
}

interface WorkerResponse {
  type: 'result' | 'error'
  color?: ColorRGB
  ambientColor?: ColorRGB
  temperature?: 'cool' | 'neutral' | 'warm'
  processingTime?: number
  error?: string
}

// Listen for messages from main thread
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, imageData, options } = e.data
  
  if (type === 'analyze') {
    try {
      const startTime = performance.now()
      
      const { clusters = 5, maxIterations = 10 } = options
      
      // Extract pixels
      const pixels = extractPixels(imageData)
      
      // K-means clustering
      const colorClusters = kMeansClustering(pixels, clusters, maxIterations)
      
      // Find dominant cluster
      const dominantCluster = colorClusters.reduce((max, cluster) =>
        cluster.count > max.count ? cluster : max
      )
      
      // Convert to ambient light
      const ambientColor = convertToAmbientLight(dominantCluster.color)
      const temperature = detectTemperature(dominantCluster.color)
      
      const processingTime = performance.now() - startTime
      
      const response: WorkerResponse = {
        type: 'result',
        color: dominantCluster.color,
        ambientColor,
        temperature,
        processingTime
      }
      
      self.postMessage(response)
    } catch (error) {
      const response: WorkerResponse = {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      self.postMessage(response)
    }
  }
}

function extractPixels(imageData: ImageData): ColorRGB[] {
  const pixels: ColorRGB[] = []
  const data = imageData.data
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    
    if (a < 128) continue
    if (r < 10 && g < 10 && b < 10) continue
    if (r > 245 && g > 245 && b > 245) continue
    
    pixels.push({ r, g, b })
  }
  
  return pixels
}

interface ColorCluster {
  color: ColorRGB
  count: number
}

function kMeansClustering(
  pixels: ColorRGB[],
  k: number,
  maxIterations: number
): ColorCluster[] {
  if (pixels.length === 0) {
    return [{ color: { r: 128, g: 128, b: 128 }, count: 1 }]
  }
  
  const centers: ColorRGB[] = []
  for (let i = 0; i < k; i++) {
    const randomIndex = Math.floor(Math.random() * pixels.length)
    centers.push({ ...pixels[randomIndex] })
  }
  
  let assignments = new Array(pixels.length).fill(0)
  
  for (let iter = 0; iter < maxIterations; iter++) {
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
    
    if (!changed) break
    
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
  
  const clusters: ColorCluster[] = centers.map((color, index) => ({
    color,
    count: assignments.filter(a => a === index).length
  }))
  
  return clusters.filter(c => c.count > 0)
}

function colorDistance(c1: ColorRGB, c2: ColorRGB): number {
  const dr = c1.r - c2.r
  const dg = c1.g - c2.g
  const db = c1.b - c2.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function convertToAmbientLight(color: ColorRGB): ColorRGB {
  const hsl = rgbToHsl(color)
  hsl.s = Math.min(hsl.s * 0.6, 0.5)
  hsl.l = Math.max(0.4, Math.min(0.7, hsl.l))
  return hslToRgb(hsl)
}

function detectTemperature(color: ColorRGB): 'cool' | 'neutral' | 'warm' {
  const { r, b } = color
  const warmth = (r - b) / 255
  
  if (warmth > 0.15) return 'warm'
  if (warmth < -0.15) return 'cool'
  return 'neutral'
}

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
