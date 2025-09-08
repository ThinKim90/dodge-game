import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

// 메모리 캐시 (개발용 - 실제 서비스에서는 Redis 등 사용)
interface CacheData {
  data: unknown
  expires: number
}
const cache = new Map<string, CacheData>()

// 캐시 무효화 함수
function invalidateCache(key: string) {
  cache.delete(key)
  console.log(`캐시 무효화: ${key}`)
}

// 레이트 리밋 체크 (메모리 기반)
interface RateLimitData {
  count: number
  resetTime: number
}
const rateLimitMap = new Map<string, RateLimitData>()

// IP 기반 레이트 리밋 (5req/min)
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1분
  const limit = 5

  const current = rateLimitMap.get(ip)
  
  if (!current || now > current.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  if (current.count >= limit) {
    return false
  }
  
  current.count++
  return true
}

// 입력 데이터 타입 정의
interface ScoreInput {
  nickname: string
  score: number
  duration: number
  level: number
}

// 입력 검증 함수
function validateInput(body: unknown): { valid: boolean; error?: string; data?: ScoreInput } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '잘못된 요청 형식입니다' }
  }
  
  const { nickname, score, duration, level } = body as Record<string, unknown>

  if (!nickname || typeof nickname !== 'string') {
    return { valid: false, error: '닉네임이 필요합니다' }
  }
  
  if (nickname.trim().length === 0 || nickname.trim().length > 20) {
    return { valid: false, error: '닉네임은 1-20자여야 합니다' }
  }
  
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 1000000) {
    return { valid: false, error: '점수가 올바르지 않습니다' }
  }
  
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 0 || duration > 86400) {
    return { valid: false, error: '플레이 시간이 올바르지 않습니다' }
  }
  
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 1000) {
    return { valid: false, error: '레벨이 올바르지 않습니다' }
  }
  
  return { 
    valid: true, 
    data: { nickname, score, duration, level } as ScoreInput 
  }
}

export async function POST(request: NextRequest) {
  try {
    // IP 주소 추출
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : 
               request.headers.get('x-real-ip') || 
               '127.0.0.1'

    // 레이트 리밋 체크
    if (!checkRateLimit(ip)) {
      console.log(`레이트 리밋 초과: ${ip}`)
      return NextResponse.json(
        { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    // 요청 본문 파싱
    const body = await request.json()
    console.log('점수 제출 요청:', { ...body, ip })

    // 입력 검증
    const validation = validateInput(body)
    if (!validation.valid) {
      console.log('입력 검증 실패:', validation.error)
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { nickname, score, duration, level } = body

    // 데이터베이스가 설정된 경우 Vercel Postgres 사용
    if (process.env.POSTGRES_URL) {
      try {
        const result = await sql`
          INSERT INTO scores (nickname, score, level, duration, ip_address, created_at)
          VALUES (${nickname.trim()}, ${score}, ${level}, ${duration}, ${ip}, NOW())
          RETURNING id, nickname, score, level, created_at
        `
        
        console.log('점수 저장 성공:', result.rows[0])
        
        // 캐시 무효화
        invalidateCache('leaderboard:top10')
        
        return NextResponse.json({
          success: true,
          message: '점수가 성공적으로 등록되었습니다!',
          data: result.rows[0]
        })
      } catch (dbError) {
        console.error('데이터베이스 오류:', dbError)
        return NextResponse.json(
          { error: '데이터베이스 오류가 발생했습니다' },
          { status: 500 }
        )
      }
    } else {
      // Mock 응답 (개발용)
      console.log('Mock: 데이터베이스가 연결되지 않아 가짜 응답을 반환합니다')
      
      // 캐시 무효화
      invalidateCache('leaderboard:top10')
      
      return NextResponse.json({
        success: true,
        message: '점수가 성공적으로 등록되었습니다! (개발 모드)',
        data: {
          id: Math.floor(Math.random() * 1000),
          nickname: nickname.trim(),
          score,
          level,
          created_at: new Date().toISOString()
        }
      })
    }

  } catch (error) {
    console.error('점수 제출 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}