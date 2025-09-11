import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { randomUUID } from 'crypto'

// 레이트 리밋 체크 (메모리 기반)
interface RateLimitData {
  count: number
  resetTime: number
}
const rateLimitMap = new Map<string, RateLimitData>()

// IP 기반 레이트 리밋 (20req/min) - 게임 시작은 더 자주 일어날 수 있음
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1분
  const limit = 20 // 1분에 20게임까지

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
interface GameStartInput {
  sessionId: string
  clientStartTime: number
}

// 입력 검증 함수
function validateInput(body: unknown): { valid: boolean; error?: string; data?: GameStartInput } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '잘못된 요청 형식입니다' }
  }
  
  const { sessionId, clientStartTime } = body as Record<string, unknown>

  // 세션 ID 검증 (UUID 형식)
  if (typeof sessionId !== 'string' || !sessionId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return { valid: false, error: '유효하지 않은 세션 ID입니다' }
  }
  
  // 클라이언트 시작 시간 검증
  if (typeof clientStartTime !== 'number' || clientStartTime <= 0 || clientStartTime > Date.now() + 1000) {
    return { valid: false, error: '유효하지 않은 시작 시간입니다' }
  }
  
  return { 
    valid: true, 
    data: { sessionId, clientStartTime } as GameStartInput 
  }
}

// 세션 토큰 생성 함수
function generateSessionToken(sessionId: string): string {
  return `${sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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
      console.log(`게임 시작 레이트 리밋 초과: ${ip}`)
      return NextResponse.json(
        { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    // 요청 본문 파싱
    const body = await request.json()
    console.log('🎮 게임 시작 요청 수신:', { 
      sessionId: body.sessionId, 
      clientStartTime: body.clientStartTime, 
      ip 
    })

    // 1. 기본 입력 검증
    const validation = validateInput(body)
    if (!validation.valid) {
      console.log('❌ 게임 시작 입력 검증 실패:', validation.error)
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { sessionId, clientStartTime } = validation.data!

    // 2. 서버 측 시작 시간 기록
    const serverStartTime = Date.now()

    console.log('✅ 게임 시작 검증 통과 - 세션 저장 진행')

    // 데이터베이스가 설정된 경우 Vercel Postgres 사용
    if (process.env.POSTGRES_URL) {
      try {
        // 게임 시작 세션을 임시 테이블에 저장
        const result = await sql`
          INSERT INTO game_sessions (session_id, server_start_time, client_start_time, status, ip_address, created_at)
          VALUES (${sessionId}, ${serverStartTime}, ${clientStartTime}, 'active', ${ip}, NOW())
          RETURNING session_id, server_start_time, client_start_time, created_at
        `
        
        console.log('✅ 게임 시작 세션 저장 성공:', result.rows[0])
        
        return NextResponse.json({
          success: true,
          serverStartTime,
          sessionToken: generateSessionToken(sessionId),
          message: '게임 시작 세션이 저장되었습니다',
          data: result.rows[0]
        })
      } catch (dbError: unknown) {
        console.error('❌ 게임 시작 세션 저장 오류:', dbError)
        
        // 테이블이 없는 경우 Mock 응답
        if (dbError instanceof Error && dbError.message?.includes('relation "game_sessions" does not exist')) {
          console.log('🧪 game_sessions 테이블이 없음 - Mock 응답 반환')
          return NextResponse.json({
            success: true,
            serverStartTime,
            sessionToken: generateSessionToken(sessionId),
            message: '게임 시작 세션이 저장되었습니다 (개발 모드)',
            data: {
              session_id: sessionId,
              server_start_time: serverStartTime,
              client_start_time: clientStartTime,
              created_at: new Date().toISOString()
            }
          })
        }
        
        return NextResponse.json(
          { error: '게임 시작 세션 저장 중 오류가 발생했습니다' },
          { status: 500 }
        )
      }
    } else {
      // Mock 응답 (개발용)
      console.log('🧪 Mock: 게임 시작 세션 가짜 응답 반환')
      
      return NextResponse.json({
        success: true,
        serverStartTime,
        sessionToken: generateSessionToken(sessionId),
        message: '게임 시작 세션이 저장되었습니다 (개발 모드)',
        data: {
          session_id: sessionId,
          server_start_time: serverStartTime,
          client_start_time: clientStartTime,
          created_at: new Date().toISOString()
        }
      })
    }

  } catch (error) {
    console.error('❌ 게임 시작 처리 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
