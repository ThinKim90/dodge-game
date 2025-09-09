import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { randomUUID } from 'crypto'

// 레이트 리밋 체크 (메모리 기반)
interface RateLimitData {
  count: number
  resetTime: number
}
const rateLimitMap = new Map<string, RateLimitData>()

// IP 기반 레이트 리밋 (10req/min) - 게임 완료는 더 자주 일어날 수 있음
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1분
  const limit = 10 // 1분에 10게임까지

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
interface GameSessionInput {
  score: number
  duration: number
  level: number
}

// 입력 검증 함수
function validateInput(body: unknown): { valid: boolean; error?: string; data?: GameSessionInput } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '잘못된 요청 형식입니다' }
  }
  
  const { score, duration, level } = body as Record<string, unknown>

  // 점수 검증
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100000) {
    return { valid: false, error: '점수가 올바르지 않습니다' }
  }
  
  // 시간 검증
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 0 || duration > 3600) {
    return { valid: false, error: '플레이 시간이 올바르지 않습니다 (최대 1시간)' }
  }
  
  // 레벨 검증
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 500) {
    return { valid: false, error: '레벨이 올바르지 않습니다' }
  }
  
  return { 
    valid: true, 
    data: { score, duration, level } as GameSessionInput 
  }
}

// 🛡️ 핵심 게임 로직 검증 함수
function validateGameLogic(score: number, level: number, duration: number): { valid: boolean; error?: string } {
  // 레벨과 점수 일관성 검증 (20점마다 레벨업)
  const expectedLevel = Math.floor(score / 20) + 1
  const levelDiff = Math.abs(level - expectedLevel)
  
  if (levelDiff > 3) { // 3레벨 이상 차이나면 의심
    return { valid: false, error: '레벨과 점수가 일치하지 않습니다' }
  }

  // 시간과 점수 일관성 검증 (너무 짧은 시간에 너무 높은 점수는 의심)
  if (duration > 0) {
    const scorePerSecond = score / duration
    if (scorePerSecond > 10) { // 초당 10점 이상은 의심스러움
      return { valid: false, error: '게임 시간 대비 점수가 비정상적입니다' }
    }
  }

  return { valid: true }
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
      console.log(`게임 완료 레이트 리밋 초과: ${ip}`)
      return NextResponse.json(
        { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    // 요청 본문 파싱
    const body = await request.json()
    console.log('🎮 게임 완료 데이터 수신:', { 
      score: body.score, 
      level: body.level, 
      duration: body.duration, 
      ip 
    })

    // 1. 기본 입력 검증
    const validation = validateInput(body)
    if (!validation.valid) {
      console.log('❌ 게임 완료 입력 검증 실패:', validation.error)
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { score, duration, level } = validation.data!

    // 2. 게임 로직 검증
    const gameValidation = validateGameLogic(score, level, duration)
    if (!gameValidation.valid) {
      console.log('❌ 게임 완료 로직 검증 실패:', gameValidation.error)
      return NextResponse.json(
        { error: gameValidation.error },
        { status: 400 }
      )
    }

    // 3. UUID 생성
    const sessionId = randomUUID()

    console.log('✅ 게임 세션 검증 통과 - 세션 저장 진행')

    // 데이터베이스가 설정된 경우 Vercel Postgres 사용
    if (process.env.POSTGRES_URL) {
      try {
        // 게임 세션을 임시 테이블에 저장
        // TODO: 나중에 전용 테이블 생성 필요
        const result = await sql`
          INSERT INTO game_sessions (session_id, score, level, duration, ip_address, created_at, is_used)
          VALUES (${sessionId}, ${score}, ${level}, ${duration}, ${ip}, NOW(), false)
          RETURNING session_id, score, level, duration, created_at
        `
        
        console.log('✅ 게임 세션 저장 성공:', result.rows[0])
        
        return NextResponse.json({
          success: true,
          sessionId,
          message: '게임 세션이 저장되었습니다',
          data: result.rows[0]
        })
      } catch (dbError: any) {
        console.error('❌ 게임 세션 저장 오류:', dbError)
        
        // 테이블이 없는 경우 Mock 응답
        if (dbError.message?.includes('relation "game_sessions" does not exist')) {
          console.log('🧪 game_sessions 테이블이 없음 - Mock 응답 반환')
          return NextResponse.json({
            success: true,
            sessionId,
            message: '게임 세션이 저장되었습니다 (개발 모드)',
            data: {
              session_id: sessionId,
              score,
              level,
              duration,
              created_at: new Date().toISOString()
            }
          })
        }
        
        return NextResponse.json(
          { error: '게임 세션 저장 중 오류가 발생했습니다' },
          { status: 500 }
        )
      }
    } else {
      // Mock 응답 (개발용)
      console.log('🧪 Mock: 게임 세션 가짜 응답 반환')
      
      return NextResponse.json({
        success: true,
        sessionId,
        message: '게임 세션이 저장되었습니다 (개발 모드)',
        data: {
          session_id: sessionId,
          score,
          level,
          duration,
          created_at: new Date().toISOString()
        }
      })
    }

  } catch (error) {
    console.error('❌ 게임 완료 처리 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
