// 공통 캐시 모듈
interface CacheData {
  data: unknown
  expires: number
}

// 전역 캐시 인스턴스
const globalCache = new Map<string, CacheData>()

// 캐시에서 데이터 가져오기
export function getFromCache(key: string) {
  const cached = globalCache.get(key)
  if (cached && Date.now() < cached.expires) {
    return cached.data
  }
  return null
}

// 캐시에 데이터 저장
export function setCache(key: string, data: unknown, ttlMs: number = 5 * 60 * 1000) {
  const expires = Date.now() + ttlMs
  globalCache.set(key, { data, expires })
}

// 캐시 무효화
export function invalidateCache(key: string) {
  globalCache.delete(key)
  console.log(`캐시 무효화: ${key}`)
}

// 모든 캐시 클리어
export function clearAllCache() {
  globalCache.clear()
  console.log('모든 캐시 클리어')
}
