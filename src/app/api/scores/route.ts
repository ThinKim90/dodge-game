import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { invalidateCache } from '@/lib/cache'

// 레이트 리밋 체크 (메모리 기반)
interface RateLimitData {
  count: number
  resetTime: number
}
const rateLimitMap = new Map<string, RateLimitData>()

// IP 기반 레이트 리밋 (3req/min) - 더 엄격하게
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1분
  const limit = 3 // 더 엄격한 제한

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

  // 닉네임 검증
  if (!nickname || typeof nickname !== 'string') {
    return { valid: false, error: '닉네임이 필요합니다' }
  }
  
  if (nickname.trim().length === 0 || nickname.trim().length > 12) {
    return { valid: false, error: '닉네임은 1-12자 사이여야 합니다' }
  }
  
  // 점수 검증
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100000) {
    return { valid: false, error: '점수가 올바르지 않습니다' }
  }
  
  // 시간 검증
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1 || duration > 3600) {
    return { valid: false, error: '플레이 시간이 올바르지 않습니다 (1초~1시간)' }
  }
  
  // 레벨 검증
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 500) {
    return { valid: false, error: '레벨이 올바르지 않습니다' }
  }
  
  return { 
    valid: true, 
    data: { nickname, score, duration, level } as ScoreInput 
  }
}

// 🛡️ 핵심 게임 로직 검증 함수
function validateGameLogic(score: number, level: number, duration: number): { valid: boolean; error?: string } {
  // 1. 레벨과 점수 일관성 검증 (20점마다 레벨업)
  const expectedLevel = Math.floor(score / 20) + 1
  const levelDiff = Math.abs(level - expectedLevel)
  
  if (levelDiff > 3) { // 3레벨 이상 차이나면 의심
    return { valid: false, error: '레벨과 점수가 일치하지 않습니다' }
  }

  // 2. 최소 플레이 시간 검증
  if (duration < 3) {
    return { valid: false, error: '게임 시간이 너무 짧습니다' }
  }

  return { valid: true }
}

// 중복 제출 방지 체크
async function checkDuplicateSubmission(ip: string, score: number): Promise<boolean> {
  if (!process.env.POSTGRES_URL) {
    return false // Mock 모드에서는 중복 체크 안함
  }

  try {
    const result = await sql`
      SELECT COUNT(*) as count FROM scores 
      WHERE ip_address = ${ip} 
      AND score = ${score}
      AND created_at > NOW() - INTERVAL '2 minutes'
    `
    
    return parseInt(result.rows[0].count) > 0
  } catch (error) {
    console.error('중복 체크 오류:', error)
    return false // 오류 시에는 통과시킴
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
    console.log('🛡️ 보안 강화된 점수 제출:', { 
      nickname: body.nickname, 
      score: body.score, 
      level: body.level, 
      duration: body.duration, 
      ip 
    })

    // 1. 기본 입력 검증
    const validation = validateInput(body)
    if (!validation.valid) {
      console.log('❌ 입력 검증 실패:', validation.error)
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { nickname, score, duration, level } = validation.data!

    // 2. 게임 로직 검증
    const gameValidation = validateGameLogic(score, level, duration)
    if (!gameValidation.valid) {
      console.log('❌ 게임 로직 검증 실패:', gameValidation.error)
      return NextResponse.json(
        { error: gameValidation.error },
        { status: 400 }
      )
    }

    // 3. 중복 제출 체크
    const isDuplicate = await checkDuplicateSubmission(ip, score)
    if (isDuplicate) {
      console.log('❌ 중복 제출 감지:', { ip, score })
      return NextResponse.json(
        { error: '이미 등록된 점수입니다.' },
        { status: 409 }
      )
    }

    console.log('✅ 모든 검증 통과 - 점수 저장 진행')

    // 데이터베이스가 설정된 경우 Vercel Postgres 사용
    if (process.env.POSTGRES_URL) {
      try {
        const result = await sql`
          INSERT INTO scores (nickname, score, level, duration, ip_address, created_at)
          VALUES (${nickname.trim()}, ${score}, ${level}, ${duration}, ${ip}, NOW())
          RETURNING id, nickname, score, level, created_at
        `
        
        console.log('✅ 검증된 점수 저장 성공:', result.rows[0])
        
        // 캐시 무효화
        invalidateCache('leaderboard:top10')
        
        return NextResponse.json({
          success: true,
          message: '점수가 성공적으로 등록되었습니다!',
          data: result.rows[0]
        })
      } catch (dbError) {
        console.error('❌ 데이터베이스 오류:', dbError)
        return NextResponse.json(
          { error: '데이터베이스 오류가 발생했습니다' },
          { status: 500 }
        )
      }
    } else {
      // Mock 응답 (개발용)
      console.log('🧪 Mock: 검증된 게임 데이터로 가짜 응답 반환')
      
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
    console.error('❌ 점수 제출 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}