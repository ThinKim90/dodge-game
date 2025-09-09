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

// 입력 데이터 타입 정의 (UUID 기반)
interface ScoreSubmissionInput {
  nickname: string
  sessionId: string
}

// 입력 검증 함수 (UUID 기반)
function validateInput(body: unknown): { valid: boolean; error?: string; data?: ScoreSubmissionInput } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '잘못된 요청 형식입니다' }
  }
  
  const { nickname, sessionId } = body as Record<string, unknown>

  // 닉네임 검증
  if (!nickname || typeof nickname !== 'string') {
    return { valid: false, error: '닉네임이 필요합니다' }
  }
  
  if (nickname.trim().length === 0 || nickname.trim().length > 12) {
    return { valid: false, error: '닉네임은 1-12자 사이여야 합니다' }
  }
  
  // 세션 ID 검증
  if (!sessionId || typeof sessionId !== 'string') {
    return { valid: false, error: '게임 세션 ID가 필요합니다' }
  }
  
  // UUID 형식 검증 (간단한 형식 체크)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(sessionId)) {
    return { valid: false, error: '잘못된 세션 ID 형식입니다' }
  }
  
  return { 
    valid: true, 
    data: { nickname: nickname.trim(), sessionId } as ScoreSubmissionInput 
  }
}

// 게임 세션 조회 및 검증 함수
async function getGameSession(sessionId: string): Promise<{
  valid: boolean
  error?: string
  sessionData?: {
    id: number
    score: number
    level: number
    duration: number
    ip_address: string
    is_used: boolean
    created_at: string
  }
}> {
  if (!process.env.POSTGRES_URL) {
    // Mock 모드 - 테스트용 가짜 데이터 반환
    console.log('🧪 Mock: 게임 세션 조회 (가짜 데이터)')
    return {
      valid: true,
      sessionData: {
        id: 1,
        score: Math.floor(Math.random() * 100),
        level: Math.floor(Math.random() * 10) + 1,
        duration: Math.floor(Math.random() * 300) + 10,
        ip_address: '127.0.0.1',
        is_used: false,
        created_at: new Date().toISOString()
      }
    }
  }

  try {
    const result = await sql`
      SELECT id, score, level, duration, ip_address, is_used, created_at
      FROM game_sessions 
      WHERE session_id = ${sessionId}
    `
    
    if (result.rows.length === 0) {
      return { valid: false, error: '게임 세션을 찾을 수 없습니다' }
    }
    
    const session = result.rows[0] as {
      id: number
      score: number
      level: number
      duration: number
      ip_address: string
      is_used: boolean
      created_at: string
    }
    
    // 세션이 이미 사용되었는지 확인 (중복 등록 방지)
    if (session.is_used) {
      return { valid: false, error: '이미 등록된 게임 세션입니다' }
    }
    
    // 세션이 너무 오래된 경우 (24시간 이상)
    const sessionAge = Date.now() - new Date(session.created_at).getTime()
    const maxAge = 24 * 60 * 60 * 1000 // 24시간
    if (sessionAge > maxAge) {
      return { valid: false, error: '만료된 게임 세션입니다' }
    }
    
    return { valid: true, sessionData: session }
    
  } catch (error) {
    console.error('게임 세션 조회 오류:', error)
    return { valid: false, error: '게임 세션 조회 중 오류가 발생했습니다' }
  }
}

// UUID 기반 시스템: 게임 로직 검증은 /api/game/complete에서 이미 완료
// 여기서는 검증된 세션 데이터만 조회하면 됨 (중복 검증 제거로 성능 최적화)

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
    console.log('🛡️ UUID 기반 보안 점수 제출:', { 
      nickname: body.nickname, 
      sessionId: body.sessionId, 
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

    const { nickname, sessionId } = validation.data!

    // 2. 게임 세션 조회 및 검증
    const sessionResult = await getGameSession(sessionId)
    if (!sessionResult.valid) {
      console.log('❌ 게임 세션 검증 실패:', sessionResult.error)
      return NextResponse.json(
        { error: sessionResult.error },
        { status: 400 }
      )
    }

    const sessionData = sessionResult.sessionData!
    const { score, level, duration } = sessionData

    // 게임 로직은 /api/game/complete에서 이미 검증 완료 ✅
    // UUID 기반 시스템에서는 중복 검증 불필요 (성능 최적화)

    console.log('✅ 검증된 게임 세션 데이터 확인 - UUID 기반 점수 저장 진행')

    // 데이터베이스가 설정된 경우 Vercel Postgres 사용
    if (process.env.POSTGRES_URL) {
      try {
        // 트랜잭션으로 처리 (점수 저장 + 세션 사용 표시)
        await sql`BEGIN`
        
        // 1. 점수 저장
        const scoreResult = await sql`
          INSERT INTO scores (nickname, session_id, score, level, duration, ip_address, created_at)
          VALUES (${nickname}, ${sessionId}, ${score}, ${level}, ${duration}, ${ip}, NOW())
          RETURNING id, nickname, score, level, duration, created_at
        `
        
        // 2. 게임 세션을 사용됨으로 표시
        await sql`
          UPDATE game_sessions 
          SET is_used = true 
          WHERE session_id = ${sessionId}
        `
        
        await sql`COMMIT`
        
        console.log('✅ UUID 기반 점수 저장 성공:', scoreResult.rows[0])
        
        // 캐시 무효화
        invalidateCache('leaderboard:top10')
        
        return NextResponse.json({
          success: true,
          message: '점수가 성공적으로 등록되었습니다!',
          data: scoreResult.rows[0]
        })
      } catch (dbError) {
        await sql`ROLLBACK`
        console.error('❌ 데이터베이스 오류:', dbError)
        return NextResponse.json(
          { error: '데이터베이스 오류가 발생했습니다' },
          { status: 500 }
        )
      }
    } else {
      // Mock 응답 (개발용)
      console.log('🧪 Mock: UUID 기반 가짜 응답 반환')
      
      // 캐시 무효화
      invalidateCache('leaderboard:top10')
      
      return NextResponse.json({
        success: true,
        message: '점수가 성공적으로 등록되었습니다! (개발 모드)',
        data: {
          id: Math.floor(Math.random() * 1000),
          nickname,
          score,
          level,
          duration,
          created_at: new Date().toISOString()
        }
      })
    }

  } catch (error) {
    console.error('❌ UUID 기반 점수 제출 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}